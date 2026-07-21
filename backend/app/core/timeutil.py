"""Работа с часовым поясом пользователя (FR-32)."""
from datetime import datetime, date
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from .models import Settings


def get_tz(session: Session) -> ZoneInfo:
    settings = session.get(Settings, 1)
    name = settings.timezone if settings else "Asia/Barnaul"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Asia/Barnaul")


def now_local(session: Session) -> datetime:
    return datetime.now(get_tz(session))


def today_local(session: Session) -> date:
    return now_local(session).date()
