/**
 * Renders `relations.resolver.ts`: the `@ResolveField` of every relation the contract publishes. A
 * collection is answered by `load`, a single relation by `loadOne`, and the loader reads the table
 * and the foreign key from the contract — nothing about them is spelled out here.
 */
import type { DMMF } from '@prisma/generator-helper';

import { API_FIELDS_FILE } from '../shared/constants.mts';
import { compare } from '../shared/dmmf.mts';
import { escape, renderFile } from './render.utils.mts';
import type { IRelation, IRenderedBlock, TReferenceRules } from './types.mts';

/**
 * Renders the resolvers of the nested relations.
 *
 * @param models models of the DMMF datamodel
 * @param references `references` of the contract by model name
 * @returns the source of `relations.resolver.ts`
 */
export function renderRelations(
  models: readonly DMMF.Model[],
  references: ReadonlyMap<string, TReferenceRules>,
): string {
  const blocks = [...models]
    .sort((left, right) => compare(left.name, right.name))
    .map((model) => renderRelationsOfModel(model, references.get(model.name) ?? {}))
    .filter((block): block is IRenderedBlock => block !== null);

  const imports = [
    "import { Inject } from '@nestjs/common';",
    "import { Parent, ResolveField, Resolver } from '@nestjs/graphql';",
    "import type { IEntity } from '../../../common/contracts/types';",
    "import { EntityLoader } from '../../../graphql/loaders/entity.loader';",
    "import type { IEntityLoader } from '../../../graphql/loaders/types';",
  ];

  return renderFile(imports, blocks, 'RELATION_RESOLVERS');
}

/**
 * Renders the relations resolver of one model, or `null` when the contract publishes no relation.
 *
 * @param model model of the datamodel
 * @param references `references` block of that model
 * @returns the class, or `null`
 */
function renderRelationsOfModel(
  model: DMMF.Model,
  references: TReferenceRules,
): IRenderedBlock | null {
  const relations = collectRelations(model, references);

  if (relations.length === 0) {
    return null;
  }

  const className = `${model.name}RelationsResolver`;
  const referenced = relations.map((relation) => relation.target);
  const targets = [...new Set([model.name, ...referenced])].sort();
  const methods = relations.map((relation) => renderRelationMethod(relation)).join('\n\n');

  const text = [
    `/** Nested relations of \`${model.name}\`, as declared in \`${API_FIELDS_FILE}\`. */`,
    `@Resolver(() => ${model.name})`,
    `export class ${className} {`,
    '  constructor(@Inject(EntityLoader) private readonly loader: IEntityLoader) {}',
    '',
    methods,
    '}',
  ].join('\n');

  return { text, className, targets };
}

/**
 * Relations of a model that the contract publishes.
 *
 * A relation that is not listed in `references` is not part of the API: the generated GraphQL class
 * hides it, so a resolver for it would read rows nothing exposes.
 *
 * @param model model of the datamodel
 * @param references `references` block of that model
 * @returns the public relations, sorted by field name
 */
function collectRelations(model: DMMF.Model, references: TReferenceRules): IRelation[] {
  return model.fields
    .filter((field) => field.kind === 'object' && references[field.name] !== undefined)
    .map((field) => ({
      field: field.name,
      target: field.type,
      list: field.isList === true,
      description: String(references[field.name].description),
    }))
    .sort((left, right) => compare(left.field, right.field));
}

/**
 * Renders one field resolver of a relation.
 *
 * @param relation relation
 * @returns the method
 */
function renderRelationMethod(relation: IRelation): string {
  const returnType = relation.list ? 'IEntity[]' : 'IEntity | null';
  const type = relation.list ? `[${relation.target}]` : relation.target;
  const method = relation.list ? 'load' : 'loadOne';
  const description = escape(relation.description);

  return [
    `  @ResolveField(() => ${type}, { description: '${description}' })`,
    `  ${relation.field}(@Parent() row: IEntity): Promise<${returnType}> {`,
    `    return this.loader.${method}(row, '${relation.field}');`,
    '  }',
  ].join('\n');
}
