import os
import random
import subprocess
import sys
from collections import Counter
from pathlib import Path
from statistics import pstdev


ROOT = Path(__file__).resolve().parents[3]
APP_DIR = ROOT / "backend" / "app"
DATA_DIR = APP_DIR / "data"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import database
import models
from mf_services import mf_recommend


def _run(cmd):
    subprocess.run(cmd, check=True)


def _load_member_ids(session):
    member_ids = set()
    review_rows = (
        session.query(models.ProductReview.member_id)
        .filter(models.ProductReview.member_id.isnot(None))
        .distinct()
        .all()
    )
    member_ids.update(int(row[0]) for row in review_rows if row[0] is not None)

    wishlist_rows = (
        session.query(models.Wishlist.member_id)
        .filter(models.Wishlist.member_id.isnot(None))
        .distinct()
        .all()
    )
    member_ids.update(int(row[0]) for row in wishlist_rows if row[0] is not None)

    order_rows = (
        session.query(models.Order.member_id)
        .filter(models.Order.member_id.isnot(None))
        .distinct()
        .all()
    )
    member_ids.update(int(row[0]) for row in order_rows if row[0] is not None)

    return sorted(member_ids)


def _collect_recommendations(session, member_ids, rec_limit, seed):
    user_items = {}
    user_scores = {}
    total_rows = 0
    item_counts = Counter()
    if not member_ids:
        return user_items, user_scores, item_counts, total_rows

    rng = random.Random(seed)
    member_limit = int(os.getenv("MF_EXPERIMENT_MEMBER_LIMIT", "200"))
    if member_limit > 0 and len(member_ids) > member_limit:
        member_ids = rng.sample(member_ids, member_limit)

    for member_id in member_ids:
        recs, _ = mf_recommend.recommend_for_member_with_score(
            session,
            member_id,
            limit=rec_limit,
            debug=False,
        )
        if not recs:
            continue
        for prod, _, _, score in recs:
            total_rows += 1
            pid = int(prod.id)
            item_counts[pid] += 1
            user_items.setdefault(member_id, set()).add(pid)
            if score is not None:
                user_scores.setdefault(member_id, []).append(float(score))

    return user_items, user_scores, item_counts, total_rows


def _compute_metrics(user_items, user_scores, item_counts, total_rows, seed):
    unique_items_covered = len(item_counts)

    top10 = sum(count for _, count in item_counts.most_common(10))
    top20 = sum(count for _, count in item_counts.most_common(20))
    top50 = sum(count for _, count in item_counts.most_common(50))

    top10_share = top10 / total_rows if total_rows else 0.0
    top20_share = top20 / total_rows if total_rows else 0.0
    top50_share = top50 / total_rows if total_rows else 0.0

    rng = random.Random(seed)
    user_ids = list(user_items.keys())
    jaccard_samples = 200
    shared = 0.0
    count = 0
    if len(user_ids) >= 2:
        for _ in range(jaccard_samples):
            u1, u2 = rng.sample(user_ids, 2)
            a = user_items.get(u1, set())
            b = user_items.get(u2, set())
            union = len(a | b)
            if union == 0:
                continue
            shared += len(a & b) / union
            count += 1
    avg_jaccard = shared / count if count else 0.0

    stds = []
    for scores in user_scores.values():
        if len(scores) >= 2:
            stds.append(pstdev(scores))
    avg_score_std = sum(stds) / len(stds) if stds else 0.0

    return {
        "unique_items_covered": unique_items_covered,
        "top10_share": top10_share,
        "top20_share": top20_share,
        "top50_share": top50_share,
        "avg_jaccard_across_users": avg_jaccard,
        "avg_score_std_per_user": avg_score_std,
    }


def main():
    seed = int(os.getenv("REC_SEED", os.getenv("MF_SEED", "42")))

    _run([sys.executable, "-m", "mf_services.mf_services", "train"])
    rec_limit = int(os.getenv("MF_EXPERIMENT_REC_LIMIT", "20"))
    with database.SessionLocal() as session:
        member_ids = _load_member_ids(session)
        user_items, user_scores, item_counts, total_rows = _collect_recommendations(
            session,
            member_ids,
            rec_limit,
            seed,
        )
    metrics = _compute_metrics(user_items, user_scores, item_counts, total_rows, seed)

    header = [
        "unique_items_covered",
        "top10_share",
        "top20_share",
        "top50_share",
        "avg_jaccard_across_users",
        "avg_score_std_per_user",
    ]
    print(" | ".join(header))
    print(
        f"{metrics['unique_items_covered']} | "
        f"{metrics['top10_share']:.3f} | "
        f"{metrics['top20_share']:.3f} | "
        f"{metrics['top50_share']:.3f} | "
        f"{metrics['avg_jaccard_across_users']:.3f} | "
        f"{metrics['avg_score_std_per_user']:.3f}"
    )


if __name__ == "__main__":
    main()
