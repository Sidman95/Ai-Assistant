#!/bin/sh
# Если задан DOMAIN и для него уже выпущен сертификат Let's Encrypt —
# добавляем HTTPS-сервер и редирект с HTTP. Иначе работаем по чистому HTTP.

set -e

CONF_DIR=/etc/nginx/conf.d
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

rm -f "$CONF_DIR/tls.conf" "$CONF_DIR/redirect-to-https.inc"

if [ -n "$DOMAIN" ] && [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo "[nginx] найден сертификат для $DOMAIN — включаю HTTPS"

  cat > "$CONF_DIR/redirect-to-https.inc" <<EOF
    location / {
        return 301 https://\$host\$request_uri;
    }
EOF

  cat > "$CONF_DIR/tls.conf" <<EOF
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://web:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files \$uri /index.html;
    }
}
EOF
else
  echo "[nginx] сертификат не найден (DOMAIN='${DOMAIN:-}') — работаю по HTTP"
fi
