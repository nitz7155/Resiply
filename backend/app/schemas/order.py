from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
from schemas.product import ProductOut

class OrderDetailIn(BaseModel):
    product_id: int
    quantity: int = 1


class OrderIn(BaseModel):
    member_id: int
    items: List[OrderDetailIn]


class OrderDetailOut(BaseModel):
    id: int
    order_id: int
    product_id: int
    quantity: int
    product_total_price: int
    product: Optional[ProductOut] = None
    has_review: bool = False

    model_config = ConfigDict(from_attributes=True)


class OrderOut(BaseModel):
    id: int
    member_id: int
    total_price: int
    status: str
    created_at: Optional[datetime] = None
    order_details: List[OrderDetailOut] = []

    model_config = ConfigDict(from_attributes=True)