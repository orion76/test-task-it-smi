import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import type { ErrorObject } from 'ajv';
import { parse } from 'yaml';

import { loadConfig } from '@lib';

/**
 * The spec imports the package source (`packages/yaml-loader/src/index.ts`) rather than the build
 * artifact of `lib/`: `lib/` is built locally with `npm run build:lib` and is not tracked by git
 * (the directory is listed in `.gitignore`), so a test that required it would fail on a clean
 * checkout, and `ts-jest` compiles the source anyway.
 *
 * Every config written by the test lives in `.tmp/` (gitignored) and is addressed the way the library
 * expects: relative to the project root. The project root is reached through `searchFrom: __dirname`,
 * so a scratch directory inside the project does not need a `package.json` of its own.
 */

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const SCRATCH_ROOT = join(PROJECT_ROOT, '.tmp');
const CONFIG_PATH = 'config/api-fields.yml';
const SCHEMA_PATH = 'config/api-fields.schema.yml';

/** Runs the call and returns the thrown error, failing the test when nothing was thrown. */
function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to throw');
}

describe('loadConfig', () => {
  let scratch: string;

  beforeAll(() => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
  });

  beforeEach(() => {
    scratch = mkdtempSync(join(SCRATCH_ROOT, 'load-config-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  /** Writes a config into the scratch directory and returns its path relative to the project root. */
  function writeScratch(name: string, content: string): string {
    const file = join(scratch, name);
    writeFileSync(file, content);

    return relative(PROJECT_ROOT, file);
  }

  it('loads the real api-fields config without a schema', () => {
    const config = loadConfig<Record<string, unknown>>(CONFIG_PATH, {
      searchFrom: __dirname,
    });

    expect(config.version).toBe(1);
    expect(typeof config.models).toBe('object');
    expect(typeof config.queries).toBe('object');
  });

  it('validates the real config against the real schema', () => {
    const config = loadConfig<Record<string, unknown>>(CONFIG_PATH, {
      searchFrom: __dirname,
      schemaPath: SCHEMA_PATH,
      validate: true,
    });

    expect(config.version).toBe(1);
  });

  it('accepts an absolute schema path, which is how a build artifact is named', () => {
    const config = loadConfig<Record<string, unknown>>(CONFIG_PATH, {
      searchFrom: __dirname,
      schemaPath: join(PROJECT_ROOT, SCHEMA_PATH),
      validate: true,
    });

    expect(config.version).toBe(1);
  });

  it('reads the document unchecked when schemaPath comes without validate', () => {
    const configPath = writeScratch('unchecked.yml', 'version: 1\nmodels: [not an object]\n');

    const config = loadConfig<Record<string, unknown>>(configPath, {
      searchFrom: __dirname,
      schemaPath: SCHEMA_PATH,
    });

    expect(config.models).toEqual(['not an object']);
  });

  it('rejects validate: true without schemaPath, naming both options', () => {
    const configPath = writeScratch('unvalidated.yml', 'version: 1\n');

    const error = captureError(() =>
      loadConfig(configPath, { searchFrom: __dirname, validate: true }),
    );

    expect(error.message).toContain('validate');
    expect(error.message).toContain('schemaPath');
  });

  it('reads a JSON schema with the YAML parser, as the JSDoc claims', () => {
    // A schema may be written in JSON: the parser of the library accepts both formats, while the
    // committed contract schema is YAML. The schema is read by `loadConfig`, so the check goes
    // through the validation rather than through the parser alone.
    const schemaPath = join(scratch, 'plain.schema.json');
    const text = JSON.stringify({ type: 'object', required: ['website'] });

    writeFileSync(schemaPath, text);

    expect(parse(text)).toEqual(JSON.parse(text));

    const configPath = writeScratch('without-website.yml', 'name: owner\n');
    const error = captureError(() =>
      loadConfig(configPath, { searchFrom: __dirname, schemaPath, validate: true }),
    );

    expect(error.message).toContain("must have required property 'website'");
  });

  it('reports a schema violation with the file name and the path inside it', () => {
    const configPath = writeScratch('violates-schema.yml', 'version: 1\nmodels:\n  Profile: {}\n');

    const error = captureError(() =>
      loadConfig(configPath, {
        searchFrom: __dirname,
        schemaPath: SCHEMA_PATH,
        validate: true,
      }),
    );

    expect(error.message).toContain(configPath);
    expect(error.message).toMatch(/\/models\/Profile must have required property 'description'/);
  });

  it('reports a missing file with the path exactly as it was passed', () => {
    const configPath = '.tmp/definitely-missing-config.yml';
    const error = captureError(() => loadConfig(configPath, { searchFrom: __dirname }));

    expect(error.message).toContain(`${configPath}: `);
    expect(error.message).toContain('ENOENT');
  });

  it('reports malformed YAML with the file name', () => {
    const configPath = writeScratch('broken.yml', 'key: [unclosed\n');
    const error = captureError(() => loadConfig(configPath, { searchFrom: __dirname }));

    expect(error.message).toContain(`${configPath}: `);
    expect(error.message).toMatch(/Flow sequence in block collection/);
  });

  it('answers undefined for a missing file when the call is optional', () => {
    const configPath = '.tmp/definitely-missing-optional-config.yml';

    const config = loadConfig<Record<string, unknown>>(configPath, {
      searchFrom: __dirname,
      optional: true,
    });

    expect(config).toBeUndefined();
  });

  it('still reports malformed YAML in the optional mode', () => {
    const configPath = writeScratch('broken-optional.yml', 'key: [unclosed\n');
    const error = captureError(() =>
      loadConfig(configPath, { searchFrom: __dirname, optional: true }),
    );

    expect(error.message).toContain(`${configPath}: `);
    expect(error.message).toMatch(/Flow sequence in block collection/);
  });

  it('returns undefined for a missing directory in the optional mode', () => {
    const configPath = '.tmp/no-such-directory/config.yml';

    const config = loadConfig<Record<string, unknown>>(configPath, {
      searchFrom: __dirname,
      optional: true,
    });

    expect(config).toBeUndefined();
  });

  it('passes the AJV errors and the file name to a custom describeErrors', () => {
    const calls: Array<{ errors: ErrorObject[]; file: string }> = [];
    const describeErrors = (errors: ErrorObject[], file: string): string => {
      calls.push({ errors, file });

      return 'CUSTOM REPORT';
    };
    const configPath = writeScratch('violates-schema.yml', 'version: 1\nmodels:\n  Profile: {}\n');

    const error = captureError(() =>
      loadConfig(configPath, {
        searchFrom: __dirname,
        schemaPath: SCHEMA_PATH,
        validate: true,
        describeErrors,
      }),
    );

    expect(error.message).toContain('CUSTOM REPORT');
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(configPath);
    expect(calls[0].errors.length).toBeGreaterThan(0);
  });

  it('registers ajv-formats when formats is true', () => {
    const schemaPath = join(scratch, 'uri.schema.json');
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: 'object',
        properties: { website: { type: 'string', format: 'uri' } },
        required: ['website'],
      }),
    );
    const configPath = writeScratch('website.yml', 'website: not a uri\n');

    // Without `format` support AJV refuses to compile the schema at all.
    expect(() =>
      loadConfig(configPath, { searchFrom: __dirname, schemaPath, validate: true }),
    ).toThrow(/unknown format "uri"/);

    const error = captureError(() =>
      loadConfig(configPath, {
        searchFrom: __dirname,
        schemaPath,
        validate: true,
        formats: true,
      }),
    );

    expect(error.message).toContain(configPath);
    expect(error.message).toContain('must match format "uri"');
  });

  it('reports every violation when ajvOptions is not passed, so allErrors is on by default', () => {
    const schemaPath = join(scratch, 'pair.schema.json');
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: 'object',
        properties: { name: { type: 'string' }, website: { type: 'string' } },
        required: ['name', 'website'],
      }),
    );
    const configPath = writeScratch('empty-pair.yml', '{}\n');

    const error = captureError(() =>
      loadConfig(configPath, { searchFrom: __dirname, schemaPath, validate: true }),
    );

    expect(error.message).toContain("must have required property 'name'");
    expect(error.message).toContain("must have required property 'website'");
  });

  it('merges a passed ajvOptions over the default, so allErrors can be turned off', () => {
    const schemaPath = join(scratch, 'pair.schema.json');
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: 'object',
        required: ['name', 'website'],
      }),
    );
    const configPath = writeScratch('empty-pair-off.yml', '{}\n');
    const reported: ErrorObject[][] = [];

    captureError(() =>
      loadConfig(configPath, {
        searchFrom: __dirname,
        schemaPath,
        validate: true,
        ajvOptions: { allErrors: false },
        describeErrors: (errors) => {
          reported.push(errors);

          return 'FIRST VIOLATION ONLY';
        },
      }),
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveLength(1);
  });

  it('keeps no state: the second call sees the edited file', () => {
    const configPath = writeScratch('counter.yml', 'value: 1\n');

    expect(loadConfig<{ value: number }>(configPath, { searchFrom: __dirname }))
      .toEqual({ value: 1 });

    writeFileSync(join(scratch, 'counter.yml'), 'value: 2\n');

    expect(loadConfig<{ value: number }>(configPath, { searchFrom: __dirname }))
      .toEqual({ value: 2 });
  });
});
