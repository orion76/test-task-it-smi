# it-smi — детальное техническое задание

Детализация требований `TZ.md`. Исходное ТЗ не редактируется; этот файл — рабочий документ,
по которому нарезаются задачи. При расхождении приоритет у `TZ.md`.

## 1. Цель

Backend-приложение «цифровая визитка»: единый GraphQL-эндпоинт с Apollo Sandbox, отдающий профиль
специалиста вместе с навыками, опытом работы и проектами. Данные живут в PostgreSQL и наполняются
автоматически при старте. Разворачивается одной командой в Docker.

Оценивается качество инженерных решений, а не объём кода.

## 2. Границы

В scope:
- GraphQL API только на чтение (query), схема code-first.
- Подготовка БД (миграции) и сидинг при старте контейнера.
- Docker + docker-compose, запуск с нуля.
- README с обоснованием архитектуры.
- Деплой на публичный хостинг.

Вне scope: авторизация, мутации/CRUD-админка, фронтенд, мультипрофильность, i18n, загрузка файлов.

## 3. Стек

| Слой | Выбор | Комментарий |
|---|---|---|
| Runtime | Node.js 24 (LTS), TypeScript strict | `type: commonjs` сохраняем — ESM ломает Nest CLI и Prisma |
| Framework | NestJS (последняя стабильная) | модульная структура = видимое разделение ответственности |
| GraphQL | `@nestjs/graphql` + `@nestjs/apollo`, Apollo Server, code-first | Sandbox отдаётся драйвером Apollo |
| ORM | Prisma | миграции + типобезопасный клиент + `String[]` |
| БД | PostgreSQL 17 (alpine) | в контейнере, том для данных |
| Контейнеризация | Docker multi-stage + docker-compose | обязательный пункт ТЗ |
| Тесты | Jest + Supertest | unit + e2e |
| Качество | ESLint (typescript-eslint) + `@stylistic/eslint-plugin` (форматирование) + `tsc --noEmit` | |

Версии фиксируются `package-lock.json` на момент установки; в README — фактические.

## 4. Архитектура

Три слоя, границы жёсткие:

```
resolver  →  порт  ←  repository  →  Prisma  →  PostgreSQL
(транспорт)  (общий)   (доступ к данным)
```

- **resolver** — только приём аргументов, вызов порта/лоадера, возврат типа. Без Prisma. Здесь же
  транспортные решения: `NotFoundException`, если БД пуста, и проверка диапазона страницы.
- **порт** — один метод `find(type, query)`: тип сущности выбирает таблицу. `db` его реализует,
  `graphql` инжектит по токену, поэтому слои не импортируют друг друга.
- **repository** — единственное место с вызовами `prisma.*`. Без бизнес-логики.
- **Отдельного слоя service нет.** Бизнес-правил, кроме «пустая БД — это 404», не осталось, а это
  правило транспорта. Отдельного слоя маппинга тоже нет: запись Prisma возвращается из резолвера
  напрямую — GraphQL сам отдаёт только поля из схемы, поэтому лишние колонки (`profileId`, `order`,
  `slug`) в ответ не попадают, а маппер с копированием полей 1:1 ничего не защищает и ломается при
  проекции (`select` без поля → `undefined` в маппере).
  - Сущности описаны одним типом `{ id, type }` (`src/common/contracts/entity.ts`): сервер не знает
    полей сущности, они нужны только схеме GraphQL.
  - Даты отдаются как `GraphQLISODateTime`: `Date` из БД сериализуется в ISO 8601 с зоной.
    Форматирование под клиента — на клиенте, сервер не усекает значения до `YYYY-MM-DD`.
  - Вычисляемых полей нет: `finished` — обычная колонка и отдаётся как есть, состояние места
    работы клиент выводит из `finished` и `endedAt`.

Структура:

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── config/          # валидация env (fail-fast на старте)
│   ├── loaders/         # фабрики DataLoader (request-scoped)
│   └── prisma/          # PrismaModule (global), PrismaService
└── modules/
    ├── profile/         # entity, resolver (Query.profile/profiles), service, repository
    ├── skills/          # entity, field-resolver на Profile, repository, loader
    ├── experience/      # то же
    ├── projects/        # то же
    └── health/          # Query.health — для healthcheck контейнера и деплоя
prisma/
├── schema.prisma
├── migrations/
└── seed.ts              # читает data/profile.yml, компилируется в dist, идемпотентен
data/
└── profile.yml          # исходные данные визитки — единственный источник контента
```

## 5. Модель данных (Prisma)

```prisma
model Profile {
  id          String   @id @default(uuid())
  slug        String   @unique          // ключ идемпотентного сидинга
  name        String
  description String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  links       SocialLink[]
  skills      Skill[]
  experience  Experience[]
  projects    Project[]
}

enum SocialKind {
  GITHUB
  LINKEDIN
  WEBSITE
  OTHER
}

model SocialLink {
  id        String @id @default(uuid())
  profileId String
  label     String                      // "GitHub", "LinkedIn"
  url       String
  kind      SocialKind
  order     Int    @default(0)
  profile   Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId])
}

model Skill {
  id        String @id @default(uuid())
  profileId String
  name      String
  category  String?                     // "backend", "database"
  order     Int    @default(0)
  profile   Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@unique([profileId, name])
  @@index([profileId])
}

model Experience {
  id           String    @id @default(uuid())
  profileId    String
  company      String
  position     String
  startedAt    DateTime
  endedAt      DateTime?                // null = работаю по сей день
  finished     Boolean   @default(false) // true = место завершено; false = текущее, endedAt пуст
  achievements String[]                 // нативный массив Postgres
  order        Int       @default(0)    // порядок вывода
  profile      Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId])
  @@index([finished])
}

model Project {
  id          String  @id @default(uuid())
  profileId   String
  name        String
  url         String?
  description String?
  order       Int     @default(0)
  profile     Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId])
}
```

Замечания:
- `order` — явный порядок вывода; сортировка `orderBy: [{ order: 'asc' }, { id: 'asc' }]`
  для детерминированности (без неё Postgres порядок не гарантирует).
- `slug` у профиля обязателен: без уникального ключа сидинг не сделать идемпотентным.
- В `Experience` поле `order` не конфликтует с `position` (должность) — не переиспользовать имя.
- `finished` — явный признак завершённого места работы (`true`) с индексом `@@index([finished])`.
  Мест работы может быть несколько одновременно, поэтому «закончилось» — это факт о записи, а не
  следствие `endedAt IS NULL`. Пару `finished`/`endedAt` проверяет только запись (сидинг, правило
  `prisma/seed/data/experience-periods.ts`); чтение из БД ничего не валидирует и отдаёт строку как есть.

## 6. GraphQL API

Схема code-first, генерируется в `src/schema.gql` (коммитится для наглядности).

```graphql
type Query {
  profile: Profile!
  profiles: [Profile!]!      # добавлено осознанно: делает батчинг осмысленным
  health: Health!
}

type Health { status: String! }

type Profile {
  id: ID!
  name: String!
  description: String!
  links: [SocialLink!]!
  skills: [Skill!]!
  experience: [Experience!]!
  projects: [Project!]!
}

type SocialLink { id: ID! label: String! url: String! kind: String! }
type Skill      { id: ID! name: String! category: String }
type Experience {
  id: ID!
  company: String!
  position: String!
  startedAt: DateTime!   # ISO 8601 с зоной; форматирование — на клиенте
  endedAt: DateTime
  finished: Boolean!     # true — место завершено; false — текущее, endedAt пуст
  achievements: [String!]!
}
type Project { id: ID! name: String! url: String description: String }
```

Обязательный контракт — запрос из `TZ.md` (строки 36–51) должен выполняться без ошибок:

```graphql
query {
  profile { name description skills { name } experience { company position } projects { name } }
}
```

Эндпоинт: `POST /graphql`, Sandbox — `GET /graphql`.

## 7. Оптимизация вложенных запросов

Требование ТЗ «работа GraphQL с вложенными данными для оптимизации запросов к БД» закрывается
DataLoader'ами, а не `include` на верхнем уровне:

- `Profile.skills`, `Profile.experience`, `Profile.projects`, `Profile.links` — `@ResolveField`,
  который берёт данные из лоадера по `profile.id`.
- Batch-функция на тип: `findMany({ where: { profileId: { in: ids } } })` + группировка по
  `profileId` в `Map`. Один SQL-запрос на тип независимо от количества профилей.
- Лоадеры **request-scoped** (`Scope.REQUEST`), иначе кэш утечёт между запросами.
- Проверка отсутствия N+1 — измеримая: в e2e-тесте счётчик Prisma `$on('query')` на запрос
  `profiles` с вложенными полями не должен расти линейно по числу профилей (ожидаемо ≤ 5 запросов
  при 3 профилях и константа при 10).

## 8. Инициализация и наполнение БД

- Миграции коммитятся (`prisma/migrations/`), применяются `prisma migrate deploy` — не `migrate dev`.
- Entrypoint контейнера: `prisma migrate deploy` → seed → `node dist/main.js`.
- Seed идемпотентен: `upsert` по `slug` профиля и по естественным ключам детей; повторный
  `docker compose up` не создаёт дублей и не падает.
- Seed собирается вместе с приложением (`dist/prisma/seed/main.js`), чтобы runtime-образ не тянул
  `ts-node` и dev-зависимости.
- Контент визитки живёт **не в коде**, а в `data/profile.yml` (см. 8.1); `seed.ts` — только
  загрузчик: прочитать → провалидировать → разложить в `upsert`.

### 8.1 Источник данных: `data/profile.yml`

Файл коммитится и является единственным местом, где меняется содержимое визитки. Схема повторяет
модель Prisma, но без служебных полей (`id`, `profileId`, `createdAt`):

```yaml
version: 1
profile:
  slug: orion76
  name: "Демонстрационный профиль"
  description: "Демонстрационное описание профиля"
  links:
    - kind: GITHUB            # enum SocialKind
      label: GitHub
      url: "https://github.com/example"
    - kind: LINKEDIN
      label: LinkedIn
      url: "https://www.linkedin.com/in/example"
  skills:
    - name: TypeScript
      category: backend
    - name: PostgreSQL
      category: database
  experience:
    - company: "Демонстрационная компания (текущее место)"
      position: "Демонстрационная должность"
      startedAt: 2025-01-15   # YYYY-MM-DD
      achievements:           # флага finished нет, endedAt отсутствует — работаю по сей день
        - "Демонстрационное достижение"
    - company: "Демонстрационная компания (предыдущее место)"
      position: "Демонстрационная должность"
      startedAt: 2021-03-01   # YYYY-MM-DD
      endedAt: 2024-12-31     # дата окончания обязательна паре с finished: true
      finished: true          # место завершено
      achievements:
        - "Демонстрационное достижение"
  projects:
    - name: "Демонстрационный проект"
      url: "https://example.com/projects/demo"
      description: "Демонстрационное описание проекта"
```

Правила:
- **Порядок элементов в массивах = порядок вывода.** `order` в БД проставляет загрузчик по индексу;
  в YAML порядковые номера руками не пишутся — иначе легко получить дыры и дубли.
- **Валидация на старте — Schema-First**: чистая JSON-схема
  `prisma/seed/schema/profile-data.schema.json` + AJV. TS-декораторы и `class-validator` в сидинге
  не используются. Ошибка вида `data/profile.yml: profile.experience[0].company — <причина>`
  с указанием пути до поля. Битый файл роняет контейнер сразу, а не отдаёт пустой профиль в Sandbox.
- **Сравнение дат — динамическое**, через официальное расширение AJV:
  ```json
  "endedAt": {
    "anyOf": [
      { "type": "string", "format": "date", "formatMinimum": { "$data": "1/startedAt" } },
      { "type": "null" }
    ]
  }
  ```
  - указатель `1/startedAt` **относительный**: один уровень вверх от `endedAt` к объекту элемента
    `experience[i]`, затем соседнее поле; индекс массива в указатель не входит;
  - `formatMinimum` инклюзивный, то есть «начало ≤ конец»; строгий вариант — `exclusiveFormatMinimum`;
  - **`anyOf`, а не `oneOf`**: альтернативы и так взаимоисключающие по типу, а `oneOf` добавил бы
    лишнее требование «ровно одна ветвь» и более шумное сообщение;
  - формат — **`date`, а не `date-time`**: период работы — это дата, у неё нет часа и зоны. Это же
    снимает необходимость раздувать `YYYY-MM-DD` до полного timestamp при чтении файла;
  - инстанс AJV обязан иметь `$data: true`, иначе указатель молча не разрешится.
- **`finished` — явный признак завершённого места работы**, а не отсутствие даты: колонка
  `finished Boolean @default(false)` с индексом `@@index([finished])` и поле `finished: Boolean!` в
  API. Мест работы может быть несколько одновременно, поэтому «закончилось» — это факт о записи:
  - завершённое место: `finished: true` и дата `endedAt`;
  - текущее место: флага нет (или `finished: false`), `endedAt` отсутствует или `null`.
  Согласованность пары проверяется **только при записи** — правилом
  `prisma/seed/data/experience-periods.ts` в сидинге, после валидации схемы и до записи в БД; сообщение
  содержит путь до записи (`profile.experience[1]`) и говорит, что исправить. Чтение из БД ничего
  не валидирует: строка уходит в API как есть. Пересечение периодов ошибкой не считается —
  параллельные места работы разрешены, а сравнение дат остаётся за JSON-схемой (`formatMinimum`),
  в коде не дублируется.
- **`isCurrent` в API нет.** Поля нет ни в БД, ни в GraphQL: состояние места работы клиент выводит
  из `finished` и `endedAt`. Вычисляемое поле было бы вторым источником истины, требующим слежения
  за согласованностью.
- **Правила, невыразимые сравнением форматов**: URL — только абсолютный `http(s)`: `format: uri`
  и `pattern: ^https?://`. Относительные ссылки, голые домены и прочие значения падают валидацией
  с путём до поля.
- **Страховка от тихой деградации**: если `ajv-formats` не зарегистрировал `compare` для `date`,
  валидация молча пропускает и неверный порядок дат, и несуществующие дни (`2023-02-30`). Поэтому
  валидатор обязан проверить на старте, что `ajv.formats.date.compare` — функция, и упасть, если нет.
- `version` — для будущих изменений формата; несовпадение версии = явная ошибка, а не молчаливый парс.
- `data/` обязательно копируется в runtime-образ Dockerfile (`COPY data ./data`) — самая частая
  причина «локально сид работает, в контейнере профиль пустой».

### 8.2 Почему YAML, а не данные в `seed.ts`

Сравнение двух вариантов хранения контента:

| Критерий | `data/profile.yml` | Константа в `seed.ts` |
|---|---|---|
| Типобезопасность | в рантайме, гасится валидацией на старте | полная, проверяет компилятор |
| Зависимости | нужен YAML-парсер (`yaml`) в prod-зависимостях | нет |
| Риск «забыть в образе» | есть: нужен `COPY data` | нет, данные внутри `dist` |
| Правка контента | файл, без пересборки TS | правка кода + пересборка |
| Длинные тексты (достижения) | блок `|`, без экранирования | строки с `\n` или шаблоны |
| Смешение логики и контента | разделено | перемешано |
| Заполнение автором | не нужно трогать код | нужен доступ к TS |
| Демо-правка на собеседовании | быстрая, один файл | пересборка проекта |

Вывод: берём YAML. Здесь данные — контент, а не логика, и их правит человек без контекста кода;
цена — один парсер, одна JSON-схема и строчка в Dockerfile. Типобезопасность компенсируется
валидацией на старте: приложение не поднимется с некорректными данными, то есть ошибка всё равно
всплывёт до первого запроса.

Типы для кода не пишутся руками и не дублируют схему: они генерируются из неё
(`json-schema-to-typescript`, npm-скрипт `schema:types`) в закоммиченный
`prisma/seed/schema/profile-data.types.ts`. Схема — единственный источник истины, типы — её проекция;
разъехаться они не могут, потому что второе выводится из первого.

## 9. Docker и запуск с нуля

- `Dockerfile`, multi-stage: `deps` (`npm ci`) → `build` (`prisma generate` + `nest build`) →
  `runtime` (prod-зависимости, `dist`, `prisma/`, non-root `node`).
- `prisma generate` обязателен в образе; для alpine —
  `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` и установленный `openssl`.
- `docker-entrypoint.sh` — миграции, сидинг, старт.
- `docker-compose.yml`: сервис `db` (postgres:17-alpine, `healthcheck` через `pg_isready`, том
  `pgdata`) и `app` (`depends_on: db: condition: service_healthy`, порт `3000:3000`).
- `.dockerignore`: `node_modules`, `dist`, `.git`, `.history`, `.env`, `*.log`.
- Критерий: `docker compose up --build` на чистой машине (без локального Postgres и без
  предварительного `npm install`) поднимает рабочее приложение.

## 10. Конфигурация

| Переменная | Назначение | Значение по умолчанию |
|---|---|---|
| `DATABASE_URL` | строка подключения Prisma | — (обязательна) |
| `PORT` | порт HTTP | `3000` |
| `NODE_ENV` | режим | `development` |

- `.env.example` коммитится, `.env` — в `.gitignore` (уже есть).
- Валидация env на старте (`common/config`), при отсутствии `DATABASE_URL` — падение с понятным
  сообщением, а не «connection refused» из недр Prisma.

## 11. Тестирование

- **Unit** (Jest): сервисы с мок-репозиториями; batch-функции лоадеров (группировка по `profileId`,
  корректная обработка отсутствующих id); вычисляемые поля.
- **e2e** (Supertest + реальная БД): приложение целиком, запросы из раздела 6, проверка порядка
  вывода и вложенности; тест-счётчик запросов на N+1 (раздел 7).
- e2e требует поднятой БД: `docker compose up -d db` либо отдельный `DATABASE_URL` для тестовой
  схемы. Это фиксируется в README, иначе тесты «не запускаются у ревьюера».

## 12. Качество кода

Скрипты `package.json` (порядок проверки важен):

```
lint → typecheck → test → test:e2e → build:lib → build
```

- `lint` — ESLint, `typecheck` — `tsc --noEmit`, `build` — `nest build`.
- `build:lib` — `tsc -p packages/yaml-loader/tsconfig.json`: проверка, что библиотека
  `packages/yaml-loader` (исходники в `src/` пакета) компилируется. Собранный `lib/` — локальный
  артефакт, в репозитории его нет, поэтому проверяется именно сборка.
- Форматирование выполняет сам ESLint (`@stylistic/eslint-plugin`): `lint:fix` исправляет и
  форматирует, отдельной проверки форматирования и отдельного форматтера нет.
- Публичные методы сервисов и batch-функций — с JSDoc на английском (код — английский,
  документация — русский; см. раздел 13).

## 13. Документация (README)

**Язык:** README и прочая документация — на русском (заказчик русскоязычный). Английский остаётся
только в коде: идентификаторы, имена полей GraphQL, комментарии, JSDoc, тексты ошибок валидации.

Обязательные разделы:
1. Что это и стек (с версиями).
2. Запуск: `docker compose up --build` → URL Sandbox; локальный запуск без Docker.
3. Переменные окружения.
4. Примеры GraphQL-запросов (минимум — запрос из ТЗ).
5. **Архитектура и обоснование решений**: слои, почему code-first, почему DataLoader вместо
   `include`, почему PostgreSQL, почему данные в `data/profile.yml`, идемпотентный сидинг,
   границы модулей. Ссылки на файлы.
6. Как заполнить `data/profile.yml` своим содержимым (с примером).
7. Компромиссы и что сделал бы дальше (честный раздел — плюс к оценке).

## 14. Деплой

- Платформа: Render или Railway (Docker-сервис + managed PostgreSQL).
- Миграции и сидинг выполняются тем же entrypoint'ом на старте — на проде тоже.
- Проверка: Sandbox открывается по публичному URL, запрос из ТЗ отдаёт данные.
- Ссылка на репозиторий и ссылка на деплой — в README (требование ТЗ).

## 15. Definition of Done

1. `git clone` + `docker compose up --build` → `http://localhost:3000/graphql` открывает Apollo
   Sandbox, запрос из ТЗ возвращает корректные данные.
2. Повторный запуск не дублирует данные (идемпотентность сидинга).
3. `npm run lint && npm run typecheck && npm run test && npm run test:e2e && npm run build` — зелёные.
4. Число SQL-запросов при выборке списка профилей не зависит от их количества.
5. README содержит обоснование архитектуры и рабочие команды.
6. Публичный деплой отвечает, introspection/Sandbox доступны.
7. В git нет `.env`, `node_modules`, `dist`, `.history`.
8. Контент визитки правится в `data/profile.yml` без изменения кода; битый файл даёт понятную
   ошибку с путём до поля.

## 16. Известные грабли (проверять явно)

- **Apollo отключает introspection и Sandbox при `NODE_ENV=production`.** На проде Playground будет
  пустым — выставить `introspection: true` и `playground: true` в `GraphQLModule.forRoot`.
  Это самая вероятная причина «на проде не работает, локально работает».
- **Prisma на alpine** без `openssl` и `binaryTargets` падает на `query-engine`.
- **Postgres поднимается дольше app** — без `healthcheck` + `condition: service_healthy` миграции
  стартуют раньше БД.
- **`migrate dev` в контейнере** требует shadow DB и интерактивности — только `migrate deploy`.
- **Порядок вывода без `orderBy`** не гарантирован: тесты на порядок будут «мигать».
- **`main` в `package.json` указывает на `index.js`** (наследие `npm init`) — должен стать
  `dist/main.js`.
- **`type: commonjs`** не менять на `module`: Nest CLI, декораторы и Prisma-генерация рассчитаны
  на CJS.
- **Сидинг с `create`** вместо `upsert` ломает повторный запуск на существующем томе.
- **`data/profile.yml` не скопирован в образ** — сид отработает «успешно» с пустым результатом
  либо упадёт на `ENOENT`; нужен `COPY data ./data` в runtime-стадии.
- **`.history/`** — бэкапы редактора; уже в `.gitignore`, не путать с исходниками.

## 17. Открытые вопросы

- Платформа деплоя: Render или Railway (влияет только на шаг деплоя).
- Реальные персональные данные: в `data/profile.yml` пока демонстрационный контент, данные автора
  ещё не внесены.
- Нужна ли мутация/админка — сейчас вне scope, ТЗ этого не требует.
