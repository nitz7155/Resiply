from pydantic import BaseModel, ConfigDict
from typing import Optional

class SocialAccountOut(BaseModel):
    provider: str
    display_name: Optional[str] = None
    provider_user_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UserOut(BaseModel):
    id: int
    login_id: str
    type: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    social: Optional[SocialAccountOut] = None

    model_config = ConfigDict(from_attributes=True)

class CurrentUserResponse(BaseModel):
    isLoggedIn: bool
    user: Optional[UserOut] = None

    model_config = ConfigDict(from_attributes=True)