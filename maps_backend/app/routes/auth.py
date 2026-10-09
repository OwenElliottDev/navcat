from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import Field

from ..auth import (
    LoginThrottle,
    client_ip,
    end_session,
    hash_password,
    start_session,
    verify_password,
)
from ..config import settings
from ..db import Db
from ..models import ApiModel, User

router = APIRouter(prefix="/auth", tags=["auth"])
throttle = LoginThrottle()


class SignUp(ApiModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=200)


class LogIn(ApiModel):
    username: str = Field(max_length=40)
    password: str = Field(max_length=200)


@router.post("/signup", status_code=201)
async def sign_up(body: SignUp, response: Response, db: Db) -> User:
    if not settings.allow_signup:
        raise HTTPException(403, "Sign-ups are turned off on this server.")

    cursor = await db.execute(
        "INSERT INTO users (username, password_hash) VALUES (%s, %s)"
        " ON CONFLICT (username) DO NOTHING RETURNING id, username",
        (body.username, hash_password(body.password)),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(409, "That username is taken.")

    await start_session(db, response, row["id"])
    return User(**row)


@router.post("/login")
async def log_in(body: LogIn, request: Request, response: Response, db: Db) -> User:
    keys = (f"ip:{client_ip(request)}", f"user:{body.username.lower()}")
    if throttle.is_blocked(*keys):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")

    cursor = await db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = %s",
        (body.username,),
    )
    row = await cursor.fetchone()
    if not verify_password(row["password_hash"] if row else None, body.password):
        throttle.record_failure(*keys)
        raise HTTPException(401, "Wrong username or password.")

    throttle.reset(*keys)
    await db.execute("DELETE FROM sessions WHERE expires_at < now()")
    await start_session(db, response, row["id"])
    return User(id=row["id"], username=row["username"])


@router.post("/logout", status_code=204)
async def log_out(request: Request, response: Response, db: Db) -> None:
    await end_session(db, request, response)
