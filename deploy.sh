#!/usr/bin/env bash
# ============================================================
# Автоматическое развертывание «Личного ассистента задач» на VPS.
#
# Использование (на сервере, под root или пользователем с sudo):
#   git clone <URL-репозитория> ai-assistant && cd ai-assistant && ./deploy.sh
# Повторный запуск безопасен: обновит код и перезапустит сервисы.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

[ -f docker-compose.yml ] || fail "запустите скрипт из каталога проекта (рядом с docker-compose.yml)"

# ---------- 1. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  say "Docker не найден — устанавливаю"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || fail "docker compose недоступен (нужен Docker с плагином compose v2)"

# ---------- 2. Конфигурация .env ----------
if [ ! -f .env ]; then
  say "Файл .env не найден — настраиваем (значения можно потом поменять в .env)"
  cp .env.example .env

  ask() { # ask VAR "вопрос" [обязательный]
    local var="$1" prompt="$2" required="${3:-yes}" value=""
    while true; do
      read -r -p "$prompt: " value </dev/tty
      [ -n "$value" ] || [ "$required" = "no" ] && break
      echo "  Значение обязательно."
    done
    # экранируем для sed
    local escaped
    escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
    sed -i "s|^${var}=.*|${var}=${escaped}|" .env
  }

  echo "Понадобятся: токен бота (@BotFather), ваш Telegram ID (@userinfobot),"
  echo "API-ключ и folder id из Yandex Cloud (см. docs/DEPLOYMENT.md, шаги 1–2)."
  echo
  ask TELEGRAM_BOT_TOKEN "Токен Telegram-бота"
  ask OWNER_TELEGRAM_ID  "Ваш Telegram ID (число)"
  ask YC_API_KEY         "Yandex Cloud API-ключ (AQVN...)"
  ask YC_FOLDER_ID       "Yandex Cloud folder id (b1g...)"
  ask WEB_USERNAME       "Логин веб-кабинета (Enter = admin)" no
  grep -q '^WEB_USERNAME=$' .env && sed -i 's|^WEB_USERNAME=$|WEB_USERNAME=admin|' .env
  ask WEB_PASSWORD       "Пароль веб-кабинета"
  ask TIMEZONE           "Часовой пояс (Enter = Asia/Barnaul)" no
  grep -q '^TIMEZONE=$' .env && sed -i 's|^TIMEZONE=$|TIMEZONE=Asia/Barnaul|' .env
  ask DOMAIN             "Домен для HTTPS (Enter = пропустить, доступ по IP)" no

  SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -A n -t x1 | tr -d ' \n')
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET_KEY}|" .env
  echo "SECRET_KEY сгенерирован автоматически."
else
  say "Использую существующий .env"
fi

# ---------- 3. Проверка минимальной конфигурации ----------
for var in TELEGRAM_BOT_TOKEN OWNER_TELEGRAM_ID YC_API_KEY YC_FOLDER_ID WEB_PASSWORD SECRET_KEY; do
  grep -q "^${var}=..*" .env || fail "в .env не заполнено ${var}"
done

# ---------- 4. Сборка и запуск ----------
say "Собираю и запускаю контейнеры (первый раз занимает несколько минут)"
docker compose up -d --build

say "Статус сервисов"
docker compose ps

# ---------- 5. Проверка ----------
sleep 5
if docker compose exec -T web python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" >/dev/null 2>&1; then
  echo "API отвечает ✔"
else
  echo "⚠ API пока не отвечает — посмотрите логи: docker compose logs web"
fi

DOMAIN_VAL=$(grep '^DOMAIN=' .env | cut -d= -f2)
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
say "Готово!"
echo "1. Напишите вашему боту в Telegram: /start"
echo "2. Веб-кабинет: http://${DOMAIN_VAL:-${IP:-<IP-сервера>}}/"
if [ -n "$DOMAIN_VAL" ]; then
  echo "3. Для HTTPS выпустите сертификат (см. docs/DEPLOYMENT.md, шаг 6):"
  echo "   docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d $DOMAIN_VAL --email ВАШ_EMAIL --agree-tos --no-eff-email"
  echo "   docker compose restart nginx"
fi
