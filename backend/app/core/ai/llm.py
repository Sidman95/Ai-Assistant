"""LLMClient (NFR-2): OpenAI-совместимый клиент, провайдер задаётся конфигом.

По умолчанию — YandexGPT (Yandex AI Studio, OpenAI-совместимый endpoint).
Смена на DeepSeek/Ollama — только переменные окружения, код не меняется (AC-8).
"""
from __future__ import annotations

import json
import logging
import re

from openai import OpenAI

from ..config import config

logger = logging.getLogger(__name__)

# Стабильный системный промпт (кэшируемый префикс — экономия токенов, NFR-1)
SYSTEM_PROMPT = """Ты — парсер личного ассистента задач. Пользователь присылает свободный текст \
(задачи, идеи, заметки, вопросы, команды). Ты ВСЕГДА отвечаешь ТОЛЬКО валидным JSON без \
пояснений, без markdown, без обрамления ```.

Типы записей:
- task (задача): действие с результатом; поля priority (asap|high|medium|low), deadline (YYYY-MM-DD или null).
- idea (идея): мысль на будущее.
- note (заметка): справочная информация; может иметь note_date (YYYY-MM-DD) и note_recurrence (none|yearly|monthly) — например день рождения = yearly.
- project (проект): контейнер-цель для задач/идей/заметок.

Схема ответа:
{"intent": "...", ...}

Варианты intent:
1) "new_item" — пользователь фиксирует новую запись(и). Формат:
{"intent":"new_item","items":[{"type":"task|idea|note|project","title":"краткая суть","description":null или "детали","tags":["сфера1"],"project":null или "название проекта, если ЯВНО упомянут","deadline":null или "YYYY-MM-DD","priority":"asap|high|medium|low" (только task),"note_date":null или "YYYY-MM-DD","note_recurrence":"none|yearly|monthly"}]}
Правила: если в одном сообщении несколько дел — верни несколько элементов в items. \
Даты вычисляй от текущей даты (передаётся в сообщении). «завтра» = текущая дата + 1 день. \
Если приоритет не ясен — "medium". Слова «срочно», «asap», «горит» → "asap". \
tags выбирай из списка известных сфер, если подходят; новую сферу добавляй только если она явно названа.
2) "status_change" — просьба отметить задачу выполненной/отменённой/переданной или вернуть в работу. Формат:
{"intent":"status_change","target":"текст, описывающий задачу","new_status":"done|cancelled|delegated|active","delegated_to":null или "кому передана"}
3) "query" — вопрос или запрос информации. Формат:
{"intent":"query","query_kind":"plan|day_report|search|list","search_text":null или "текст поиска","filters":{"type":null или "task|idea|note|project","status":null или "active|done|...","tag":null или "сфера","project":null или "название проекта"}}
query_kind: plan = план на день; day_report = итоги/аналитика дня; search = текстовый поиск; list = список по фильтру.
4) "edit" — просьба изменить существующую запись (перенести дедлайн, сменить приоритет и т.п.). Формат:
{"intent":"edit","target":"текст, описывающий запись","changes":{"deadline":"YYYY-MM-DD" или null,"priority":"...","title":"...","description":"...","tags":[...],"project":"..."}}
В changes включай ТОЛЬКО изменяемые поля.
5) "chat" — всё остальное (просто вопрос/разговор). Формат:
{"intent":"chat","reply":"краткий полезный ответ по-русски"}
"""

EDIT_PROMPT = """Ты — редактор записей ассистента задач. Тебе дают JSON текущей записи и \
инструкцию пользователя. Верни ТОЛЬКО валидный JSON вида \
{"changes":{...}} где changes содержит ТОЛЬКО изменяемые поля из списка: \
title, description, deadline (YYYY-MM-DD|null), priority (asap|high|medium|low), \
tags (полный новый список), project (название|null), note_date, note_recurrence, \
status (для задач: active|done|cancelled|delegated). Даты вычисляй от текущей даты."""


class LLMClient:
    def __init__(self) -> None:
        base_url, model, api_key = config.resolved_llm()
        self.model = model
        self.client = OpenAI(base_url=base_url, api_key=api_key or "unset")

    def _chat(self, system: str, user: str, temperature: float = 0.1, max_tokens: int = 2000) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return (response.choices[0].message.content or "").strip()

    # ---------- Разбор ввода (FR-4, FR-5, FR-6) ----------

    def classify(self, text: str, today: str, known_tags: list[str], projects: list[str]) -> dict:
        """Определяет намерение и извлекает структуру. Возвращает dict со строгой схемой."""
        user_msg = (
            f"Текущая дата: {today}\n"
            f"Известные сферы: {', '.join(known_tags) or '—'}\n"
            f"Существующие проекты: {', '.join(projects) or '—'}\n\n"
            f"Сообщение пользователя:\n{text}"
        )
        raw = self._chat(SYSTEM_PROMPT, user_msg)
        parsed = _extract_json(raw)
        if parsed is None or "intent" not in parsed:
            logger.warning("LLM вернул невалидный JSON: %r", raw[:500])
            # Фолбэк (ТЗ §4.1): создаём заметку, чтобы ничего не потерять
            return {
                "intent": "new_item",
                "items": [{"type": "note", "title": text[:120], "description": text}],
                "_fallback": True,
            }
        return parsed

    def extract_edit(self, item_json: dict, instruction: str, today: str) -> dict:
        user_msg = (
            f"Текущая дата: {today}\n"
            f"Запись: {json.dumps(item_json, ensure_ascii=False)}\n"
            f"Инструкция: {instruction}"
        )
        raw = self._chat(EDIT_PROMPT, user_msg)
        parsed = _extract_json(raw)
        if parsed and isinstance(parsed.get("changes"), dict):
            return parsed["changes"]
        return {}

    # ---------- Оформление (план/аналитика: данные уже выбраны из БД) ----------

    def format_plan(self, plan: dict) -> str:
        system = (
            "Ты — личный ассистент. Тебе передают ГОТОВЫЕ данные плана дня в JSON. "
            "Оформи их в короткое, дружелюбное сообщение на русском для Telegram (без markdown-заголовков, "
            "можно эмодзи). НИЧЕГО не выдумывай и не добавляй задач, которых нет в данных. "
            "Порядок: задачи с дедлайном (по приоритету), затем ASAP без дедлайна, затем блок «дополнительно» "
            "из заметок. У задач указывай #id. Для связанных записей — короткое упоминание."
        )
        return self._chat(system, json.dumps(plan, ensure_ascii=False), temperature=0.3)

    def format_report(self, report: dict) -> str:
        system = (
            "Ты — личный ассистент. Тебе передают ГОТОВУЮ аналитику дня в JSON. "
            "Оформи короткое сообщение на русском: сколько задач завершено (перечисли), сколько записей "
            "создано, разбивка по сферам/проектам, и один краткий аналитический вывод (1-2 предложения). "
            "НИЧЕГО не выдумывай сверх данных."
        )
        return self._chat(system, json.dumps(report, ensure_ascii=False), temperature=0.3)

    def dashboard_insights(self, stats: dict) -> str:
        system = (
            "Ты — аналитик личной продуктивности. По JSON-агрегатам сформируй 3-5 кратких инсайтов "
            "на русском (маркированный список «— »). Опирайся ТОЛЬКО на данные, без выдумок. "
            "Отметь динамику завершения задач, перекосы по сферам, ближайшие дедлайны."
        )
        return self._chat(system, json.dumps(stats, ensure_ascii=False), temperature=0.4)


def _extract_json(raw: str) -> dict | None:
    """Строгий парсинг с зачисткой типичных обрамлений (```json ... ```)."""
    if not raw:
        return None
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    # последняя попытка: первый '{' … последний '}'
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if 0 <= start < end:
        try:
            data = json.loads(cleaned[start : end + 1])
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None
    return None
