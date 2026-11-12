import type { Prisma, PrismaClient } from '@prisma/client';

import type { IDictionarySpec } from '../dictionaries/types';
import { placesOf } from '../schema/model.places';
import type { IChildSpec, IDataModel, IModelSpec } from '../schema/types';
import { parseDateValue } from '../shared/date-value.parser';
import { delegateName } from '../shared/delegate-name';
import { withContext } from '../shared/error-context';
import { isRecord } from '../shared/record';
import { SeedError } from '../shared/seed.error';
import { ID_COLUMN } from './constants';
import type {
  IDataWriter,
  IDelegate,
  IModelReport,
  IParentRef,
  IPreparedItem,
  ISeedSummary,
  IWrittenElement,
  TRow,
} from './types';

/**
 * Writes the validated data file through the model tree of the JSON Schema: the tables of the tree
 * and the tie tables of the dictionaries are emptied, then the file is inserted in one transaction,
 * so a failure leaves the database untouched. A dictionary model goes in two steps: one row per key
 * value, then one row of the tie table per parent, because the file names values, not identifiers.
 */
export class DataWriter implements IDataWriter {
  private readonly reports = new Map<string, IModelReport>();
  private readonly byName: Map<string, IModelSpec>;
  private readonly places: Map<string, string>;
  private readonly byDictionary: Map<string, IDictionarySpec>;

  /** Identifiers of the dictionary rows of this run, by model and by the value the file names. */
  private readonly dictionaryIds = new Map<string, Map<string, unknown>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly dataModel: IDataModel,
    private readonly dictionaries: readonly IDictionarySpec[],
  ) {
    this.byName = new Map(dataModel.models.map((model) => [model.name, model]));
    this.places = placesOf(dataModel);
    this.byDictionary = new Map(dictionaries.map((spec) => [spec.model, spec]));
  }

  /**
   * Applies the data file in a single transaction: the tables of the tree are emptied first, then
   * the root row and its children are inserted. A repeated run on an existing volume therefore
   * leaves the content of the file in the database instead of appending a second copy.
   */
  async write(source: unknown): Promise<ISeedSummary> {
    const rootValue = this.rootValue(source);
    const { root, property } = this.dataModel;

    // The maps describe this run only: a second `write()` on the same instance starts from the
    // emptied tables, so the identifiers of the previous run are stale and the counters start over.
    this.dictionaryIds.clear();
    this.reports.clear();

    await this.prisma.$transaction(async (transaction) => {
      await this.clear(transaction);

      let element: IWrittenElement;

      try {
        element = await this.writeElement(transaction, root, rootValue, null);
      } catch (error) {
        throw withContext(property, error);
      }

      await this.writeChildren(transaction, root, element.item, element.saved);
    });

    return { models: [...this.reports.values()] };
  }

  /**
   * Empties every table the run writes: the tie tables first, because their rows name both sides, and
   * then the tree in the reverse write order, so a child goes before its parent. The cascade is not
   * used: the engine must not depend on a relation declared in the database.
   */
  private async clear(transaction: Prisma.TransactionClient): Promise<void> {
    for (const dictionary of this.dictionaries) {
      await this.delegateNamed(transaction, dictionary.link.model).deleteMany({ where: {} });
    }

    for (const spec of [...this.dataModel.models].reverse()) {
      await this.delegateNamed(transaction, spec.name).deleteMany({ where: {} });
    }
  }

  private rootValue(source: unknown): unknown {
    const { property } = this.dataModel;

    if (!isRecord(source)) {
      throw new SeedError(`root — expected an object with the "${property}" property`);
    }

    if (!(property in source)) {
      throw new SeedError(
        `${property} — missing property that the JSON Schema defines as the root`,
      );
    }

    return source[property];
  }

  /**
   * Writes every model nested in one row. The place of a model in the data file is a constant of the
   * run (`placeOf`), so a message names it without a path being carried through the walk: the code
   * below the tree reports the problem, this method adds where it happened.
   */
  private async writeChildren(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    item: IPreparedItem,
    saved: TRow,
  ): Promise<void> {
    if (spec.children.length === 0) {
      return;
    }

    let id: unknown;

    try {
      id = this.idOf(saved);
    } catch (error) {
      throw withContext(`${this.placeOf(spec)} — model ${spec.name}`, error);
    }

    const parent: IParentRef = { model: spec.name, id };

    for (const child of spec.children) {
      const childSpec = this.modelOf(child.model);
      const childPlace = this.placeOf(childSpec);
      let value: unknown;

      try {
        value = this.childValue(item.value, child);
      } catch (error) {
        throw withContext(childPlace, error);
      }

      if (value === undefined) {
        continue;
      }

      if (child.collection) {
        if (!Array.isArray(value)) {
          throw new SeedError(
            `${childPlace} — expected an array, ` +
              `the JSON Schema defines a collection of ${childSpec.name}`,
          );
        }

        await this.writeChildCollection(transaction, childSpec, value, parent, childPlace);
        continue;
      }

      if (this.byDictionary.has(childSpec.name)) {
        throw new SeedError(
          `${childPlace} — a dictionary is written as a collection of its key values`,
        );
      }

      let element: IWrittenElement;

      try {
        element = await this.writeElement(transaction, childSpec, value, parent);
      } catch (error) {
        throw withContext(childPlace, error);
      }

      await this.writeChildren(transaction, childSpec, element.item, element.saved);
    }
  }

  /**
   * Writes a collection of a child model: a dictionary through its two tables, any other model as a
   * plain list of rows.
   */
  private async writeChildCollection(
    transaction: Prisma.TransactionClient,
    childSpec: IModelSpec,
    values: unknown[],
    parent: IParentRef,
    place: string,
  ): Promise<void> {
    const dictionary = this.byDictionary.get(childSpec.name);

    if (dictionary === undefined) {
      await this.writeCollection(transaction, childSpec, values, parent);

      return;
    }

    await this.writeDictionaryCollection(transaction, dictionary, values, parent, place);
  }

  /** Builds the row of one element and writes it. */
  private async writeElement(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    value: unknown,
    parent: IParentRef | null,
  ): Promise<IWrittenElement> {
    const item = this.prepare(spec, value, parent);
    const saved = await this.persist(transaction, spec, item);

    return { item, saved };
  }

  private prepare(spec: IModelSpec, value: unknown, parent: IParentRef | null): IPreparedItem {
    return { value, row: this.buildRow(spec, value, parent) };
  }

  /**
   * Builds the row of one element: scalar properties of the model plus the column that links the
   * row to its parent. A missing required property is an error: the schema allows AJV to pass only
   * complete documents, so the value here is the author's mistake. Its location is added by the
   * caller.
   */
  private buildRow(spec: IModelSpec, value: unknown, parent: IParentRef | null): TRow {
    if (!isRecord(value)) {
      throw new SeedError(`expected an object, the JSON Schema defines model ${spec.name}`);
    }

    const row: TRow = {};

    for (const field of spec.fields) {
      if (!(field.name in value)) {
        if (field.required) {
          throw new SeedError('missing property required by the JSON Schema');
        }

        continue;
      }

      const raw = value[field.name];

      // An explicit `null` is a value the schema allows for an optional column (`endedAt`, `url`), and
      // the database stores it as is; only a date has to be converted from its text form.
      if (raw === null) {
        row[field.name] = null;
        continue;
      }

      if (field.date) {
        if (typeof raw !== 'string') {
          throw new SeedError('expected a date string');
        }

        row[field.name] = parseDateValue(raw);
        continue;
      }

      row[field.name] = raw;
    }

    if (parent !== null) {
      row[this.foreignKeyOf(parent.model)] = parent.id;
    }

    return row;
  }

  /** Inserts the row and counts it: the tables were emptied, so every row is a new one. */
  private async persist(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    item: IPreparedItem,
  ): Promise<TRow> {
    const saved = await this.delegateNamed(transaction, spec.name).create({ data: item.row });

    this.count(spec.name, 1);

    return saved;
  }

  /**
   * Writes a collection of a child model. A model without nested models goes in one `createMany`;
   * a model with children is written row by row, because every child needs the id of its parent.
   */
  private async writeCollection(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    values: unknown[],
    parent: IParentRef,
  ): Promise<void> {
    const place = this.placeOf(spec);

    const items = values.map((value, index) => {
      try {
        return this.prepare(spec, value, parent);
      } catch (error) {
        throw withContext(`${place}[${index}]`, error);
      }
    });

    if (spec.children.length === 0) {
      const data = items.map((item) => item.row);

      if (data.length > 0) {
        await this.delegateNamed(transaction, spec.name).createMany({ data });
      }

      this.count(spec.name, data.length);

      return;
    }

    for (const [index, item] of items.entries()) {
      let saved: TRow;

      try {
        saved = await this.persist(transaction, spec, item);
      } catch (error) {
        throw withContext(`${place}[${index}]`, error);
      }

      await this.writeChildren(transaction, spec, item, saved);
    }
  }

  /**
   * Writes one collection of a dictionary model: the rows of the dictionary once per key value, then
   * the rows of the tie table that point at them. The file names values, never identifiers, so the
   * tie is resolved by the value the element carries.
   */
  private async writeDictionaryCollection(
    transaction: Prisma.TransactionClient,
    dictionary: IDictionarySpec,
    values: readonly unknown[],
    parent: IParentRef,
    place: string,
  ): Promise<void> {
    const keys = this.dictionaryKeys(dictionary, values, place);

    await this.insertDictionaries(transaction, dictionary, values, keys, place);

    for (const [index, key] of keys.entries()) {
      const itemPlace = `${place}[${index}]`;
      const targetId = this.resolveDictionary(dictionary, key, itemPlace);

      await this.insertLink(transaction, dictionary, parent, targetId, itemPlace);
    }
  }

  /**
   * Values the collection names its dictionary rows by, one per element.
   *
   * A repeated key inside one parent is an error: it would be a second tie to the same row, which the
   * unique constraint of the tie table rejects after the dictionary row was already written.
   */
  private dictionaryKeys(
    dictionary: IDictionarySpec,
    values: readonly unknown[],
    place: string,
  ): string[] {
    const seen = new Map<string, number>();
    const keys: string[] = [];

    for (const [index, value] of values.entries()) {
      const itemPlace = `${place}[${index}]`;
      let key: string;

      try {
        key = this.keyValueOf(dictionary, value);
      } catch (error) {
        throw withContext(itemPlace, error);
      }

      const previous = seen.get(key);

      if (previous !== undefined) {
        throw withContext(
          itemPlace,
          new SeedError(
            `duplicate ${dictionary.key} "${key}": the same ${dictionary.model} is already ` +
              `listed at ${place}[${previous}]`,
          ),
        );
      }

      seen.set(key, index);
      keys.push(key);
    }

    return keys;
  }

  /** Value the element names its dictionary row by: the key column of the dictionary. */
  private keyValueOf(dictionary: IDictionarySpec, value: unknown): string {
    const key = isRecord(value) ? value[dictionary.key] : undefined;

    if (typeof key !== 'string' || key.length === 0) {
      throw new SeedError(
        `expected a non-empty string in "${dictionary.key}", the key of ${dictionary.model}`,
      );
    }

    return key;
  }

  /** Inserts the dictionary rows this run does not have yet: one row per key value, before any tie. */
  private async insertDictionaries(
    transaction: Prisma.TransactionClient,
    dictionary: IDictionarySpec,
    values: readonly unknown[],
    keys: readonly string[],
    place: string,
  ): Promise<void> {
    const spec = this.modelOf(dictionary.model);

    for (const [index, value] of values.entries()) {
      const key = keys[index];

      if (this.dictionaryIds.get(dictionary.model)?.has(key) === true) {
        continue;
      }

      try {
        const saved = await this.persist(transaction, spec, this.prepare(spec, value, null));

        this.rememberDictionary(dictionary.model, key, this.idOf(saved));
      } catch (error) {
        throw withContext(`${place}[${index}]`, error);
      }
    }
  }

  /**
   * Id of the dictionary row the file inserted for a key value.
   *
   * @throws SeedError when the value the element names has no row, so the tie would point at nothing
   */
  private resolveDictionary(
    dictionary: IDictionarySpec,
    key: string,
    place: string,
  ): unknown {
    const id = this.dictionaryIds.get(dictionary.model)?.get(key);

    if (id === undefined) {
      throw withContext(
        place,
        new SeedError(
          `no ${dictionary.model} row for ${dictionary.key} "${key}" — the value the element ` +
            'names was not inserted',
        ),
      );
    }

    return id;
  }

  /** Row of the tie table: the parent and the dictionary row, both by identifier. */
  private async insertLink(
    transaction: Prisma.TransactionClient,
    dictionary: IDictionarySpec,
    parent: IParentRef,
    targetId: unknown,
    place: string,
  ): Promise<void> {
    const row: TRow = { [dictionary.link.parent]: parent.id, [dictionary.link.target]: targetId };

    try {
      await this.delegateNamed(transaction, dictionary.link.model).create({ data: row });

      this.count(dictionary.link.model, 1);
    } catch (error) {
      throw withContext(place, error);
    }
  }

  /** Remembers the id of a dictionary row, so the next parent that names the value reuses it. */
  private rememberDictionary(model: string, key: string, id: unknown): void {
    const ids = this.dictionaryIds.get(model);

    if (ids === undefined) {
      this.dictionaryIds.set(model, new Map([[key, id]]));

      return;
    }

    ids.set(key, id);
  }

  /** Value of the child property, or `undefined` when an optional property is absent. */
  private childValue(value: unknown, child: IChildSpec): unknown {
    if (!isRecord(value)) {
      return undefined;
    }

    if (!(child.property in value)) {
      if (child.required) {
        throw new SeedError('missing property required by the JSON Schema');
      }

      return undefined;
    }

    return value[child.property];
  }

  /** Id of the saved row, needed by the models nested in it. */
  private idOf(saved: TRow): unknown {
    const id = saved[ID_COLUMN];

    if (id === undefined || id === null) {
      throw new SeedError(
        `the saved row has no "${ID_COLUMN}" column, so the models nested in it cannot be linked`,
      );
    }

    return id;
  }

  /** Column that stores the parent id, derived from the parent model name (`Profile` → `profileId`). */
  private foreignKeyOf(parentModel: string): string {
    return `${delegateName(parentModel)}Id`;
  }

  private modelOf(name: string): IModelSpec {
    const spec = this.byName.get(name);

    if (spec === undefined) {
      throw new SeedError(`the JSON Schema does not define the model "${name}"`);
    }

    return spec;
  }

  /**
   * Place of a model in the data file, as a message about that model names it (`profile.skills`).
   *
   * A model the tree does not list — which the walk cannot reach — keeps its own name.
   */
  private placeOf(spec: IModelSpec): string {
    return this.places.get(spec.name) ?? spec.name;
  }

  /** Prisma delegate of the model, addressed by the delegate name of its schema name. */
  private delegateNamed(transaction: Prisma.TransactionClient, modelName: string): IDelegate {
    const name = delegateName(modelName);
    const delegate: unknown = (transaction as unknown as Record<string, unknown>)[name];

    if (typeof delegate !== 'object' || delegate === null) {
      throw new SeedError(`model ${modelName} — the Prisma client has no delegate "${name}"`);
    }

    return delegate as IDelegate;
  }

  private count(model: string, written: number): void {
    const report = this.reports.get(model);

    if (report === undefined) {
      this.reports.set(model, { model, written });

      return;
    }

    report.written += written;
  }
}
