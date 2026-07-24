"""Конфигурация из переменных окружения (.env через docker-compose)."""
import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass
class Config:
    # Telegram
    telegram_bot_token: str = field(default_factory=lambda: _env("TELEGRAM_BOT_TOKEN"))
    owner_telegram_id: int = field(
        default_factory=lambda: int(_env("OWNER_TELEGRAM_ID", "0") or "0")
    )

    # Yandex Cloud
    yc_api_key: str = field(default_factory=lambda: _env("YC_API_KEY"))
    yc_folder_id: str = field(default_factory=lambda: _env("YC_FOLDER_ID"))

    # LLM (OpenAI-совместимый интерфейс; NFR-2 — провайдер меняется конфигом)
    llm_base_url: str = field(default_factory=lambda: _env("LLM_BASE_URL"))
    llm_model: str = field(default_factory=lambda: _env("LLM_MODEL"))
    llm_api_key: str = field(default_factory=lambda: _env("LLM_API_KEY"))

    # STT / OCR
    stt_provider: str = field(default_factory=lambda: _env("STT_PROVIDER", "yandex"))
    ocr_provider: str = field(default_factory=lambda: _env("OCR_PROVIDER", "yandex"))

    # Веб
    web_username: str = field(default_factory=lambda: _env("WEB_USERNAME", "admin"))
    web_password: str = field(default_factory=lambda: _env("WEB_PASSWORD"))
    secret_key: str = field(default_factory=lambda: _env("SECRET_KEY", "dev-insecure-key"))

    # Общие
    timezone: str = field(default_factory=lambda: _env("TIMEZONE", "Asia/Barnaul"))
    db_path: str = field(default_factory=lambda: _env("DB_PATH", "./data/assistant.sqlite3"))
    files_dir: str = field(default_factory=lambda: _env("FILES_DIR", "./data/files"))

    def resolved_llm(self) -> tuple[str, str, str]:
        """(base_url, model, api_key) с дефолтом на Yandex AI Studio.

        LLM_MODEL можно задавать:
          • пустым — берётся дефолт (DeepSeek V4 Flash: дешевле lite, сильнее в разборе);
          • коротким именем модели из AI Studio («deepseek-v4-flash», «yandexgpt»,
            «yandexgpt-lite», «qwen3-235b») — код сам соберёт полный gpt://-URI;
          • полным идентификатором («gpt://<folder>/.../latest») — используется как есть.
        Для внешнего провайдера (DeepSeek API, Ollama) задайте LLM_BASE_URL —
        тогда LLM_MODEL передаётся как есть.
        """
        base_url = self.llm_base_url or "https://llm.api.cloud.yandex.net/v1"
        api_key = self.llm_api_key or self.yc_api_key

        model = self.llm_model or "deepseek-v4-flash"
        # Короткое имя модели AI Studio → полный URI (только для Yandex-endpoint)
        if "://" not in model and not self.llm_base_url:
            model = f"gpt://{self.yc_folder_id}/{model}/latest"
        return base_url, model, api_key


config = Config()
