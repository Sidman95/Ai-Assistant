"""Плановый утренний отчёт (FR-31, FR-32): тик каждые 30 сек, отправка раз в день."""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core import planner
from app.core.config import config
from app.core.database import db_session
from app.core.models import Settings
from app.core.timeutil import now_local

logger = logging.getLogger(__name__)

_last_sent_date: str | None = None


async def _tick(bot: Bot, llm) -> None:
    global _last_sent_date
    with db_session() as s:
        settings = s.get(Settings, 1)
        if not settings or not settings.morning_report_enabled:
            return
        now = now_local(s)
        if now.strftime("%H:%M") != settings.morning_report_time:
            return
        today = now.date().isoformat()
        if _last_sent_date == today:
            return
        plan = planner.build_day_plan(s)

    try:
        text = await asyncio.to_thread(llm.format_plan, plan)
    except Exception:
        logger.exception("LLM недоступен для утреннего отчёта, резервный формат")
        text = planner.plan_to_text(plan)

    try:
        await bot.send_message(config.owner_telegram_id, "🌅 Утренний отчёт\n\n" + text)
        _last_sent_date = today
        logger.info("Утренний отчёт отправлен (%s)", today)
    except Exception:
        logger.exception("Не удалось отправить утренний отчёт")


def start_scheduler(bot: Bot, llm) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_tick, "interval", seconds=30, args=[bot, llm], max_instances=1)
    scheduler.start()
    return scheduler
