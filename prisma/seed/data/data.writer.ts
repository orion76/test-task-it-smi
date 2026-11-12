import type { Prisma, PrismaClient } from '@prisma/client';

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
 * Writes the validated data file through the model tree of the JSON Schema. The writer knows no
 * property of the domain and keeps no order: it empties the tables of the tree and inserts the file
 * in one transaction, so a failure on any model leaves the database untouched.
 */
export class DataWriter implements IDataWriter {
  private readonly reports = new Map<string, IModelReport>();
  private readonly byName: Map<string, IModelSpec>;
  private readonly places: Map<string, string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly dataModel: IDataModel,
  ) {
    this.byName = new Map(dataModel.models.map((model) => [model.name, model]));
    this.places = placesOf(dataModel);
  }

  /**
   * Applies the data file in a single transaction: the tables of the tree are emptied first, then
   * the root row and its children are inserted. A repeated run on an existing volume therefore
   * leaves the content of the file in the database instead of appending a second copy.
   */
  async write(source: unknown): Promise<ISeedSummary> {
    const rootValue = this.rootValue(source);
    const { root, property } = this.dataModel;

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
   * Empties every table of the tree in the reverse write order, so a child goes before its parent.
   * The cascade is not used: the engine must not depend on a relation declared in the database.
   */
  private async clear(transaction: Prisma.TransactionClient): Promise<void> {
    for (const spec of [...this.dataModel.models].reverse()) {
      await this.delegateOf(transaction, spec).deleteMany({ where: {} });
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

        await this.writeCollection(transaction, childSpec, value, parent);
        continue;
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
    const saved = await this.delegateOf(transaction, spec).create({ data: item.row });

    this.count(spec, 1);

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
        await this.delegateOf(transaction, spec).createMany({ data });
      }

      this.count(spec, data.length);

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
  private delegateOf(transaction: Prisma.TransactionClient, spec: IModelSpec): IDelegate {
    const name = delegateName(spec.name);
    const delegate: unknown = (transaction as unknown as Record<string, unknown>)[name];

    if (typeof delegate !== 'object' || delegate === null) {
      throw new SeedError(`model ${spec.name} — the Prisma client has no delegate "${name}"`);
    }

    return delegate as IDelegate;
  }

  private count(spec: IModelSpec, written: number): void {
    const report = this.reports.get(spec.name);

    if (report === undefined) {
      this.reports.set(spec.name, { model: spec.name, written });

      return;
    }

    report.written += written;
  }
}
