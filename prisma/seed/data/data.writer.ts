import type { Prisma, PrismaClient } from '@prisma/client';

import type { IModelConfig, ISeedConfig } from '../config/types';
import { placesOf } from '../schema/model.places';
import type { IChildSpec, IDataModel, IModelSpec } from '../schema/types';
import { parseDateValue } from '../shared/date-value.parser';
import { delegateName } from '../shared/delegate-name';
import { withContext } from '../shared/error-context';
import { isRecord, omit } from '../shared/record';
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
  UWriteStrategy,
} from './types';

/**
 * Writes the validated data file through the model tree of the JSON Schema. The writer knows no
 * property of the domain, keeps no order, and runs the whole file as one transaction — so a failure
 * on any model leaves the database untouched.
 */
export class DataWriter implements IDataWriter {
  private readonly reports = new Map<string, IModelReport>();
  private readonly byName: Map<string, IModelSpec>;
  private readonly places: Map<string, string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ISeedConfig,
    private readonly dataModel: IDataModel,
  ) {
    this.byName = new Map(dataModel.models.map((model) => [model.name, model]));
    this.places = placesOf(dataModel);
  }

  /**
   * Applies the data file in a single transaction. Safe to run on every container start:
   * a second run on an existing volume neither duplicates rows nor fails. The root row without a
   * natural key is replaced, so a restart cannot append another one.
   */
  async write(source: unknown): Promise<ISeedSummary> {
    const rootValue = this.rootValue(source);
    const { root, property } = this.dataModel;

    await this.prisma.$transaction(async (transaction) => {
      await this.replaceRoot(transaction);

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
   * Root of the data file is a single object, so its row is a singleton. Without a natural key it
   * cannot be matched by `upsert` and `create` would append one row per run, so the previous rows are
   * removed in the same transaction; the rows of the nested models go with the database cascade.
   */
  private async replaceRoot(transaction: Prisma.TransactionClient): Promise<void> {
    const { root } = this.dataModel;

    if (this.configOf(root).key !== undefined) {
      return;
    }

    await this.delegateOf(transaction, root).deleteMany({ where: {} });
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

        await this.writeCollection(transaction, childSpec, value, parent);
        continue;
      }

      let element: IWrittenElement;

      try {
        await this.replaceNested(transaction, childSpec, parent);
        element = await this.writeElement(transaction, childSpec, value, parent);
      } catch (error) {
        throw withContext(childPlace, error);
      }

      await this.writeChildren(transaction, childSpec, element.item, element.saved);
    }
  }

  /** Builds the row of one element and writes it with the strategy its config implies. */
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
      row[this.foreignKeyOf(spec, parent.model)] = parent.id;
    }

    return row;
  }

  /**
   * Writes the row with the strategy its config implies and counts it. A row without a natural key
   * is created only after its previous rows were removed (`replaceRoot`, `replaceNested`,
   * `writeCollection`), so the count never grows on a repeated run.
   */
  private async persist(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    item: IPreparedItem,
  ): Promise<TRow> {
    const config = this.configOf(spec);
    const delegate = this.delegateOf(transaction, spec);

    if (config.key !== undefined) {
      const saved = await delegate.upsert({
        where: this.whereOf(config.key, item),
        create: item.row,
        update: omit(item.row, config.key),
      });

      this.count(spec, 'upsert', 1);

      return saved;
    }

    const saved = await delegate.create({ data: item.row });

    this.count(spec, 'replace', 1);

    return saved;
  }

  /**
   * Writes a collection of a child model. Without a natural key the rows of the parent are removed and
   * written again in the same transaction, so a second run keeps the row count; with a key the rows are
   * matched by it and the ones that disappeared from the file are pruned.
   */
  private async writeCollection(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    values: unknown[],
    parent: IParentRef,
  ): Promise<void> {
    const place = this.placeOf(spec);
    const delegate = this.delegateOf(transaction, spec);
    const foreignKey = this.foreignKeyOf(spec, parent.model);
    const key = this.configOf(spec).key;

    if (key === undefined) {
      await delegate.deleteMany({ where: { [foreignKey]: parent.id } });

      if (values.length === 0) {
        this.count(spec, 'replace', 0);

        return;
      }
    }

    const items = values.map((value, index) => {
      try {
        return this.prepare(spec, value, parent);
      } catch (error) {
        throw withContext(`${place}[${index}]`, error);
      }
    });

    if (key === undefined && spec.children.length === 0) {
      await delegate.createMany({ data: items.map((item) => item.row) });
      this.count(spec, 'replace', items.length);

      return;
    }

    if (key !== undefined) {
      try {
        await this.prune(delegate, key, foreignKey, parent.id, items);
      } catch (error) {
        throw withContext(`${place} — model ${spec.name}`, error);
      }
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
   * Nested object is a singleton of its parent, as the root is a singleton of the file: without a
   * natural key the previous row of this parent is removed before the new one is created, so a
   * repeated run does not append a copy.
   */
  private async replaceNested(
    transaction: Prisma.TransactionClient,
    spec: IModelSpec,
    parent: IParentRef,
  ): Promise<void> {
    if (this.configOf(spec).key !== undefined) {
      return;
    }

    const delegate = this.delegateOf(transaction, spec);
    const foreignKey = this.foreignKeyOf(spec, parent.model);

    await delegate.deleteMany({ where: { [foreignKey]: parent.id } });
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

  /** Removes the rows of the parent whose natural key is not present in the file. */
  private async prune(
    delegate: IDelegate,
    key: string[],
    foreignKey: string,
    parentId: unknown,
    items: IPreparedItem[],
  ): Promise<void> {
    const where: TRow = { [foreignKey]: parentId };

    if (items.length > 0) {
      where.NOT = { OR: items.map((item) => this.keyOf(key, item)) };
    }

    await delegate.deleteMany({ where });
  }

  /** Key columns and their values for one element. */
  private keyOf(key: string[], item: IPreparedItem): TRow {
    const values: TRow = {};

    for (const column of key) {
      const value = item.row[column];

      if (value === undefined) {
        throw new SeedError(
          `key column "${column}" has no value; the JSON Schema does not provide it, ` +
            'so it has to be declared in the seed config',
        );
      }

      values[column] = value;
    }

    return values;
  }

  /** `where` clause of the upsert: a single column or a compound unique key. */
  private whereOf(key: string[], item: IPreparedItem): TRow {
    const values = this.keyOf(key, item);

    if (key.length === 1) {
      const [column] = key;

      return { [column]: values[column] };
    }

    return { [key.join('_')]: values };
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

  /**
   * Column that stores the parent id. The config declares it; without the config the name is
   * derived from the parent model name (`Profile` → `profile` + `Id`), which keeps the
   * schema-only mode working for conventionally named relations.
   */
  private foreignKeyOf(spec: IModelSpec, parentModel: string): string {
    const configured = this.configOf(spec).foreignKey;

    if (configured !== undefined) {
      return configured;
    }

    return `${delegateName(parentModel)}Id`;
  }

  private configOf(spec: IModelSpec): IModelConfig {
    return this.config.models[spec.name] ?? {};
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

  /** Prisma delegate of the model; `model` in the config overrides the name from the schema. */
  private delegateOf(transaction: Prisma.TransactionClient, spec: IModelSpec): IDelegate {
    const modelName = this.configOf(spec).model ?? spec.name;
    const name = delegateName(modelName);
    const delegate: unknown = (transaction as unknown as Record<string, unknown>)[name];

    if (typeof delegate !== 'object' || delegate === null) {
      throw new SeedError(
        `model ${spec.name} — the Prisma client has no delegate "${name}"; ` +
          'check the "model" override in the seed config',
      );
    }

    return delegate as IDelegate;
  }

  private count(spec: IModelSpec, strategy: UWriteStrategy, written: number): void {
    const report = this.reports.get(spec.name);

    if (report === undefined) {
      this.reports.set(spec.name, { model: spec.name, strategy, written });

      return;
    }

    report.written += written;
  }
}
