# Многостадийная сборка: зависимости -> компиляция TypeScript -> статика Angular -> минимальный
# runtime. Runtime работает от непривилегированного пользователя `node`.
# Клиент собирается в этом же образе: Nest отдаёт его статику сам (`useStaticAssets` в `src/main.ts`),
# поэтому второй образ и второй пайплайн не нужны.

# --- Стадия 1: зависимости ---------------------------------------------------
# `openssl` нужен Prisma на alpine (задача prisma-postgres-data), `curl` — для HEALTHCHECK.
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl curl
# Корневой `postinstall` — файл, а не инлайн-строка, поэтому его нужно положить в образ до `npm ci`
# вместе с модулем констант, который он импортирует. Каталога `prisma/` на этой стадии ещё нет:
# `COPY` файлов создаёт его сам.
COPY package.json package-lock.json ./
COPY prisma/scripts/post-install.mts prisma/scripts/constants.mts ./prisma/scripts/
# `yaml-loader` — зависимость вида `file:./packages/yaml-loader`: `npm ci` читает манифест
# пакета, а корневой `postinstall` берёт корень проекта из `projectRoot` собранного пакета, поэтому
# `lib/` (артефакт `tsc`, лежащий в репозитории) нужен уже на стадии зависимостей.
COPY packages/yaml-loader ./packages/yaml-loader
RUN npm ci

# --- Стадия 2: сборка --------------------------------------------------------
# Исходники копируются поверх установленных зависимостей (node_modules исключён
# через .dockerignore). `npm run build` = prisma generate + проверка конфига API + nest build
# + компиляция seed; результат — dist/main.js и dist/prisma/seed/main.js.
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --- Стадия 3: клиент --------------------------------------------------------
# Сборка Angular идёт своим контекстом: манифесты копируются отдельно от исходников, иначе любой
# правке `client/src` предшествует полный `npm ci`. `outputPath: dist` из `client/angular.json`
# кладёт готовую страницу в `/app/dist/browser`. `npm run build` использует конфигурацию
# `production` из `defaultConfiguration`.
FROM node:24-alpine AS client-build
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Стадия 4: runtime -------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

# Те же системные пакеты, что и на стадии зависимостей: openssl — для Prisma, curl — для HEALTHCHECK.
RUN apk add --no-cache openssl curl

ENV NODE_ENV=production

# Только production-зависимости: devDependencies в образ не попадают.
# Prisma CLI лежит в `dependencies` осознанно: контейнер сам применяет миграции
# (`prisma migrate deploy` в docker/entrypoint.sh), поэтому CLI нужен в runtime.
# `postinstall` ссылается на файлы, поэтому они копируются до `npm ci`; каталог `prisma/`
# целиком придёт из стадии сборки ниже.
COPY package.json package-lock.json ./
COPY prisma/scripts/post-install.mts prisma/scripts/constants.mts ./prisma/scripts/
# `yaml-loader` подключён как `file:./packages/yaml-loader`: npm разворачивает такую
# зависимость в символическую ссылку, поэтому каталог пакета должен лежать в образе до
# `npm ci --omit=dev`; `lib/` в нём — артефакт, пересобранный на стадии `build`.
COPY --from=build /app/packages/yaml-loader ./packages/yaml-loader
RUN npm ci --omit=dev && npm cache clean --force

# Схема и закоммиченные миграции нужны `prisma migrate deploy` внутри контейнера.
COPY --from=build --chown=node:node /app/prisma ./prisma

# Клиент генерируется в runtime-стадии: `npm ci --omit=dev` ставит чистый `@prisma/client`,
# а `binaryTargets` в схеме включает linux-musl — движок соответствует alpine.
# Генераторы `nestgraphql` и `apiFields` здесь не нужны и не запускаются: GraphQL-типы
# сгенерированы на стадии сборки и лежат в `dist`, а схема контракта API — артефакт каталога
# `src/generated/config/`, который копируется отдельным `COPY` ниже. Поэтому выбирается
# только `client`.
RUN npx prisma generate --generator client

# Артефакты сборки, конфигурация и контент визитки принадлежат пользователю `node`. Каталог
# `config/` (YAML-конфиги, которые правит пользователь) копируется отдельно: приложение и сидинг
# читают его относительно рабочего каталога `/app`, а не из `dist`.
COPY --from=build --chown=node:node /app/dist ./dist
# Схемы контракта и контента со справочниками выпускает `prisma generate` в `src/generated/config/`,
# поэтому в `config/` их нет и вместе с ним они не приезжают: каталог генерации копируется сам.
COPY --from=build --chown=node:node /app/src/generated/config ./src/generated/config
# Статика клиента лежит рядом с `dist` и отдаётся тем же процессом Nest
# (`useStaticAssets(join(__dirname, '..', 'public'))`): отдельного веб-сервера в образе нет.
COPY --from=client-build --chown=node:node /app/dist/browser ./public
COPY --chown=node:node config ./config
COPY --chown=node:node data ./data
COPY --chown=node:node docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

# GraphQLModule пишет сгенерированную схему в `src/schema.gql` при старте (graphql-layer).
# Каталога в runtime-образе нет, а создавать его должен непривилегированный пользователь `node` —
# без этого приложение падает на старте с EACCES.
RUN mkdir -p ./src && chown node:node ./src

USER node

EXPOSE 3000

# Приложение считается живым, когда отвечает GET /health.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["/app/docker/entrypoint.sh"]
