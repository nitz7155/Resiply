from pydantic import BaseModel, ConfigDict, Field
from typing import List

class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class GetRecipe(BaseSchema):
    id: int
class RecipeTipsResponse(BaseModel):
    recipe_id: int
    tips: List[str] = Field(default_factory=list)