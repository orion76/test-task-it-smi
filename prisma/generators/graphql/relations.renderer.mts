/**
 * Renders `relations.resolver.ts`: the `@ResolveField` of every relation the contract publishes. A
 * collection is answered by `load`, a single relation by `loadOne`, and the loader reads the table,
 * the column or the tie table from the contract — nothing about them is spelled out here.
 */
import type { DMMF } from '@prisma/generator-helper';

import { API_FIELDS_FILE } from '../shared/constants.mts';
import { compare, delegateName } from '../shared/dmmf.mts';
import { isMapping } from '../shared/mapping.mts';
import { escape, renderFile } from './render.utils.mts';
import type { IRelation, IRenderedBlock, TContractNode, TReferenceRules } from './types.mts';

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
    .map((model) => renderRelationsOfModel(model, references.get(model.name) ?? {}, models))
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
 * @param models every model of the datamodel, for the type of a reference
 * @returns the class, or `null`
 */
function renderRelationsOfModel(
  model: DMMF.Model,
  references: TReferenceRules,
  models: readonly DMMF.Model[],
): IRenderedBlock | null {
  const relations = collectRelations(model, references, models);

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
 * The contract is the list of the API fields, not the datamodel: a collection read through a tie
 * table has no field of its own in the schema, so its name exists only here. A relation the contract
 * does not declare is not part of the API.
 *
 * @param model model of the datamodel
 * @param references `references` block of that model
 * @param models every model of the datamodel
 * @returns the public relations, sorted by field name
 */
function collectRelations(
  model: DMMF.Model,
  references: TReferenceRules,
  models: readonly DMMF.Model[],
): IRelation[] {
  return Object.entries(references)
    .map(([field, rule]) => relationOf(model, field, rule, models))
    .sort((left, right) => compare(left.field, right.field));
}

/**
 * One relation of the contract: the type it returns and whether it is a collection.
 *
 * A one-hop reference is described by the field the model declares; a through-form is a collection,
 * because a tie table ties one dictionary row to one parent.
 *
 * @param model model the reference belongs to
 * @param field name of the relation field
 * @param rule the reference as the contract declares it
 * @param models every model of the datamodel
 * @returns the relation the renderer needs
 * @throws Error naming the file, the model and the field when the entity is not a model
 */
function relationOf(
  model: DMMF.Model,
  field: string,
  rule: TContractNode,
  models: readonly DMMF.Model[],
): IRelation {
  const entity = String(rule.entity);
  const target = models.find((candidate) => delegateName(candidate.name) === entity);

  if (target === undefined) {
    throw new Error(
      `${API_FIELDS_FILE}: models.${model.name}.references.${field}: ` +
        `the datamodel has no entity "${entity}"`,
    );
  }

  const declared = model.fields.find((candidate) => candidate.name === field);
  const list = declared === undefined ? isMapping(rule.through) : declared.isList === true;

  return { field, target: target.name, list, description: String(rule.description) };
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
