#!/bin/sh
# Изолированный суточный бэкап SQLite (NFR-4).
# Контейнер работает под отдельным пользователем (12000), БД смонтирована
# только на чтение, каталог /backups не смонтирован в web/bot —
# ИИ/бот физически не могут изменить или удалить резервные копии.

DB_PATH="${DB_PATH:-/data/assistant.sqlite3}"
BACKUP_DIR="/backups"
BACKUP_TIME="${BACKUP_TIME:-03:30}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
export TZ="${TIMEZONE:-Asia/Barnaul}"

echo "[backup] старт: время бэкапа ${BACKUP_TIME} (${TZ}), хранение ${RETENTION_DAYS} дн."

last_run_date=""
while true; do
  now_hm="$(date +%H:%M)"
  today="$(date +%F)"
  if [ "$now_hm" = "$BACKUP_TIME" ] && [ "$last_run_date" != "$today" ]; then
    if [ -f "$DB_PATH" ]; then
      out="${BACKUP_DIR}/assistant-${today}.sqlite3"
      # .backup даёт консистентный снимок даже при активной записи (WAL)
      if sqlite3 "file:${DB_PATH}?mode=ro" ".backup '${out}'"; then
        gzip -f "$out"
        echo "[backup] создан ${out}.gz"
        last_run_date="$today"
        # ротация
        find "$BACKUP_DIR" -name 'assistant-*.sqlite3.gz' -mtime +"$RETENTION_DAYS" -delete
      else
        echo "[backup] ОШИБКА создания бэкапа"
      fi
    else
      echo "[backup] БД не найдена: $DB_PATH"
    fi
  fi
  sleep 30
done
