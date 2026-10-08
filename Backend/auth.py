# auth.py
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY ortam değişkeni tanımlı değil veya en az 32 karakter olmalı.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

_security = HTTPBearer()

@dataclass
class CurrentUser:
    user_id: int
    ciftlik_id: int
    eposta: str

def create_access_token(user_id: int, ciftlik_id: int, eposta: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "ciftlik_id": ciftlik_id,
        "eposta": eposta,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi doldu, tekrar giriş yapın.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz kimlik doğrulama bilgisi.",
        )

    try:
        user_id = int(payload.get("sub"))
        ciftlik_id = int(payload.get("ciftlik_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz token içeriği.")

    return CurrentUser(user_id=user_id, ciftlik_id=ciftlik_id, eposta=payload.get("eposta", ""))

class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        now = time.time()
        window_start = now - self.window_seconds
        hits = [t for t in self._hits[key] if t > window_start]
        if len(hits) >= self.max_attempts:
            retry_after = max(int(self.window_seconds - (now - hits[0])), 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Çok fazla deneme yapıldı. {retry_after} saniye sonra tekrar deneyin.",
            )
        hits.append(now)
        self._hits[key] = hits

TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true"

def client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

login_rate_limiter = RateLimiter(max_attempts=5, window_seconds=300)
signup_rate_limiter = RateLimiter(max_attempts=3, window_seconds=3600)