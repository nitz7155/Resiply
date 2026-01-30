import json
from typing import List, Optional
from uuid import NAMESPACE_DNS, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import Member, Taste
from schemas.mypage import AddressCreate, AddressOut, AddressUpdate, ModifyInfo

router = APIRouter(prefix="/api/mypage", tags=["마이페이지"])


def _get_member_or_404(db: Session, member_id: Optional[int]) -> Member:
    if member_id is None:
        raise HTTPException(status_code=400, detail="member_id는 필수입니다.")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return member


def _coerce_address_entry(entry: dict) -> dict:
    identifier = entry.get("id")
    phone = entry.get("phone")
    delivery_type = entry.get("deliveryType")

    return {
        "id": str(identifier) if identifier is not None else str(uuid4()),
        "label": entry.get("label") or "",
        "receiver": entry.get("receiver") or "",
        "phone": str(phone) if phone is not None else None,
        "addressLine": entry.get("addressLine") or "",
        "deliveryType": str(delivery_type) if delivery_type is not None else None,
        "isDefault": bool(entry.get("isDefault")),
    }


def _load_member_addresses(member: Member) -> List[dict]:
    raw = member.address
    if not raw:
        return []

    if isinstance(raw, list):
        source = raw
    else:
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            # Legacy plain-text address: surface it as a single default entry.
            legacy_value = str(raw)
            legacy_entry = {
                "id": str(uuid5(NAMESPACE_DNS, legacy_value)),
                "label": "기본배송지",
                "receiver": "",
                "phone": None,
                "addressLine": legacy_value,
                "deliveryType": None,
                "isDefault": True,
            }
            return [_coerce_address_entry(legacy_entry)]

        if isinstance(parsed, list):
            source = parsed
        elif isinstance(parsed, dict):
            source = [parsed]
        else:
            return []

    normalized = []
    for item in source:
        if isinstance(item, dict):
            normalized.append(_coerce_address_entry(item))

    return normalized


def _persist_member_addresses(db: Session, member: Member, addresses: List[dict]) -> List[dict]:
    member.address = json.dumps(addresses, ensure_ascii=False) if addresses else None
    db.add(member)
    db.commit()
    db.refresh(member)
    return addresses


def _set_default_address(addresses: List[dict], target_id: str) -> None:
    target = str(target_id)
    found = False

    for entry in addresses:
        matches = str(entry.get("id")) == target
        entry["isDefault"] = matches
        if matches:
            found = True

    if not found:
        _ensure_default_address(addresses)


def _ensure_default_address(addresses: List[dict]) -> None:
    if not addresses:
        return

    default_index = None
    for idx, entry in enumerate(addresses):
        if entry.get("isDefault"):
            default_index = idx
            break

    if default_index is None:
        default_index = 0

    for idx, entry in enumerate(addresses):
        entry["isDefault"] = idx == default_index


@router.get("/edit")
def show_info(member_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    로그인 계정의 정보 리턴
    """
    member_info = _get_member_or_404(db, member_id)

    member_taste = db.query(Taste).filter(Taste.member_id == member_id).first()

    def parse_array(value):
        if not value:
            return []

        # 이미 파이썬 리스트면 그대로
        if isinstance(value, list):
            return value

        # 문자열인 경우
        if isinstance(value, str):
            v = value.strip()

            # PostgreSQL 배열 리터럴: {"매운 맛","짠 맛"}
            if v.startswith("{") and v.endswith("}"):
                inner = v[1:-1].strip()
                if not inner:
                    return []
                return [item.strip().strip('"') for item in inner.split(",")]

            # JSON 문자열인 경우
            try:
                return json.loads(v)
            except Exception:
                return []

        return []

    return {
        "phone": member_info.phone,
        "email": member_info.email,
        "birthday": member_info.birthday,
        "likes": parse_array(member_taste.like if member_taste else None),
        "dislikes": parse_array(member_taste.dislike if member_taste else None),
    }




@router.post("/edit")
def modify_info(payload: ModifyInfo, db: Session = Depends(get_db)):
    """"
    유저 정보 수정
    """

    print(payload)

    member_info = _get_member_or_404(db, payload.member_id)

    if payload.phone is not None:
        member_info.phone = payload.phone

    if payload.email is not None:
        member_info.email = payload.email

    taste = db.query(Taste).filter(Taste.member_id == payload.member_id).first()
    if not taste:
        taste = Taste(member_id=payload.member_id)
        db.add(taste)

    taste.like = payload.likes
    taste.dislike = payload.dislikes

    db.commit()

    return {"success": True, "message": "변경되었습니다."}


@router.get("/address", response_model=List[AddressOut])
def list_addresses(member_id: int, db: Session = Depends(get_db)):
    """회원의 배송지 목록을 반환"""

    member = _get_member_or_404(db, member_id)
    return _load_member_addresses(member)


@router.post("/address", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
def create_address(payload: AddressCreate, db: Session = Depends(get_db)):
    member = _get_member_or_404(db, payload.member_id)
    addresses = _load_member_addresses(member)

    new_address = {
        "id": str(uuid4()),
        "label": payload.label,
        "receiver": payload.receiver,
        "phone": payload.phone,
        "addressLine": payload.addressLine,
        "deliveryType": payload.deliveryType,
        "isDefault": payload.isDefault,
    }

    addresses.append(new_address)

    if payload.isDefault:
        _set_default_address(addresses, new_address["id"])
    else:
        _ensure_default_address(addresses)

    _persist_member_addresses(db, member, addresses)
    return new_address


@router.put("/address/{address_id}", response_model=AddressOut)
def update_address(address_id: str, payload: AddressUpdate, db: Session = Depends(get_db)):
    member = _get_member_or_404(db, payload.member_id)
    addresses = _load_member_addresses(member)
    target = next((addr for addr in addresses if str(addr.get("id")) == str(address_id)), None)

    if not target:
        raise HTTPException(status_code=404, detail="배송지를 찾을 수 없습니다.")

    update_data = payload.model_dump(exclude_unset=True, exclude={"member_id"})

    if "isDefault" in update_data and update_data["isDefault"] is None:
        update_data.pop("isDefault")

    for field in ("label", "receiver", "phone", "addressLine", "deliveryType"):
        if field in update_data:
            target[field] = update_data[field]

    if "isDefault" in update_data:
        target["isDefault"] = bool(update_data["isDefault"])
        if target["isDefault"]:
            _set_default_address(addresses, address_id)
        else:
            _ensure_default_address(addresses)
    else:
        _ensure_default_address(addresses)

    _persist_member_addresses(db, member, addresses)
    return target


@router.delete("/address/{address_id}")
def delete_address(address_id: str, member_id: int, db: Session = Depends(get_db)):
    member = _get_member_or_404(db, member_id)
    addresses = _load_member_addresses(member)

    remaining: List[dict] = []
    removed = None
    for entry in addresses:
        if str(entry.get("id")) == str(address_id):
            removed = entry
            continue
        remaining.append(entry)

    if removed is None:
        raise HTTPException(status_code=404, detail="배송지를 찾을 수 없습니다.")

    _ensure_default_address(remaining)
    _persist_member_addresses(db, member, remaining)

    return {"success": True}