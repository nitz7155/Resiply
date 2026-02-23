from pydantic import BaseModel, ConfigDict
from datetime import datetime

class WishlistProductOut(BaseModel):
    product_id: int
    title: str
    price: int
    main_thumbnail: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)