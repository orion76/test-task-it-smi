/**
 * `stripUnusedImports` is the cleanup of the generated `prisma-nestjs-graphql` sources: the
 * generator imports the type of every field, including the ones hidden with `@HideField()`, and the
 * build fails on an unused import because `noUnusedLocals` is on. The function is a pure transform
 * of a source string (the walk over the output directory belongs to `post-generate.mts`), so the
 * spec feeds it strings.
 */
import { stripUnusedImports } from '@scripts/imports.cleaner.mts';

/** Header of a generated entity file, with an import that may be used or not. */
function source(importLine: string, body: string): string {
  return `${importLine}\n${body}`;
}

describe('stripUnusedImports', () => {
  it('removes an import nothing in the file uses', () => {
    const input = source("import { Int } from '@nestjs/graphql';", 'export class SocialLink {}\n');

    const { cleaned, changed } = stripUnusedImports(input);

    expect(changed).toBe(true);
    // The import line is removed, but its newline remains at the head of the file.
    expect(cleaned).toBe('\nexport class SocialLink {}\n');
    expect(cleaned).not.toContain('Int');
  });

  it('shrinks an import to the names that are actually used', () => {
    const input = source(
      "import { Int, Field } from '@nestjs/graphql';",
      '@Field()\nexport class SocialLink {}\n',
    );

    const { cleaned, changed } = stripUnusedImports(input);

    expect(changed).toBe(true);
    expect(cleaned).toContain("import { Field } from '@nestjs/graphql';");
    expect(cleaned).not.toContain('Int');
  });

  it('keeps an import whose names are all used and reports no change', () => {
    const input = source(
      "import { ObjectType } from '@nestjs/graphql';",
      '@ObjectType()\nexport class SocialLink {}\n',
    );

    expect(stripUnusedImports(input)).toEqual({ cleaned: input, changed: false });
  });

  it('keeps the type keyword when a type import is shrunk', () => {
    const input = source(
      "import type { Int, Entity } from './types';",
      'const id: Int = 1;\n',
    );

    const { cleaned, changed } = stripUnusedImports(input);

    expect(changed).toBe(true);
    expect(cleaned).toBe("import type { Int } from './types';\nconst id: Int = 1;\n");
  });

  it('does not mistake a longer identifier for a use of the import', () => {
    const input = source(
      "import { Field } from '@nestjs/graphql';",
      'const fieldName = "x";\n',
    );

    const { cleaned, changed } = stripUnusedImports(input);

    expect(changed).toBe(true);
    expect(cleaned).not.toContain('Field');
  });

  it('counts a standalone occurrence of the name as a use', () => {
    const input = source(
      "import { Field } from '@nestjs/graphql';",
      'const f = Field;\n',
    );

    expect(stripUnusedImports(input)).toEqual({ cleaned: input, changed: false });
  });

  it('cleans every import of the file on its own', () => {
    const input = [
      "import { Int } from '@nestjs/graphql';",
      "import { ObjectType, Field } from '@nestjs/graphql';",
      '@ObjectType()',
      'export class SocialLink { id: number = 0 }',
      '',
    ].join('\n');

    const { cleaned, changed } = stripUnusedImports(input);

    expect(changed).toBe(true);
    expect(cleaned).toBe([
      '',
      "import { ObjectType } from '@nestjs/graphql';",
      '@ObjectType()',
      'export class SocialLink { id: number = 0 }',
      '',
    ].join('\n'));
    expect(cleaned).not.toContain('Int');
  });
});
