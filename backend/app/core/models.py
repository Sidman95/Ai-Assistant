"""Модели данных (схема из ТЗ §3): единая таблица items с дискриминатором type."""
from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

ITEM_TYPES = ("task", "idea", "note", "project")
TASK_STATUSES = ("active", "done", "cancelled", "delegated")
IDEA_STATUSES = ("active", "archived")
PROJECT_STATUSES = ("active", "done", "cancelled")
PRIORITIES = ("asap", "high", "medium", "low")
RECURRENCES = ("none", "yearly", "monthly")

PRESET_TAGS = ("работа", "дом", "ремонт", "идеи")


class Base(DeclarativeBase):
    pass


item_tags = Table(
    "item_tags",
    Base.metadata,
    Column("item_id", ForeignKey("items.id"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True),
)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(10), index=True)
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(20), index=True)
    priority: Mapped[str | None] = mapped_column(String(10))
    deadline: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    delegated_to: Mapped[str | None] = mapped_column(Text)
    note_date: Mapped[date | None] = mapped_column(Date, index=True)
    note_recurrence: Mapped[str | None] = mapped_column(String(10))
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id"), index=True
    )
    source_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    tags: Mapped[list[Tag]] = relationship(secondary=item_tags, lazy="selectin")
    comments: Mapped[list[Comment]] = relationship(
        back_populates="item", lazy="selectin", order_by="Comment.created_at"
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="item", lazy="selectin"
    )
    project: Mapped[Item | None] = relationship(remote_side=[id], lazy="selectin")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    is_preset: Mapped[bool] = mapped_column(Boolean, default=False)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    item: Mapped[Item] = relationship(back_populates="comments")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # image | audio
    file_path: Mapped[str | None] = mapped_column(Text)  # только если оригинал сохранён (FR-3)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    item: Mapped[Item] = relationship(back_populates="attachments")


class Link(Base):
    """Двунаправленная связь между items; канонический порядок low < high."""

    __tablename__ = "links"
    __table_args__ = (UniqueConstraint("item_low_id", "item_high_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_low_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    item_high_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)  # всегда 1
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Barnaul")
    morning_report_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    morning_report_time: Mapped[str] = mapped_column(String(5), default="08:30")
    notification_mode: Mapped[str] = mapped_column(String(20), default="on_request")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)


class AuditLog(Base):
    """Лог изменений (NFR-5): фиксирует действия, особенно actor='ai'."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(10))  # user | ai
    action: Mapped[str] = mapped_column(String(30))
    item_id: Mapped[int | None] = mapped_column(Integer, index=True)
    before: Mapped[str | None] = mapped_column(Text)  # JSON-снимок
    after: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
