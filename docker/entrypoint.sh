#!/bin/sh
# Точка входа контейнера приложения.
# Готовит базу данных и передаёт управление Node.js.
set -e

# 1. Применяем закоммиченные миграции. Именно `migrate deploy`: `migrate dev` требует shadow DB
#    и интерактивности и в контейнере непригоден. Схема и миграции лежат в /app/prisma,
#    Prisma CLI — в production-зависимостях (см. Dockerfile).
echo "==> prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

# 2. Сидинг из data/profile.yml: доменные таблицы очищаются и наполняются заново, поэтому
#    повторный запуск не создаёт дублей. Скрипт собран в dist вместе с приложением,
#    поэтому ts-node в runtime-образе не нужен.
echo "==> seed (dist/prisma/seed/main.js)"
node dist/prisma/seed/main.js

# exec: shell заменяется процессом Node.js, лишний процесс-обёртка не остаётся.
# PID 1 в контейнере — tini (`init: true` в docker-compose): он получает SIGTERM от Docker,
# пересылает его Node.js и пожинает зомби-процессы. Само приложение завершается по SIGTERM
# благодаря app.enableShutdownHooks() в src/main.ts.
exec node dist/main.js
