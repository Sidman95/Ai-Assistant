"""Авторизация веб-кабинета (FR-33, FR-34): argon2 + подписанная HTTP-only cookie."""
from __future__ import annotations

import logging

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select

from app.core.config import config
from app.core.database import db_session
from app.core.models import User

logger = logging.getLogger(__name__)

hasher = PasswordHasher()
serializer = URLSafeTimedSerializer(config.secret_key, salt="session")

SESSION_COOKIE = "assistant_session"
SESSION_MAX_AGE = 30 * 24 * 3600  # 30 дней


def ensure_web_user() -> None:
    """Создание пользователя из .env при первом запуске (пароль — только хэшем)."""
    with db_session() as s:
        user = s.execute(select(User)).scalar_one_or_none()
        if user is None:
            if not config.web_password:
                logger.warning(
                    "WEB_PASSWORD не задан — веб-логин не создан. Задайте его в .env и перезапустите."
                )
                return
            s.add(
                User(
                    username=config.web_username,
                    password_hash=hasher.hash(config.web_password),
                )
            )
            logger.info("Создан веб-пользователь «%s»", config.web_username)


def check_credentials(username: str, password: str) -> bool:
    with db_session() as s:
        user = s.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if user is None:
            return False
        try:
            hasher.verify(user.password_hash, password)
            return True
        except VerifyMismatchError:
            return False


def make_session_token(username: str) -> str:
    return serializer.dumps({"u": username})


def require_auth(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизован")
    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
        return data["u"]
    except (BadSignature, KeyError):
        raise HTTPException(status_code=401, detail="Сессия недействительна")
