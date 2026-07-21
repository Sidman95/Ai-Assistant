"""STTClient: голос → текст. Реализация по умолчанию — Yandex SpeechKit.

Telegram присылает голосовые в формате OggOpus — SpeechKit принимает его
напрямую, конвертация не нужна.
"""
from __future__ import annotations

import logging

import httpx

from ..config import config

logger = logging.getLogger(__name__)

SPEECHKIT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"


class STTError(Exception):
    pass


class STTClient:
    def __init__(self) -> None:
        self.provider = config.stt_provider.lower()

    async def transcribe(self, audio: bytes) -> str:
        if self.provider == "yandex":
            return await self._yandex(audio)
        raise STTError(f"STT-провайдер не настроен: {self.provider}")

    async def _yandex(self, audio: bytes) -> str:
        params = {
            "topic": "general",
            "lang": "ru-RU",
            "format": "oggopus",
            "folderId": config.yc_folder_id,
        }
        headers = {"Authorization": f"Api-Key {config.yc_api_key}"}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(SPEECHKIT_URL, params=params, headers=headers, content=audio)
        if resp.status_code != 200:
            logger.error("SpeechKit %s: %s", resp.status_code, resp.text[:300])
            raise STTError(f"SpeechKit вернул {resp.status_code}")
        result = resp.json().get("result", "")
        if not result:
            raise STTError("Пустая транскрипция")
        return result
