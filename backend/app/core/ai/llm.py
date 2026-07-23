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

ГЛАВНОЕ ПРАВИЛО выбора намерения: если сообщение ссылается на УЖЕ существующую запись \
(есть «#N», слово «задача/задачу N», или пользователь сообщает о ходе/итоге работы — \
«готово», «сделал», «выполнил», «частично», «осталось», «перенеси»), это НЕ новая запись. \
Новую запись (new_item) создавай ТОЛЬКО когда пользователь формулирует новое дело/мысль, \
а не отчитывается о старом.

Варианты intent:
1) "new_item" — пользователь фиксирует новую запись(и). Формат:
{"intent":"new_item","items":[{"type":"task|idea|note|project","title":"краткая суть","description":null или "детали","tags":["сфера1"],"project":null или "название проекта, если ЯВНО упомянут","deadline":null или "YYYY-MM-DD","priority":"asap|high|medium|low" (только task),"note_date":null или "YYYY-MM-DD","note_recurrence":"none|yearly|monthly"}]}
Правила: если в одном сообщении несколько РАЗНЫХ новых дел — верни несколько элементов в items. \
title — короткая суть (2-6 слов), без слов «готово/сделал»; подробности клади в description. \
Даты вычисляй от текущей даты (передаётся в сообщении). «завтра» = текущая дата + 1 день. \
Если приоритет не ясен — "medium". Слова «срочно», «asap», «горит» → "asap". \
tags выбирай из списка известных сфер, если подходят; новую сферу добавляй только если она явно названа.
2) "status_change" — пользователь просит ПОЛНОСТЬЮ закрыть/отменить/передать задачу или вернуть в работу \
(«отметь X готово», «задача N выполнена», «отмени N»). Формат:
{"intent":"status_change","target":"#N или краткое описание задачи","new_status":"done|cancelled|delegated|active","delegated_to":null или "кому передана"}
Если в тексте есть «#N» или «задача N» — обязательно верни это в target.
3) "progress" — пользователь сообщает о ЧАСТИЧНОМ прогрессе по существующей задаче, не закрывая её \
(«частично выполнено», «сделал половину», «X готово, осталось Y», «продвинулся»). Формат:
{"intent":"progress","target":"#N или краткое описание задачи","note":"что именно сделано/осталось — текст для хронологии","reschedule":null или "YYYY-MM-DD если просят перенести остаток"}
НЕ создавай при этом новых задач.
4) "query" — вопрос или запрос информации. Формат:
{"intent":"query","query_kind":"plan|day_report|search|list","search_text":null или "текст поиска","filters":{"type":null или "task|idea|note|project","status":null или "active|done|...","tag":null или "сфера","project":null или "название проекта"}}
query_kind: plan = план на день; day_report = итоги/аналитика дня; search = текстовый поиск; list = список по фильтру.
5) "edit" — просьба изменить поля существующей записи (перенести дедлайн, сменить приоритет/сферу/проект). Формат:
{"intent":"edit","target":"#N или описание записи","changes":{"deadline":"YYYY-MM-DD" или null,"priority":"...","title":"...","description":"...","tags":[...],"project":"..."}}
В changes включай ТОЛЬКО изменяемые поля.
6) "chat" — всё остальное (просто вопрос/разговор). Формат:
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

    def _chat(
        self,
        system: str,
        user: str,
        temperature: float = 0.1,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        kwargs = dict(
            model=self.model,
            temperature=temperature,
            max_tokens=max_tokens,
            messages=messages,
        )
        # JSON-режим: заставляет модель вернуть строго объект JSON (без прозы).
        # Если провайдер не поддерживает response_format — повторяем без него.
        if json_mode:
            try:
                response = self.client.chat.completions.create(
                    response_format={"type": "json_object"}, **kwargs
                )
                return (response.choices[0].message.content or "").strip()
            except Exception as e:  # noqa: BLE001
                logger.info("response_format не поддержан (%s) — повтор без него", e)
        response = self.client.chat.completions.create(**kwargs)
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
        raw = self._chat(SYSTEM_PROMPT, user_msg, json_mode=True, max_tokens=1500)
        parsed = _extract_json(raw)
        if parsed is None or "intent" not in parsed:
            # Одна строгая повторная попытка перед фолбэком
            logger.info("Первый ответ не JSON, повтор со строгим требованием")
            raw2 = self._chat(
                SYSTEM_PROMPT,
                user_msg + "\n\nВЕРНИ СТРОГО валидный JSON по схеме. Без пояснений, без текста вокруг.",
                temperature=0.0,
                max_tokens=1500,
                json_mode=True,
            )
            parsed = _extract_json(raw2)
            if parsed is None or "intent" not in parsed:
                logger.warning("LLM вернул невалидный JSON: %r", (raw or "")[:800])
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
        raw = self._chat(EDIT_PROMPT, user_msg, json_mode=True, max_tokens=800)
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


def _try_load(text: str) -> dict | None:
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _extract_json(raw: str) -> dict | None:
    """Терпимый парсинг: снимает обрамление ```json```, вырезает объект,
    убирает висячие запятые. Возвращает dict или None."""
    if not raw:
        return None
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    # 1) как есть
    data = _try_load(cleaned)
    if data is not None:
        return data

    # 2) вырезать от первого '{' до последнего '}'
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if not (0 <= start < end):
        return None
    candidate = cleaned[start : end + 1]
    data = _try_load(candidate)
    if data is not None:
        return data

    # 3) убрать висячие запятые перед } и ]
    candidate2 = re.sub(r",(\s*[}\]])", r"\1", candidate)
    return _try_load(candidate2)
