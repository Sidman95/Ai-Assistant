# Стадия 1: сборка React SPA
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# Стадия 2: nginx со статикой и прокси
FROM nginx:1.27-alpine
COPY --from=frontend /build/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/docker-entrypoint-tls.sh /docker-entrypoint.d/50-tls.sh
RUN chmod +x /docker-entrypoint.d/50-tls.sh
