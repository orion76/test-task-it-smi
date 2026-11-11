/**
 * Shape of a type declaration: a flat object structure belongs to an `interface`, and a `type`
 * alias is kept only for what an interface cannot express — a union, an intersection with a computed
 * part, a mapped or utility type.
 *
 * The rule is the one of `instructions/typescript.md` (`ts-type-vs-interface`). It is mechanical, so
 * it is checked mechanically: this spec walks the source tree, parses every module and fails on a
 * `type` alias whose right side is an object literal, a `Readonly` around one, or an intersection
 * with one. A `type` that names a union, a `Record`, a `Pick` or a mapped type is not a violation:
 * an `interface` expresses none of them.
 *
 * Files out of the rule are the ones `./support/scope` lists: the generated tree, the build output,
 * the ambient declarations, the bootstrap and the specs, whose fixtures describe structures of their
 * own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesInScope, PROJECT_ROOT } from './support/scope';

/** The utility whose only effect on a fresh literal is `readonly` fields, which `interface` states. */
const READONLY_WRAPPER = 'Readonly';

/** One `type` alias that declares a structure an `interface` expresses: file, line and name. */
interface IShapeViolation {
  path: string;
  line: number;
  name: string;
}

/**
 * Whether a right side of a `type` alias declares a structure an `interface` expresses.
 *
 * The three shapes are the ones the rule names: an object literal, `Readonly<{ … }>` and
 * `A & { … }`. An intersection of two declared structures is `extends` and stays out: only a member
 * that is a literal makes it a structure of the alias itself.
 */
function isObjectShape(node: ts.TypeNode): boolean {
  if (ts.isTypeLiteralNode(node)) {
    return true;
  }

  if (ts.isIntersectionTypeNode(node)) {
    return node.types.some((member) => ts.isTypeLiteralNode(member));
  }

  return (
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === READONLY_WRAPPER &&
    (node.typeArguments ?? []).some((argument) => ts.isTypeLiteralNode(argument))
  );
}

/** The `type` aliases a module declares at its top level, in source order. */
function typeAliasesOf(source: ts.SourceFile): ts.TypeAliasDeclaration[] {
  const aliases: ts.TypeAliasDeclaration[] = [];

  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      aliases.push(statement);
    }
  }

  return aliases;
}

/** The module parsed by the compiler, so a string of a body is not read as a declaration. */
function sourceOf(path: string, content: string): ts.SourceFile {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
}

/** Object shapes one module declares as `type` aliases, with the line of each declaration. */
function violationsOf(path: string, content: string): IShapeViolation[] {
  const source = sourceOf(path, content);

  return typeAliasesOf(source)
    .filter((alias) => isObjectShape(alias.type))
    .map((alias) => ({
      path,
      line: source.getLineAndCharacterOfPosition(alias.getStart(source)).line + 1,
      name: alias.name.text,
    }));
}

/** Names of the `type` aliases one module declares, so a scan that reads nothing is visible. */
function typeAliasNamesOf(path: string, content: string): string[] {
  return typeAliasesOf(sourceOf(path, content)).map((alias) => alias.name.text);
}

/** Every object shape the scope declares as a `type` alias, relative to the project root. */
function scopeViolationsOf(root: string): IShapeViolation[] {
  return filesInScope(root).flatMap((path) =>
    violationsOf(path, readFileSync(join(root, path), 'utf8')),
  );
}

/** The way a violation is reported: the file and the line first, then the name of the alias. */
function formatViolation(violation: IShapeViolation): string {
  return `${violation.path}:${violation.line} — ${violation.name}`;
}

describe('shape of a type declaration', () => {
  it('keeps every structure in an interface rather than a type alias', () => {
    // The failure names the file, the line and the alias, so the report points at the declaration
    // that has to become an interface.
    expect(scopeViolationsOf(PROJECT_ROOT).map(formatViolation)).toEqual([]);
  });

  it('scans the whole scope rather than an empty list of files', () => {
    // An empty scan would pass the assertion above for the wrong reason, so the scope itself is
    // checked: it has files, a module of the task is among them, and the parse sees the aliases the
    // rule allows to stay `type`.
    const files = filesInScope(PROJECT_ROOT);

    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/db/types.ts');

    const aliases = files.flatMap((path) =>
      typeAliasNamesOf(path, readFileSync(join(PROJECT_ROOT, path), 'utf8')),
    );

    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases).toContain('UEntityQuery');
    expect(aliases).toContain('TContractNode');
  });

  it('reports an object shape declared as a type and accepts the interface', () => {
    // The detection is what the assertion above relies on, so it is checked on a fixture: without
    // this control a broken parse would keep the rule green.
    const fixture = [
      'export type TBad = { a: string };',
      'export type TReadonlyBad = Readonly<{ a: string }>;',
      'export type TIntersectedBad = TContractNode & { name: string };',
      '',
      'export interface IGood {',
      '  a: string;',
      '}',
      '',
      'export type UUnion = { a: string } | undefined;',
      'export type TPicked = Pick<IEntity, "id">;',
      'export type TRecorded = Record<string, string>;',
      'export type TMapped = { [K in keyof IEntity]: string };',
      'export type TIntersected = IEntity & IContractNode;',
    ].join('\n');

    // Only the three object shapes are violations: the interface, the union, the utility and the
    // mapped alias are what `type` exists for, and an intersection of declared structures is
    // `extends` of an interface rather than a shape of its own.
    expect(violationsOf('src/db/types.ts', fixture)).toEqual([
      { path: 'src/db/types.ts', line: 1, name: 'TBad' },
      { path: 'src/db/types.ts', line: 2, name: 'TReadonlyBad' },
      { path: 'src/db/types.ts', line: 3, name: 'TIntersectedBad' },
    ]);
  });
});
