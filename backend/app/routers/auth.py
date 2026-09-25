import os
import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, Response
from sqlalchemy import select

from ..auth import DB, SESSION_COOKIE, SESSION_TTL, CurrentUser, create_session, hash_password, verify_password
from ..errors import APIError
from ..models import User, UserSession
from ..schemas import LoginIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


def _new_account_id() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(12))


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: DB) -> User:
    username = body.username.strip()
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        # Mocked auth: any new username/password pair creates an account.
        user = User(username=username, password_hash=hash_password(body.password), account_id=_new_account_id())
        db.add(user)
        db.commit()
    elif not verify_password(body.password, user.password_hash):
        raise APIError(401, "InvalidCredentials", "The username or password you entered is incorrect.")

    session = create_session(db, user)
    response.set_cookie(
        SESSION_COOKIE,
        session.token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(response: Response, db: DB, session: Annotated[str | None, Cookie()] = None) -> Response:
    if session:
        row = db.get(UserSession, session)
        if row:
            db.delete(row)
            db.commit()
    response.status_code = 204
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
