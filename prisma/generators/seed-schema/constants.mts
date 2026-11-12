/**
 * Constants of the `seedSchema` generator: the name and the fallback directory of its artifact, the
 * path of its config in the messages, the keys it accepts and the JSON Schema keywords a fragment
 * may use.
 */
import config from './seed-schema.config.mts';

/** Fallback when the schema declares no `output`: mirrors the value declared in `schema.prisma`. */
export const DEFAULT_OUTPUT = '../config';

/** Header of the artifact: it explains where the content comes from and how to change it. */
export const HEADER = [
  `# ${config.output} — JSON Schema импорта data/profile.yml.`,
  '#',
  '# Файл собран генератором prisma/generators/seed-schema/seed-schema.generator.mts из prisma/schema.prisma и',
  '# prisma/generators/seed-schema/seed-schema.config.mts: структура (модели, вложенность, обязательность, типы,',
  '# enum-значения, массивы) выведена из DMMF, доменные ограничения (форматы дат, шаблоны URL,',
  '# необязательная дата окончания) взяты из конфига генератора. Руками не редактируется: правка',
  '# теряется при `prisma generate` и ловится тестом паритета',
  '# tests/unit/generated/artifacts.parity.spec.ts.',
  '#',
  '# Читает файл валидатор сидинга (AJV, prisma/seed/data/data.validator.ts): он проверяет data/profile.yml.',
].join('\n');

/** Prefix of the messages about the datamodel: every one of them names a model and a field. */
export const GENERATOR_NAME = 'seed-schema';

/** The config file in the messages: the reader has to know which file to fix. */
export const CONFIG_FILE = 'prisma/generators/seed-schema/seed-schema.config.mts';

/** Keys the config may contain. Anything else is a typo and must not be ignored silently. */
export const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'output',
  'root',
  'omit',
  'definitions',
  'overrides',
  'dictionaries',
]);

/** Keys one entry of the `dictionaries` block may contain. */
export const DICTIONARY_KEYS: ReadonlySet<string> = new Set(['key', 'link']);

/** Keys of the `link` block of one dictionary: the tie table and the two columns it stores. */
export const DICTIONARY_LINK_KEYS: ReadonlySet<string> = new Set(['model', 'parent', 'target']);

/** Artifact of the `dictionaries` block: written next to the schema of the import file. */
export const DICTIONARIES_FILE_NAME = 'dictionaries.yml';

/** Header of the dictionaries artifact: where the block comes from and who reads it. */
export const DICTIONARIES_HEADER = [
  `# config/${DICTIONARIES_FILE_NAME} — справочники и их таблицы связи.`,
  '#',
  '# Файл собран генератором prisma/generators/seed-schema/seed-schema.generator.mts из prisma/schema.prisma и',
  '# prisma/generators/seed-schema/seed-schema.config.mts: блок `dictionaries` конфига перечисляет справочные',
  '# модели, их ключ и таблицу связи, а генератор проверяет каждое имя по DMMF. Руками не редактируется:',
  '# правка теряется при `prisma generate` и ловится тестом паритета',
  '# tests/unit/generated/artifacts.parity.spec.ts.',
  '#',
  '# Читает файл сидинг (prisma/seed/dictionaries/dictionaries.reader.ts): строку справочника он вставляет',
  '# один раз на значение ключа, строку связи — по полученному id.',
].join('\n');

/** Keys `root` may contain. */
export const ROOT_KEYS: ReadonlySet<string> = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'version',
  'properties',
]);

/** Keys of the root envelope that are copied to the document as they are. */
export const ROOT_PASSTHROUGH_KEYS: readonly string[] = ['$schema', '$id', 'title', 'description'];

/**
 * JSON Schema keywords a config fragment may use: draft-07 plus the comparison keywords of
 * `ajv-formats`. A misspelled keyword would be ignored by AJV and silently drop a restriction, so the
 * keys of every fragment are checked instead of being copied blindly.
 */
export const FRAGMENT_KEYWORDS: ReadonlySet<string> = new Set([
  '$id',
  '$schema',
  '$ref',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'readOnly',
  'writeOnly',
  'type',
  'enum',
  'const',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'format',
  'formatMinimum',
  'formatMaximum',
  'formatExclusiveMinimum',
  'formatExclusiveMaximum',
  'items',
  'additionalItems',
  'maxItems',
  'minItems',
  'uniqueItems',
  'contains',
  'maxProperties',
  'minProperties',
  'required',
  'properties',
  'patternProperties',
  'additionalProperties',
  'dependencies',
  'propertyNames',
  'if',
  'then',
  'else',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'definitions',
  'contentMediaType',
  'contentEncoding',
]);

/**
 * JSON Schema type of a Prisma scalar. A scalar outside this map has no obvious counterpart
 * (`Json`, `Bytes`), so the generator stops instead of inventing an empty schema for it.
 */
export const SCALAR_TYPES: ReadonlyMap<string, string> = new Map([
  ['String', 'string'],
  ['Int', 'integer'],
  ['BigInt', 'integer'],
  ['Float', 'number'],
  ['Decimal', 'number'],
  ['Boolean', 'boolean'],
  ['DateTime', 'string'],
]);
