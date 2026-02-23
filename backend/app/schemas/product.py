from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from typing import List

class ProductBase(BaseModel):
    category_id: int
    name: str
    title: str
    price: int = 0
    main_thumbnail: Optional[str] = None
    detail_images: Optional[str] = None
    stock: Optional[int] = 0
    is_active: Optional[bool] = True

class ProductOut(ProductBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    avg_rating: Optional[float] = 0.0
    review_count: int = 0
    monthly_buyers: int = 0

    model_config = ConfigDict(from_attributes=True)

class PaginationProduct(BaseModel):
    items: List[ProductOut]
    total_count: int
    page: int
    size: int