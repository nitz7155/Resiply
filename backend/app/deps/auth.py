from typing import Optional
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import AuthSession, Member

def get_current_member(
    user_id: Optional[str] = Cookie(None),
    session_id: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
) -> Member:
    if not user_id or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not logged in")

    session = (
        db.query(AuthSession)
        .filter(
            AuthSession.session_id == session_id,
            AuthSession.member_id == int(user_id),
            AuthSession.is_revoked == False,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    member = db.query(Member).filter(Member.id == int(user_id), Member.is_deleted == False).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return member
