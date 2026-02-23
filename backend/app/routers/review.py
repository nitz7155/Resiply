from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


@router.get("/", response_model=List[dict])
def list_reviews(member_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.ProductReview)
    if member_id is not None:
        q = q.filter(models.ProductReview.member_id == member_id)

    reviews = q.order_by(models.ProductReview.created_at.desc()).all()

    out = []
    for r in reviews:
        prod = None
        try:
            prod = db.query(models.Product).filter(models.Product.id == r.product_id).first()
        except Exception:
            prod = None

        out.append({
            "id": r.id,
            "member_id": r.member_id,
            "product_id": r.product_id,
            "content": r.content,
            "rating": r.rating,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "product": {
                "id": prod.id,
                "name": prod.title if getattr(prod, 'title', None) else getattr(prod, 'name', None),
                "main_thumbnail": getattr(prod, 'main_thumbnail', None),
            } if prod else None,
        })

    return out
