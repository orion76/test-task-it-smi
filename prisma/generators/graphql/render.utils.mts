/**
 * Assembles one generated file from its header, imports, classes and the list the module registers,
 * and escapes the text that reaches the generated sources.
 */
import { HEADER, LINE_LIMIT } from './constants.mts';
import type { IRenderedBlock } from './types.mts';

/** Escapes a description for a single-quoted TypeScript string. */
export function escape(value: unknown): string {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Assembles one generated file: header, imports, classes and the list the module registers.
 *
 * Every import line goes through `wrapImport`, so a deep path that pushes the line over the limit is
 * wrapped instead of leaving a line the project style forbids.
 *
 * @param imports import lines of the file
 * @param blocks rendered classes
 * @param listName name of the exported list of classes
 * @returns the source of the file
 */
export function renderFile(
  imports: readonly string[],
  blocks: readonly IRenderedBlock[],
  listName: string,
): string {
  const targets = [...new Set(blocks.flatMap((block) => block.targets))].sort();
  const names = blocks.map((block) => block.className);
  const entityImport = `import { ${targets.join(', ')} } from '../entities';`;

  return [
    HEADER,
    '',
    ...imports.flatMap(wrapImport),
    ...wrapImport(entityImport),
    '',
    ...blocks.flatMap((block) => [block.text, '']),
    '/** Registered as one list by `GraphqlApiModule`. */',
    renderList(listName, names),
    '',
  ].join('\n');
}

/**
 * Wraps a named import over several lines when it does not fit.
 *
 * The line limit applies to the generated files too, and the list of models grows with the domain, so
 * the wrapping cannot be decided once by hand.
 *
 * @param line the single-line import
 * @returns one or several lines
 */
function wrapImport(line: string): string[] {
  if (line.length <= LINE_LIMIT) {
    return [line];
  }

  const opened = line.indexOf('{');
  const closed = line.indexOf('}');
  const names = line
    .slice(opened + 1, closed)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return [
    `${line.slice(0, opened)}{`,
    ...names.map((name) => `  ${name},`),
    `} ${line.slice(closed + 1).trim()}`,
  ];
}

/**
 * Renders an exported array, wrapped when it does not fit one line.
 *
 * @param name name of the exported constant
 * @param items values of the array
 * @returns the declaration
 */
function renderList(name: string, items: readonly string[]): string {
  const single = `export const ${name} = [${items.join(', ')}];`;

  if (single.length <= LINE_LIMIT) {
    return single;
  }

  return [`export const ${name} = [`, ...items.map((item) => `  ${item},`), '];'].join('\n');
}
