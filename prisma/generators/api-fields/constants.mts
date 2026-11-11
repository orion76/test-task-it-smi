/**
 * Constants of the `apiFields` generator: the name, the fallback directory and the header of its
 * artifact, and the subschemas every generated document reuses.
 */
import type { DMMF } from '@prisma/generator-helper';

import type { IObjectSchema, TSchemaNode } from './types.mts';

/** File written into the generator output directory (`output` in `schema.prisma`). */
export const SCHEMA_FILE_NAME = 'api-fields.schema.yml';

/** Fallback when the schema declares no `output`: mirrors the value declared in `schema.prisma`. */
export const DEFAULT_OUTPUT = '../config';

/** Header of the artifact: it explains where the content comes from and how to change it. */
export const HEADER = [
  `# config/${SCHEMA_FILE_NAME} — JSON Schema контракта API (config/api-fields.yml).`,
  '#',
  '# Файл собран генератором prisma/generators/api-fields/api-fields.generator.mts из DMMF',
  '# prisma/schema.prisma: модели, их скалярные поля, связи и порядок чтения перечислены явно,',
  '# поэтому имя модели, колонки или сущности, которых нет в схеме, — ошибка валидации, а не',
  '# молча пропавшее поле API. Руками не редактируется: правка теряется при `prisma generate`',
  '# и ловится тестом паритета tests/unit/generated/artifacts.parity.spec.ts.',
  '#',
  '# Читает файл валидатор контракта (AJV, src/graphql/contract/api-fields.validator.ts):',
  '# он проверяет config/api-fields.yml на сборке и на старте приложения.',
].join('\n');

/**
 * Field kinds listed in `properties`. `scalar` and `enum` are values stored in the row itself
 * (`SocialLink.kind` is an enum), while `object` is a relation and `unsupported` is a column Prisma
 * cannot map to a scalar — the first two belong to `references`, the last to neither.
 */
export const VALUE_FIELD_KINDS = new Set<DMMF.FieldKind>(['scalar', 'enum']);

/** One entry of a `properties` block: an object with a non-empty description and nothing else. */
export const PROPERTY_SCHEMA: IObjectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description'],
  properties: {
    description: { type: 'string', minLength: 1 },
  },
};

/**
 * One entry of the top-level `queries` block: a GraphQL query over one entity.
 *
 * The query name is the GraphQL field name, so it is not enumerated here — a new query is a new
 * public field, not a typo to catch. `entity` and `kind` are enumerated: they must name a table that
 * exists and one of the two shapes the base class implements.
 */
export const QUERY_SCHEMA: IObjectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'entity', 'kind'],
  properties: {
    description: { type: 'string', minLength: 1 },
    kind: { enum: ['one', 'page'] },
  },
};

/**
 * Value of one key of an `order` entry: a direction, or the full form that also places the rows
 * whose value is `null` (`{ sort: asc, nulls: last }`).
 */
export const SORT_SCHEMA: TSchemaNode = {
  oneOf: [
    { enum: ['asc', 'desc'] },
    {
      type: 'object',
      additionalProperties: false,
      required: ['sort', 'nulls'],
      properties: {
        sort: { enum: ['asc', 'desc'] },
        nulls: { enum: ['first', 'last'] },
      },
    },
  ],
};
