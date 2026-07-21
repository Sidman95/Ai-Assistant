"""Аудит действий (NFR-5): все изменения логируются, действия ИИ — обязательно."""
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import AuditLog, Item


def snapshot(item: Item) -> dict:
    return {
        "id": item.id,
        "type": item.type,
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "priority": item.priority,
        "deadline": item.deadline.isoformat() if item.deadline else None,
        "delegated_to": item.delegated_to,
        "note_date": item.note_date.isoformat() if item.note_date else None,
        "note_recurrence": item.note_recurrence,
        "project_id": item.project_id,
        "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
        "tags": [t.name for t in item.tags],
    }


def log(
    session: Session,
    actor: str,
    action: str,
    item_id: int | None = None,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            actor=actor,
            action=action,
            item_id=item_id,
            before=json.dumps(before, ensure_ascii=False) if before else None,
            after=json.dumps(after, ensure_ascii=False) if after else None,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
