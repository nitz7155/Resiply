from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from mf_services import mf_recommend, mf_services
import models
from schemas.product import ProductOut

router = APIRouter(prefix="/api/mf_recommend", tags=["mf_recommend"])


@router.get("/mf", response_model=List[ProductOut])
def get_mf_recommendations(
    member_id: Optional[int] = Query(None, description="Member id for personalized recommendations"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """MF 추천 목록 조회."""
    mf_services.trigger_retrain(reason="api_recommend_request")
    rows = mf_recommend.recommend_for_member(db, member_id, limit)

    items = []
    for prod, avg_rating, review_count in rows:
        data = prod.__dict__.copy()
        data.pop("_sa_instance_state", None)
        data["avg_rating"] = float(avg_rating) if avg_rating is not None else 0.0
        data["review_count"] = int(review_count)
        data["monthly_buyers"] = 0
        items.append(data)

    return items


@router.get("/stats")
def get_member_category_stats(
    member_id: int = Query(..., description="Member id"),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """회원 카테고리 통계(리뷰/위시/구매/추천)."""
    review_rows = (
        db.query(
            models.Product.category_id,
            models.Category.name,
            func.count(models.ProductReview.id),
            func.coalesce(func.avg(models.ProductReview.rating), 0),
        )
        .join(models.Product, models.Product.id == models.ProductReview.product_id)
        .join(models.Category, models.Category.id == models.Product.category_id)
        .filter(models.ProductReview.member_id == member_id)
        .group_by(models.Product.category_id, models.Category.name)
        .all()
    )
    wishlist_rows = (
        db.query(
            models.Product.category_id,
            models.Category.name,
            func.count(models.Wishlist.id),
        )
        .join(models.Product, models.Product.id == models.Wishlist.product_id)
        .join(models.Category, models.Category.id == models.Product.category_id)
        .filter(models.Wishlist.member_id == member_id)
        .group_by(models.Product.category_id, models.Category.name)
        .all()
    )
    order_rows = (
        db.query(
            models.Product.category_id,
            models.Category.name,
            func.count(models.OrderDetail.id),
        )
        .join(models.Product, models.Product.id == models.OrderDetail.product_id)
        .join(models.Category, models.Category.id == models.Product.category_id)
        .join(models.Order, models.Order.id == models.OrderDetail.order_id)
        .filter(models.Order.member_id == member_id)
        .group_by(models.Product.category_id, models.Category.name)
        .all()
    )

    review_map: Dict[int, int] = {cid: int(cnt) for cid, _, cnt, _ in review_rows}
    rating_map: Dict[int, float] = {cid: float(avg) for cid, _, _, avg in review_rows}
    wishlist_map: Dict[int, int] = {cid: int(cnt) for cid, _, cnt in wishlist_rows}
    order_map: Dict[int, int] = {cid: int(cnt) for cid, _, cnt in order_rows}

    rec_rows = mf_recommend.recommend_for_member(db, member_id, limit)
    rec_map: Dict[int, int] = {}
    for prod, _, _ in rec_rows:
        cid = int(prod.category_id)
        rec_map[cid] = rec_map.get(cid, 0) + 1

    category_ids = set(review_map) | set(wishlist_map) | set(order_map) | set(rec_map)
    name_map: Dict[int, str] = {}
    if category_ids:
        cat_rows = (
            db.query(models.Category.id, models.Category.name)
            .filter(models.Category.id.in_(list(category_ids)))
            .all()
        )
        name_map = {cid: name for cid, name in cat_rows}

    rows = []
    for cid in category_ids:
        rows.append(
            {
                "category_id": cid,
                "category_name": name_map.get(cid, ""),
                "review_count": review_map.get(cid, 0),
                "avg_rating": round(rating_map.get(cid, 0.0), 2),
                "wishlist_count": wishlist_map.get(cid, 0),
                "order_count": order_map.get(cid, 0),
                "recommend_count": rec_map.get(cid, 0),
            }
        )

    rows.sort(
        key=lambda r: (
            r["recommend_count"],
            r["order_count"],
            r["wishlist_count"],
            r["review_count"],
        ),
        reverse=True,
    )
    return {"member_id": member_id, "items": rows}
