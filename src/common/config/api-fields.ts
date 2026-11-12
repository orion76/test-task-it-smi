import { loadConfig } from 'yaml-loader';

import { entityNameOf } from '../contracts/entity';
import type { IThroughLink, TOrderBy, UEntityReference, USortKey } from '../contracts/types';
import { API_FIELDS_CONFIG_PATH } from './config-paths';
import type { IContractIndex, TReferencesByEntity } from './types';

/** Read once per process: the contract is static, and a broken file has to fail on the first read. */
let cached: IContractIndex | null = null;

/**
 * Reference of one field of one entity: what the field reads and how — a column of a row or a tie
 * table between the two rows.
 *
 * `entity` is the `type` of the row (`profile`, `socialLink`, …), not the model name: that is what
 * the row carries and what the config is indexed by.
 *
 * @param entity `type` of the row whose field is read
 * @param field name of the relation field, e.g. `links`
 * @throws Error naming the file, the entity and the field when the reference is not declared
 */
export function referenceOf(entity: string, field: string): UEntityReference {
  const reference = contract().references.get(entity)?.get(field);

  if (reference === undefined) {
    throw new Error(
      `${API_FIELDS_CONFIG_PATH}: no reference "${field}" of entity "${entity}"; ` +
        'declare it in the "references" block of the model',
    );
  }

  return reference;
}

/**
 * Ordering of the rows of one entity, as the model declares it: the columns from the most
 * significant key to the least significant one.
 *
 * @param entity `type` of the row whose collection is read
 * @returns the ordering, or `undefined` when the model declares none
 */
export function orderOf(entity: string): TOrderBy | undefined {
  return contract().orders.get(entity);
}

/** The contract of the process: read and indexed on the first call, then reused. */
function contract(): IContractIndex {
  if (cached === null) {
    cached = indexModels(readModels());
  }

  return cached;
}

/** Indexes the `references` and the `order` of every model by the entity name the rows carry. */
function indexModels(models: Record<string, unknown>): IContractIndex {
  const references: TReferencesByEntity = new Map();
  const orders = new Map<string, TOrderBy>();

  for (const [modelName, model] of Object.entries(models)) {
    const entity = entityNameOf(modelName);
    const order = orderBlockOf(modelName, model);

    references.set(entity, referencesOf(modelName, model));

    if (order !== undefined) {
      orders.set(entity, order);
    }
  }

  return { references, orders };
}

/**
 * Indexes the `references` of one model by the field name.
 *
 * @param modelName name of the model in the contract, for the messages
 * @param model model entry as the YAML parser returned it
 * @throws Error naming the file and the model when the block is not a mapping
 */
function referencesOf(modelName: string, model: unknown): Map<string, UEntityReference> {
  const fields = new Map<string, UEntityReference>();
  const references = isRecord(model) ? model.references : undefined;

  if (references === undefined) {
    return fields;
  }

  if (!isRecord(references)) {
    throw new Error(`${API_FIELDS_CONFIG_PATH}: models.${modelName}.references must be a mapping`);
  }

  for (const [field, reference] of Object.entries(references)) {
    try {
      fields.set(field, toReference(reference));
    } catch (error) {
      throw failedEntry(`${modelName}.references.${field}`, error);
    }
  }

  return fields;
}

/**
 * Reads the `order` block of one model: the columns from the most significant key to the least.
 *
 * @param modelName name of the model in the contract, for the messages
 * @param model model entry as the YAML parser returned it
 * @returns the ordering, or `undefined` when the model declares none
 * @throws Error naming the model, the position of a broken entry and the reason
 */
function orderBlockOf(modelName: string, model: unknown): TOrderBy | undefined {
  const order = isRecord(model) ? model.order : undefined;

  if (order === undefined) {
    return undefined;
  }

  if (!Array.isArray(order)) {
    throw new Error(`${API_FIELDS_CONFIG_PATH}: models.${modelName}.order must be a list`);
  }

  return order.map((entry, position) => {
    try {
      return toOrderEntry(entry);
    } catch (error) {
      throw failedOrderEntry(modelName, position, error);
    }
  });
}

/**
 * Reads one entry of the `order` block: exactly one column with its direction.
 *
 * A rejected direction names the column it belongs to; the position of the entry is added by
 * `orderBlockOf`, which reads it from the document.
 *
 * @throws Error naming the column and the form its value has to hold
 */
function toOrderEntry(value: unknown): Record<string, USortKey> {
  const columns: [string, unknown][] = isRecord(value) ? Object.entries(value) : [];

  if (columns.length !== 1) {
    throw new Error('an entry must name exactly one column');
  }

  const [[column, direction]] = columns;

  try {
    return { [column]: toSortKey(direction) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(`${column}: ${reason}`, { cause: error });
  }
}

/**
 * Reads the direction of one column: `asc`/`desc`, or the full form that places nulls as well.
 *
 * @throws Error naming the accepted forms when the value is neither of them
 */
function toSortKey(value: unknown): USortKey {
  if (value === 'asc' || value === 'desc') {
    return value;
  }

  const sort = isRecord(value) ? value.sort : undefined;
  const nulls = isRecord(value) ? value.nulls : undefined;

  if ((sort === 'asc' || sort === 'desc') && (nulls === 'first' || nulls === 'last')) {
    return { sort, nulls };
  }

  throw new Error('a direction must be "asc", "desc" or { sort, nulls }');
}

/**
 * Reads one entry of the `references` block: the entity and how the field reads it — through a column
 * of a row or through the tie table between the two rows. A rejected entry names the key that is
 * wrong and the value it has to hold; the place of the entry is added by `referencesOf`, which reads
 * it from the document, so no path is passed down for the sake of the message.
 *
 * @throws Error naming the offending key of the entry
 */
function toReference(value: unknown): UEntityReference {
  const entity = isRecord(value) ? value.entity : undefined;

  if (typeof entity !== 'string' || entity.length === 0) {
    throw new Error('entity must be an entity name');
  }

  const through = isRecord(value) ? value.through : undefined;

  if (through !== undefined) {
    return { entity, through: toThroughLink(through) };
  }

  const property = isRecord(value) ? value.property : undefined;

  if (typeof property !== 'string' || property.length === 0) {
    throw new Error('property must be a column name');
  }

  return { entity, property };
}

/**
 * Reads the `through` block of one entry: the tie table and the two columns it stores.
 *
 * @throws Error naming the key of the block that is wrong
 */
function toThroughLink(value: unknown): IThroughLink {
  return {
    entity: throughName(value, 'entity', 'an entity name'),
    parent: throughName(value, 'parent', 'a column name'),
    target: throughName(value, 'target', 'a column name'),
  };
}

/**
 * Reads one name of the `through` block.
 *
 * @throws Error naming the key and the value it has to hold
 */
function throughName(value: unknown, key: string, expected: string): string {
  const name = isRecord(value) ? value[key] : undefined;

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`through.${key} must be ${expected}`);
  }

  return name;
}

/**
 * Failure of one entry of the `references` block: the place of the entry, the file and the reason,
 * in one message that points at the key to fix.
 */
function failedEntry(place: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);

  return new Error(`${API_FIELDS_CONFIG_PATH}: ${place}.${reason}`, { cause: error });
}

/**
 * Failure of one entry of the `order` block: the model, the position in the list, the file and the
 * reason, in one message that points at the entry to fix.
 */
function failedOrderEntry(modelName: string, position: number, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);

  return new Error(
    `${API_FIELDS_CONFIG_PATH}: models.${modelName}.order.${position}: ${reason}`,
    { cause: error },
  );
}

/** Reads the `models` block of the contract; `yaml-loader` reads, parses and names the file. */
function readModels(): Record<string, unknown> {
  const document = loadConfig<unknown>(API_FIELDS_CONFIG_PATH, { searchFrom: __dirname });
  const models = isRecord(document) ? document.models : undefined;

  if (!isRecord(models)) {
    throw new Error(
      `${API_FIELDS_CONFIG_PATH}: "models" is required and must be a mapping of model names`,
    );
  }

  return models;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
