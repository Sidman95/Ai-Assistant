"""Карточки-подтверждения и форматирование списков (FR-7)."""
from __future__ import annotations

from app.core.models import Item

TYPE_NAMES = {"task": "Задача", "idea": "Идея", "note": "Заметка", "project": "Проект"}
TYPE_ICONS = {"task": "✅", "idea": "💡", "note": "📝", "project": "📁"}
STATUS_NAMES = {
    "active": "активная",
    "done": "завершена",
    "cancelled": "отменена",
    "delegated": "передана",
    "archived": "в архиве",
}
PRIORITY_NAMES = {"asap": "🔥 ASAP", "high": "высокий", "medium": "средний", "low": "низкий"}


def item_card(item: Item) -> str:
    """Компактная карточка записи."""
    lines = [f"{TYPE_ICONS.get(item.type, '•')} {TYPE_NAMES.get(item.type)} #{item.id}: {item.title or '(без названия)'}"]
    if item.description and item.description != item.title:
        desc = item.description if len(item.description) <= 140 else item.description[:140] + "…"
        lines.append(desc)
    details = []
    if item.type == "task" and item.priority:
        details.append(f"приоритет: {PRIORITY_NAMES.get(item.priority, item.priority)}")
    if item.deadline:
        details.append(f"дедлайн: {item.deadline.strftime('%d.%m.%Y')}")
    if item.note_date:
        rec = {"yearly": ", ежегодно", "monthly": ", ежемесячно"}.get(item.note_recurrence or "", "")
        details.append(f"дата: {item.note_date.strftime('%d.%m.%Y')}{rec}")
    if item.tags:
        details.append("сферы: " + ", ".join(t.name for t in item.tags))
    if item.project:
        details.append(f"проект: {item.project.title}")
    if item.status and item.status != "active":
        details.append(f"статус: {STATUS_NAMES.get(item.status, item.status)}")
    if item.delegated_to:
        details.append(f"кому: {item.delegated_to}")
    if details:
        lines.append(" · ".join(details))
    return "\n".join(lines)


def created_cards(items: list[Item]) -> str:
    header = "Записал ✍️" if len(items) == 1 else f"Записал {len(items)} шт. ✍️"
    return header + "\n\n" + "\n\n".join(item_card(i) for i in items)


def items_list(items: list[Item], title: str = "Найдено") -> str:
    if not items:
        return "Ничего не найдено."
    lines = [f"{title} ({len(items)}):"]
    for i in items:
        status = ""
        if i.status and i.status != "active":
            status = f" [{STATUS_NAMES.get(i.status, i.status)}]"
        deadline = f" ⏰{i.deadline.strftime('%d.%m')}" if i.deadline else ""
        lines.append(f"{TYPE_ICONS.get(i.type, '•')} #{i.id} {i.title}{deadline}{status}")
    return "\n".join(lines)
