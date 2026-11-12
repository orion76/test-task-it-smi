/**
 * Конфиг генератора seed-schema (`generator seedSchema` в `schema.prisma`): только то, чего нет в
 * DMMF — корневой конверт файла, служебные колонки, общие фрагменты и доменные ограничения. Ключи
 * английские, как у любого артефакта кода; комментарии русские, потому что каждое правило здесь —
 * решение о формате данных, и обоснование важнее самого правила.
 */
import type { ISeedSchemaConfig } from './types.mts';

const config = {
  // Путь от корня проекта: отсюда генератор берёт имя файла и пишет его в каталог `output` из
  // `schema.prisma` (`../config`). Значение же служит запасным путём для запуска без Prisma.
  output: 'config/profile-data.schema.yml',

  // Корневой конверт: то, что относится к файлу целиком, а не к модели.
  root: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://it-smi.local/schema/profile-data.schema.yml',
    title: 'ProfileData',
    description:
      'Format of data/profile.yml: the only source of the business-card content. The schema ' +
      'mirrors the Prisma models without service fields (id, profileId, createdAt, updatedAt) and ' +
      'is the single source of truth for the loader: validation (AJV) and the structure the ' +
      'writer walks are derived from it.',
    // Версия формата: несовпадение — явная ошибка загрузки, а не молчаливый парс.
    version: {
      const: 1,
      description: 'Format version. A different value is a hard error, not a silent parse.',
    },
    // Свойства файла верхнего уровня: ключ — имя свойства в `data/profile.yml`, значение — ключ
    // `$defs`, то есть модель в camelCase (`profile` → `$defs.profile`, модель `Profile`).
    // Порядок свойств сохраняется в схеме, `required` собирается из них же.
    properties: {
      profile: 'profile',
    },
  },

  // Служебные колонки строки: их заполняет БД или сидинг, в файле импорта их нет.
  // `profileId` пишет сидинг из вложенности, `type` — значение по умолчанию колонки,
  // `id`/`createdAt`/`updatedAt` — БД. Порядка среди них нет: порядок вывода коллекции задают её
  // собственные значения, а не служебная колонка с индексом элемента массива.
  omit: ['id', 'type', 'profileId', 'createdAt', 'updatedAt'],

  // Справочники: модели, строки которых делятся между родителями. Здесь названы ключ строки,
  // имя свойства родителя, под которым файл вкладывает коллекцию, и таблица связи с колонками
  // родителя и цели. Генератор проверяет каждое имя по DMMF и выпускает блок отдельным артефактом
  // `config/dictionaries.yml`; таблицы связи в файл импорта не попадают — движок выводит их строки.
  dictionaries: {
    Skill: {
      key: 'name',
      property: 'skills',
      link: { model: 'ProfileSkill', parent: 'profileId', target: 'skillId' },
    },
    SocialLink: {
      key: 'url',
      property: 'links',
      link: { model: 'ProfileSocialLink', parent: 'profileId', target: 'socialLinkId' },
    },
  },

  // Общие фрагменты `$defs`, не привязанные к модели: одна и та же ссылка повторяется в разных
  // моделях, поэтому правило живёт в одном месте.
  definitions: {
    // Только абсолютный http(s): относительные ссылки и голые домены отсекаются, а не попадают в
    // API мусорным href. `format: uri` проверяет форму значения, `pattern` — схему.
    httpUrl: {
      description:
        'Absolute http(s) URL with a scheme and a host. Relative links, bare domains and any ' +
        'other value are rejected with the path of the offending field.',
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
    },
  },

  // Доменные ограничения поверх выведенных правил: по модели (`Skill`) и по полю (`Profile.slug`).
  overrides: {
    // Модель: описание импорта дополняет `///` из `schema.prisma`. Справочник держит `name`
    // уникальным (`@unique`), поэтому описание импорта говорит об уникальности имени, а связь с
    // профилем живёт в таблице `ProfileSkill`.
    Skill: {
      description:
        'Skill of the business card. The name identifies the dictionary row and is unique in the ' +
        'database, so one profile lists the same skill once.',
    },
    // Kebab-case латиница: `slug` — публичный идентификатор профиля, поэтому формат проверяется.
    'Profile.slug': {
      type: 'string',
      pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    },
    // Период работы — календарные даты, а не моменты времени: у месяца трудоустройства нет ни
    // времени суток, ни часового пояса.
    'Experience.startedAt': {
      type: 'string',
      format: 'date',
    },
    // Даты окончания может не быть: «работаю по сей день» выражает флаг `finished`, а его
    // согласованность с датой проверяет сидинг (`prisma/seed/data/experience-periods.check.ts`).
    // `formatMinimum` сравнивает с соседним `startedAt`: указатель `1/startedAt` поднимается к
    // элементу массива, поэтому индекс в нём не участвует.
    'Experience.endedAt': {
      anyOf: [
        { type: 'string', format: 'date', formatMinimum: { $data: '1/startedAt' } },
        { type: 'null' },
      ],
    },
    // Ссылка — только абсолютный http(s): правило общее, вынесено в `$defs.httpUrl`.
    'SocialLink.url': {
      $ref: '#/$defs/httpUrl',
    },
    // Ссылка проекта необязательна: `null` — «ссылки нет», значение — абсолютный http(s).
    'Project.url': {
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/httpUrl' }],
    },
  },
} satisfies ISeedSchemaConfig;

export default config;
