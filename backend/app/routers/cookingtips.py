from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models
from schemas.cookingtips import CookingTipsOut, PaginationCookingTips

router = APIRouter(prefix="/cookingtips", tags=["cookingtips"])


@router.get("/", response_model=PaginationCookingTips)
def create_cooking_tips(
    sort: Optional[str] = Query(None, description="Sort option: created_desc"), 
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1),
    db: Session = Depends(get_db)
    ):

    query = db.query(models.CookingTip).options(joinedload(models.CookingTip.steps))

    if sort == "created_desc":
        query = query.order_by(models.CookingTip.created_at.desc())

    total_count = query.count()

    skip = (page - 1) * size
    cookingtip = query.offset(skip).limit(size).all()

    return {
        "items" : cookingtip,
        "total_count" : total_count,
        "page" : page,
        "size" : size
    }


@router.get("/{cooking_tip_id}", response_model=CookingTipsOut)
def get_cooking_tips(cooking_tip_id: int, db: Session = Depends(get_db)):
    cookingtip = db.query(models.CookingTip)\
        .options(joinedload(models.CookingTip.steps))\
        .filter(models.CookingTip.id == cooking_tip_id)\
        .first()


    if not cookingtip:
        raise HTTPException(status_code=404, detail="CookingTip not found")
    return cookingtip