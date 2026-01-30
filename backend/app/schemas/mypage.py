from pydantic import BaseModel
from typing import List, Optional

class ModifyInfo(BaseModel):
    member_id: Optional[int]
    phone: Optional[str]
    email: Optional[str]
    likes: Optional[List[str]] = []
    dislikes: Optional[List[str]] = []


class AddressBase(BaseModel):
    label: str
    receiver: str
    addressLine: str
    phone: Optional[str] = None
    deliveryType: Optional[str] = None
    isDefault: bool = False


class AddressCreate(AddressBase):
    member_id: int


class AddressUpdate(BaseModel):
    member_id: int
    label: Optional[str] = None
    receiver: Optional[str] = None
    phone: Optional[str] = None
    addressLine: Optional[str] = None
    deliveryType: Optional[str] = None
    isDefault: Optional[bool] = None


class AddressOut(AddressBase):
    id: str