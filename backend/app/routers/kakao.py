import os
import httpx
import uuid
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Cookie
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
from models import Member, SocialAccount, SocialToken, AuthSession
from schemas.user import CurrentUserResponse

logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parent.parent.parent / "..env"
load_dotenv(ENV_PATH)

KAKAO_CLIENT_ID = os.getenv("KAKAO_CLIENT_ID")
KAKAO_CLIENT_SECRET = os.getenv("KAKAO_CLIENT_SECRET")
KAKAO_REDIRECT_URI = os.getenv("KAKAO_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

_state_store = {}
router = APIRouter(prefix="/api/auth/kakao", tags=["카카오 소셜로그인"])


@router.get("/login")
async def kakao_login():
    state = str(uuid.uuid4())
    _state_store[state] = datetime.now() + timedelta(minutes=10)
    
    login_url = (
        "https://kauth.kakao.com/oauth/authorize"
        f"?response_type=code&client_id={KAKAO_CLIENT_ID}"
        f"&redirect_uri={KAKAO_REDIRECT_URI}&state={state}&prompt=login"
    )
    return RedirectResponse(url=login_url)


@router.get("/callback")
async def kakao_callback(code: str, state: str, db: Session = Depends(get_db)):
    # state 검증
    if state not in _state_store or _state_store[state] < datetime.now():
        logger.warning(f"Invalid state: {state}")
        _state_store.pop(state, None)
        return JSONResponse(status_code=400, content={"error": "유효하지 않은 요청입니다."})
    
    del _state_store[state]
    
    # 토큰 교환
    token_url = "https://kauth.kakao.com/oauth/token"
    token_data = {
        "grant_type": "authorization_code",
        "client_id": KAKAO_CLIENT_ID,
        "redirect_uri": KAKAO_REDIRECT_URI,
        "client_secret": KAKAO_CLIENT_SECRET,
        "code": code,
    }

    try:
        async with httpx.AsyncClient() as client:
            token_res = await client.post(token_url, data=token_data, timeout=10)
        
        if token_res.status_code != 200:
            logger.error(f"Token exchange failed: {token_res.text}")
            return JSONResponse(status_code=400, content={"error": "토큰 발급 실패"})
        
        token_json = token_res.json()
        access_token = token_json.get("access_token")
        if not access_token:
            return JSONResponse(status_code=400, content={"error": "토큰 없음"})
        
    except Exception as e:
        logger.error(f"Token request failed: {str(e)}")
        return JSONResponse(status_code=502, content={"error": "카카오 서버 오류"})

    # 사용자 정보 조회
    try:
        async with httpx.AsyncClient() as client:
            user_res = await client.get(
                "https://kapi.kakao.com/v2/user/me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10
            )
        
        if user_res.status_code != 200:
            logger.error(f"User info failed: {user_res.text}")
            return JSONResponse(status_code=400, content={"error": "사용자 정보 조회 실패"})
        
        user_json = user_res.json()
        
    except Exception as e:
        logger.error(f"User info request failed: {str(e)}")
        return JSONResponse(status_code=502, content={"error": "카카오 서버 오류"})

    kakao_id = user_json.get("id")
    if not kakao_id:
        logger.error(f"No kakao id: {user_json}")
        return JSONResponse(status_code=400, content={"error": "사용자 ID 없음"})

    kakao_account = user_json.get("kakao_account", {}) or {}
    kakao_nickname = kakao_account.get("profile", {}).get("nickname") or "Unknown"
    kakao_email = kakao_account.get("email")
    kakao_phone = kakao_account.get("phone_number")
    kakao_birthday = kakao_account.get("birthday")

    newly_created = False
    expires_in = int(token_json.get("expires_in", 6 * 60 * 60))

    # DB 처리
    try:
        social = db.query(SocialAccount).filter(
            SocialAccount.provider == "kakao",
            SocialAccount.provider_user_id == str(kakao_id),
        ).first()

        if social:
            social.unlinked_at = None
            social.email = kakao_email or social.email
            social.display_name = kakao_nickname or social.display_name
            member = social.member
            if member.is_deleted:
                member.is_deleted = False
        else:
            member = db.query(Member).filter(
                Member.email == kakao_email,
                Member.is_deleted == False
            ).first() if kakao_email else None

            if not member:
                newly_created = True
                member = Member(
                    login_id=f"kakao_{kakao_id}",
                    type="kakao",
                    phone=kakao_phone,
                    email=kakao_email,
                    birthday=kakao_birthday,
                    role="user",
                    is_deleted=False,
                )
                db.add(member)
                db.flush()

            social = SocialAccount(
                member_id=member.id,
                provider="kakao",
                provider_user_id=str(kakao_id),
                email=kakao_email,
                display_name=kakao_nickname,
                unlinked_at=None,
            )
            db.add(social)
            db.flush()

        db.commit()
        db.refresh(social)
        db.refresh(member)

    except Exception as e:
        db.rollback()
        logger.exception("DB error")
        return JSONResponse(status_code=500, content={"error": "DB 오류"})

    # SocialToken 저장
    try:
        expires_at = datetime.now() + timedelta(seconds=expires_in)
        
        social_token = db.query(SocialToken).filter(
            SocialToken.social_account_id == social.id
        ).order_by(SocialToken.id.desc()).first()

        if social_token:
            social_token.access_token = token_json.get("access_token")
            social_token.refresh_token = token_json.get("refresh_token") or social_token.refresh_token
            social_token.expires_at = expires_at
        else:
            db.add(SocialToken(
                social_account_id=social.id,
                access_token=token_json.get("access_token"),
                refresh_token=token_json.get("refresh_token"),
                expires_at=expires_at,
            ))

        db.commit()

    except Exception as e:
        db.rollback()
        logger.exception("Social token save failed")

    # AuthSession 생성
    try:
        session_id = str(uuid.uuid4())
        session_expires_at = datetime.now() + timedelta(days=30)

        old_sessions = db.query(AuthSession).filter(
            AuthSession.member_id == member.id,
            AuthSession.is_revoked == False
        ).all()
        for s in old_sessions:
            s.is_revoked = True

        db.add(AuthSession(
            session_id=session_id,
            member_id=member.id,
            expires_at=session_expires_at,
            is_revoked=False,
        ))
        db.commit()

    except Exception as e:
        db.rollback()
        logger.exception("Session creation failed")
        return JSONResponse(status_code=500, content={"error": "세션 생성 실패"})

    # 프론트 리다이렉트
    redirect_url = f"{FRONTEND_URL}/callback" + ("?signup=true" if newly_created else "")
    html = f"""
    <html><head><script>
        try {{ localStorage.setItem('isLogin', 'true'); }} catch(e) {{}}
        window.location.href = "{redirect_url}";
    </script></head></html>
    """
    response = HTMLResponse(html)

    cookie_opt = {"httponly": True, "secure": False, "samesite": "lax", "path": "/"}
    response.set_cookie("session_id", session_id, max_age=30 * 24 * 60 * 60, **cookie_opt)
    response.set_cookie("user_id", str(member.id), max_age=30 * 24 * 60 * 60, **cookie_opt)
    response.set_cookie("is_login", "true", httponly=False, secure=False, samesite="lax", path="/")
    
    return response


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user(
    user_id: Optional[str] = Cookie(None),
    session_id: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    if not user_id or not session_id:
        return {"isLoggedIn": False, "user": None}

    try:
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
            return {"isLoggedIn": False, "user": None}

        if session.expires_at < datetime.now():
            session.is_revoked = True
            db.commit()
            return {"isLoggedIn": False, "user": None}

        member = db.query(Member).filter(Member.id == int(user_id), Member.is_deleted == False).first()
        if not member:
            return {"isLoggedIn": False, "user": None}

        # 대표 소셜 계정 정보(있으면)
        social = (
            db.query(SocialAccount)
            .filter(SocialAccount.member_id == member.id, SocialAccount.unlinked_at.is_(None))
            .order_by(SocialAccount.id.desc())
            .first()
        )

        return {
            "isLoggedIn": True,
            "user": {
                "id": member.id,
                "login_id": member.login_id,
                "type": member.type,
                "email": member.email,
                "role": member.role,
                "social": {
                    "provider": social.provider,
                    "display_name": social.display_name,
                    "provider_user_id": social.provider_user_id,
                } if social else None,
            },
        }

    except Exception as e:
        logger.exception("Error in get_current_user")
        return {"isLoggedIn": False, "user": None}


@router.get("/logout")
async def kakao_logout(
    session_id: Optional[str] = Cookie(None),
    user_id: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    if session_id and user_id:
        try:
            session = db.query(AuthSession).filter(
                AuthSession.session_id == session_id,
                AuthSession.member_id == int(user_id)
            ).first()
            if session:
                session.is_revoked = True
                db.commit()
        except Exception as e:
            logger.exception("Session revoke failed")

    response = HTMLResponse(
        '<script>alert("로그아웃 되었습니다."); window.location.href = "/";</script>'
    )

    delete_opt = {"path": "/", "httponly": True, "secure": False, "samesite": "lax"}
    response.delete_cookie("session_id", **delete_opt)
    response.delete_cookie("user_id", **delete_opt)
    response.delete_cookie("is_login", path="/", httponly=False, secure=False, samesite="lax")

    return response
