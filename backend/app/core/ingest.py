"""Конвейер приёма (ТЗ §4.1): применение результата LLM-разбора к БД."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .items import create_item, find_items
from .models import Item, Tag


def known_tags(session: Session) -> list[str]:
    return [t.name for t in session.execute(select(Tag)).scalars()]


def project_titles(session: Session) -> list[str]:
    return [
        p.title or ""
        for p in session.execute(
            select(Item).where(
                Item.type == "project", Item.deleted_at.is_(None), Item.status == "active"
            )
        ).scalars()
    ]


def apply_new_items(
    session: Session, items_data: list[dict], source_text: str | None, actor: str = "ai"
) -> list[Item]:
    """Создание записей из структурированного извлечения LLM (FR-5, FR-6)."""
    created: list[Item] = []
    for data in items_data[:10]:  # разумный предел на один ввод
        if not isinstance(data, dict):
            continue
        data = dict(data)
        data["source_text"] = source_text
        created.append(create_item(session, data, actor=actor))
    return created


def resolve_target(
    session: Session, target_text: str, types: list[str] | None = None
) -> list[Item]:
    """Поиск записи по свободному описанию (для смены статуса/правки).

    Сначала пробуем #id, затем поиск по словам заголовка.
    """
    target_text = (target_text or "").strip()
    if not target_text:
        return []

    m = re.search(r"#?(\d+)\b", target_text)
    if m and target_text.replace("#", "").strip().isdigit():
        item = session.get(Item, int(m.group(1)))
        return [item] if item and item.deleted_at is None else []

    words = [w for w in re.findall(r"[а-яёa-z0-9]{3,}", target_text.lower())]
    if not words:
        return find_items(session, types=types, text=target_text, limit=5)

    candidates = find_items(session, types=types, limit=500)
    scored = []
    for item in candidates:
        hay = f"{item.title or ''} {item.description or ''}".lower()
        score = sum(1 for w in words if w in hay)
        if score > 0:
            # приоритет активным
            bonus = 0.5 if item.status in ("active", None) else 0
            scored.append((score + bonus, item))
    scored.sort(key=lambda x: -x[0])
    best = [item for s, item in scored[:5]]
    # если лучший сильно опережает — оставить только его
    if len(scored) >= 2 and scored[0][0] >= scored[1][0] + 2:
        return [scored[0][1]]
    return best
