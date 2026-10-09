"""Authentication endpoints.

A deliberately small surface: register, sign in, read the current account, and
— in mock mode only — a password-less demo sign-in so the local demo needs no
credentials. There is no password-reset or email-verification flow; see
`docs/SVARAH_SECURITY_AND_DEPLOYMENT.md` for what a production deployment still
has to add.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..errors import AuthenticationError, AuthUnavailableError, ConflictError, ValidationError
from ..models import User, utcnow
from ..security import (
    MIN_PASSWORD_LENGTH,
    hash_password,
    mint_token,
    normalize_email,
    owner_uid_for_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

DEMO_EMAIL = "demo@svarah.local"
DEMO_NAME = "Demo Shopkeeper"


#: Deliberately permissive: enough structure to catch a typo, without pulling
#: in `email-validator` (and without rejecting a valid-but-unusual address).
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


class _EmailMixin(BaseModel):
    email: str = Field(min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        value = value.strip()
        if not _EMAIL_PATTERN.match(value):
            raise ValueError("Enter a valid email address.")
        return value


class RegisterRequest(_EmailMixin):
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=256)
    display_name: str | None = Field(default=None, max_length=128)


class LoginRequest(_EmailMixin):
    password: str = Field(min_length=1, max_length=256)


class AccountView(BaseModel):
    owner_uid: str
    email: str
    display_name: str
    is_demo: bool


class SessionView(BaseModel):
    token: str
    expires_at: datetime
    account: AccountView
    #: True when the signing key was generated for this process only, so the
    #: UI can warn that sessions end at the next backend restart.
    ephemeral_signing_key: bool


def _account(user: User) -> AccountView:
    return AccountView(
        owner_uid=user.owner_uid,
        email=user.email,
        display_name=user.display_name,
        is_demo=user.is_demo,
    )


def _session(user: User) -> SessionView:
    settings = get_settings()
    token, expires = mint_token(uid=user.owner_uid, email=user.email, settings=settings)
    return SessionView(
        token=token,
        expires_at=datetime.fromtimestamp(expires, tz=timezone.utc),
        account=_account(user),
        ephemeral_signing_key=settings.auth_secret_ephemeral,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=SessionView)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> SessionView:
    settings = get_settings()
    if not settings.auth_configured:
        raise AuthUnavailableError(
            "Authentication is not configured: set TITAN_AUTH_SECRET.",
            details={"configured": False},
        )
    email = normalize_email(str(payload.email))
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise ConflictError(
            "An account already exists for this email.", code="email_taken"
        )
    if not payload.password.strip():
        raise ValidationError("The password cannot be blank.", code="password_blank")
    user = User(
        owner_uid=owner_uid_for_email(email),
        email=email,
        display_name=(payload.display_name or "").strip() or email.split("@", 1)[0],
        password_hash=hash_password(payload.password),
        is_demo=False,
        last_login_at=utcnow(),
    )
    db.add(user)
    db.commit()
    return _session(user)


@router.post("/login", response_model=SessionView)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> SessionView:
    email = normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    # One message for "unknown email" and "wrong password" alike: the response
    # must not reveal whether an address is registered.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthenticationError(
            "That email and password combination is not valid.",
            code="invalid_credentials",
        )
    user.last_login_at = utcnow()
    db.commit()
    return _session(user)


@router.post("/demo", response_model=SessionView)
def demo_login(db: Session = Depends(get_db)) -> SessionView:
    """Password-less sign-in for the offline demo. Mock mode only.

    This is a convenience, not a security model: it is refused outright in live
    mode and whenever `TITAN_ALLOW_DEMO_LOGIN=false`.
    """
    settings = get_settings()
    if not settings.demo_login_enabled:
        raise ConflictError(
            "Demo sign-in is disabled. It is available only when TITAN_MODE=mock "
            "and TITAN_ALLOW_DEMO_LOGIN is not false.",
            code="demo_login_disabled",
            details={"mode": settings.titan_mode},
        )
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(
            owner_uid=owner_uid_for_email(DEMO_EMAIL),
            email=DEMO_EMAIL,
            display_name=DEMO_NAME,
            password_hash=None,
            is_demo=True,
        )
        db.add(user)
    user.last_login_at = utcnow()
    db.commit()
    return _session(user)


@router.get("/me", response_model=AccountView)
def me(user: User = Depends(current_user)) -> AccountView:
    return _account(user)
