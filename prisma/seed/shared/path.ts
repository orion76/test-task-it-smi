import { relative, resolve } from 'node:path';

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
