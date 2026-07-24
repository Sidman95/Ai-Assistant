"""Конвейер приёма (ТЗ §4.1): применение результата LLM-разбора к БД."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .items import create_item, find_items, parse_relative_date
from .models import Item, Tag
from .timeutil import today_local


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


def _project_mentioned(project_name: str, source_text: str | None) -> bool:
    """Проект принимаем, только если он реально упомянут в тексте пользователя.

    Защита от галлюцинаций LLM, которая любит прицепить единственный
    существующий проект, даже если пользователь его не называл.
    """
    if not project_name or not source_text:
        return False
    src = source_text.lower()
    name = project_name.lower().strip()
    if name and name in src:
        return True
    tokens = [w for w in re.findall(r"[а-яёa-z0-9]{3,}", name)]
    return any(tok in src for tok in tokens)


def apply_new_items(
    session: Session, items_data: list[dict], source_text: str | None, actor: str = "ai"
) -> list[Item]:
    """Создание записей из структурированного извлечения LLM (FR-5, FR-6)."""
    items_data = [d for d in items_data[:10] if isinstance(d, dict)]

    # Относительные даты («понедельник», «завтра») считаем детерминированно —
    # LLM часто ошибается в дне недели. Применяем только для одиночного ввода,
    # чтобы не перепутать даты в сообщении с несколькими делами.
    rel_date = None
    if len(items_data) == 1:
        rel_date = parse_relative_date(source_text, today_local(session))

    created: list[Item] = []
    for data in items_data:
        data = dict(data)
        data["source_text"] = source_text

        # Гейт проекта: сбрасываем, если он не упомянут в исходном тексте
        if data.get("project") and not _project_mentioned(str(data["project"]), source_text):
            data["project"] = None
        data.pop("project_id", None)

        # Перекрываем дедлайн вычисленной относительной датой (task/project)
        if rel_date and data.get("type") in ("task", "project"):
            data["deadline"] = rel_date.isoformat()

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
