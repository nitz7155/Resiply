from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from database import get_db
import models
from schemas.order import OrderIn, OrderOut
from mf_services import mf_services

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("/", response_model=OrderOut)
def create_order(order_in: OrderIn, db: Session = Depends(get_db)):
    # validate member
    member = db.query(models.Member).filter(models.Member.id == order_in.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    total = 0
    order = models.Order(member_id=order_in.member_id, total_price=0)

    for item in order_in.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        product_price = product.price if product.price is not None else 0
        product_total = product_price * item.quantity

        od = models.OrderDetail(
            product_id=item.product_id,
            quantity=item.quantity,
            product_total_price=product_total,
        )
        order.order_details.append(od)
        total += product_total

    order.total_price = total
    order.status = "배송완료"

    db.add(order)
    db.commit()
    db.refresh(order)
    mf_services.trigger_retrain(reason="order_create")

    return order


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(models.Order)
        .options(joinedload(models.Order.order_details).joinedload(models.OrderDetail.product))
        .filter(models.Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # mark has_review for each order_detail using member_id scope
    member_id = order.member_id
    if member_id and order.order_details:
        od_ids = {od.id for od in order.order_details}
        if od_ids:
            reviewed_od_ids = {
                oid
                for (oid,) in db.query(models.ProductReview.order_detail_id)
                .filter(models.ProductReview.member_id == member_id)
                .filter(models.ProductReview.order_detail_id.in_(od_ids))
                .all()
            }
            for od in order.order_details:
                setattr(od, "has_review", od.id in reviewed_od_ids)

    return order


@router.get("/", response_model=List[OrderOut])
def list_orders(member_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Order).options(
        joinedload(models.Order.order_details).joinedload(models.OrderDetail.product)
    )
    if member_id is not None:
        q = q.filter(models.Order.member_id == member_id)

    orders = q.order_by(models.Order.created_at.desc()).all()

    # mark order_details that already have a review by this member (one review per order line)
    if member_id is not None and orders:
        od_ids = {od.id for o in orders for od in (o.order_details or [])}
        if od_ids:
            reviewed_od_ids = {
                oid
                for (oid,) in db.query(models.ProductReview.order_detail_id)
                .filter(models.ProductReview.member_id == member_id)
                .filter(models.ProductReview.order_detail_id.in_(od_ids))
                .all()
            }
            for o in orders:
                for od in o.order_details or []:
                    setattr(od, "has_review", od.id in reviewed_od_ids)

    return orders
