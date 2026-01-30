from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from database import get_db
import models
from schemas.product import ProductOut, PaginationProduct
from schemas.review import ProductReviewIn, ProductReviewOut, PaginationReview
from mf_services import mf_services

router = APIRouter(prefix="/api/products", tags=["products"])

RECOMMENDED_PRODUCT_IDS: List[int] = [323, 373, 150, 2, 5, 28, 45, 154, 184, 196, 254, 406]


@router.get("/", response_model=PaginationProduct)
def list_products(
    sort: Optional[str] = Query(None, description="Sort option: price_asc, price_desc, created_desc"), 
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    category_id: Optional[int] = Query(None, description="Filter by single category id"),
    category_ids: Optional[str] = Query(None, description="Filter by multiple category ids (comma-separated)"),
    db: Session = Depends(get_db)
    ):
    """List products with optional sorting.

    Supported sort values:
    - `price_asc`: price ascending
    - `price_desc`: price descending
    - `created_desc`: newest first (by created_at)
    - `sales`: 추가 필요
    - `rating`: 추가 필요

    Unknown or unsupported sort values are ignored (no ordering).
    """
    query = db.query(models.Product)

    # filter by single category id
    if category_id is not None:
        query = query.filter(models.Product.category_id == category_id)

    # filter by multiple category ids passed as comma-separated string
    if category_ids:
        try:
            ids = [int(x) for x in category_ids.split(",") if x.strip()]
            if ids:
                query = query.filter(models.Product.category_id.in_(ids))
        except ValueError:
            # ignore malformed values
            pass

    if sort == "price_asc":
        query = query.order_by(models.Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(models.Product.price.desc())
    elif sort == "created_desc":
        # newest first
        query = query.order_by(models.Product.created_at.desc())

    total_count = query.count()

    skip = (page - 1) * size

    # join with reviews to compute average rating and review count per product
    avg_expr = func.coalesce(func.round(func.avg(models.ProductReview.rating), 1), 0)

    agg_q = (
        query
        .outerjoin(models.ProductReview, models.Product.id == models.ProductReview.product_id)
        .with_entities(models.Product, avg_expr.label("avg_rating"), func.count(models.ProductReview.id).label("review_count"))
        .group_by(models.Product.id)
    )

    rows = agg_q.offset(skip).limit(size).all()

    items = []
    for prod, avg_rating, review_count in rows:
        data = prod.__dict__.copy()
        data.pop("_sa_instance_state", None)
        data["avg_rating"] = float(avg_rating) if avg_rating is not None else 0.0
        data["review_count"] = int(review_count)
        items.append(data)

    return {
        "items": items,
        "total_count": total_count,
        "page": page,
        "size": size,
    }


@router.get("/recommended", response_model=List[ProductOut])
def list_recommended_products(db: Session = Depends(get_db)):
    if not RECOMMENDED_PRODUCT_IDS:
        return []

    rows = (
        db.query(
            models.Product,
            func.coalesce(func.round(func.avg(models.ProductReview.rating), 1), 0).label("avg_rating"),
            func.count(models.ProductReview.id).label("review_count"),
        )
        .outerjoin(models.ProductReview, models.Product.id == models.ProductReview.product_id)
        .filter(models.Product.id.in_(RECOMMENDED_PRODUCT_IDS))
        .group_by(models.Product.id)
        .all()
    )

    product_map = {}
    for product, avg_rating, review_count in rows:
        data = product.__dict__.copy()
        data.pop("_sa_instance_state", None)
        data["avg_rating"] = float(avg_rating) if avg_rating is not None else 0.0
        data["review_count"] = int(review_count)
        product_map[product.id] = data

    ordered_items = [product_map[pid] for pid in RECOMMENDED_PRODUCT_IDS if pid in product_map]
    return ordered_items


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(
            models.Product,
            func.coalesce(func.round(func.avg(models.ProductReview.rating), 1), 0).label("avg_rating"),
            func.count(models.ProductReview.id).label("review_count"),
        )
        .outerjoin(models.ProductReview, models.Product.id == models.ProductReview.product_id)
        .filter(models.Product.id == product_id)
        .group_by(models.Product.id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    product, avg_rating, review_count = row
    data = product.__dict__.copy()
    data.pop("_sa_instance_state", None)
    data["avg_rating"] = float(avg_rating) if avg_rating is not None else 0.0
    data["review_count"] = int(review_count)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    monthly_buyers = (
        db.query(func.count(func.distinct(models.Order.member_id)))
        .select_from(models.Order)
        .join(models.OrderDetail, models.Order.id == models.OrderDetail.order_id)
        .filter(models.OrderDetail.product_id == product_id)
        .filter(models.Order.created_at >= thirty_days_ago)
        .scalar()
    ) or 0
    data["monthly_buyers"] = int(monthly_buyers)
    return data



@router.post("/{product_id}/reviews", response_model=ProductReviewOut)
def create_review(product_id: int, review: ProductReviewIn, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    member = db.query(models.Member).filter(models.Member.id == review.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    order_detail_id = review.order_detail_id
    if order_detail_id:
        od = (
            db.query(models.OrderDetail)
            .join(models.Order, models.Order.id == models.OrderDetail.order_id)
            .filter(models.OrderDetail.id == order_detail_id)
            .first()
        )
        if not od:
            raise HTTPException(status_code=404, detail="Order detail not found")
        if od.product_id != product_id:
            raise HTTPException(status_code=400, detail="Order detail does not match product")
        # optional: ensure the member owns the order
        order_owner_id = (
            db.query(models.Order.member_id)
            .filter(models.Order.id == od.order_id)
            .scalar()
        )
        if order_owner_id and order_owner_id != member.id:
            raise HTTPException(status_code=403, detail="Not allowed to review this order")

    db_review = models.ProductReview(
        member_id=review.member_id,
        product_id=product_id,
        order_detail_id=order_detail_id,
        content=review.content,
        url=review.url,
        rating=review.rating,
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    mf_services.trigger_retrain(reason="review_create")
    return db_review


@router.get("/{product_id}/reviews", response_model=PaginationReview)
def list_reviews(product_id: int, page: int = 1, size: int = 20, db: Session = Depends(get_db)):
    query = db.query(models.ProductReview).filter(models.ProductReview.product_id == product_id)
    total_count = query.count()
    skip = (page - 1) * size
    items = query.order_by(models.ProductReview.created_at.desc()).offset(skip).limit(size).all()
    return {"items": items, "total_count": total_count, "page": page, "size": size}
