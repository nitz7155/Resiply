from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone

# JWT => HEADER.PAYLOAD.SIGNATURE

ALG = "HS256"        # 암호화 알고리즘
SECRET = "my-secret" # 실제 서비스에서는 반드시 env로 빼기

# ---------------------------------------------------
# Access Token 생성 (role 포함)
# ---------------------------------------------------
def create_token(user_info: dict):
    """
    user_info 예시:
    {
        "user_id": 1,
        "email": "test@test.com",
        "role": "admin"  # 또는 "user"
    }
    """
    payload = {
        "user_info": {
            "user_id": user_info["user_id"],
            "email": user_info["email"],
            "role": user_info["role"],   # ⭐ 핵심
        },
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30)
    }

    token = jwt.encode(payload, SECRET, algorithm=ALG)
    return token


# ---------------------------------------------------
# Refresh Token 생성 (role 포함 권장)
# ---------------------------------------------------
def create_refresh_token(user_info: dict):
    payload = {
        "user_info": {
            "user_id": user_info["user_id"],
            "email": user_info["email"],
            "role": user_info["role"],   # refresh에도 포함
        },
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }

    token = jwt.encode(payload, SECRET, algorithm=ALG)
    return token


# ---------------------------------------------------
# Token 검증
# ---------------------------------------------------
def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALG])

        token_type = payload.get("type")
        user_info = payload.get("user_info")

        if not user_info:
            return None, "invalid"

        return {
            "user_id": user_info.get("user_id"),
            "email": user_info.get("email"),
            "role": user_info.get("role"),
            "token_type": token_type,
        }, None

    # 토큰 만료
    except jwt.ExpiredSignatureError:
        return None, "expired"

    # 유효하지 않은 토큰
    except JWTError:
        return None, "invalid"
