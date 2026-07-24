"""CRUD и операции над сущностями (FR-9…FR-16). Общая логика бота и веба."""
from __future__ import annotations

from datetime import datetime, timezone, date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import audit
from .models import (
    Attachment,
    Comment,
    Item,
    Link,
    Tag,
    ITEM_TYPES,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def parse_deadline(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


# Дни недели: (номер weekday, regex по корню словоформы)
_WEEKDAY_PATTERNS = [
    (0, r"понедельник"),
    (1, r"вторник"),
    (2, r"сред[ауыое]"),
    (3, r"четверг"),
    (4, r"пятниц[ауые]"),
    (5, r"суббот[ауые]"),
    (6, r"воскресень[еяю]|воскр\b"),
]


def parse_relative_date(text: str | None, today: date) -> date | None:
    """Вычисляет дату из относительных слов надёжнее, чем LLM.

    «сегодня/завтра/послезавтра» и дни недели («на понедельник» → ближайший
    будущий понедельник; если сегодня и есть этот день — сегодня).
    """
    if not text:
        return None
    import re as _re

    t = text.lower()
    if _re.search(r"послезавтра", t):
        return today + timedelta(days=2)
    if _re.search(r"\bзавтра", t):
        return today + timedelta(days=1)
    if _re.search(r"\bсегодня", t):
        return today
    for wd, pat in _WEEKDAY_PATTERNS:
        if _re.search(pat, t):
            days_ahead = (wd - today.weekday()) % 7
            return today + timedelta(days=days_ahead)
    return None


def get_or_create_tag(session: Session, name: str) -> Tag:
    name = name.strip().lower()
    tag = session.execute(select(Tag).where(Tag.name == name)).scalar_one_or_none()
    if tag is None:
        tag = Tag(name=name, is_preset=False)
        session.add(tag)
        session.flush()
    return tag


def find_project_by_name(session: Session, name: str) -> Item | None:
    if not name:
        return None
    return session.execute(
        select(Item)
        .where(Item.type == "project", Item.deleted_at.is_(None))
        .where(Item.title.ilike(f"%{name.strip()}%"))
        .limit(1)
    ).scalar_one_or_none()


def create_item(session: Session, data: dict, actor: str = "user") -> Item:
    """data: type, title, description, status, priority, deadline, note_date,
    note_recurrence, project_id | project (имя), tags[], source_text, delegated_to."""
    itype = data.get("type")
    if itype not in ITEM_TYPES:
        itype = "note"

    default_status = {"task": "active", "idea": "active", "project": "active", "note": None}
    now = _utcnow()

    project_id = data.get("project_id")
    if not project_id and data.get("project"):
        project = find_project_by_name(session, str(data["project"]))
        project_id = project.id if project else None

    item = Item(
        type=itype,
        title=(data.get("title") or "").strip() or None,
        description=(data.get("description") or "").strip() or None,
        status=data.get("status") or default_status[itype],
        priority=data.get("priority") if itype == "task" else None,
        deadline=parse_deadline(data.get("deadline")) if itype in ("task", "project") else None,
        delegated_to=data.get("delegated_to"),
        note_date=parse_date(data.get("note_date")) if itype == "note" else None,
        note_recurrence=data.get("note_recurrence") if itype == "note" else None,
        project_id=project_id,
        source_text=data.get("source_text"),
        created_at=now,
        updated_at=now,
    )
    if itype == "task" and item.priority not in ("asap", "high", "medium", "low"):
        item.priority = "medium"
    session.add(item)
    session.flush()

    for tag_name in data.get("tags") or []:
        tag = get_or_create_tag(session, str(tag_name))
        if tag not in item.tags:
            item.tags.append(tag)

    audit.log(session, actor, "create", item.id, after=audit.snapshot(item))
    return item


def update_item(session: Session, item: Item, fields: dict, actor: str = "user") -> Item:
    before = audit.snapshot(item)

    simple = ("title", "description", "status", "delegated_to", "note_recurrence")
    for key in simple:
        if key in fields:
            item.__setattr__(key, fields[key] or None)
    if "priority" in fields and item.type == "task":
        if fields["priority"] in ("asap", "high", "medium", "low"):
            item.priority = fields["priority"]
    if "deadline" in fields:
        item.deadline = parse_deadline(fields["deadline"]) if fields["deadline"] else None
    if "note_date" in fields:
        item.note_date = parse_date(fields["note_date"]) if fields["note_date"] else None
    if "project_id" in fields:
        item.project_id = fields["project_id"] or None
    if "project" in fields and "project_id" not in fields:
        project = find_project_by_name(session, str(fields["project"] or ""))
        item.project_id = project.id if project else None
    if "tags" in fields and fields["tags"] is not None:
        item.tags.clear()
        for tag_name in fields["tags"]:
            item.tags.append(get_or_create_tag(session, str(tag_name)))

    item.updated_at = _utcnow()
    audit.log(session, actor, "update", item.id, before=before, after=audit.snapshot(item))
    return item


def set_status(
    session: Session,
    item: Item,
    status: str,
    delegated_to: str | None = None,
    actor: str = "user",
) -> Item:
    before = audit.snapshot(item)
    item.status = status
    if status == "delegated":
        item.delegated_to = delegated_to
    item.updated_at = _utcnow()
    audit.log(session, actor, "status_change", item.id, before=before, after=audit.snapshot(item))
    return item


def soft_delete(session: Session, item: Item, actor: str = "user") -> None:
    """Мягкое удаление (NFR-5): данные физически не стираются."""
    before = audit.snapshot(item)
    item.deleted_at = _utcnow()
    item.updated_at = item.deleted_at
    audit.log(session, actor, "delete", item.id, before=before, after=audit.snapshot(item))


def restore(session: Session, item: Item, actor: str = "user") -> None:
    before = audit.snapshot(item)
    item.deleted_at = None
    item.updated_at = _utcnow()
    audit.log(session, actor, "restore", item.id, before=before, after=audit.snapshot(item))


def add_comment(session: Session, item: Item, text: str, actor: str = "user") -> Comment:
    comment = Comment(item_id=item.id, text=text, created_at=_utcnow())
    session.add(comment)
    session.flush()
    audit.log(session, actor, "comment", item.id, after={"text": text})
    return comment


def add_attachment(
    session: Session,
    item: Item,
    kind: str,
    extracted_text: str | None,
    file_path: str | None = None,
    actor: str = "user",
) -> Attachment:
    att = Attachment(
        item_id=item.id,
        kind=kind,
        file_path=file_path,
        extracted_text=extracted_text,
        created_at=_utcnow(),
    )
    session.add(att)
    session.flush()
    audit.log(session, actor, "attach", item.id, after={"kind": kind, "saved_file": bool(file_path)})
    return att


# ---------- Связи (FR-16, FR-19) ----------

def link_items(session: Session, a_id: int, b_id: int, actor: str = "user") -> bool:
    if a_id == b_id:
        return False
    low, high = sorted((a_id, b_id))
    exists = session.execute(
        select(Link).where(Link.item_low_id == low, Link.item_high_id == high)
    ).scalar_one_or_none()
    if exists:
        return False
    session.add(Link(item_low_id=low, item_high_id=high))
    audit.log(session, actor, "link", a_id, after={"linked_with": b_id})
    return True


def unlink_items(session: Session, a_id: int, b_id: int, actor: str = "user") -> bool:
    low, high = sorted((a_id, b_id))
    link = session.execute(
        select(Link).where(Link.item_low_id == low, Link.item_high_id == high)
    ).scalar_one_or_none()
    if not link:
        return False
    session.delete(link)
    audit.log(session, actor, "unlink", a_id, after={"unlinked_from": b_id})
    return True


def linked_items(session: Session, item_id: int) -> list[Item]:
    links = session.execute(
        select(Link).where(or_(Link.item_low_id == item_id, Link.item_high_id == item_id))
    ).scalars().all()
    other_ids = [
        l.item_high_id if l.item_low_id == item_id else l.item_low_id for l in links
    ]
    if not other_ids:
        return []
    return list(
        session.execute(
            select(Item).where(Item.id.in_(other_ids), Item.deleted_at.is_(None))
        ).scalars()
    )


# ---------- Выборки (FR-22) ----------

def find_items(
    session: Session,
    types: list[str] | None = None,
    status: str | None = None,
    tag: str | None = None,
    project_id: int | None = None,
    text: str | None = None,
    include_deleted: bool = False,
    limit: int = 200,
) -> list[Item]:
    q = select(Item).order_by(Item.updated_at.desc()).limit(limit)
    if not include_deleted:
        q = q.where(Item.deleted_at.is_(None))
    if types:
        q = q.where(Item.type.in_(types))
    if status:
        q = q.where(Item.status == status)
    if project_id:
        q = q.where(Item.project_id == project_id)
    if tag:
        q = q.join(Item.tags).where(Tag.name == tag.strip().lower())
    if text:
        pattern = f"%{text.strip()}%"
        q = q.where(or_(Item.title.ilike(pattern), Item.description.ilike(pattern)))
    return list(session.execute(q).scalars().unique())


def item_to_dict(item: Item, with_links: bool = False, session: Session | None = None) -> dict:
    data = {
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
        "project_title": item.project.title if item.project else None,
        "source_text": item.source_text,
        "tags": [t.name for t in item.tags],
        "comments": [
            {"id": c.id, "text": c.text, "created_at": c.created_at.isoformat()}
            for c in item.comments
        ],
        "attachments": [
            {
                "id": a.id,
                "kind": a.kind,
                "has_file": bool(a.file_path),
                "extracted_text": a.extracted_text,
                "created_at": a.created_at.isoformat(),
            }
            for a in item.attachments
        ],
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
    }
    if with_links and session is not None:
        data["links"] = [
            {"id": li.id, "type": li.type, "title": li.title, "status": li.status}
            for li in linked_items(session, item.id)
        ]
    return data
