"""Подключение к SQLite: единый источник правды для бота и веба (FR-29)."""
import os
from contextlib import contextmanager

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from .config import config
from .models import Base, Settings, Tag, PRESET_TAGS

os.makedirs(os.path.dirname(os.path.abspath(config.db_path)), exist_ok=True)

engine = create_engine(
    f"sqlite:///{config.db_path}",
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    # WAL: одновременная работа бота и веба без блокировок читателей
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def db_session():
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Создание схемы и сидов (преднастроенные сферы, строка настроек)."""
    Base.metadata.create_all(engine)
    with db_session() as s:
        if s.get(Settings, 1) is None:
            s.add(Settings(id=1, timezone=config.timezone))
        existing = {t.name for t in s.execute(select(Tag)).scalars()}
        for name in PRESET_TAGS:
            if name not in existing:
                s.add(Tag(name=name, is_preset=True))
