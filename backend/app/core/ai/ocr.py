"""OCRClient: изображение → текст. Реализация по умолчанию — Yandex Vision OCR."""
from __future__ import annotations

import base64
import logging

import httpx

from ..config import config

logger = logging.getLogger(__name__)

VISION_URL = "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText"


class OCRError(Exception):
    pass


class OCRClient:
    def __init__(self) -> None:
        self.provider = config.ocr_provider.lower()

    async def extract(self, image: bytes, mime_type: str = "JPEG") -> str:
        if self.provider == "yandex":
            return await self._yandex(image, mime_type)
        raise OCRError(f"OCR-провайдер не настроен: {self.provider}")

    async def _yandex(self, image: bytes, mime_type: str) -> str:
        body = {
            "mimeType": mime_type,
            "languageCodes": ["ru", "en"],
            "model": "page",
            "content": base64.b64encode(image).decode(),
        }
        headers = {
            "Authorization": f"Api-Key {config.yc_api_key}",
            "x-folder-id": config.yc_folder_id,
            "x-data-logging-enabled": "false",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(VISION_URL, json=body, headers=headers)
        if resp.status_code != 200:
            logger.error("Vision OCR %s: %s", resp.status_code, resp.text[:300])
            raise OCRError(f"Vision OCR вернул {resp.status_code}")
        data = resp.json()
        text = (
            data.get("result", {})
            .get("textAnnotation", {})
            .get("fullText", "")
        ).strip()
        if not text:
            raise OCRError("Текст на изображении не распознан")
        return text
