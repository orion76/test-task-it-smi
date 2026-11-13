/**
 * A model description has one source: `models.<Model>.description` in `config/api-fields.yml`.
 * `prisma/schema.prisma` repeats it in the `///` comment, because the GraphQL generator takes the
 * text of a type from the DMMF alone. This spec holds the equality, so a rewrite in one file cannot
 * reach the client's GraphQL help while the other file still says the old thing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { PROJECT_ROOT } from '../../structure/support/scope';

const CONTRACT_PATH = resolve(PROJECT_ROOT, 'config', 'api-fields.yml');
const SCHEMA_PATH = resolve(PROJECT_ROOT, 'prisma', 'schema.prisma');

/** A `model <Name> {` block of the Prisma schema, whatever follows the name. */
const MODEL_START = /^model\s+(\w+)\s*\{/;

/** One `///` line: the documentation comment Prisma hands to a generator as `documentation`. */
const DOCUMENTATION_LINE = /^\s*\/\/\/ ?(.*)$/;

/** What the report says when the model has no documentation comment at all. */
const NO_DOCUMENTATION = '<нет ///-описания модели>';

/** One divergence: the model, the text of the contract and the text of the schema. */
interface IDescriptionMismatch {
  model: string;
  contract: string;
  schema: string;
}

/** Whether the parsed YAML value is a mapping: only then its keys may be read. */
function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The described models of the contract: every model name with the text of its `description`. */
function contractDescriptionsOf(): Map<string, string> {
  const document: unknown = parse(readFileSync(CONTRACT_PATH, 'utf8'));

  if (!isMapping(document) || !isMapping(document.models)) {
    throw new Error('config/api-fields.yml: "models" is required and must be a mapping');
  }

  const descriptions = new Map<string, string>();

  for (const [model, value] of Object.entries(document.models)) {
    if (!isMapping(value) || typeof value.description !== 'string') {
      throw new Error(`config/api-fields.yml: models.${model}.description must be a string`);
    }

    descriptions.set(model, value.description);
  }

  return descriptions;
}

/** The `///` lines above every `model` block, joined as Prisma joins them into `documentation`. */
function schemaDocumentationsOf(): Map<string, string> {
  const lines = readFileSync(SCHEMA_PATH, 'utf8').split('\n');
  const documentations = new Map<string, string>();

  lines.forEach((line, index) => {
    const start = MODEL_START.exec(line);

    if (start === null) {
      return;
    }

    const comment: string[] = [];
    let cursor = index - 1;

    while (cursor >= 0) {
      const documentation = DOCUMENTATION_LINE.exec(lines[cursor]);

      if (documentation === null) {
        break;
      }

      comment.unshift(documentation[1].trim());
      cursor -= 1;
    }

    documentations.set(start[1], comment.join('\n'));
  });

  return documentations;
}

/** The failure text of one divergence: the model first, then both texts, so the fix is obvious. */
function reportOf(mismatch: IDescriptionMismatch): string {
  return [
    `models.${mismatch.model}: the contract and the Prisma comment disagree`,
    `  config/api-fields.yml: ${mismatch.contract}`,
    `  prisma/schema.prisma:  ${mismatch.schema}`,
  ].join('\n');
}

describe('model descriptions', () => {
  it('repeats every contract description in the /// of the same model of schema.prisma', () => {
    const contract = contractDescriptionsOf();
    const schema = schemaDocumentationsOf();

    const mismatches = [...contract]
      .filter(([model, description]) => schema.get(model) !== description)
      .map(([model, description]) =>
        reportOf({
          model,
          contract: description,
          schema: schema.get(model) ?? NO_DOCUMENTATION,
        }),
      );

    expect(mismatches).toEqual([]);
  });
});
