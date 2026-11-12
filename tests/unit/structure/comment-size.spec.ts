/**
 * Size of the comments: a class or a function is described in at most four lines, and a run of `//`
 * in a body stays within the same limit. The sources are parsed with the TypeScript compiler, since
 * `//` of a template literal is not a comment and a wrapped signature still has an argument count.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesInScope, PROJECT_ROOT } from './support/scope';

/** The lines a docblock may spend on a purpose and a `//` run may take; the limit of both measures. */
const SIZE_LIMIT = 4;

/** What may stand between a docblock and its declaration: decorators and modifiers, nothing else. */
const DECLARATION_PREFIX = /^(?:@[\w$].*|[\w$\s]+)$/;

/** The tag that documents an argument of the signature. */
const PARAM_TAG = /^@param\b/;

/** What a docblock documents: a type of the layer, a callable, or a value that is not measured. */
type UDocumentedKind = 'type' | 'callable' | 'value';

/** The expressions that declare a function rather than a constant. */
type UFunctionValue = ts.ArrowFunction | ts.FunctionExpression;

/** What the measure sizes: a class, an interface or a type, and a callable with its arguments. */
type UMeasuredKind = 'type' | 'callable';

/** A node a docblock may document, with the number of arguments its signature takes. */
interface IDeclaration {
  start: number;
  kind: UDocumentedKind;
  args: number;
}

/** What a docblock says about its declaration: the purpose lines and the arguments it documents. */
interface IDocblock {
  purpose: string[];
  params: number;
}

/** A measured docblock: where it is, what it describes and how much it spent on each measure. */
interface IMeasuredDocblock {
  line: number;
  kind: UMeasuredKind;
  purpose: number;
  params: number;
  args: number;
}

/** One comment that breaks a limit: the file, the line, the measure and what it found there. */
interface IViolation {
  path: string;
  line: number;
  kind: 'purpose' | 'params' | 'inline';
  count: number;
  limit: number;
}

/** The way a violation is reported: the file and the line first, then what was found there. */
function formatViolation(violation: IViolation): string {
  return `${violation.path}:${violation.line} — ${violation.kind} ${violation.count} > ${violation.limit}`;
}

/** The function a declaration binds, when its value is a function rather than a constant. */
function functionOf(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return node;
  }

  if (
    ts.isVariableDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node)
  ) {
    const initializer = node.initializer;

    if (initializer !== undefined && isFunctionValue(initializer)) {
      return initializer;
    }
  }

  return undefined;
}

/** Whether a node declares a callable with a signature of its own. */
function isCallable(node: ts.Node): node is ts.SignatureDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node)
  );
}

/** Whether an expression is a function value rather than a constant. */
function isFunctionValue(node: ts.Expression): node is UFunctionValue {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/** The kind of declaration a node is, when a docblock above it is measured at all. */
function kindOf(node: ts.Node): UDocumentedKind | undefined {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return 'type';
  }

  if (isCallable(node)) {
    return 'callable';
  }

  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return 'value';
  }

  if (
    ts.isVariableDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isPropertySignature(node)
  ) {
    return functionOf(node) === undefined ? 'value' : 'callable';
  }

  return undefined;
}

/** The number of arguments the signature of a declaration takes. */
function argsOf(node: ts.Node): number {
  const fn = functionOf(node);

  if (fn !== undefined) {
    return fn.parameters.length;
  }

  return isCallable(node) ? node.parameters.length : 0;
}

/** Every node a docblock may document, in source order. */
function declarationsOf(source: ts.SourceFile): IDeclaration[] {
  const declarations: IDeclaration[] = [];

  const visit = (node: ts.Node): void => {
    const kind = kindOf(node);

    if (kind !== undefined) {
      declarations.push({ start: node.getStart(source), kind, args: argsOf(node) });
    }

    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };

  visit(source);

  return declarations.sort((left, right) => left.start - right.start);
}

/** Every comment of the module, read by the compiler so that text of a string stays code. */
function commentsOf(source: ts.SourceFile): ts.CommentRange[] {
  const text = source.getFullText();
  const comments = new Map<number, ts.CommentRange>();

  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
      comments.set(range.pos, range);
    }

    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) {
      comments.set(range.pos, range);
    }

    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };

  visit(source);

  return [...comments.values()].sort((left, right) => left.pos - right.pos);
}

/** The purpose lines of a docblock (before its tags) and the `@param` lines among the tags. */
function docblockOf(comment: string): IDocblock {
  const body = comment.replace(/^\/\*\*/, '').replace(/\*\/$/, '');
  const lines = body.split('\n').map((line) => line.replace(/^\s*\*/, '').trim());
  const purpose: string[] = [];
  let params = 0;
  let inTags = false;

  for (const line of lines) {
    if (line.startsWith('@')) {
      inTags = true;
      params += PARAM_TAG.test(line) ? 1 : 0;

      continue;
    }

    if (!inTags && line.length > 0) {
      purpose.push(line);
    }
  }

  return { purpose, params };
}

/** The 1-based line a position of the module falls on. */
function lineOf(text: string, position: number): number {
  return text.slice(0, position).split('\n').length;
}

/** The declaration a docblock ends at, when only decorators and modifiers stand between them. */
function documentedBy(
  declarations: IDeclaration[],
  text: string,
  end: number,
): IDeclaration | undefined {
  const declaration = declarations.find((candidate) => candidate.start >= end);

  if (declaration === undefined) {
    return undefined;
  }

  const between = text.slice(end, declaration.start);
  const code = between
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return code.every((line) => DECLARATION_PREFIX.test(line)) ? declaration : undefined;
}

/**
 * Docblocks of one module that describe a class, an interface, a type or a callable.
 *
 * A docblock that stands alone — the header of the module, a block of a body — is not a description
 * of a declaration and is left out, as is a docblock of a constant: the rule sizes the descriptions
 * of classes, functions and methods.
 */
function measuredDocblocksOf(source: ts.SourceFile): IMeasuredDocblock[] {
  const text = source.getFullText();
  const declarations = declarationsOf(source);
  const docblocks: IMeasuredDocblock[] = [];

  for (const comment of commentsOf(source)) {
    if (comment.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    const block = text.slice(comment.pos, comment.end);

    if (!block.startsWith('/**')) {
      continue;
    }

    const declaration = documentedBy(declarations, text, comment.end);

    if (declaration === undefined || declaration.kind === 'value') {
      continue;
    }

    const { purpose, params } = docblockOf(block);

    docblocks.push({
      line: lineOf(text, comment.pos),
      kind: declaration.kind,
      purpose: purpose.length,
      params,
      args: declaration.args,
    });
  }

  return docblocks;
}

/** The limits a single docblock breaks: its purpose and the arguments it documents. */
function docblockViolationsOf(path: string, docblock: IMeasuredDocblock): IViolation[] {
  const violations: IViolation[] = [];

  if (docblock.purpose > SIZE_LIMIT) {
    violations.push({
      path,
      line: docblock.line,
      kind: 'purpose',
      count: docblock.purpose,
      limit: SIZE_LIMIT,
    });
  }

  if (docblock.kind === 'callable' && docblock.params > docblock.args) {
    violations.push({
      path,
      line: docblock.line,
      kind: 'params',
      count: docblock.params,
      limit: docblock.args,
    });
  }

  return violations;
}

/** Runs of `//` comments of one module that are longer than the limit. */
function runViolationsOf(path: string, text: string, comments: ts.CommentRange[]): IViolation[] {
  const violations: IViolation[] = [];
  let run: number[] = [];

  const report = (): void => {
    if (run.length > SIZE_LIMIT) {
      violations.push({ path, line: run[0], kind: 'inline', count: run.length, limit: SIZE_LIMIT });
    }

    run = [];
  };

  for (const comment of comments) {
    if (comment.kind !== ts.SyntaxKind.SingleLineCommentTrivia) {
      report();

      continue;
    }

    const line = lineOf(text, comment.pos);

    if (run.length > 0 && line !== run[run.length - 1] + 1) {
      report();
    }

    run.push(line);
  }

  report();

  return violations;
}

/** Comments of one module that break a limit, in source order. */
function violationsOf(path: string, content: string): IViolation[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const docblocks = measuredDocblocksOf(source);

  return [
    ...docblocks.flatMap((docblock) => docblockViolationsOf(path, docblock)),
    ...runViolationsOf(path, source.getFullText(), commentsOf(source)),
  ];
}

/** One module of the scope, parsed by the compiler. */
function sourceOf(root: string, path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Every docblock of the scope that the measure reads. */
function scopeDocblocksOf(root: string): IMeasuredDocblock[] {
  return filesInScope(root).flatMap((path) => measuredDocblocksOf(sourceOf(root, path)));
}

/** Every comment of the scope that breaks a limit, relative to the project root. */
function scopeViolationsOf(root: string): IViolation[] {
  return filesInScope(root).flatMap((path) =>
    violationsOf(path, readFileSync(join(root, path), 'utf8')),
  );
}

describe('size of the comments', () => {
  it('keeps every docblock and every comment run within the limit', () => {
    // The failure names the file, the line and the number of lines found, so the report points at
    // the block that has to be cut: `src/db/entity.repository.ts:21 — purpose 6 > 4`.
    expect(scopeViolationsOf(PROJECT_ROOT).map(formatViolation)).toEqual([]);
  });

  it('scans the whole scope rather than an empty list of files', () => {
    // An empty scan would pass the assertion above for the wrong reason, so the scope itself is
    // checked: every root contributes files, and the modules of the task are among them.
    const files = filesInScope(PROJECT_ROOT);

    expect(files.length).toBeGreaterThan(90);
    expect(files.some((path) => path.startsWith('src/'))).toBe(true);
    expect(files.some((path) => path.startsWith('prisma/'))).toBe(true);
    expect(files.some((path) => path.startsWith('packages/yaml-loader/src/'))).toBe(true);
    expect(files.some((path) => path.startsWith('client/src/'))).toBe(true);

    expect(files).toContain('src/db/entity.repository.ts');
    expect(files).toContain('prisma/seed/shared/error-context.ts');
    expect(files).toContain('packages/yaml-loader/src/project-root.ts');
    expect(files).toContain('client/src/app/api/request.parser.ts');
  });

  it('measures the docblocks of the scope rather than none of them', () => {
    // A docblock that is never attached to its declaration would keep the rule green without being
    // read, so the measure itself is counted: every module with a described class or function
    // contributes, and a module of the task is among them.
    const docblocks = scopeDocblocksOf(PROJECT_ROOT);

    // The floor only proves that the scan is not empty: it sits well below the real total (291 at
    // the time of writing) and is not meant to track the size of the code base, which grows and
    // shrinks with every task.
    expect(docblocks.length).toBeGreaterThan(250);
    expect(docblocks.some((docblock) => docblock.kind === 'type')).toBe(true);
    expect(docblocks.some((docblock) => docblock.kind === 'callable' && docblock.params > 0)).toBe(
      true,
    );
  });

  it('measures a long purpose of a class and of a function', () => {
    // The detection is what the assertion above relies on, so it is checked on fixtures: without
    // this control a broken parse would keep the rule green.
    const source = [
      '/**',
      ' * The repository of an entity.',
      ' *',
      ' * It keeps the delegate and the transaction of the request, so a query',
      ' * is built in one place instead of every caller, and the layer of the',
      ' * database is the only place that knows the spelling of a column.',
      ' *',
      ' * It is the only module of `db` that speaks to the client.',
      ' */',
      'export class Repository {',
      '  /**',
      '   * Finds the rows of the query.',
      '   *',
      '   * The query is built from the order of the module and the pagination',
      '   * of the caller, which keeps the SQL of the layer in one place, and',
      '   * the rows are read by the delegate the entity names.',
      '   *',
      '   * The delegate is read once per call.',
      '   */',
      '  find(): number {',
      '    return 0;',
      '  }',
      '}',
    ].join('\n');

    // Both blocks describe the purpose in five lines: the class one and the method one.
    expect(violationsOf('src/db/entity.repository.ts', source)).toEqual([
      { path: 'src/db/entity.repository.ts', line: 1, kind: 'purpose', count: 5, limit: 4 },
      { path: 'src/db/entity.repository.ts', line: 11, kind: 'purpose', count: 5, limit: 4 },
    ]);
  });

  it('measures the arguments a docblock documents against the signature', () => {
    const source = [
      '/**',
      ' * Finds the rows.',
      ' *',
      ' * @param delegate the entity of the query',
      ' * @param order the order of the rows',
      ' * @throws Error when the entity is not known',
      ' */',
      'export function find(delegate: string, order: string): number {',
      '  return delegate.length + order.length;',
      '}',
      '',
      '/**',
      ' * Finds the row.',
      ' *',
      ' * @param id identifier of the row',
      ' * @param delegate the entity of the query',
      ' */',
      'export function findOne(id: string): string {',
      '  return id;',
      '}',
    ].join('\n');

    // The first docblock documents two arguments of a signature with two of them, the second
    // documents two arguments of a signature with one: only the second is a violation.
    expect(violationsOf('src/db/entity.repository.ts', source)).toEqual([
      { path: 'src/db/entity.repository.ts', line: 12, kind: 'params', count: 2, limit: 1 },
    ]);
  });

  it('measures a run of // comments of a body and keeps a shorter one out', () => {
    const source = [
      'export function find(): number {',
      '  // The identifier is read from the column the config declares, so the',
      '  // resolver does not know the foreign key and a missing value needs no',
      '  // query at all: the row is looked up by the column the reference names,',
      '  // which is the only place of the layer that knows the spelling of the',
      '  // key, and a row without it is returned as `null` without a query.',
      '  const id = 1;',
      '  return id;',
      '}',
      '',
      'export function count(): number {',
      '  // Three lines of a body are within the limit.',
      '  // The second one is a continuation.',
      '  // The third one closes the block.',
      '  return 3;',
      '}',
    ].join('\n');

    expect(violationsOf('src/db/entity.repository.ts', source)).toEqual([
      { path: 'src/db/entity.repository.ts', line: 2, kind: 'inline', count: 5, limit: 4 },
    ]);
  });

  it('reads a comment of a template literal as code, not as a comment', () => {
    // A pattern would count the `//` lines of the rendered text as comments; the parse knows where
    // the string is, so a generated module does not fail the rule of the source.
    const source = [
      'export function render(name: string): string {',
      '  return [',
      '    `// The generated file, do not edit:`,',
      '    `// 1`,',
      '    `// 2`,',
      '    `// 3`,',
      '    `// 4`,',
      '    `// 5`,',
      '    `export class ${name} {}`,',
      '  ].join(String.fromCharCode(10));',
      '}',
    ].join('\n');

    expect(violationsOf('src/generated/graphql/entity.ts', source)).toEqual([]);
  });

  it('treats a header of a module as out of the measure', () => {
    // A module header is not a description of a declaration: it is followed by an import, and the
    // rule sizes the docblocks of classes, functions and methods only.
    const source = [
      '/**',
      ' * The repository of an entity.',
      ' *',
      ' * It keeps the delegate and the transaction of the request, so a query',
      ' * is built in one place instead of every caller, and the layer of the',
      ' * database is the only place that knows the spelling of a column.',
      ' */',
      "import { join } from 'node:path';",
      '',
      '/** Finds the rows. */',
      'export function find(): string {',
      '  return join("a", "b");',
      '}',
    ].join('\n');

    expect(violationsOf('src/db/entity.repository.ts', source)).toEqual([]);
  });
});
