from pydantic import BaseModel, ConfigDict
from typing import List


class CategoryOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class MajorCategoryOut(BaseModel):
    id: int
    name: str
    categories: List[CategoryOut] = []

    model_config = ConfigDict(from_attributes=True)