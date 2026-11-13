# it-smi — цифровая визитка: backend на NestJS, Prisma, GraphQL и Docker

## Что это и в каком состоянии

Тестовое задание: backend цифровой визитки. Стек зафиксирован заказчиком — TypeScript, Node.js 24,
NestJS, Prisma 6 + PostgreSQL, GraphQL (Apollo Sandbox), Docker.

Код готов: семь моделей и один enum, сидинг из YAML, батчинг вложенных полей, юнит- и e2e-тесты,
Angular-клиент ручной проверки. Проверка с нуля — `docker compose up --build`: миграции и сидинг
выполняет entrypoint контейнера, дальше доступны `/graphql` (Sandbox), `/health` и `/` (страница
проверки).

Источник требований — `TZ/TZ.md` и `TZ/tz-detail.md`. Устройство подсистем, сквозные сценарии и
типовые доработки разобраны в `README.md` (`## Подсистемы`, `## Как части работают вместе`,
`## Типовые доработки`) — здесь они не дублируются.

## Карта репозитория

| Путь | Что это | Правится руками |
|---|---|---|
| `src/common/` | контракты (`IEntity`, порт чтения), чтение контракта API, валидация окружения | да |
| `src/db/` | `EntityRepository`, построение аргументов чтения, Prisma-клиент | да |
| `src/graphql/` | поведение запросов (404, пагинация), `EntityLoader`, регистрация резолверов | да |
| `src/features/health/` | HTTP `/health` и GraphQL-поле `health` | да |
| `src/generated/**` | артефакты `npm run prisma:generate`: классы GraphQL-типов, объявления резолверов и YAML-схемы под `src/generated/config/` | **нет** — перегенерировать |
| `src/schema.gql` | снимок SDL; единственный писатель — тест (`npm run schema:update`) | **нет** |
| `prisma/schema.prisma` | источник структуры данных: модели, колонки, индексы, связи | да, затем миграция и генерация |
| `prisma/migrations/` | закоммиченный SQL; `init` не переписывается, новая миграция — `npm run prisma:migrate:dev` | только через CLI |
| `prisma/generators/` | генераторы и их конфиги, в т.ч. объявление справочников в `seed-schema/seed-schema.config.mts` | да |
| `prisma/seed/` | движок сидинга: дерево моделей, писатель, справочники, доменные проверки | да |
| `prisma/scripts/` | пост-обработка после генерации и установки | да |
| `config/` | только то, что правит пользователь: `api-fields.yml` (контракт API: запросы, поля, связи, порядок), `environment.schema.yml` (JSON Schema окружения) | да |
| `src/generated/config/` | артефакты генерации: `api-fields.schema.yml`, `profile-data.schema.yml`, `dictionaries.yml` | **нет** — перегенерировать |
| `data/profile.yml` | контент визитки; сидинг только читает его | да |
| `tests/unit/`, `tests/e2e/` | юнит-тесты и e2e на живой PostgreSQL | да |
| `packages/yaml-loader/` | своя библиотека чтения и проверки YAML (`file:`-зависимость) | да |
| `client/` | Angular-клиент ручной проверки API | да |
| `scripts/` | CLI проверки контракта и dev-хелперы | да |
| `docker/` | entrypoint: `migrate deploy` → сидинг → `node dist/main.js` | да |
| `TZ/` | требования заказчика | **нет** |
| `todo-global.yml` | roadmap реализации; большинство групп закрыто | да |

`.opencode/`, `.doc/`, `.history/`, `.tmp/` — локальные рабочие каталоги, в git не входят
(`.gitignore`).

## Инварианты: утверждение → признак нарушения

Менять эти решения можно только сознательно, вместе с кодом, тестами и README.

- **Строка любой таблицы — `{ id, type }`** (`src/common/contracts/types.ts`), `type` — имя делегата
  Prisma (`profile`, `socialLink`, …). DTO, мапперов и сервисов между резолвером и репозиторием нет:
  строка БД уходит в GraphQL как есть. → Признак: класс-модель с пофайловым маппингом, `toDto`,
  сервис, перекладывающий поля.
- **Объявления запросов и полей-связей генерируются** (`prisma/generators/graphql/` →
  `src/generated/graphql/resolvers/`); руками пишется только поведение в `src/graphql/`. → Признак:
  `@Query`/`@ResolveField` вне `src/generated/` (единственное исключение — `src/features/health/`).
- **Видимость полей решает `config/api-fields.yml`, инверсия по умолчанию:** чего нет в файле, того
  нет в API. → Признак: колонка в GraphQL без записи в `properties`/`references`.
- **Порядок коллекций берётся из `order` контракта**, последний ключ различает строки (`id`), поэтому
  подпоследовательность одного родителя не «плывёт» между чтениями. → Признак: сортировка в памяти
  (`sort()` в резолвере или лоадере) либо `order`, у которого последний ключ не различает строки.
- **Вложенные поля батчатся:** `EntityLoader` (DataLoader, `Scope.REQUEST`) делает один `find` на
  таблицу за тик, связь через таблицу — два чтения на группу. → Признак: `findMany`/`prisma.*` в
  резолвере или число запросов, растущее с числом родителей (`tests/e2e/batching.e2e-spec.ts`).
- **Сидинг только вставляет:** одна транзакция, таблицы очищаются, затем строки вставляются; повторный
  запуск не даёт дублей. → Признак: `update`, `upsert` или `updateMany` в `prisma/seed/**`.
- **Справочники двухфазные:** `Skill` (ключ `name`) и `SocialLink` (ключ `url`) — общие строки, а
  принадлежность профилю хранят `ProfileSkill` и `ProfileSocialLink`; объявление — блок `dictionaries`
  в `seed-schema.config.mts`, артефакт — `src/generated/config/dictionaries.yml`. → Признак:
  `profileId` у `Skill` или `SocialLink`, `@@unique([profileId, name])`.
- **Артефакты `prisma generate` лежат под `src/generated/`,** в `config/` — только конфиги, которые
  правит пользователь (`api-fields.yml`, `environment.schema.yml`). YAML-схемы контракта и контента
  со справочниками — тоже артефакты, поэтому они живут в `src/generated/config/`. → Признак: файл,
  который пишет генератор, лежит в `config/`; либо правимый руками конфиг появился под
  `src/generated/`.
- **Артефакты лежат в git, актуальность держит тест паритета.** → Признак: расхождение `npm test` на
  `tests/unit/generated/artifacts.parity.spec.ts`.
- **Границы слоёв:** `db` и `graphql` не импортируют друг друга, связь — через `IEntityQueryPort` и
  токен `ENTITY_QUERY_PORT`. → Признак: импорт `src/db` из `src/graphql` (валит `npm run lint`).

Структурные правила кода (типы отдельно от реализации, одна категория объявлений на файл, длина
комментариев) проверяют `tests/unit/structure/*.spec.ts`.

## Команды проверки

| Команда | Назначение |
|---|---|
| `npm run lint` | стиль, `@stylistic/eol-last`, границы слоёв |
| `npm run typecheck` | пять проектов TypeScript |
| `npm run knip` | неиспользуемые файлы, экспорты и зависимости |
| `npm test` | юнит-тесты, паритет артефактов, снимок SDL |
| `npm run test:e2e` | e2e на живой PostgreSQL, нужен Docker |
| `npm run build` | библиотека → проверка контракта → генерация → `nest build` → сидинг |
| `npm run prisma:generate` | артефакты генерации и пост-обработка |
| `npm run validate:api-fields` | контракт против схемы БД |
| `npm run schema:update` | перезаписать `src/schema.gql` |
| `npm run prisma:migrate:dev` | создать и применить миграцию локально |
| `npm run build:seed && npm run prisma:seed` | собрать и прогнать сидинг |
| `npm run docker:up` | `docker compose up --build` |

В `npm run build` проверка контракта стоит раньше генерации намеренно: `config/api-fields.yml`
читают сами генераторы (`prisma/generators/graphql/contract.reader.mts`,
`prisma/generators/nestgraphql/api-fields.reader.mts`), поэтому ошибка в контракте должна быть
поймана `validate:api-fields` до того, как они начнут перезаписывать `src/generated/**`.

## Правила изменений

- Русский — документация, `.md`-комментарии, коммиты; английский — код: идентификаторы, JSDoc,
  комментарии в коде.
- `config/` — только YAML, который правит пользователь, и только он: `api-fields.yml`,
  `environment.schema.yml`. Читающий и проверяющий код лежит в `src/`, `prisma/` или `scripts/`;
  новый конфиг добавляется в `config/`, а не в `src/`. Всё, что пишет `prisma generate`, живёт под
  `src/generated/`, а не в `config/`.
- `type: commonjs` в `package.json` не менять на `module` — ESM ломает Nest CLI и Prisma.
- Временные файлы, логи и отладочные скрипты — только в `.tmp/` (он в `.gitignore`); каталог `tmp/`
  без точки не использовать.
- Каждый текстовый файл заканчивается ровно одним `\n`; правило `@stylistic/eol-last`, `npm run lint`
  обязан быть зелёным.
- Новая модель: колонка `type` с `@default`, `onDelete: Cascade` на связи с профилем, миграция, блок
  `models.<Model>` в контракте, генерация, паритет.
- Новая колонка в API: `properties` с описанием; при сортировке — `order` и индекс под его ключи.

## Чего не делать без явного разрешения

- Правка `README.md` и документации: пункт todo разрешением не является, спрашивайте отдельно.
- Правка сгенерированных артефактов (`src/generated/**`, включая `src/generated/config/*.yml`, и
  `src/schema.gql`) — их перегенерируют.
- Изменение `TZ/` — это требования заказчика, а не документация проекта.
- Возврат `.doc/` в репозиторий: решением пользователя каталог остаётся в `.gitignore`.
