import { SeedError } from '../shared/seed.error';
import { alternativesOf, defNameFromRef, isObjectSchema, resolvePointer } from './json-schema';
import type { IJsonSchema, IModelBuilder, IModelRef, IModelSpec } from './types';

/**
 * Walks the definitions reachable from the root property and records every model once.
 * A definition referenced from two places is an error: the engine writes a tree, so a child model
 * has exactly one parent, and the parent is the owner of the service column that points to its rows.
 */
export class ModelBuilder implements IModelBuilder {
  readonly models: IModelSpec[] = [];

  private readonly built = new Map<string, IModelSpec>();

  constructor(private readonly schema: IJsonSchema) {}

  build(defName: string, trail: string[]): IModelSpec {
    if (trail.includes(defName)) {
      throw new SeedError(`circular reference: ${[...trail, defName].join(' → ')}`);
    }

    const existing = this.built.get(defName);

    if (existing !== undefined) {
      throw new SeedError(
        `definition "${defName}" is referenced from more than one place ` +
          `(${[...trail, defName].join(' → ')}); the seed engine writes a tree of models`,
      );
    }

    const definition = this.definition(defName);
    const model: IModelSpec = {
      name: this.modelName(defName),
      defName,
      fields: [],
      children: [],
    };

    this.built.set(defName, model);
    this.models.push(model);

    const required = definition.required ?? [];

    for (const [name, property] of Object.entries(definition.properties ?? {})) {
      const child = this.childOf(property);

      if (child !== null) {
        model.children.push({
          property: name,
          model: this.modelName(child.defName),
          required: required.includes(name),
          collection: child.collection,
        });
        this.build(child.defName, [...trail, defName]);
        continue;
      }

      model.fields.push({
        name,
        required: required.includes(name),
        date: this.isDateProperty(property),
      });
    }

    return model;
  }

  private definition(defName: string): IJsonSchema {
    const definition = this.schema.$defs?.[defName];

    if (definition === undefined) {
      throw new SeedError(`reference to a definition that does not exist: "#/$defs/${defName}"`);
    }

    return definition;
  }

  /** Child model referenced by the property, or `null` when the property is a scalar. */
  private childOf(property: IJsonSchema): IModelRef | null {
    const ownRef = property.$ref;
    const itemRef = property.items?.$ref;

    if (ownRef !== undefined) {
      return this.modelRef(ownRef, false);
    }

    if (itemRef !== undefined) {
      return this.modelRef(itemRef, true);
    }

    return null;
  }

  private modelRef(ref: string, collection: boolean): IModelRef | null {
    const defName = defNameFromRef(ref);

    if (defName === null) {
      return null;
    }

    const definition = this.definition(defName);

    return isObjectSchema(definition) ? { defName, collection } : null;
  }

  /**
   * Whether a scalar property is a date: `format: "date"` on the property itself or on one of the
   * alternatives of its rule, so a union with `null` keeps the trait.
   */
  private isDateProperty(property: IJsonSchema): boolean {
    const resolved = this.resolve(property);

    if (resolved.format === 'date') {
      return true;
    }

    return alternativesOf(resolved).some(
      (alternative) => this.resolve(alternative).format === 'date',
    );
  }

  /** Follows a local reference; references outside `$defs` stay scalars and are returned as-is. */
  private resolve(property: IJsonSchema): IJsonSchema {
    const ref = property.$ref;

    if (ref === undefined) {
      return property;
    }

    return resolvePointer(this.schema, ref) ?? property;
  }

  /** Model name from the definition key: `socialLink` and `social_link` become `SocialLink`. */
  private modelName(defName: string): string {
    const words = defName.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);

    if (words.length === 0) {
      throw new SeedError(`cannot derive a model name from definition "${defName}"`);
    }

    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  }
}
