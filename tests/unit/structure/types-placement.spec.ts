/**
 * Placement of types: a `type` alias or an `interface` belongs to a types file, never to a file that
 * holds classes, functions or runtime values.
 *
 * The rule is the one of `instructions/typescript.md` (`ts-code-structure`): a module keeps its
 * types in `types.ts` (or `types.mts`), in a `*.types.ts` file or in a `types/` directory, and an
 * implementation file holds only the code. The rule is mechanical, so it is checked mechanically:
 * this spec walks the source tree, reads every module as text and fails on a declaration found
 * outside a types file.
 *
 * Files out of the rule are listed explicitly, and only because they are not hand-written modules
 * of the project: the generated tree (`src/generated`), build output, ambient declarations
 * (`*.d.ts`) and the specs themselves. A spec is not a module with a public API — its types are
 * doubles that belong with the test that uses them.
 *
 * The scan is the same scope as the audit it replaces (`.opencode/review/audit-structure.py`), so a
 * file that the audit read is read here too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  fileNameOf,
  GENERATED_PREFIXES,
  isSpec,
  PROJECT_ROOT,
  SCOPE_ROOTS,
  sourceFilesOf,
} from './support/scope';

/** Directories of the scope: the sources above, plus the specs themselves. */
const SPEC_ROOTS = [...SCOPE_ROOTS, 'tests'] as const;

/** A `type` alias or an `interface` declared at the top level of a module, with the declared name. */
const TYPE_DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+([A-Za-z0-9_$]+)/;

/** One declaration of a type outside a types file: the file, the line and the name. */
interface IDeclaration {
  path: string;
  line: number;
  name: string;
}

/** Whether the file is a declaration of an external module or of the ambient environment. */
function isAmbient(path: string): boolean {
  return path.endsWith('.d.ts');
}

/** Whether the file exists to hold types: `types.ts`, `*.types.ts`, `types.mts` or a `types/` directory. */
function isTypesFile(path: string): boolean {
  const name = fileNameOf(path);

  return (
    name === 'types.ts' ||
    name === 'types.mts' ||
    name.endsWith('.types.ts') ||
    name.endsWith('.types.mts') ||
    path.includes('/types/')
  );
}

/** Whether the rule does not apply to the file at all. */
function isExempt(path: string): boolean {
  return (
    path.includes('node_modules/') ||
    GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    isAmbient(path) ||
    isTypesFile(path) ||
    isSpec(path)
  );
}

/** Every module the rule covers, relative to the project root. */
function filesInScope(root: string): string[] {
  return SPEC_ROOTS.flatMap((directory) => sourceFilesOf(root, directory)).filter(
    (path) => !isExempt(path),
  );
}

/** Declarations a module holds: one entry per top-level `type` or `interface`, with its line. */
function declarationsOf(path: string, content: string): IDeclaration[] {
  const declarations: IDeclaration[] = [];

  content.split('\n').forEach((text, index) => {
    const match = TYPE_DECLARATION.exec(text);

    if (match !== null) {
      declarations.push({ path, line: index + 1, name: match[1] });
    }
  });

  return declarations;
}

/** Every declaration of a type outside a types file, relative to the project root. */
function violationsOf(root: string): IDeclaration[] {
  return filesInScope(root).flatMap((path) =>
    declarationsOf(path, readFileSync(join(root, path), 'utf8')),
  );
}

describe('placement of types', () => {
  it('keeps every type alias and interface in a types file', () => {
    expect(violationsOf(PROJECT_ROOT)).toEqual([]);
  });

  it('scans the whole scope rather than an empty list of files', () => {
    // An empty scan would pass the assertion above for the wrong reason, so the scope itself is
    // checked: every root contributes files, and the modules of the application are among them.
    const files = filesInScope(PROJECT_ROOT);

    expect(files.length).toBeGreaterThan(90);

    for (const root of SPEC_ROOTS) {
      expect(files.some((path) => path.startsWith(`${root}/`))).toBe(true);
    }

    expect(files).toContain('src/db/entity.repository.ts');
    expect(files).toContain('tests/e2e/support/app.ts');
  });

  it('reports a declaration of an implementation file and reads a types file as empty', () => {
    // The detection is what the assertions above rely on, so it is checked on a fixture: without
    // this control a broken pattern would keep the rule green.
    const implementation = [
      "import type { DMMF } from '@prisma/generator-helper';",
      '',
      'export type TFieldSpec = { name: string };',
      'interface ICountingPort { count(): number }',
      'export function field(): void {}',
    ].join('\n');

    expect(declarationsOf('src/db/entity.repository.ts', implementation)).toEqual([
      { path: 'src/db/entity.repository.ts', line: 3, name: 'TFieldSpec' },
      { path: 'src/db/entity.repository.ts', line: 4, name: 'ICountingPort' },
    ]);
  });

  it('treats generated code, ambient declarations and specs as out of the rule', () => {
    expect(isExempt('src/generated/graphql/entities/profile.ts')).toBe(true);
    expect(isExempt('src/modules/health/health.types.ts')).toBe(true);
    expect(isExempt('src/graphql/loaders/types.ts')).toBe(true);
    expect(isExempt('src/graphql/loaders/types.mts')).toBe(true);
    expect(isExempt('src/common/contracts/types/entity.ts')).toBe(true);
    expect(isExempt('client/src/app/api/vendor.d.ts')).toBe(true);
    expect(isExempt('tests/unit/db/entity.repository.spec.ts')).toBe(true);
    expect(isExempt('tests/e2e/batching.e2e-spec.ts')).toBe(true);
    expect(isExempt('client/src/app/api/request.parser.ts')).toBe(false);
    expect(isExempt('tests/e2e/support/app.ts')).toBe(false);
  });
});
