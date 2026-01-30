"""MF 추천 로직(진단/다양성 옵션 포함)."""
from typing import Dict, List, Optional, Tuple

import os
import logging
import time

import numpy as np

from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from . import mf_services

POPULAR_ORDER_WEIGHT = 0.8
POPULAR_REVIEW_COUNT_WEIGHT = 0.15
PER_CATEGORY_LIMIT = 3

logger = logging.getLogger(__name__)
_RECOMMEND_CACHE: Dict[Tuple[Optional[int], int, bool, str, float], Tuple[float, List[Tuple[int, float, int, Optional[float]]]]] = {}


def _diversify_enabled() -> bool:
    """다양성 제한 사용 여부."""
    return os.getenv("MF_DIVERSIFY_ENABLED", "true").lower() not in {"0", "false", "no"}


def _per_category_limit() -> int:
    """카테고리별 최대 개수."""
    try:
        return max(1, int(os.getenv("MF_PER_CATEGORY_LIMIT", str(PER_CATEGORY_LIMIT))))
    except ValueError:
        return PER_CATEGORY_LIMIT


def _score_norm_mode() -> str:
    """점수 정규화 모드(none/zscore)."""
    return os.getenv("MF_SCORE_NORM", "zscore").lower()


def _explore_ratio() -> float:
    """탐색 비율(0~1)."""
    try:
        return max(0.0, min(1.0, float(os.getenv("MF_EXPLORE_RATIO", "0.01"))))
    except ValueError:
        return 0.0


def _cache_ttl_seconds() -> int:
    """MF 추천 캐시 TTL (초)."""
    try:
        return max(0, int(os.getenv("MF_CACHE_TTL_SEC", "0")))
    except ValueError:
        return 30


def _cache_key(member_id: Optional[int], limit: int) -> Tuple[Optional[int], int, bool, str, float]:
    return (
        int(member_id) if member_id is not None else None,
        int(limit),
        _diversify_enabled(),
        _score_norm_mode(),
        _explore_ratio(),
    )


def _hydrate_cached(db: Session, rows: List[Tuple[int, float, int, Optional[float]]]):
    if not rows:
        return []
    ids = [pid for pid, _, _, _ in rows]
    products = (
        db.query(models.Product)
        .filter(models.Product.id.in_(ids))
        .all()
    )
    product_map = {int(p.id): p for p in products}
    hydrated = []
    for pid, avg, rc, score in rows:
        prod = product_map.get(int(pid))
        if not prod:
            continue
        hydrated.append((prod, float(avg), int(rc), score))
    return hydrated


def _get_cached_recs(db: Session, member_id: Optional[int], limit: int):
    ttl = _cache_ttl_seconds()
    if ttl <= 0:
        return None
    key = _cache_key(member_id, limit)
    entry = _RECOMMEND_CACHE.get(key)
    if not entry:
        return None
    ts, rows = entry
    if (time.time() - ts) > ttl:
        _RECOMMEND_CACHE.pop(key, None)
        return None
    logger.debug("MF cache hit key=%s", key)
    return _hydrate_cached(db, rows)


def _set_cached_recs(member_id: Optional[int], limit: int, rows: List[Tuple[models.Product, float, int, Optional[float]]]):
    ttl = _cache_ttl_seconds()
    if ttl <= 0:
        return
    key = _cache_key(member_id, limit)
    payload = [(int(p.id), float(avg), int(rc), score) for p, avg, rc, score in rows]
    _RECOMMEND_CACHE[key] = (time.time(), payload)


def _rng():
    """탐색 샘플링용 RNG."""
    try:
        seed = int(os.getenv("MF_SEED", "42"))
    except ValueError:
        seed = 42
    return np.random.default_rng(seed)


def _get_interacted_product_ids(db: Session, member_id: int) -> set:
    """주문/위시/리뷰 기반 상호작용 상품 추출."""
    product_ids = set()

    order_rows = (
        db.query(models.OrderDetail.product_id)
        .join(models.Order, models.Order.id == models.OrderDetail.order_id)
        .filter(models.Order.member_id == member_id)
        .all()
    )
    product_ids.update([row[0] for row in order_rows])

    wishlist_rows = (
        db.query(models.Wishlist.product_id)
        .filter(models.Wishlist.member_id == member_id)
        .all()
    )
    product_ids.update([row[0] for row in wishlist_rows])

    review_rows = (
        db.query(models.Recommend.product_id)
        .filter(models.Recommend.member_id == member_id)
        .all()
    )
    product_ids.update([row[0] for row in review_rows])

    return product_ids


def _base_product_query(db: Session):
    """활성 상품 + 리뷰/주문 집계 조인."""
    order_subq = (
        db.query(
            models.OrderDetail.product_id.label("product_id"),
            func.count(models.OrderDetail.id).label("order_count"),
        )
        .group_by(models.OrderDetail.product_id)
        .subquery()
    )

    review_subq = (
        db.query(
            models.ProductReview.product_id.label("product_id"),
            func.count(models.ProductReview.id).label("review_count"),
            func.coalesce(func.avg(models.ProductReview.rating), 0).label("avg_rating"),
        )
        .group_by(models.ProductReview.product_id)
        .subquery()
    )

    order_count = func.coalesce(order_subq.c.order_count, 0)
    review_count = func.coalesce(review_subq.c.review_count, 0)
    avg_rating = func.coalesce(review_subq.c.avg_rating, 0)

    query = (
        db.query(
            models.Product,
            avg_rating.label("avg_rating"),
            review_count.label("review_count"),
            order_count.label("order_count"),
        )
        .filter(models.Product.is_active.is_(True))
        .outerjoin(order_subq, models.Product.id == order_subq.c.product_id)
        .outerjoin(review_subq, models.Product.id == review_subq.c.product_id)
    )

    return query, order_count, review_count, avg_rating


def _get_member_category_stats(
    db: Session, member_id: int
) -> Tuple[Dict[int, float], Dict[int, int], int]:
    review_rows = (
        db.query(models.Product.category_id, func.count(models.ProductReview.id))
        .join(models.Product, models.Product.id == models.ProductReview.product_id)
        .filter(models.ProductReview.member_id == member_id)
        .group_by(models.Product.category_id)
        .all()
    )
    wishlist_rows = (
        db.query(models.Product.category_id, func.count(models.Wishlist.id))
        .join(models.Product, models.Product.id == models.Wishlist.product_id)
        .filter(models.Wishlist.member_id == member_id)
        .group_by(models.Product.category_id)
        .all()
    )
    order_rows = (
        db.query(models.Product.category_id, func.count(models.OrderDetail.id))
        .join(models.Product, models.Product.id == models.OrderDetail.product_id)
        .join(models.Order, models.Order.id == models.OrderDetail.order_id)
        .filter(models.Order.member_id == member_id)
        .group_by(models.Product.category_id)
        .all()
    )

    weights: Dict[int, float] = {}
    counts: Dict[int, int] = {}
    for cid, cnt in review_rows:
        cid_int = int(cid)
        weights[cid_int] = weights.get(cid_int, 0.0) + float(cnt)
        counts[cid_int] = counts.get(cid_int, 0) + int(cnt)
    for cid, cnt in wishlist_rows:
        cid_int = int(cid)
        weights[cid_int] = weights.get(cid_int, 0.0) + float(cnt) * 0.8
        counts[cid_int] = counts.get(cid_int, 0) + int(cnt)
    for cid, cnt in order_rows:
        cid_int = int(cid)
        weights[cid_int] = weights.get(cid_int, 0.0) + float(cnt) * 1.2
        counts[cid_int] = counts.get(cid_int, 0) + int(cnt)

    total_interactions = sum(counts.values())
    max_weight = max(weights.values()) if weights else 0.0
    if max_weight <= 0.0:
        return {}, counts, total_interactions
    return {cid: w / max_weight for cid, w in weights.items()}, counts, total_interactions


def _apply_sparse_preference(
    mixed: List[Tuple[models.Product, float, int, float, float]],
    prefer_ids: List[int],
    category_weights: Dict[int, float],
    limit: int,
    prefer_pool: Optional[List[Tuple[models.Product, float, int, float, float]]] = None,
) -> List[Tuple[models.Product, float, int, float, float]]:
    try:
        min_per = int(os.getenv("MF_PREFER_MIN_PER_CATEGORY", "1"))
    except ValueError:
        min_per = 1
    try:
        max_per = int(os.getenv("MF_PREFER_MAX_PER_CATEGORY", "2"))
    except ValueError:
        max_per = 2
    min_per = max(0, min_per)
    max_per = max(min_per, max_per)

    pool = prefer_pool if prefer_pool is not None else mixed
    per_cat_items: Dict[int, List[Tuple[models.Product, float, int, float, float]]] = {}
    for row in pool:
        cid = int(row[0].category_id)
        if cid in prefer_ids:
            per_cat_items.setdefault(cid, []).append(row)

    cats_sorted = sorted(
        prefer_ids, key=lambda cid: category_weights.get(cid, 0.0), reverse=True
    )
    if min_per > 0:
        max_cats = max(1, limit // max(1, min_per))
        if len(cats_sorted) > max_cats:
            cats_sorted = cats_sorted[:max_cats]

    picked: List[Tuple[models.Product, float, int, float, float]] = []
    picked_ids = set()
    per_cat_idx = {cid: 0 for cid in cats_sorted}
    per_cat_picked = {cid: 0 for cid in cats_sorted}

    def _take_next(cid: int):
        items = per_cat_items.get(cid)
        if not items:
            return None
        idx = per_cat_idx.get(cid, 0)
        if idx >= len(items):
            return None
        per_cat_idx[cid] = idx + 1
        return items[idx]

    for cid in cats_sorted:
        for _ in range(min_per):
            if len(picked) >= limit:
                break
            item = _take_next(cid)
            if item is None:
                break
            pid = int(item[0].id)
            if pid in picked_ids:
                continue
            picked.append(item)
            picked_ids.add(pid)
            per_cat_picked[cid] += 1
        if len(picked) >= limit:
            break

    if len(picked) < limit and max_per > 0:
        while len(picked) < limit:
            progressed = False
            for cid in cats_sorted:
                if len(picked) >= limit:
                    break
                if per_cat_picked[cid] >= max_per:
                    continue
                item = _take_next(cid)
                if item is None:
                    continue
                pid = int(item[0].id)
                if pid in picked_ids:
                    continue
                picked.append(item)
                picked_ids.add(pid)
                per_cat_picked[cid] += 1
                progressed = True
            if not progressed:
                break

    if len(picked) < limit:
        for row in mixed:
            if len(picked) >= limit:
                break
            pid = int(row[0].id)
            if pid in picked_ids:
                continue
            picked.append(row)
            picked_ids.add(pid)

    return picked


def _popular_products(db: Session, limit: int) -> List[Tuple[models.Product, float, int]]:
    """모델이 없을 때 사용하는 인기 기반 추천."""
    query, order_count, review_count, avg_rating = _base_product_query(db)
    score = (order_count * POPULAR_ORDER_WEIGHT) + avg_rating + (review_count * POPULAR_REVIEW_COUNT_WEIGHT)

    candidate_limit = min(max(limit * 5, 50), 500)
    rows = (
        query.order_by(score.desc(), models.Product.created_at.desc())
        .limit(candidate_limit)
        .all()
    )

    # diversify results so a single subcategory doesn't dominate
    picked: List[Tuple[models.Product, float, int]] = []
    per_cat_counts: Dict[int, int] = {}
    for prod, avg, rc, _ in rows:
        cat_id = int(prod.category_id)
        if per_cat_counts.get(cat_id, 0) >= _per_category_limit():
            continue
        per_cat_counts[cat_id] = per_cat_counts.get(cat_id, 0) + 1
        picked.append((prod, float(avg), int(rc)))
        if len(picked) >= limit:
            break

    if len(picked) < limit:
        for prod, avg, rc, _ in rows:
            if len(picked) >= limit:
                break
            if any(p.id == prod.id for p, _, _ in picked):
                continue
            picked.append((prod, float(avg), int(rc)))

    return picked


def recommend_for_member_with_score(
    db: Session,
    member_id: Optional[int],
    limit: int = 20,
    debug: bool = False,
) -> Tuple[List[Tuple[models.Product, float, int, Optional[float]]], Optional[Dict[str, int]]]:
    # 진단 정보(옵션)
    diagnostics = {
        "total_active_products": 0,
        "scorable_items_after_model_filter": 0,
        "interacted_excluded_count": 0,
        "remaining_candidates_before_diversify": 0,
        "selected_after_diversify": 0,
        "filled_by_fallback": 0,
    }

    if not debug:
        cached = _get_cached_recs(db, member_id, limit)
        if cached is not None:
            return (cached, None)

    if member_id is None:
        logger.info("MF fallback: anonymous member")
        recs = [(p, a, r, None) for p, a, r in _popular_products(db, limit)]
        if not debug:
            _set_cached_recs(member_id, limit, recs)
        return (recs, diagnostics) if debug else (recs, None)

    # 모델 로드 실패/미등록 유저는 인기 추천으로 대체
    model = mf_services.load_mf_model()
    if not model:
        logger.warning("MF fallback: model not available")
        recs = [(p, a, r, None) for p, a, r in _popular_products(db, limit)]
        if not debug:
            _set_cached_recs(member_id, limit, recs)
        return (recs, diagnostics) if debug else (recs, None)

    if int(member_id) not in model.get("user_index", {}):
        logger.info("MF fallback: member_id not in model")
        recs = [(p, a, r, None) for p, a, r in _popular_products(db, limit)]
        if not debug:
            _set_cached_recs(member_id, limit, recs)
        return (recs, diagnostics) if debug else (recs, None)

    # 후보군: 활성 상품 전체 -> 상호작용 제외
    query, _, _, _ = _base_product_query(db)
    diagnostics["total_active_products"] = query.count()

    interacted_ids = _get_interacted_product_ids(db, member_id)
    if interacted_ids:
        query = query.filter(~models.Product.id.in_(interacted_ids))
        diagnostics["interacted_excluded_count"] = max(
            0, diagnostics["total_active_products"] - query.count()
        )

    rows = (
        query.order_by(models.Product.created_at.desc())
        .all()
    )

    if not rows:
        logger.info("MF fallback: no active products")
        recs = [(p, a, r, None) for p, a, r in _popular_products(db, limit)]
        if not debug:
            _set_cached_recs(member_id, limit, recs)
        return (recs, diagnostics) if debug else (recs, None)

    category_bonus = 0.0
    try:
        category_bonus = float(os.getenv("MF_CATEGORY_BONUS", "1.0"))
    except ValueError:
        category_bonus = 0.0
    category_weights, category_counts, total_interactions = _get_member_category_stats(
        db, int(member_id)
    )

    # MF 점수 계산(모델에 있는 아이템만)
    scored: List[Tuple[models.Product, float, int, float]] = []
    for prod, avg, rc, _ in rows:
        score = mf_services.predict_score(model, int(member_id), int(prod.id))
        if score is None:
            continue
        bonus = category_weights.get(int(prod.category_id), 0.0) * category_bonus
        scored.append((prod, float(avg), int(rc), float(score + bonus)))
    diagnostics["scorable_items_after_model_filter"] = len(scored)
    diagnostics["remaining_candidates_before_diversify"] = len(scored)

    if not scored:
        logger.info("MF fallback: no scorable items")
        recs = [(p, a, r, None) for p, a, r in _popular_products(db, limit)]
        if not debug:
            _set_cached_recs(member_id, limit, recs)
        return (recs, diagnostics) if debug else (recs, None)

    # 점수 정규화(랭킹에만 사용)
    if _score_norm_mode() == "zscore":
        scores = [s for _, _, _, s in scored]
        mean = float(sum(scores) / len(scores))
        var = sum((s - mean) ** 2 for s in scores) / len(scores)
        std = float(var ** 0.5)
        scored = [(p, a, r, s, (s - mean) / (std + 1e-8)) for p, a, r, s in scored]
    else:
        scored = [(p, a, r, s, s) for p, a, r, s in scored]

    scored.sort(key=lambda r: (r[4], r[0].created_at), reverse=True)
    # 탐색 혼합(상위 + 샘플)
    explore_count = int(round(limit * _explore_ratio()))
    explore_count = min(explore_count, max(0, len(scored) - limit))
    base_count = max(0, limit - explore_count)
    base = scored[:base_count]
    explore_pool = scored[base_count:base_count + 200]
    explore = []
    if explore_count > 0 and explore_pool:
        rng = _rng()
        weights = np.array([max(0.0, row[3]) for row in explore_pool], dtype=float)
        if weights.sum() == 0:
            weights = None
        indices = rng.choice(len(explore_pool), size=explore_count, replace=False, p=None if weights is None else (weights / weights.sum()))
        explore = [explore_pool[i] for i in indices]
    mixed = base + explore

    prefer_ids = [int(cid) for cid in category_counts.keys()]
    if prefer_ids:
        mixed = _apply_sparse_preference(mixed, prefer_ids, category_weights, limit, scored)

    # 다양성 끄면 바로 top-N 반환
    if not _diversify_enabled():
        picked = [(prod, float(avg), int(rc), float(score)) for prod, avg, rc, score, _ in mixed[:limit]]
        diagnostics["selected_after_diversify"] = len(picked)
        if not debug:
            _set_cached_recs(member_id, limit, picked)
        return (picked, diagnostics) if debug else (picked, None)

    # 다양성 제한 적용
    picked: List[Tuple[models.Product, float, int, Optional[float]]] = []
    per_cat_counts: Dict[int, int] = {}
    for prod, avg, rc, score, _ in mixed:
        cat_id = int(prod.category_id)
        if per_cat_counts.get(cat_id, 0) >= _per_category_limit():
            continue
        per_cat_counts[cat_id] = per_cat_counts.get(cat_id, 0) + 1
        picked.append((prod, float(avg), int(rc), float(score)))
        if len(picked) >= limit:
            break

    if len(picked) < limit:
        for prod, avg, rc, score, _ in mixed:
            if len(picked) >= limit:
                break
            if any(p.id == prod.id for p, _, _, _ in picked):
                continue
            picked.append((prod, float(avg), int(rc), float(score)))
            diagnostics["filled_by_fallback"] += 1

    diagnostics["selected_after_diversify"] = len(picked)

    if not debug:
        _set_cached_recs(member_id, limit, picked)
    return (picked, diagnostics) if debug else (picked, None)


def recommend_for_member(
    db: Session, member_id: Optional[int], limit: int = 20, debug: bool = False
) -> List[Tuple[models.Product, float, int]]:
    """외부 호출용: 점수 없이 (Product, avg_rating, review_count) 반환."""
    recs, diagnostics = recommend_for_member_with_score(db, member_id, limit, debug=debug)
    results = [(prod, avg, rc) for prod, avg, rc, _ in recs]
    return (results, diagnostics) if debug else results
