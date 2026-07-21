"""Точка входа Telegram-бота."""
import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand

from app.core.config import config
from app.core.database import init_db

from . import handlers
from .scheduler import start_scheduler

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

COMMANDS = [
    BotCommand(command="plan", description="План на день"),
    BotCommand(command="report", description="Аналитика дня"),
    BotCommand(command="find", description="Поиск записей"),
    BotCommand(command="done", description="Завершить задачу"),
    BotCommand(command="settings", description="Настройки"),
    BotCommand(command="help", description="Справка"),
]


async def main() -> None:
    if not config.telegram_bot_token:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан (.env)")
    if not config.owner_telegram_id:
        raise SystemExit("OWNER_TELEGRAM_ID не задан (.env)")

    init_db()

    bot = Bot(token=config.telegram_bot_token)
    dp = Dispatcher()
    dp.include_router(handlers.router)

    await bot.set_my_commands(COMMANDS)
    start_scheduler(bot, handlers.llm)

    logger.info("Бот запущен (владелец: %s)", config.owner_telegram_id)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
