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

    Порядок: явная ссылка #N → «задача N» целиком → поиск по словам заголовка.
    """
    target_text = (target_text or "").strip()
    if not target_text:
        return []

    def _by_id(item_id: int) -> list[Item] | None:
        item = session.get(Item, item_id)
        if item and item.deleted_at is None and (not types or item.type in types):
            return [item]
        return None

    # 1) Явная ссылка «#3» в любом месте текста — самый надёжный сигнал.
    m = re.search(r"#(\d+)\b", target_text)
    if m:
        hit = _by_id(int(m.group(1)))
        if hit is not None:
            return hit

    # 2) Короткая ссылка вида «3», «задача 3», «задачу №3» — когда номер и есть вся цель.
    bare = re.fullmatch(
        r"(?:задач[ауиеой]*\s*)?(?:№|#)?\s*(\d{1,6})", target_text.strip(), re.IGNORECASE
    )
    if bare:
        hit = _by_id(int(bare.group(1)))
        if hit is not None:
            return hit

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
