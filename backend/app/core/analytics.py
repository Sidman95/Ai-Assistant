"""«Аналитика дня» и агрегаты дашборда (FR-18, FR-26)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Item, Tag, item_tags
from .timeutil import get_tz, today_local


def _day_bounds_utc(session: Session, day) -> tuple[datetime, datetime]:
    """Границы локального дня в наивном UTC (как хранится в БД)."""
    tz = get_tz(session)
    start = datetime(day.year, day.month, day.day, tzinfo=tz)
    end = start + timedelta(days=1)
    return (
        start.astimezone(timezone.utc).replace(tzinfo=None),
        end.astimezone(timezone.utc).replace(tzinfo=None),
    )


def day_report(session: Session) -> dict:
    """Агрегаты за сегодня: сделано, создано, разбивки по сферам/проектам."""
    today = today_local(session)
    start, end = _day_bounds_utc(session, today)

    done_today = list(
        session.execute(
            select(Item).where(
                Item.type == "task",
                Item.status == "done",
                Item.deleted_at.is_(None),
                Item.updated_at >= start,
                Item.updated_at < end,
            )
        ).scalars()
    )
    created_today = list(
        session.execute(
            select(Item).where(
                Item.deleted_at.is_(None),
                Item.created_at >= start,
                Item.created_at < end,
            )
        ).scalars()
    )

    by_tag: dict[str, int] = {}
    by_project: dict[str, int] = {}
    for t in done_today:
        for tag in t.tags:
            by_tag[tag.name] = by_tag.get(tag.name, 0) + 1
        if t.project:
            by_project[t.project.title] = by_project.get(t.project.title, 0) + 1

    active_tasks = session.execute(
        select(func.count()).where(
            Item.type == "task", Item.status == "active", Item.deleted_at.is_(None)
        )
    ).scalar_one()

    return {
        "date": today.isoformat(),
        "done_tasks": [{"id": t.id, "title": t.title} for t in done_today],
        "done_count": len(done_today),
        "created_count": len(created_today),
        "created_by_type": _count_by(created_today, lambda i: i.type),
        "done_by_tag": by_tag,
        "done_by_project": by_project,
        "active_tasks_total": active_tasks,
    }


def _count_by(items, key) -> dict:
    out: dict = {}
    for i in items:
        k = key(i)
        out[k] = out.get(k, 0) + 1
    return out


def report_to_text(report: dict) -> str:
    """Резервное форматирование аналитики без LLM."""
    type_names = {"task": "задачи", "idea": "идеи", "note": "заметки", "project": "проекты"}
    lines = [f"📊 Итоги дня {report['date']}"]
    lines.append(f"\n✅ Завершено задач: {report['done_count']}")
    for t in report["done_tasks"]:
        lines.append(f"  • {t['title']}")
    lines.append(f"➕ Создано записей: {report['created_count']}")
    for k, v in report["created_by_type"].items():
        lines.append(f"  • {type_names.get(k, k)}: {v}")
    if report["done_by_tag"]:
        lines.append("По сферам: " + ", ".join(f"{k} — {v}" for k, v in report["done_by_tag"].items()))
    if report["done_by_project"]:
        lines.append("По проектам: " + ", ".join(f"{k} — {v}" for k, v in report["done_by_project"].items()))
    lines.append(f"\n📋 Активных задач всего: {report['active_tasks_total']}")
    return "\n".join(lines)


def dashboard_stats(session: Session) -> dict:
    """Агрегаты для дашборда веб-кабинета."""
    today = today_local(session)

    counts = {}
    for itype in ("task", "idea", "note", "project"):
        rows = session.execute(
            select(Item.status, func.count())
            .where(Item.type == itype, Item.deleted_at.is_(None))
            .group_by(Item.status)
        ).all()
        counts[itype] = {status or "none": n for status, n in rows}

    # Завершённые задачи по дням за последние 14 дней
    done_series = []
    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        start, end = _day_bounds_utc(session, day)
        n = session.execute(
            select(func.count()).where(
                Item.type == "task",
                Item.status == "done",
                Item.deleted_at.is_(None),
                Item.updated_at >= start,
                Item.updated_at < end,
            )
        ).scalar_one()
        done_series.append({"date": day.isoformat(), "done": n})

    # Активные задачи по сферам
    tag_rows = session.execute(
        select(Tag.name, func.count())
        .join(item_tags, item_tags.c.tag_id == Tag.id)
        .join(Item, Item.id == item_tags.c.item_id)
        .where(Item.type == "task", Item.status == "active", Item.deleted_at.is_(None))
        .group_by(Tag.name)
    ).all()

    upcoming = list(
        session.execute(
            select(Item)
            .where(
                Item.type == "task",
                Item.status == "active",
                Item.deleted_at.is_(None),
                Item.deadline.is_not(None),
            )
            .order_by(Item.deadline)
            .limit(10)
        ).scalars()
    )

    return {
        "counts": counts,
        "done_series": done_series,
        "active_by_tag": [{"tag": name, "count": n} for name, n in tag_rows],
        "upcoming": [
            {
                "id": t.id,
                "title": t.title,
                "deadline": t.deadline.isoformat(),
                "priority": t.priority,
            }
            for t in upcoming
        ],
        "day_report": day_report(session),
    }
