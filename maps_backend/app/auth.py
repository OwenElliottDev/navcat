import hashlib
import secrets
import time
from collections import defaultdict, deque
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response

from .config import settings
from .db import Db
from .models import User

SESSION_COOKIE = "session"
COOKIE_PATH = "/api"

# ---------- passwords ----------

_hasher = PasswordHasher()
# Checked when the username doesn't exist, so a wrong username takes as long as a wrong password
_DUMMY_HASH = _hasher.hash("not a real password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except VerifyMismatchError:
        return False
    return password_hash is not None


# ---------- sessions ----------


def _token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


async def start_session(db: Db, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    await db.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at)"
        " VALUES (%s, %s, now() + make_interval(days => %s))",
        (_token_hash(token), user_id, settings.session_days),
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        path=COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


async def end_session(db: Db, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.execute("DELETE FROM sessions WHERE token_hash = %s", (_token_hash(token),))
    response.delete_cookie(SESSION_COOKIE, path=COOKIE_PATH)


async def optional_user(request: Request, db: Db) -> User | None:
    """The signed-in user, or None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    cursor = await db.execute(
        "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id"
        " WHERE s.token_hash = %s AND s.expires_at > now()",
        (_token_hash(token),),
    )
    row = await cursor.fetchone()
    return User(**row) if row else None


async def require_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(401, "Sign in first.")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(require_user)]


# ---------- brute-force protection ----------


class LoginThrottle:
    """Blocks a key (an IP or username) after `limit` failed logins within `window` seconds.

    Kept in memory, which is fine for a single backend process.
    """

    def __init__(self, limit: int = 10, window: float = 15 * 60) -> None:
        self.limit = limit
        self.window = window
        self._failures: defaultdict[str, deque[float]] = defaultdict(deque)

    def _recent(self, key: str, now: float) -> deque[float]:
        failures = self._failures[key]
        while failures and failures[0] < now - self.window:
            failures.popleft()
        return failures

    def is_blocked(self, *keys: str) -> bool:
        now = time.monotonic()
        return any(len(self._recent(key, now)) >= self.limit for key in keys)

    def record_failure(self, *keys: str) -> None:
        now = time.monotonic()
        for key in keys:
            self._recent(key, now).append(now)

    def reset(self, *keys: str) -> None:
        for key in keys:
            self._failures.pop(key, None)


def client_ip(request: Request) -> str:
    # nginx passes the real address; fall back to the socket peer when running directly
    return request.headers.get("x-real-ip") or (
        request.client.host if request.client else "unknown"
    )
