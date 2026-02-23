"""members.csv/ratings.csv 기반으로 MF 데모 데이터를 DB에 적재."""
import csv
import random
import sys
from pathlib import Path
from datetime import timedelta, datetime, timezone

from sqlalchemy import func

# app 모듈(database.py, models.py) import 경로 확보
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import database
import models

SEED = 42


def build_review_content(session, product_id, cache):
    if product_id in cache:
        return cache[product_id]

    prod = (
        session.query(models.Product)
        .filter(models.Product.id == product_id)
        .first()
    )
    if not prod:
        cache[product_id] = None
        return None

    title = prod.title or prod.name or f"product_{product_id}"
    category_name = prod.category.name if getattr(prod, "category", None) else ""
    content = f"{category_name} | {title}" if category_name else title
    cache[product_id] = content
    return content


def load_csv(path: Path):
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)

def load_existing_review_pairs(session, member_ids, product_ids):
    if not member_ids or not product_ids:
        return set()
    rows = (
        session.query(models.ProductReview.member_id, models.ProductReview.product_id)
        .filter(models.ProductReview.member_id.in_(member_ids))
        .filter(models.ProductReview.product_id.in_(product_ids))
        .all()
    )
    return {(int(mid), int(pid)) for mid, pid in rows}


def load_existing_order_pairs(session, member_ids):
    if not member_ids:
        return {}
    rows = (
        session.query(models.Order.member_id, models.OrderDetail.product_id)
        .join(models.OrderDetail, models.Order.id == models.OrderDetail.order_id)
        .filter(models.Order.member_id.in_(member_ids))
        .all()
    )
    mapping = {}
    for member_id, product_id in rows:
        mapping.setdefault(int(member_id), set()).add(int(product_id))
    return mapping


def load_existing_wishlist_members(session, member_ids):
    if not member_ids:
        return set()
    rows = (
        session.query(models.Wishlist.member_id)
        .filter(models.Wishlist.member_id.in_(member_ids))
        .distinct()
        .all()
    )
    return {int(row[0]) for row in rows}


def ensure_members(session, member_ids):
    """CSV member_id를 DB member로 보장."""
    member_key_to_id = {}
    for member_key in member_ids:
        login_id = f"dummy_{member_key}"

        member = session.query(models.Member).filter(models.Member.login_id == login_id).first()
        if not member:
            member = models.Member(
                login_id=login_id,
                type="kakao",
                email=f"{member_key.lower()}@example.com",
                role="user",
                is_deleted=False,
            )
            session.add(member)
            session.flush()
        member_key_to_id[member_key] = member.id

    return member_key_to_id


def ensure_sessions(session, member_map):
    """더미 세션 생성(로그인 테스트용)."""
    sessions = []
    for member_key, member_id in member_map.items():
        session_id = f"dummy-{member_key}"
        existing = (
            session.query(models.AuthSession.id)
            .filter(models.AuthSession.session_id == session_id)
            .first()
        )
        if existing:
            continue

        sessions.append(models.AuthSession(
            session_id=session_id,
            member_id=member_id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            is_revoked=False,
        ))

    if sessions:
        session.bulk_save_objects(sessions)
        session.commit()

    return {member_key: f"dummy-{member_key}" for member_key in member_map.keys()}


def insert_reviews(session, ratings, member_map, chunk_size=500):
    """ratings.csv 기반으로 리뷰 생성."""
    objs = []
    inserted = 0
    content_cache = {}
    product_ids = set()
    for row in ratings:
        try:
            product_ids.add(int(row["product_id"]))
        except (TypeError, ValueError):
            continue
    existing_pairs = load_existing_review_pairs(
        session,
        list(member_map.values()),
        list(product_ids),
    )
    for row in ratings:
        member_key = row["member_id"]
        item_id = row["product_id"]
        rating = int(row["rating"])

        member_id = member_map.get(member_key)
        if not member_id:
            continue

        try:
            product_id = int(item_id)
        except (TypeError, ValueError):
            continue

        if (int(member_id), int(product_id)) in existing_pairs:
            continue

        content = build_review_content(session, product_id, content_cache)
        if not content:
            continue
        review = models.ProductReview(
            member_id=member_id,
            product_id=product_id,
            content=content,
            rating=rating,
        )
        objs.append(review)
        existing_pairs.add((int(member_id), int(product_id)))

        if len(objs) >= chunk_size:
            session.bulk_save_objects(objs)
            session.commit()
            inserted += len(objs)
            objs = []

    if objs:
        session.bulk_save_objects(objs)
        session.commit()
        inserted += len(objs)

    return inserted


def insert_wishlists_and_orders(session, ratings, member_map):
    """높은 평점 중심으로 위시리스트/주문 생성."""
    wishlist_pairs = set()
    order_items = {}
    existing_orders = load_existing_order_pairs(session, list(member_map.values()))
    existing_wishlist_members = load_existing_wishlist_members(session, list(member_map.values()))
    existing_order_members = set(existing_orders.keys())

    for row in ratings:
        rating = int(row["rating"])
        if rating < 4:
            continue

        member_id = member_map.get(row["member_id"])
        if not member_id:
            continue

        try:
            product_id = int(row["product_id"])
        except (TypeError, ValueError):
            continue

        if member_id in existing_wishlist_members:
            pass
        elif random.random() < 0.5:
            wishlist_pairs.add((member_id, product_id))

        if member_id in existing_order_members:
            continue
        if random.random() < 0.3:
            order_items.setdefault(member_id, []).append(product_id)

    for member_id, product_id in wishlist_pairs:
        exists = (
            session.query(models.Wishlist.id)
            .filter(
                models.Wishlist.member_id == member_id,
                models.Wishlist.product_id == product_id,
            )
            .first()
        )
        if not exists:
            session.add(models.Wishlist(member_id=member_id, product_id=product_id))

    for member_id, product_ids in order_items.items():
        if not product_ids:
            continue

        order = models.Order(member_id=member_id, total_price=0, status="paid")
        session.add(order)
        session.flush()

        total_price = 0
        for product_id in product_ids:
            product = session.query(models.Product).filter(models.Product.id == product_id).first()
            price = int(product.price or 0) if product else 0
            total_price += price
            session.add(models.OrderDetail(
                order_id=order.id,
                product_id=product_id,
                quantity=1,
                product_total_price=price,
            ))

        order.total_price = total_price

    session.commit()


def main():
    """CSV -> DB 적재 진입점."""
    random.seed(SEED)

    data_dir = Path(__file__).resolve().parent
    members_path = data_dir / "members.csv"
    ratings_path = data_dir / "ratings.csv"

    if not ratings_path.exists():
        raise RuntimeError("ratings.csv not found in app/data")

    members = load_csv(members_path) if members_path.exists() else []
    ratings = load_csv(ratings_path)

    session = database.SessionLocal()
    try:
        if members:
            member_ids = [row["member_id"] for row in members]
        else:
            member_ids = sorted({row["member_id"] for row in ratings})

        member_map = ensure_members(session, member_ids)

        # 더미 세션 생성: dummy-U001 형태
        session_map = ensure_sessions(session, member_map)

        inserted_reviews = insert_reviews(session, ratings, member_map)
        insert_wishlists_and_orders(session, ratings, member_map)
        print(f"✨ 총 {inserted_reviews} 개의 리뷰 데이터가 삽입되었습니다.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
