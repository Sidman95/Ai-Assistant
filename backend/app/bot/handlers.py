"""Обработчики Telegram-бота: ingest-конвейер, команды, inline-действия."""
from __future__ import annotations

import asyncio
import logging
import os
import uuid

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from app.core import analytics, ingest, items as items_svc, linking, planner
from app.core.ai.llm import LLMClient
from app.core.ai.ocr import OCRClient, OCRError
from app.core.ai.stt import STTClient, STTError
from app.core.config import config
from app.core.database import db_session
from app.core.models import Item, Settings
from app.core.timeutil import today_local

from .cards import STATUS_NAMES, created_cards, item_card, items_list

logger = logging.getLogger(__name__)

router = Router()
# Защита канала (ТЗ §4.9): бот отвечает только владельцу
router.message.filter(F.from_user.id == config.owner_telegram_id)
router.callback_query.filter(F.from_user.id == config.owner_telegram_id)

llm = LLMClient()
stt = STTClient()
ocr = OCRClient()

# Состояние «ожидаю текст правки» и незакреплённые медиа (живут до рестарта)
EDIT_STATE: dict[int, list[int]] = {}
PENDING_MEDIA: dict[str, dict] = {}

HELP_TEXT = """Я — твой личный ассистент задач. Просто пиши, наговаривай или фотографируй — я разберу и сохраню.

Примеры:
• «завтра сдать отчёт и позвонить в ЦОД» → две задачи
• «идея: сделать подсветку на кухне» → идея
• «ДР Иры 21 июля» → заметка с ежегодным повтором
• «отметь отчёт как готово» → смена статуса
• «что у меня по дому?» → выборка по сфере

Команды (работают всегда, без ИИ):
/plan — план на день
/report — аналитика дня
/find <текст> — поиск
/done <номер или текст> — завершить задачу
/settings — настройки (утренний отчёт, часовой пояс)
/cancel — сбросить режим правки
/help — эта справка

Веб-кабинет: полный CRUD, проекты, связи, дашборд с инсайтами."""


def _kb(rows: list[list[tuple[str, str]]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=t, callback_data=d) for t, d in row] for row in rows
        ]
    )


# ============================ Команды ============================

@router.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer("Привет! 👋\n\n" + HELP_TEXT)


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(HELP_TEXT)


@router.message(Command("plan"))
async def cmd_plan(message: Message):
    await _send_plan(message)


@router.message(Command("report"))
async def cmd_report(message: Message):
    await _send_report(message)


@router.message(Command("find"))
async def cmd_find(message: Message, command: CommandObject):
    text = (command.args or "").strip()
    if not text:
        await message.answer("Использование: /find <текст>")
        return
    with db_session() as s:
        found = items_svc.find_items(s, text=text, limit=15)
        await message.answer(items_list(found, f"Поиск «{text}»"))


@router.message(Command("done"))
async def cmd_done(message: Message, command: CommandObject):
    target = (command.args or "").strip()
    if not target:
        await message.answer("Использование: /done <номер или описание задачи>")
        return
    await _change_status(message, target, "done", None)


@router.message(Command("cancel"))
async def cmd_cancel(message: Message):
    EDIT_STATE.pop(message.from_user.id, None)
    await message.answer("Ок, режим правки сброшен.")


@router.message(Command("settings"))
async def cmd_settings(message: Message):
    await _send_settings(message)


@router.message(Command("report_time"))
async def cmd_report_time(message: Message, command: CommandObject):
    value = (command.args or "").strip()
    if not _valid_hhmm(value):
        await message.answer("Использование: /report_time HH:MM (например /report_time 08:30)")
        return
    with db_session() as s:
        settings = s.get(Settings, 1)
        settings.morning_report_time = value
    await message.answer(f"⏰ Время утреннего отчёта: {value}")


@router.message(Command("tz"))
async def cmd_tz(message: Message, command: CommandObject):
    value = (command.args or "").strip()
    from zoneinfo import ZoneInfo

    try:
        ZoneInfo(value)
    except Exception:
        await message.answer("Не знаю такой часовой пояс. Пример: /tz Asia/Barnaul")
        return
    with db_session() as s:
        s.get(Settings, 1).timezone = value
    await message.answer(f"🌍 Часовой пояс: {value}")


async def _send_settings(message: Message):
    with db_session() as s:
        st = s.get(Settings, 1)
        status = "включён ✅" if st.morning_report_enabled else "выключен ⛔"
        text = (
            "⚙️ Настройки\n\n"
            f"Утренний отчёт: {status} (время {st.morning_report_time})\n"
            f"Часовой пояс: {st.timezone}\n\n"
            "Сменить время: /report_time 08:30\n"
            "Сменить пояс: /tz Asia/Barnaul"
        )
        toggle = (
            [("Выключить утренний отчёт", "mr:off")]
            if st.morning_report_enabled
            else [("Включить утренний отчёт", "mr:on")]
        )
    await message.answer(text, reply_markup=_kb([toggle]))


# ============================ Сценарии ============================

async def _send_plan(message: Message):
    with db_session() as s:
        plan = planner.build_day_plan(s)
    try:
        text = await asyncio.to_thread(llm.format_plan, plan)
    except Exception:
        logger.exception("LLM недоступен, использую резервное форматирование")
        text = planner.plan_to_text(plan)
    await message.answer(text)


async def _send_report(message: Message):
    with db_session() as s:
        report = analytics.day_report(s)
    try:
        text = await asyncio.to_thread(llm.format_report, report)
    except Exception:
        logger.exception("LLM недоступен, использую резервное форматирование")
        text = analytics.report_to_text(report)
    await message.answer(text)


async def _change_status(message: Message, target: str, new_status: str, delegated_to: str | None):
    with db_session() as s:
        types = ["task"] if new_status in ("done", "cancelled", "delegated") else None
        candidates = ingest.resolve_target(s, target, types=types)
        if not candidates:
            await message.answer(f"Не нашёл запись по «{target}». Попробуй /find или укажи #номер.")
            return
        if len(candidates) == 1:
            item = items_svc.set_status(s, candidates[0], new_status, delegated_to, actor="ai")
            await message.answer(
                f"Готово: «{item.title}» → {STATUS_NAMES.get(new_status, new_status)} ✅"
            )
            return
        rows = [
            [(f"#{c.id} {(c.title or '')[:40]}", f"st:{c.id}:{new_status}")]
            for c in candidates[:5]
        ]
    await message.answer("Уточни, какую запись:", reply_markup=_kb(rows))


# ============================ Ingest ============================

@router.message(F.voice | F.audio)
async def on_voice(message: Message, bot: Bot):
    media = message.voice or message.audio
    try:
        file = await bot.get_file(media.file_id)
        buf = await bot.download_file(file.file_path)
        text = await stt.transcribe(buf.read())
    except STTError as e:
        await message.answer(f"Не смог распознать голос: {e}")
        return
    except Exception:
        logger.exception("Ошибка STT")
        await message.answer("Не смог обработать голосовое. Попробуй ещё раз.")
        return
    await _process_text(message, text, media=("audio", media.file_id))


@router.message(F.photo)
async def on_photo(message: Message, bot: Bot):
    photo = message.photo[-1]
    try:
        file = await bot.get_file(photo.file_id)
        buf = await bot.download_file(file.file_path)
        extracted = await ocr.extract(buf.read())
    except OCRError as e:
        await message.answer(f"Не смог распознать текст на фото: {e}")
        return
    except Exception:
        logger.exception("Ошибка OCR")
        await message.answer("Не смог обработать фото. Попробуй ещё раз.")
        return
    text = extracted if not message.caption else f"{message.caption}\n\n{extracted}"
    await _process_text(message, text, media=("image", photo.file_id))


@router.message(F.text)
async def on_text(message: Message):
    user_id = message.from_user.id
    if user_id in EDIT_STATE:
        await _apply_edit(message, EDIT_STATE.pop(user_id), message.text)
        return
    await _process_text(message, message.text)


async def _process_text(message: Message, text: str, media: tuple[str, str] | None = None):
    """Основной конвейер: LLM-классификация → маршрутизация (FR-4)."""
    with db_session() as s:
        today = today_local(s).isoformat()
        tags = ingest.known_tags(s)
        projects = ingest.project_titles(s)

    try:
        result = await asyncio.to_thread(llm.classify, text, today, tags, projects)
    except Exception:
        logger.exception("LLM classify недоступен")
        await message.answer(
            "⚠️ ИИ сейчас недоступен, но команды работают: /plan, /report, /find, /done."
        )
        return

    intent = result.get("intent")
    if intent == "new_item":
        await _create_items(message, result.get("items") or [], text, media,
                            fallback=bool(result.get("_fallback")))
    elif intent == "status_change":
        status = result.get("new_status")
        if status not in ("done", "cancelled", "delegated", "active"):
            status = "done"
        await _change_status(message, result.get("target") or text, status, result.get("delegated_to"))
    elif intent == "query":
        await _handle_query(message, result)
    elif intent == "edit":
        await _handle_edit_intent(message, result, today)
    else:  # chat
        reply = result.get("reply") or "Понял. Если нужно что-то записать — просто напиши."
        await message.answer(reply)


async def _create_items(
    message: Message,
    items_data: list[dict],
    source_text: str,
    media: tuple[str, str] | None,
    fallback: bool = False,
):
    with db_session() as s:
        created = ingest.apply_new_items(s, items_data, source_text, actor="ai")
        if not created:
            await message.answer("Не понял, что записать. Сформулируй иначе?")
            return
        ids = [i.id for i in created]
        text = created_cards(created)
        if fallback:
            text = "⚠️ Не смог разобрать структуру — сохранил как заметку.\n\n" + text

        # Гибридное связывание (FR-19): подсказки для первой записи
        suggestions = linking.suggest_links(s, created[0]) if created else []

    ids_str = ",".join(map(str, ids))
    rows: list[list[tuple[str, str]]] = [
        [("✏️ Изменить", f"edit:{ids_str}"), ("❌ Отменить", f"cancel:{ids_str}")]
    ]
    if media:
        kind, file_id = media
        token = uuid.uuid4().hex[:12]
        PENDING_MEDIA[token] = {"kind": kind, "file_id": file_id, "item_ids": ids}
        rows.append([("📎 Сохранить оригинал", f"save:{token}")])
    for sug in suggestions:
        title = (sug["title"] or "")[:35]
        rows.append([(f"🔗 Связать с #{sug['id']} {title}", f"link:{ids[0]}:{sug['id']}")])

    await message.answer(text, reply_markup=_kb(rows))


async def _handle_query(message: Message, result: dict):
    kind = result.get("query_kind")
    if kind == "plan":
        await _send_plan(message)
        return
    if kind == "day_report":
        await _send_report(message)
        return
    filters = result.get("filters") or {}
    with db_session() as s:
        project_id = None
        if filters.get("project"):
            project = items_svc.find_project_by_name(s, filters["project"])
            project_id = project.id if project else None
        types = [filters["type"]] if filters.get("type") else None
        found = items_svc.find_items(
            s,
            types=types,
            status=filters.get("status"),
            tag=filters.get("tag"),
            project_id=project_id,
            text=result.get("search_text"),
            limit=20,
        )
        await message.answer(items_list(found))


async def _handle_edit_intent(message: Message, result: dict, today: str):
    target = result.get("target") or ""
    changes = result.get("changes") or {}
    with db_session() as s:
        candidates = ingest.resolve_target(s, target)
        if not candidates:
            await message.answer(f"Не нашёл запись по «{target}». Уточни или используй /find.")
            return
        if len(candidates) > 1:
            rows = [
                [(f"#{c.id} {(c.title or '')[:40]}", f"pick_edit:{c.id}")]
                for c in candidates[:5]
            ]
            # запомним изменения до выбора
            EDIT_PENDING_CHANGES[message.from_user.id] = changes
            await message.answer("Уточни, какую запись изменить:", reply_markup=_kb(rows))
            return
        item = items_svc.update_item(s, candidates[0], changes, actor="ai")
        await message.answer("Обновил:\n\n" + item_card(item))


EDIT_PENDING_CHANGES: dict[int, dict] = {}


async def _apply_edit(message: Message, item_ids: list[int], instruction: str):
    """Правка после нажатия «Изменить»: инструкция свободным текстом → LLM."""
    with db_session() as s:
        target_id = item_ids[0]
        # если в тексте указан #id из списка — правим его
        for iid in item_ids:
            if f"#{iid}" in instruction:
                target_id = iid
                break
        item = s.get(Item, target_id)
        if not item or item.deleted_at:
            await message.answer("Запись уже недоступна.")
            return
        snapshot = items_svc.item_to_dict(item)
        today = today_local(s).isoformat()

    try:
        changes = await asyncio.to_thread(llm.extract_edit, snapshot, instruction, today)
    except Exception:
        logger.exception("LLM edit недоступен")
        await message.answer("⚠️ ИИ сейчас недоступен, попробуй позже.")
        return
    if not changes:
        await message.answer("Не понял, что изменить. Сформулируй иначе?")
        return

    with db_session() as s:
        item = s.get(Item, target_id)
        item = items_svc.update_item(s, item, changes, actor="ai")
        await message.answer("Обновил:\n\n" + item_card(item))


# ============================ Callback-кнопки ============================

@router.callback_query(F.data.startswith("cancel:"))
async def cb_cancel(query: CallbackQuery):
    ids = [int(x) for x in query.data.split(":", 1)[1].split(",") if x]
    with db_session() as s:
        for iid in ids:
            item = s.get(Item, iid)
            if item and not item.deleted_at:
                items_svc.soft_delete(s, item, actor="user")
    await query.message.edit_text("Отменено, записи удалены. 🗑")
    await query.answer()


@router.callback_query(F.data.startswith("edit:"))
async def cb_edit(query: CallbackQuery):
    ids = [int(x) for x in query.data.split(":", 1)[1].split(",") if x]
    EDIT_STATE[query.from_user.id] = ids
    hint = "Напиши, что изменить (например: «дедлайн пятница, приоритет высокий»)."
    if len(ids) > 1:
        hint += f"\nЕсли записей несколько — укажи #номер (создано: {', '.join('#' + str(i) for i in ids)})."
    await query.message.answer(hint)
    await query.answer()


@router.callback_query(F.data.startswith("save:"))
async def cb_save_media(query: CallbackQuery, bot: Bot):
    """Сохранение оригинала медиа по явному запросу (FR-3)."""
    token = query.data.split(":", 1)[1]
    pending = PENDING_MEDIA.pop(token, None)
    if not pending:
        await query.answer("Файл уже недоступен (перезапуск бота).", show_alert=True)
        return
    kind, file_id, item_ids = pending["kind"], pending["file_id"], pending["item_ids"]
    ext = "jpg" if kind == "image" else "ogg"
    os.makedirs(config.files_dir, exist_ok=True)
    path = os.path.join(config.files_dir, f"{uuid.uuid4().hex}.{ext}")
    file = await bot.get_file(file_id)
    await bot.download_file(file.file_path, destination=path)
    with db_session() as s:
        for iid in item_ids:
            item = s.get(Item, iid)
            if item:
                items_svc.add_attachment(
                    s, item, kind, extracted_text=item.source_text, file_path=path, actor="user"
                )
    await query.answer("Оригинал сохранён 📎")


@router.callback_query(F.data.startswith("link:"))
async def cb_link(query: CallbackQuery):
    _, a, b = query.data.split(":")
    with db_session() as s:
        if items_svc.link_items(s, int(a), int(b), actor="user"):
            await query.answer("Связано 🔗")
        else:
            await query.answer("Уже связаны")


@router.callback_query(F.data.startswith("st:"))
async def cb_status(query: CallbackQuery):
    _, iid, status = query.data.split(":")
    with db_session() as s:
        item = s.get(Item, int(iid))
        if not item:
            await query.answer("Не найдено")
            return
        items_svc.set_status(s, item, status, actor="ai")
        await query.message.edit_text(
            f"Готово: «{item.title}» → {STATUS_NAMES.get(status, status)} ✅"
        )
    await query.answer()


@router.callback_query(F.data.startswith("pick_edit:"))
async def cb_pick_edit(query: CallbackQuery):
    iid = int(query.data.split(":", 1)[1])
    changes = EDIT_PENDING_CHANGES.pop(query.from_user.id, None)
    if not changes:
        await query.answer("Правка устарела, повтори запрос.", show_alert=True)
        return
    with db_session() as s:
        item = s.get(Item, iid)
        if not item:
            await query.answer("Не найдено")
            return
        item = items_svc.update_item(s, item, changes, actor="ai")
        await query.message.edit_text("Обновил:\n\n" + item_card(item))
    await query.answer()


@router.callback_query(F.data.startswith("mr:"))
async def cb_morning_report(query: CallbackQuery):
    enable = query.data.endswith(":on")
    with db_session() as s:
        st = s.get(Settings, 1)
        st.morning_report_enabled = enable
        time_str = st.morning_report_time
    text = (
        f"🌅 Утренний отчёт включён, буду присылать в {time_str}."
        if enable
        else "Утренний отчёт выключен. По умолчанию пишу только по запросу."
    )
    await query.message.edit_text(text)
    await query.answer()


def _valid_hhmm(value: str) -> bool:
    if len(value) != 5 or value[2] != ":":
        return False
    try:
        h, m = int(value[:2]), int(value[3:])
        return 0 <= h < 24 and 0 <= m < 60
    except ValueError:
        return False
