/**
 * Renders `queries.resolver.ts`: the `@Query` of every query the contract declares.
 *
 * A query declares the name, the return type and — for a page — the arguments; the behaviour of both
 * shapes lives in `EntityQueries`, so nothing is duplicated per query. The entity is the one the
 * contract names, and the class it returns is the model the query reads.
 */
import type { DMMF } from '@prisma/generator-helper';

import { API_FIELDS_FILE } from '../shared/constants.mts';
import { compare, delegateName } from '../shared/dmmf.mts';
import { escape, renderFile } from './render.utils.mts';
import type { IQueryEntry, IRenderedBlock, TContractNode } from './types.mts';

/**
 * Renders the top-level queries.
 *
 * @param models models of the DMMF datamodel
 * @param queries `queries` block of the contract
 * @returns the source of `queries.resolver.ts`
 */
export function renderQueries(
  models: readonly DMMF.Model[],
  queries: Record<string, TContractNode>,
): string {
  const pairs: ReadonlyArray<readonly [string, DMMF.Model]> = models.map((model) => [
    delegateName(model.name),
    model,
  ]);
  const modelsByName = new Map(pairs);
  const byEntity = new Map<string, IQueryEntry[]>();

  for (const [name, query] of Object.entries(queries)) {
    const entity = String(query.entity);
    const existing = byEntity.get(entity);

    if (existing === undefined) {
      byEntity.set(entity, [{ name, ...query }]);
      continue;
    }

    existing.push({ name, ...query });
  }

  const blocks = [...byEntity]
    .sort(([left], [right]) => compare(left, right))
    .map(([entity, entries]) => renderQueriesOfEntity(entity, entries, modelsByName.get(entity)))
    .filter((block): block is IRenderedBlock => block !== null);

  const imports = [
    "import { Inject } from '@nestjs/common';",
    "import { Args, Query, Resolver } from '@nestjs/graphql';",
    "import { ENTITY_QUERY_PORT } from '../../../common/contracts/entity-query.port';",
    "import type { IEntity, IEntityQueryPort } from '../../../common/contracts/types';",
    "import { PAGE_LIMIT_ARG, PAGE_OFFSET_ARG } from '../../../graphql/queries/args';",
    "import { EntityQueries } from '../../../graphql/queries/entity-queries';",
  ];

  return renderFile(imports, blocks, 'QUERY_RESOLVERS');
}

/**
 * Renders the queries resolver of one entity: every query of the contract that reads it.
 *
 * @param entity delegate name of the entity (`profile`)
 * @param queries its queries
 * @param model model the entity reads
 * @returns the class, or `null`
 */
function renderQueriesOfEntity(
  entity: string,
  queries: IQueryEntry[],
  model: DMMF.Model | undefined,
): IRenderedBlock | null {
  if (model === undefined) {
    return null;
  }

  const className = `${model.name}QueriesResolver`;
  const methods = queries
    .sort((left, right) => compare(left.name, right.name))
    .map((query) => renderQueryMethod(query, model.name))
    .join('\n\n');

  const text = [
    `/** Top-level queries of \`${model.name}\`, as declared in \`${API_FIELDS_FILE}\`. */`,
    `@Resolver(() => ${model.name})`,
    `export class ${className} extends EntityQueries {`,
    '  constructor(@Inject(ENTITY_QUERY_PORT) query: IEntityQueryPort) {',
    '    super(query);',
    '  }',
    '',
    methods,
    '}',
  ].join('\n');

  return { text, className, targets: [model.name] };
}

/**
 * Renders one query method.
 *
 * Both shapes delegate to the base class, which owns the behaviour: `findOne` answers a 404 when the
 * table is empty, `findPage` validates the requested window. The generated method only names the
 * field, the return type and the entity to read.
 *
 * @param query query of the contract
 * @param model name of the model it reads
 * @returns the method
 */
function renderQueryMethod(query: IQueryEntry, model: string): string {
  const description = escape(query.description);

  if (query.kind === 'page') {
    return [
      `  @Query(() => [${model}], { description: '${description}' })`,
      `  ${query.name}(`,
      "    @Args('limit', PAGE_LIMIT_ARG) limit: number,",
      "    @Args('offset', PAGE_OFFSET_ARG) offset: number,",
      '  ): Promise<IEntity[]> {',
      `    return this.findPage('${delegateName(model)}', { limit, offset });`,
      '  }',
    ].join('\n');
  }

  return [
    `  @Query(() => ${model}, { description: '${description}' })`,
    `  ${query.name}(): Promise<IEntity> {`,
    `    return this.findOne('${delegateName(model)}');`,
    '  }',
  ].join('\n');
}
