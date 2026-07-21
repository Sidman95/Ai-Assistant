"""«План на день» (FR-17): детерминированная выборка, LLM — только оформление."""
from __future__ import annotations

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from .items import item_to_dict, linked_items
from .models import Item
from .timeutil import today_local

PRIORITY_ORDER = {"asap": 0, "high": 1, "medium": 2, "low": 3}


def notes_for_today(session: Session) -> list[Item]:
    """Заметки на сегодня с учётом повтора (yearly — по дню-месяцу)."""
    today = today_local(session)
    q = select(Item).where(
        Item.type == "note", Item.deleted_at.is_(None), Item.note_date.is_not(None)
    )
    result = []
    for note in session.execute(q).scalars():
        nd = note.note_date
        rec = note.note_recurrence or "none"
        if rec == "yearly" and (nd.month, nd.day) == (today.month, today.day):
            result.append(note)
        elif rec == "monthly" and nd.day == today.day:
            result.append(note)
        elif rec in ("none", None) and nd == today:
            result.append(note)
    return result


def build_day_plan(session: Session) -> dict:
    """Структура плана дня — передаётся LLM только для форматирования."""
    today = today_local(session)

    deadline_today = list(
        session.execute(
            select(Item).where(
                Item.type == "task",
                Item.status == "active",
                Item.deleted_at.is_(None),
                func.date(Item.deadline) <= today.isoformat(),
            )
        ).scalars()
    )
    deadline_today.sort(key=lambda t: (PRIORITY_ORDER.get(t.priority, 9), t.deadline or t.created_at))

    asap_no_deadline = list(
        session.execute(
            select(Item).where(
                Item.type == "task",
                Item.status == "active",
                Item.deleted_at.is_(None),
                Item.deadline.is_(None),
                Item.priority == "asap",
            )
        ).scalars()
    )

    def brief(item: Item) -> dict:
        d = {
            "id": item.id,
            "title": item.title,
            "priority": item.priority,
            "deadline": item.deadline.isoformat() if item.deadline else None,
            "tags": [t.name for t in item.tags],
            "project": item.project.title if item.project else None,
        }
        return d

    tasks_block = []
    for task in deadline_today:
        entry = brief(task)
        overdue = task.deadline and task.deadline.date() < today
        entry["overdue"] = bool(overdue)
        related = linked_items(session, task.id)
        entry["related"] = [
            {"id": r.id, "type": r.type, "title": r.title} for r in related
        ]
        tasks_block.append(entry)

    return {
        "date": today.isoformat(),
        "tasks_deadline_today": tasks_block,
        "tasks_asap": [brief(t) for t in asap_no_deadline],
        "notes_today": [
            {
                "id": n.id,
                "title": n.title,
                "body": n.description,
                "recurrence": n.note_recurrence,
            }
            for n in notes_for_today(session)
        ],
    }


def plan_to_text(plan: dict) -> str:
    """Резервное детерминированное форматирование (без LLM)."""
    lines = [f"📅 План на {plan['date']}"]
    pr_icon = {"asap": "🔥", "high": "❗", "medium": "▪️", "low": "▫️"}

    if plan["tasks_deadline_today"]:
        lines.append("\nДедлайн сегодня:")
        for t in plan["tasks_deadline_today"]:
            mark = " (просрочено)" if t.get("overdue") else ""
            lines.append(f"{pr_icon.get(t['priority'], '▪️')} #{t['id']} {t['title']}{mark}")
            for r in t.get("related", []):
                lines.append(f"    ↳ связано: {r['title']} (#{r['id']})")
    if plan["tasks_asap"]:
        lines.append("\nASAP (без дедлайна):")
        for t in plan["tasks_asap"]:
            lines.append(f"🔥 #{t['id']} {t['title']}")
    if plan["notes_today"]:
        lines.append("\nДополнительно на сегодня:")
        for n in plan["notes_today"]:
            lines.append(f"📌 {n['title'] or n['body']}")
    if len(lines) == 1:
        lines.append("\nНа сегодня задач нет. 🎉")
    return "\n".join(lines)
