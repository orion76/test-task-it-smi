import { SeedError } from '../shared/seed.error';
import { defNameFromRef, isObjectSchema, resolvePointer } from './json-schema';
import { ModelBuilder } from './model.builder';
import type { IDataModel, IJsonSchema } from './types';

/**
 * Turns the JSON Schema into the tree of models the writer walks: the root property, its model,
 * nested models and collections, the date trait and the required flags. Nothing about the domain is
 * hard-coded: the shape comes from the document only.
 */
export function buildDataModel(schema: IJsonSchema): IDataModel {
  const rootProperties = schema.properties;

  if (rootProperties === undefined) {
    throw new SeedError('the schema has no root "properties"');
  }

  const roots = Object.entries(rootProperties).filter(([, property]) => {
    const definition = objectDefinitionOf(schema, property);

    return definition !== null;
  });

  if (roots.length !== 1) {
    const names = roots.map(([name]) => name).join(', ') || 'none';

    throw new SeedError(
      'expected exactly one root property that references an object definition, ' +
        `found ${roots.length} (${names})`,
    );
  }

  const [property, rootProperty] = roots[0];
  const defName = defNameFromRef(rootProperty.$ref ?? '');

  if (defName === null) {
    throw new SeedError(`root property "${property}" must reference a definition`);
  }

  const builder = new ModelBuilder(schema);
  const root = builder.build(defName, []);

  return { property, root, models: builder.models };
}

/** Definition referenced by the property, when that definition describes an object. */
function objectDefinitionOf(schema: IJsonSchema, property: IJsonSchema): IJsonSchema | null {
  const ref = property.$ref;

  if (ref === undefined) {
    return null;
  }

  const defName = defNameFromRef(ref);

  if (defName !== null && schema.$defs?.[defName] === undefined) {
    throw new SeedError(`reference to a definition that does not exist: "#/$defs/${defName}"`);
  }

  const target = resolvePointer(schema, ref);

  return target !== null && isObjectSchema(target) ? target : null;
}
