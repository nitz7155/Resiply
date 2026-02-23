from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from typing import List

class CookingStepOut(BaseModel):
    id: int
    step_number: int
    content: str
    url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class CookingTipsBase(BaseModel):
    title: str
    main_thumbnail: Optional[str] = None
    intro_summary: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class CookingTipsOut(CookingTipsBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    steps: List[CookingStepOut] = []

    model_config = ConfigDict(from_attributes=True)

class PaginationCookingTips(BaseModel):
    items: List[CookingTipsOut]
    total_count: int
    page: int
    size: int