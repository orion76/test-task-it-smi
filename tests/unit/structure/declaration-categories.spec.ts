/**
 * Categories of declarations: a production module belongs to exactly one of four categories, so a
 * file either declares a class, or functions, or types, or constants — never two of them at once.
 *
 * The rule is the one of `.opencode/_task.md` («Правило категорий объявлений») and of
 * `instructions/typescript.md` (`ts-code-structure`): a file named after its class holds the class
 * and nothing else, a module that groups data holds constants, and a function that is only needed
 * next to a class moves to the module of its purpose. The rule is mechanical, so it is checked
 * mechanically: this spec walks the source tree, parses every module and fails on a file whose
 * top-level declarations fall into more than one category.
 *
 * The module is parsed with the TypeScript compiler instead of being matched line by line: the
 * category of a `const` depends on the value it is bound to (`() => …` is a function, `{ … }` is a
 * constant), which a regular expression cannot tell apart. The parse also gives the intended
 * meaning of "top level" for free: only the statements of the source file are read, so a `const`
 * inside a function body and a private method of a class are not declarations of the file.
 *
 * Files out of the rule are listed explicitly, and only because they are not hand-written modules
 * of the project: the generated tree (`src/generated`), build output, ambient declarations
 * (`*.d.ts`), the bootstrap `main.ts` (a `main` function together with its logger and constants)
 * and the specs themselves. A spec is not a module with a public API — its doubles belong with the
 * test that uses them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import {
  filesInScope,
  isExempt,
  PROJECT_ROOT,
  SCOPE_ROOTS,
} from './support/scope';

/** The categories of the rule, in the order they are reported. */
const CATEGORIES = ['class', 'functions', 'types', 'constants'] as const;

/** One category of declarations a file may be built of. */
type UDeclarationCategory = (typeof CATEGORIES)[number];

/** One file of the scope that mixes categories: its path and the categories it declares. */
interface IMixedFile {
  path: string;
  categories: UDeclarationCategory[];
}

/** Whether a value bound by `const` is a function rather than a constant. */
function isFunctionValue(node: ts.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/** The category a single `const` declaration belongs to: a function value or a constant. */
function categoryOfDeclaration(declaration: ts.VariableDeclaration): UDeclarationCategory {
  const initializer = declaration.initializer;

  if (initializer !== undefined && isFunctionValue(initializer)) {
    return 'functions';
  }

  return 'constants';
}

/** Statements that declare a type: `type`, `interface` and `enum` all belong to the types. */
function isTypeDeclaration(statement: ts.Statement): boolean {
  return (
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  );
}

/**
 * The categories the module declares at its top level.
 *
 * A `const` whose value is a function counts as a function: `export const argsOf = (query) => …`
 * is a function of the module, not a value. `let` and `var` are not counted at all: the rule speaks
 * about constants, and a mutable module state is neither a constant nor a function.
 */
function categoriesOf(path: string, content: string): UDeclarationCategory[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const declared = new Set<UDeclarationCategory>();

  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement)) {
      declared.add('class');
    } else if (ts.isFunctionDeclaration(statement)) {
      declared.add('functions');
    } else if (isTypeDeclaration(statement)) {
      declared.add('types');
    } else if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of statement.declarationList.declarations) {
        declared.add(categoryOfDeclaration(declaration));
      }
    }
  }

  return CATEGORIES.filter((category) => declared.has(category));
}

/** Files of the scope that declare more than one category, relative to the project root. */
function mixedFilesOf(root: string): IMixedFile[] {
  return filesInScope(root)
    .map((path) => ({ path, categories: categoriesOf(path, readFileSync(join(root, path), 'utf8')) }))
    .filter((file) => file.categories.length > 1);
}

describe('categories of declarations', () => {
  it('keeps every production module to a single category', () => {
    // The failure names the file and the categories it mixes, so the report points at the split
    // that has to be made: a function next to a class, a constant next to a function, and so on.
    expect(mixedFilesOf(PROJECT_ROOT)).toEqual([]);
  });

  it('scans the whole scope rather than an empty list of files', () => {
    // An empty scan would pass the assertion above for the wrong reason, so the scope itself is
    // checked: every root contributes files, and the modules of the task are among them.
    const files = filesInScope(PROJECT_ROOT);

    expect(files.length).toBeGreaterThan(90);

    for (const root of SCOPE_ROOTS) {
      expect(files.some((path) => path.startsWith(`${root}/`))).toBe(true);
    }

    expect(files).toContain('src/db/entity.repository.ts');
    expect(files).toContain('prisma/seed/data/data.writer.ts');
    expect(files).toContain('client/src/app/api/request-input.error.ts');
    expect(files).toContain('src/graphql/queries/args.ts');
  });

  it('reports every category of a mixed module and none of a single-category one', () => {
    // The detection is what the assertion above relies on, so it is checked on fixtures: without
    // this control a broken classifier would keep the rule green.
    const mixed = [
      "import type { TRow } from './types';",
      '',
      'export type TRowView = { id: string };',
      'export enum UMode { Read, Write }',
      'export class Repository {',
      '  find(): TRow[] {',
      '    return [];',
      '  }',
      '}',
      'export const LIMIT = 10;',
      'export function argsOf(query: TRow): TRow {',
      '  return query;',
      '}',
    ].join('\n');

    expect(categoriesOf('src/db/entity.repository.ts', mixed)).toEqual([
      'class',
      'functions',
      'types',
      'constants',
    ]);

    expect(categoriesOf('src/db/orders.ts', 'export const ID_ORDER = [{ id: "asc" }];\n')).toEqual([
      'constants',
    ]);
    expect(
      categoriesOf(
        'src/graphql/queries/pagination.check.ts',
        'export function assertPagination(page: number): void {}\n',
      ),
    ).toEqual(['functions']);
    expect(
      categoriesOf('src/common/contracts/types.ts', 'export type TRow = { id: string };\n'),
    ).toEqual(['types']);
  });

  it('counts a function value as a function and ignores local state', () => {
    // `const` bound to an arrow function is a function of the module, while a `const` inside a
    // method or a `let` of the module is not a declaration the rule counts.
    const source = [
      'let cache: string | undefined;',
      '',
      'export const argsOf = (query: string): string => query;',
      '',
      'export class Repository {',
      '  private readonly limit = 10;',
      '',
      '  find(): number {',
      '    const rows = [1, 2, 3];',
      '',
      '    return rows.length;',
      '  }',
      '}',
    ].join('\n');

    // A class next to a function is the mix the rule forbids; the method, its field and the local
    // `const` are not declarations of the file, and `let` is not a constant.
    expect(categoriesOf('src/db/entity.repository.ts', source)).toEqual(['class', 'functions']);
  });

  it('treats generated code, ambient declarations, the bootstrap and specs as out of the rule', () => {
    expect(isExempt('src/generated/graphql/resolvers/queries.resolver.ts')).toBe(true);
    expect(isExempt('src/common/contracts/vendor.d.ts')).toBe(true);
    expect(isExempt('src/main.ts')).toBe(true);
    expect(isExempt('prisma/seed/main.ts')).toBe(true);
    expect(isExempt('tests/unit/structure/types-placement.spec.ts')).toBe(true);
    expect(isExempt('tests/e2e/batching.e2e-spec.ts')).toBe(true);
    expect(isExempt('src/db/entity.repository.ts')).toBe(false);
    expect(isExempt('src/common/contracts/types.ts')).toBe(false);
    expect(isExempt('client/src/app/api/request.parser.ts')).toBe(false);
  });
});
