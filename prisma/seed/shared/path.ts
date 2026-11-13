import { relative, resolve } from 'node:path';

import type { ErrorObject } from 'ajv';

/**
 * Path as it appears in diagnostics: relative to the working directory when possible,
 * e.g. `data/profile.yml` instead of `/app/data/profile.yml`.
 */
export function toDisplayPath(filePath: string): string {
  const absolutePath = resolve(filePath);

  return relative(process.cwd(), absolutePath) || absolutePath;
}

/**
 * Location inside the data file, built from its path segments: `profile.<collection>[0].<property>`,
 * or `root` for the document itself. Collections are indexed with brackets, the rest is joined with
 * dots. The file path is added by the caller.
 */
export function formatPath(segments: string[]): string {
  if (segments.length === 0) {
    return 'root';
  }

  const [head, ...tail] = segments;

  return tail.reduce(
    (accumulator, segment) =>
      /^\d+$/.test(segment) ? `${accumulator}[${segment}]` : `${accumulator}.${segment}`,
    head,
  );
}

/**
 * Location of an AJV violation as path segments. `required` and `additionalProperties` point at the
 * parent object, so the offending key is appended: the message stays anchored at the property that
 * has to be fixed.
 */
export function errorSegments(error: ErrorObject): string[] {
  const segments = error.instancePath === '' ? [] : error.instancePath.slice(1).split('/');
  const params = error.params as Record<string, unknown>;

  const decoded = segments.map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  if (error.keyword === 'required') {
    decoded.push(String(params.missingProperty));
  }

  if (error.keyword === 'additionalProperties') {
    decoded.push(String(params.additionalProperty));
  }

  return decoded;
}
