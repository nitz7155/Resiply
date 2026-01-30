from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Product, Wishlist, Member
from deps.auth import get_current_member
from mf_services import mf_services

router = APIRouter(prefix="/api/wishlist", tags=["wishlist"])

@router.get("/")
def get_my_wishlist(
    db: Session = Depends(get_db),
    me: Member = Depends(get_current_member),
):
    rows = (
        db.query(Wishlist)
        .join(Product, Product.id == Wishlist.product_id)
        .filter(Wishlist.member_id == me.id)
        .order_by(Wishlist.created_at.desc())
        .all()
    )

    # ✅ 프론트에서 바로 WishlistItem으로 매핑하기 쉬운 형태
    return [
        {
            "id": str(w.product.id),
            "title": w.product.title,
            "name": w.product.name,
            "price": w.product.price,
            "imageUrl": w.product.main_thumbnail,
            "likedAt": w.created_at.isoformat(),
        }
        for w in rows
    ]


@router.post("/{product_id}", status_code=status.HTTP_201_CREATED)
def add_to_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    me: Member = Depends(get_current_member),
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.is_active == True)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    exists = (
        db.query(Wishlist)
        .filter(Wishlist.member_id == me.id, Wishlist.product_id == product_id)
        .first()
    )
    if exists:
        return {"liked": True}

    w = Wishlist(member_id=me.id, product_id=product_id)
    db.add(w)
    db.commit()
    mf_services.trigger_retrain(reason="wishlist_add")
    return {"liked": True}


@router.delete("/{product_id}")
def remove_from_wishlist(
    product_id: int,
    db: Session = Depends(get_db),
    me: Member = Depends(get_current_member),
):
    row = (
        db.query(Wishlist)
        .filter(Wishlist.member_id == me.id, Wishlist.product_id == product_id)
        .first()
    )
    if not row:
        return {"liked": False}

    db.delete(row)
    db.commit()
    mf_services.trigger_retrain(reason="wishlist_remove")
    return {"liked": False}
