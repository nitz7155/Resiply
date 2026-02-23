"""MF 학습/예측 유틸리티(CSV/DB 입력, numpy SGD)."""
import csv
import os
import runpy
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

import database
import models

# 모델 캐시(프로세스 단위)
_MODEL_CACHE: Optional[Dict[str, np.ndarray]] = None


def _load_ratings(csv_path: str) -> List[Tuple[int, int, float]]:
    """ratings.csv에서 (member_id, product_id, rating) 로드."""
    ratings: List[Tuple[int, int, float]] = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                member_id_raw = row.get("member_id") or row.get("\ufeffmember_id")
                product_id = row.get("product_id")
                rating = row.get("rating")
                if member_id_raw is None or product_id is None or rating is None:
                    continue
                member_id_raw = str(member_id_raw).strip()
                if member_id_raw.lower().startswith("u") and member_id_raw[1:].isdigit():
                    member_id = int(member_id_raw[1:])
                else:
                    member_id = int(member_id_raw)
                product_id = int(product_id)
                rating = float(rating)
            except (ValueError, TypeError):
                continue
            ratings.append((member_id, product_id, rating))
    return ratings


def _load_ratings_from_db() -> List[Tuple[int, int, float]]:
    ratings: Dict[Tuple[int, int], float] = {}
    review_weight = float(os.getenv("MF_REVIEW_WEIGHT", "10.0"))
    review_weight = max(0.0, review_weight)
    wishlist_score = float(os.getenv("MF_WISHLIST_RATING", "5.0"))
    order_score = float(os.getenv("MF_ORDER_RATING", "8.0"))
    dummy_weight = float(os.getenv("MF_DUMMY_WEIGHT", "0.1"))
    dummy_weight = max(0.0, dummy_weight)
    with database.SessionLocal() as session:
        review_rows = (
            session.query(models.ProductReview.member_id, models.ProductReview.product_id, models.ProductReview.rating)
            .filter(models.ProductReview.member_id.isnot(None))
            .filter(models.ProductReview.product_id.isnot(None))
            .all()
        )
        for mid, pid, rating in review_rows:
            try:
                is_dummy = 1 <= int(mid) <= 100
                weight = dummy_weight if is_dummy else 1.0
                key = (int(mid), int(pid))
                ratings[key] = max(
                    ratings.get(key, 0.0),
                    float(rating) * review_weight * weight,
                )
            except (TypeError, ValueError):
                continue

        wishlist_rows = (
            session.query(models.Wishlist.member_id, models.Wishlist.product_id)
            .filter(models.Wishlist.member_id.isnot(None))
            .filter(models.Wishlist.product_id.isnot(None))
            .all()
        )
        for mid, pid in wishlist_rows:
            try:
                is_dummy = 1 <= int(mid) <= 100
                weight = dummy_weight if is_dummy else 1.0
                key = (int(mid), int(pid))
                ratings[key] = max(ratings.get(key, 0.0), wishlist_score*weight)
            except (TypeError, ValueError):
                continue

        order_rows = (
            session.query(models.Order.member_id, models.OrderDetail.product_id)
            .join(models.OrderDetail, models.Order.id == models.OrderDetail.order_id)
            .filter(models.Order.member_id.isnot(None))
            .filter(models.OrderDetail.product_id.isnot(None))
            .all()
        )
        for mid, pid in order_rows:
            try:
                is_dummy = 1 <= int(mid) <= 100
                weight = dummy_weight if is_dummy else 1.0
                key = (int(mid), int(pid))
                ratings[key] = max(ratings.get(key, 0.0), order_score*weight)
            except (TypeError, ValueError):
                continue

    return [(mid, pid, score) for (mid, pid), score in ratings.items()]


def _train_source() -> str:
    return os.getenv("MF_TRAIN_SOURCE", "db").lower()


def _build_mappings(ratings: List[Tuple[int, int, float]]):
    """아이디 -> 인덱스 매핑 생성."""
    user_ids = sorted({u for u, _, _ in ratings})
    item_ids = sorted({i for _, i, _ in ratings})
    user_index = {u: idx for idx, u in enumerate(user_ids)}
    item_index = {i: idx for idx, i in enumerate(item_ids)}
    return user_ids, item_ids, user_index, item_index


def _train_biased_mf(
    ratings: List[Tuple[int, int, float]],
    factors: int,
    epochs: int,
    lr: float,
    reg: float,
    seed: int,
    center_user: bool,
    patience: int = 3,
):
    # 학습 초기화
    rng = np.random.default_rng(seed)
    user_ids, item_ids, user_index, item_index = _build_mappings(ratings)
    num_users = len(user_ids)
    num_items = len(item_ids)

    data = np.array(
        [(user_index[u], item_index[i], r) for u, i, r in ratings], dtype=np.float64
    )
    rng.shuffle(data)

    val_size = max(1, int(0.1 * len(data)))
    val = data[:val_size]
    train = data[val_size:]

    user_mean = np.zeros(num_users, dtype=np.float64)
    # 유저 평균으로 중심화(옵션)
    if center_user and len(data):
        sums = np.zeros(num_users, dtype=np.float64)
        counts = np.zeros(num_users, dtype=np.int64)
        for u_idx, _, rating in data:
            u = int(u_idx)
            sums[u] += rating
            counts[u] += 1
        user_mean = np.divide(sums, np.maximum(counts, 1), dtype=np.float64)

    if center_user and len(train):
        train_ratings = train[:, 2] - user_mean[train[:, 0].astype(int)]
    else:
        train_ratings = train[:, 2]

    global_mean = float(train_ratings.mean()) if len(train_ratings) else 0.0
    user_bias = np.zeros(num_users, dtype=np.float64)
    item_bias = np.zeros(num_items, dtype=np.float64)
    user_factors = rng.normal(0, 0.1, size=(num_users, factors)).astype(np.float64)
    item_factors = rng.normal(0, 0.1, size=(num_items, factors)).astype(np.float64)

    best_rmse = float("inf")
    best_state = None
    patience_left = patience

    # SGD 학습 루프 + 조기 종료
    for _ in range(epochs):
        rng.shuffle(train)
        for u_idx, i_idx, rating in train:
            u = int(u_idx)
            i = int(i_idx)
            target = rating - user_mean[u] if center_user else rating
            pred = global_mean + user_bias[u] + item_bias[i] + np.dot(user_factors[u], item_factors[i])
            err = rating - pred
            err = target - pred

            user_bias[u] += lr * (err - reg * user_bias[u])
            item_bias[i] += lr * (err - reg * item_bias[i])

            uf = user_factors[u]
            it = item_factors[i]
            user_factors[u] += lr * (err * it - reg * uf)
            item_factors[i] += lr * (err * uf - reg * it)

        if len(val):
            errors = []
            for u_idx, i_idx, rating in val:
                u = int(u_idx)
                i = int(i_idx)
                base = global_mean + user_bias[u] + item_bias[i] + np.dot(user_factors[u], item_factors[i])
                pred = base + (user_mean[u] if center_user else 0.0)
                errors.append((rating - pred) ** 2)
            rmse = float(np.sqrt(np.mean(errors)))
        else:
            rmse = 0.0

        if rmse + 1e-5 < best_rmse:
            best_rmse = rmse
            best_state = (
                user_factors.copy(),
                item_factors.copy(),
                user_bias.copy(),
                item_bias.copy(),
            )
            patience_left = patience
        else:
            patience_left -= 1
            if patience_left <= 0:
                break

    # 가장 좋은 가중치로 복원
    if best_state is not None:
        user_factors, item_factors, user_bias, item_bias = best_state

    return {
        "user_factors": user_factors.astype(np.float32),
        "item_factors": item_factors.astype(np.float32),
        "user_bias": user_bias.astype(np.float32),
        "item_bias": item_bias.astype(np.float32),
        "global_mean": np.array(global_mean, dtype=np.float32),
        "user_ids": np.array(user_ids, dtype=np.int64),
        "item_ids": np.array(item_ids, dtype=np.int64),
        "user_mean": user_mean.astype(np.float32),
        "center_user": center_user,
        "rmse": best_rmse if best_state is not None else 0.0,
    }


def train_from_csv():
    """CSV 기반 학습 및 모델 저장."""
    ratings_csv = os.getenv(
        "RATINGS_CSV_PATH",
        str((Path(__file__).resolve().parents[1] / "data" / "ratings.csv")),
    )
    factors = int(os.getenv("MF_FACTORS", "24"))
    epochs = int(os.getenv("MF_EPOCHS", "50"))
    lr = float(os.getenv("MF_LR", "0.01"))
    reg = float(os.getenv("MF_REG", "0.01"))
    seed = int(os.getenv("MF_SEED", "42"))

    ratings = _load_ratings(ratings_csv)
    if not ratings:
        raise RuntimeError("No ratings found in ratings.csv.")

    center_user = os.getenv("MF_CENTER_USER", "false").lower() in {"1", "true", "yes"}
    # 권장 튜닝: MF_FACTORS=64, MF_LR=0.005~0.02, MF_REG=0.01~0.05.
    result = _train_biased_mf(ratings, factors, epochs, lr, reg, seed, center_user)

    model_path = os.getenv(
        "MF_MODEL_PATH",
        str(Path(__file__).resolve().parent / "mf_model.npz"),
    )
    np.savez(
        model_path,
        user_factors=result["user_factors"],
        item_factors=result["item_factors"],
        user_bias=result["user_bias"],
        item_bias=result["item_bias"],
        global_mean=result["global_mean"],
        user_ids=result["user_ids"],
        item_ids=result["item_ids"],
        user_mean=result["user_mean"],
        center_user=np.array(int(result["center_user"]), dtype=np.int8),
    )
    global _MODEL_CACHE
    _MODEL_CACHE = None

    return {
        "num_users": len(result["user_ids"]),
        "num_items": len(result["item_ids"]),
        "num_ratings": len(ratings),
        "rmse": result["rmse"],
        "user_bias_std": float(np.std(result["user_bias"])),
        "item_bias_std": float(np.std(result["item_bias"])),
        "model_path": model_path,
    }


def train_from_db():
    """DB 기반 학습 및 모델 저장"""
    factors = int(os.getenv("MF_FACTORS", "24"))
    epochs = int(os.getenv("MF_EPOCHS", "60"))
    lr = float(os.getenv("MF_LR", "0.01"))
    reg = float(os.getenv("MF_REG", "0.02"))
    seed = int(os.getenv("MF_SEED", "42"))

    ratings = _load_ratings_from_db()
    if not ratings:
        raise RuntimeError("No ratings found in DB.")

    center_user = os.getenv("MF_CENTER_USER", "false").lower() in {"1", "true", "yes"}
    result = _train_biased_mf(ratings, factors, epochs, lr, reg, seed, center_user)

    model_path = os.getenv(
        "MF_MODEL_PATH",
        str(Path(__file__).resolve().parent / "mf_model.npz"),
    )
    np.savez(
        model_path,
        user_factors=result["user_factors"],
        item_factors=result["item_factors"],
        user_bias=result["user_bias"],
        item_bias=result["item_bias"],
        global_mean=result["global_mean"],
        user_ids=result["user_ids"],
        item_ids=result["item_ids"],
        user_mean=result["user_mean"],
        center_user=np.array(int(result["center_user"]), dtype=np.int8),
    )
    global _MODEL_CACHE
    _MODEL_CACHE = None

    return {
        "num_users": len(result["user_ids"]),
        "num_items": len(result["item_ids"]),
        "num_ratings": len(ratings),
        "rmse": result["rmse"],
        "user_bias_std": float(np.std(result["user_bias"])),
        "item_bias_std": float(np.std(result["item_bias"])),
        "model_path": model_path,
    }


def _train_from_source():
    if _train_source() == "csv":
        return train_from_csv()
    return train_from_db()


def trigger_retrain(reason: str = "") -> bool:
    """Synchronous retrain hook for user interactions."""
    try:
        train_from_db()
        return True
    except Exception as exc:
        msg = f"MF retrain failed: {exc}"
        if reason:
            msg = f"{msg} (reason={reason})"
        print(msg)
        return False


def _needs_dummy_seed() -> bool:
    with database.SessionLocal() as session:
        review_count = session.query(models.ProductReview.id).limit(1).count()
        wishlist_count = session.query(models.Wishlist.id).limit(1).count()
        order_count = session.query(models.OrderDetail.id).limit(1).count()
    return (review_count + wishlist_count + order_count) == 0


def run_mf_pipeline() -> Dict[str, str]:
    """MF 데이터 생성 -> DB 적재 -> 모델 학습 순서 실행."""
    base_dir = Path(__file__).resolve().parents[1]
    data_dir = base_dir / "data"
    mf_data_script = data_dir / "mf_data.py"
    insert_mf_script = data_dir / "insert_mf_data.py"

    if not mf_data_script.exists() or not insert_mf_script.exists():
        missing = [p for p in (mf_data_script, insert_mf_script) if not p.exists()]
        raise FileNotFoundError(f"MF scripts missing: {', '.join(str(p) for p in missing)}")

    if _needs_dummy_seed():
        runpy.run_path(str(mf_data_script), run_name="__main__")
        runpy.run_path(str(insert_mf_script), run_name="__main__")
    summary = _train_from_source()
    return {
        "model_path": summary["model_path"],
        "train_source": _train_source(),
    }


def load_mf_model(_retry: bool = True) -> Optional[Dict[str, np.ndarray]]:
    """모델 로드(캐시 적용)."""
    global _MODEL_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE

    model_path = os.getenv(
        "MF_MODEL_PATH",
        str(Path(__file__).resolve().parent / "mf_model.npz"),
    )
    if not os.path.exists(model_path):
        # 모델이 없으면 자동 학습 옵션으로 생성 시도
        auto_train = os.getenv("MF_AUTO_TRAIN", "true").lower() in {"1", "true", "yes"}
        if auto_train:
            try:
                _train_from_source()
            except Exception:
                return None
        else:
            return None

    try:
        data = np.load(model_path, allow_pickle=False)
        user_ids = data["user_ids"].astype(np.int64)
        item_ids = data["item_ids"].astype(np.int64)
        _MODEL_CACHE = {
            "user_factors": data["user_factors"].astype(np.float32),
            "item_factors": data["item_factors"].astype(np.float32),
            "user_bias": data["user_bias"].astype(np.float32),
            "item_bias": data["item_bias"].astype(np.float32),
            "global_mean": float(data["global_mean"]),
            "user_ids": user_ids,
            "item_ids": item_ids,
            "user_index": {int(uid): idx for idx, uid in enumerate(user_ids)},
            "item_index": {int(iid): idx for idx, iid in enumerate(item_ids)},
            "user_mean": data["user_mean"].astype(np.float32) if "user_mean" in data else None,
            "center_user": bool(int(data["center_user"])) if "center_user" in data else False,
        }
        return _MODEL_CACHE
    except Exception:
        # 로드 실패 시 자동 학습으로 재시도(옵션)
        auto_train = os.getenv("MF_AUTO_TRAIN", "true").lower() in {"1", "true", "yes"}
        if auto_train and _retry:
            try:
                _train_from_source()
                _MODEL_CACHE = None
                return load_mf_model(_retry=False)
            except Exception:
                return None
        return None


def predict_score(model: Dict[str, np.ndarray], member_id: int, product_id: int) -> Optional[float]:
    """단일 유저-상품 점수 예측."""
    user_index = model["user_index"].get(int(member_id))
    item_index = model["item_index"].get(int(product_id))
    if user_index is None or item_index is None:
        return None

    user_bias = float(model["user_bias"][user_index])
    item_bias = float(model["item_bias"][item_index])
    user_factors = model["user_factors"][user_index]
    item_factors = model["item_factors"][item_index]
    global_mean = float(model["global_mean"])
    base = global_mean + user_bias + item_bias + float(np.dot(user_factors, item_factors))
    if model.get("center_user") and model.get("user_mean") is not None:
        return base + float(model["user_mean"][user_index])
    return base


def model_summary() -> Dict[str, float]:
    """Basic model stats."""
    model = load_mf_model()
    if not model:
        return {"model_loaded": 0}

    summary: Dict[str, float] = {
        "model_loaded": 1,
        "num_users": float(len(model.get("user_ids", []))),
        "num_items": float(len(model.get("item_ids", []))),
        "center_user": float(1 if model.get("center_user") else 0),
    }

    return summary


def _sanity_check(model: Dict[str, np.ndarray]):
    user_ids = model.get("user_ids", [])
    item_ids = model.get("item_ids", [])
    if len(user_ids) == 0 or len(item_ids) == 0:
        print("Model loaded but no ids found.")
        return

    samples = min(3, len(user_ids), len(item_ids))
    for i in range(samples):
        uid = int(user_ids[i])
        iid = int(item_ids[i])
        score = predict_score(model, uid, iid)
        print(f"user={uid} item={iid} score={score:.4f}" if score is not None else "score=None")


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["train", "sanity", "summary"])
    args = parser.parse_args()

    if args.command == "train":
        summary = _train_from_source()
        print(
            "Training complete:",
            f"num_users={summary['num_users']}",
            f"num_items={summary['num_items']}",
            f"num_ratings={summary['num_ratings']}",
            f"val_rmse={summary['rmse']:.4f}",
            f"user_bias_std={summary['user_bias_std']:.4f}",
            f"item_bias_std={summary['item_bias_std']:.4f}",
            f"model_path={summary['model_path']}",
        )
    elif args.command == "sanity":
        model = load_mf_model()
        if not model:
            print("Model not found.")
            return
        _sanity_check(model)
    elif args.command == "summary":
        summary = model_summary()
        print("Model summary:", summary)


if __name__ == "__main__":
    main()
