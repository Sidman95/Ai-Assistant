# Инструкция по развертыванию на VPS

Пошаговое руководство: от чистого сервера до работающего ассистента.
Ориентировано на Ubuntu 22.04/24.04 (подойдёт любой Linux с Docker).

## Что понадобится

- VPS (1 vCPU / 1 ГБ RAM достаточно; рекомендуется 2 ГБ) с публичным IP.
- Аккаунт **Yandex Cloud** (оплата в рублях, работает из РФ).
- Telegram-аккаунт (для создания бота).
- Опционально: домен, направленный на IP сервера (для HTTPS).

---

## Шаг 1. Создание Telegram-бота

1. В Telegram откройте **@BotFather** → команда `/newbot`.
2. Задайте имя (например, «Мой ассистент») и username (например, `my_assistant_xxx_bot`).
3. Сохраните выданный **токен** вида `1234567890:AAE...` — это `TELEGRAM_BOT_TOKEN`.
4. Узнайте свой Telegram ID: напишите боту **@userinfobot** — число вида `123456789`
   — это `OWNER_TELEGRAM_ID`. Бот будет отвечать **только** этому ID.

## Шаг 2. Настройка Yandex Cloud

Нужен API-ключ сервисного аккаунта с доступом к YandexGPT, SpeechKit и Vision.

1. Зарегистрируйтесь на [console.yandex.cloud](https://console.yandex.cloud) и создайте
   (или используйте существующий) **каталог** (folder). Его идентификатор — на странице
   каталога, вида `b1gxxxxxxxxxxxx` — это `YC_FOLDER_ID`.
2. Привяжите платёжный аккаунт (Биллинг → активировать). Без него API не работает.
   Для личного профиля нагрузки расходы обычно составляют десятки–сотни рублей в месяц.
3. Создайте **сервисный аккаунт**: Каталог → «Сервисные аккаунты» → «Создать».
   Назначьте ему роли:
   - `ai.languageModels.user` — YandexGPT (LLM),
   - `ai.speechkit-stt.user` — распознавание голоса,
   - `ai.vision.user` — распознавание текста на фото.
4. Откройте сервисный аккаунт → «Создать новый ключ» → **API-ключ**.
   Сохраните секрет вида `AQVN...` — это `YC_API_KEY` (показывается один раз!).

> Модель по умолчанию — `yandexgpt-lite` (дешёвая и быстрая). Если хотите более
> сильную модель, задайте в `.env`: `LLM_MODEL=gpt://<YC_FOLDER_ID>/yandexgpt/latest`.

## Быстрый путь: автоматический скрипт

Шаги 3–5 можно заменить одной командой. Подключитесь к серверу по SSH и выполните:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <URL-вашего-репозитория> ai-assistant && cd ai-assistant && ./deploy.sh
```

Скрипт сам установит Docker, спросит токены из шагов 1–2, сгенерирует `SECRET_KEY`,
соберёт и запустит все сервисы. Повторный запуск `./deploy.sh` безопасен (обновление).
Если репозиторий приватный — используйте `git clone https://<логин>:<personal-access-token>@github.com/...`
или добавьте на сервер SSH-ключ с доступом к репозиторию.

Дальше остаётся только шаг 6 (HTTPS), если нужен домен. Ручной путь — ниже.

## Шаг 3. Подготовка VPS

Подключитесь по SSH и установите Docker:

```bash
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker --version && docker compose version
```

Откройте порты 80 и 443 (если используется firewall):

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

## Шаг 4. Установка проекта

```bash
git clone <URL-вашего-репозитория> ai-assistant
cd ai-assistant
cp .env.example .env
nano .env
```

Заполните `.env`:

| Переменная | Что вписать |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен из шага 1 |
| `OWNER_TELEGRAM_ID` | ваш Telegram ID из шага 1 |
| `YC_API_KEY` | API-ключ из шага 2 |
| `YC_FOLDER_ID` | идентификатор каталога из шага 2 |
| `WEB_USERNAME` / `WEB_PASSWORD` | логин и пароль веб-кабинета (придумайте надёжный) |
| `SECRET_KEY` | случайная строка: `openssl rand -hex 32` |
| `TIMEZONE` | ваш часовой пояс, напр. `Asia/Barnaul` |
| `DOMAIN` | домен, если есть (для HTTPS); иначе оставить пустым |

Остальные переменные (`LLM_*`, `STT_PROVIDER`, `OCR_PROVIDER`, `BACKUP_*`) можно
не трогать — значения по умолчанию соответствуют Yandex Cloud.

## Шаг 5. Запуск

```bash
docker compose up -d --build
docker compose ps        # все сервисы должны быть Up
docker compose logs -f bot   # «Бот запущен (владелец: ...)» = всё в порядке
```

Проверка:

1. Напишите боту в Telegram `/start` — получите приветствие.
2. Отправьте «завтра сдать отчёт» — бот создаст задачу и покажет карточку.
3. Откройте `http://<IP-сервера>/` — войдите с `WEB_USERNAME`/`WEB_PASSWORD`.

## Шаг 6 (опционально). HTTPS с Let's Encrypt

Нужен домен, A-запись которого указывает на IP сервера, и заполненный `DOMAIN` в `.env`.

```bash
# 1. Выпуск сертификата (nginx уже слушает порт 80 и отдаёт ACME-челленджи)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d ВАШ_ДОМЕН --email ВАШ_EMAIL --agree-tos --no-eff-email

# 2. Перезапуск nginx — он найдёт сертификат и включит HTTPS с редиректом
docker compose restart nginx
```

Продление (сертификат живёт 90 дней) — добавьте в cron хоста (`crontab -e`):

```
0 4 * * 1 cd /home/ВАШ_ЮЗЕР/ai-assistant && docker compose run --rm certbot renew --webroot -w /var/www/certbot -q && docker compose restart nginx
```

## Бэкапы

Работают автоматически, настройка не требуется:

- сервис `backup` каждый день в `BACKUP_TIME` (по умолчанию 03:30 по вашему часовому
  поясу) делает консистентный снимок SQLite и хранит его `BACKUP_RETENTION_DAYS` дней;
- каталог бэкапов — отдельный Docker-том `backup_data`, который **не смонтирован**
  в контейнеры `web`/`bot`; сам `backup` видит БД только на чтение и работает под
  отдельным пользователем. ИИ/бот физически не могут изменить или удалить копии.

Посмотреть бэкапы:

```bash
docker compose exec backup ls -la /backups
```

Восстановление из бэкапа:

```bash
docker compose stop web bot
docker compose cp backup:/backups/assistant-ГГГГ-ММ-ДД.sqlite3.gz /tmp/restore.gz
gunzip /tmp/restore.gz
docker compose cp /tmp/restore bot:/data/assistant.sqlite3
docker compose start web bot
```

Дополнительно рекомендуется периодически копировать бэкапы с VPS на другую машину:

```bash
scp ВАШ_ЮЗЕР@СЕРВЕР:/var/lib/docker/volumes/ai-assistant_backup_data/_data/*.gz ~/backups/
```

## Обновление проекта

```bash
cd ai-assistant
git pull
docker compose up -d --build
```

Данные хранятся в томах Docker и при пересборке не теряются.

## Смена ИИ-провайдера (без изменения кода)

В `.env` задайте три переменные и перезапустите (`docker compose up -d`):

```bash
# DeepSeek
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-...

# Локальная Ollama (например, на том же VPS)
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b
LLM_API_KEY=ollama
```

STT/OCR при этом продолжают работать через Yandex (или отключаются:
`STT_PROVIDER=disabled`, `OCR_PROVIDER=disabled` — бот попросит присылать текстом).

## Диагностика

| Симптом | Что проверить |
|---|---|
| Бот не отвечает | `docker compose logs bot` — верный ли токен; пишете ли вы с аккаунта `OWNER_TELEGRAM_ID` (другим бот молчит) |
| «ИИ сейчас недоступен» | `YC_API_KEY`/`YC_FOLDER_ID`, роли сервисного аккаунта, активирован ли биллинг; `docker compose logs bot | grep -i llm` |
| Голос/фото не распознаются | роли `ai.speechkit-stt.user` / `ai.vision.user` у сервисного аккаунта |
| Веб не открывается | `docker compose ps`; порт 80 открыт в firewall; `docker compose logs nginx web` |
| Неверный логин в вебе | пользователь создаётся из `.env` при **первом** запуске; для сброса пароля: `docker compose exec web python -c "import sys; sys.path.insert(0,'/srv'); from app.web.auth import hasher; from app.core.database import db_session, init_db; from app.core.models import User; from sqlalchemy import select; init_db(); s=db_session().__enter__(); u=s.execute(select(User)).scalar_one(); u.password_hash=hasher.hash('НОВЫЙ_ПАРОЛЬ'); s.commit(); print('ok')"` |
| Утренний отчёт не приходит | включён ли он (в вебе «Настройки» или `/settings` в TG); часовой пояс; `docker compose logs bot` |

Полный сброс (⚠️ удаляет все данные, кроме бэкапов):

```bash
docker compose down
docker volume rm ai-assistant_app_data
docker compose up -d
```
