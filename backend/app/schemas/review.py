from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class ProductReviewIn(BaseModel):
    member_id: int
    content: str
    url: Optional[str] = None
    rating: int
    order_detail_id: Optional[int] = None

class ProductReviewOut(BaseModel):
    id: int
    member_id: int
    product_id: int
    order_detail_id: Optional[int] = None
    content: str
    url: Optional[str] = None
    rating: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class PaginationReview(BaseModel):
    items: List[ProductReviewOut]
    total_count: int
    page: int
    size: int