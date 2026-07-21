"""Гибридное связывание (FR-19): детерминированные кандидаты + подсказки.

Кандидаты ищутся дёшево (пересечение слов заголовков и общих сфер среди
активных записей), количество ограничено — стоимость под контролем (NFR-1).
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Item

STOP_WORDS = {
    "в", "на", "по", "с", "и", "к", "у", "о", "от", "до", "за", "из", "не",
    "для", "что", "как", "это", "или", "надо", "нужно", "сделать", "the", "a", "to",
}
MAX_CANDIDATES = 3


_SUFFIX_RE = re.compile(r"(ями|ами|иями|ов|ев|ей|ий|ый|ой|ая|яя|ое|ее|ах|ях|ам|ям|ом|ем|у|ю|а|я|е|и|ы|о|ь)$")


def _stem(word: str) -> str:
    """Очень лёгкий стемминг для сопоставления русских словоформ."""
    if len(word) <= 4:
        return word
    return _SUFFIX_RE.sub("", word)


def _keywords(text: str | None) -> set[str]:
    if not text:
        return set()
    words = re.findall(r"[а-яёa-z0-9]{3,}", text.lower())
    return {_stem(w) for w in words if w not in STOP_WORDS}


def suggest_links(session: Session, item: Item) -> list[dict]:
    """Кандидаты на связь для новой записи: по пересечению ключевых слов и сфер."""
    own_words = _keywords(item.title) | _keywords(item.description)
    own_tags = {t.name for t in item.tags}
    if not own_words and not own_tags:
        return []

    candidates = session.execute(
        select(Item)
        .where(Item.id != item.id, Item.deleted_at.is_(None))
        .order_by(Item.updated_at.desc())
        .limit(300)
    ).scalars()

    scored = []
    for cand in candidates:
        # связываем только с «живыми» записями
        if cand.status not in ("active", None):
            continue
        cand_words = _keywords(cand.title) | _keywords(cand.description)
        word_overlap = len(own_words & cand_words)
        tag_overlap = len(own_tags & {t.name for t in cand.tags})
        score = word_overlap * 2 + tag_overlap
        if word_overlap >= 1 and score >= 2:
            scored.append((score, cand))

    scored.sort(key=lambda x: -x[0])
    return [
        {"id": c.id, "type": c.type, "title": c.title, "score": s}
        for s, c in scored[:MAX_CANDIDATES]
    ]
