from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models
from schemas.category import MajorCategoryOut

router = APIRouter(prefix="/api", tags=["categories"])


@router.get("/major-categories", response_model=List[MajorCategoryOut])
def get_major_categories(db: Session = Depends(get_db)):
    majors = db.query(models.MajorCategory).all()
    return majors
