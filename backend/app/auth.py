import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from .database import get_db
from .errors import APIError
from .models import User, UserSession, utcnow

SESSION_COOKIE = "session"
SESSION_TTL = timedelta(days=7)
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return hmac.compare_digest(candidate, digest)


def create_session(db: Session, user: User) -> UserSession:
    now = utcnow()
    session = UserSession(token=secrets.token_urlsafe(32), user_id=user.id, created_at=now, expires_at=now + SESSION_TTL)
    db.add(session)
    db.commit()
    return session


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    session: Annotated[str | None, Cookie()] = None,
) -> User:
    if not session:
        raise APIError(401, "NotAuthenticated", "You must be signed in to perform this action.")
    row = db.get(UserSession, session)
    if row is None or row.expires_at < utcnow():
        raise APIError(401, "NotAuthenticated", "Your session has expired. Please sign in again.")
    return row.user


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
