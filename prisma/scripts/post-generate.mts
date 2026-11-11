/**
 * Entry point of the post-processing of the `prisma-nestjs-graphql` output
 * (`src/generated/graphql/entities`): drops the imports nothing uses and stamps every file with the
 * header that marks it as generated. The walk starts only when the file is executed, never on
 * import: a test that imports the cleanup must not rewrite the committed sources.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

import { FILE_HEADER, FILE_HEADER_MARKER, OUTPUT_DIRECTORY } from './constants.mts';
import { stripUnusedImports } from './imports.cleaner.mts';

/**
 * Drops the header a previous run added, together with the blank line after it.
 *
 * The cleanup and the stamping are two steps of one run, so the header has to leave the body alone:
 * neither an identifier in the header text may count as a usage of an import, nor may a second run
 * keep the first header and add its own.
 *
 * @param source content of one generated file
 * @returns the content without the header
 */
function stripHeader(source: string): string {
  if (!source.startsWith(FILE_HEADER_MARKER)) {
    return source;
  }

  const bodyStart = source.indexOf('\n\n');

  return bodyStart === -1 ? '' : source.slice(bodyStart + 2);
}

/** Rewrites every generated TypeScript file in place with exactly one header and no unused imports. */
function processGeneratedFiles(): void {
  if (!existsSync(OUTPUT_DIRECTORY)) {
    console.log(`prisma-nestjs-graphql: ${OUTPUT_DIRECTORY} does not exist, nothing to process`);
    return;
  }

  const files = readdirSync(OUTPUT_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry: Dirent) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry: Dirent) => join(entry.parentPath, entry.name));

  let cleanedFiles = 0;
  let stampedFiles = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const body = stripHeader(source);
    const { cleaned, changed } = stripUnusedImports(body);

    if (changed) {
      cleanedFiles += 1;
    }

    if (body === source) {
      stampedFiles += 1;
    }

    const stamped = `${FILE_HEADER}\n\n${cleaned}`;

    if (stamped !== source) {
      writeFileSync(file, stamped);
    }
  }

  console.log(
    `prisma-nestjs-graphql: removed unused imports from ${cleanedFiles} generated file(s)`,
  );
  console.log(`prisma-nestjs-graphql: stamped ${stampedFiles} generated file(s) with the header`);
}

if (import.meta.main) {
  processGeneratedFiles();
}
