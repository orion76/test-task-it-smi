/**
 * `renderFile` assembles a generated file and keeps it inside the line limit the project lints at;
 * `escape` makes a description survive as a single-quoted TypeScript string. Both are shared by the
 * two renderers, so a defect here shows up as an unreadable artifact or a broken generated file,
 * not as a wrong API.
 */
import { HEADER, LINE_LIMIT } from '@generators/graphql/constants.mts';
import {
  escape,
  renderFile,
} from '@generators/graphql/render.utils.mts';
import type { IRenderedBlock } from '@generators/graphql/types.mts';

function block(
  className: string,
  targets: string[] = [],
  text = `export class ${className} {}`,
): IRenderedBlock {
  return { text, className, targets };
}

describe('escape', () => {
  it('escapes the single quote and the backslash of a description', () => {
    expect(escape("owner's profile")).toBe("owner\\'s profile");
    expect(escape('C:\\path')).toBe('C:\\\\path');
    expect(escape("a\\b'c")).toBe("a\\\\b\\'c");
  });

  it('renders a value that is not a string', () => {
    expect(escape(42)).toBe('42');
    expect(escape(null)).toBe('null');
    expect(escape(undefined)).toBe('undefined');
  });
});

describe('renderFile', () => {
  it('starts with the header and separates the blocks with a blank line', () => {
    const source = renderFile([], [block('Alpha', ['Profile'], 'class Alpha {}')], 'LIST');

    expect(source.startsWith(HEADER)).toBe(true);
    expect(source).toContain('class Alpha {}\n\n/** Registered as one list by `GraphqlApiModule`. */');
    expect(source.endsWith('\n')).toBe(true);
    expect(source.endsWith('\n\n')).toBe(false);
  });

  it('keeps the entity import on one line while it fits', () => {
    const source = renderFile([], [block('Alpha', ['Profile'])], 'LIST');
    const importLine = "import { Profile } from '../entities';";

    expect(importLine.length).toBeLessThanOrEqual(LINE_LIMIT);
    expect(source).toContain(`${importLine}\n`);
  });

  it('wraps a long entity import one name per line', () => {
    const targets = [
      'AchievementRecord',
      'BusinessCardProfile',
      'CertificationRecord',
      'EducationRecord',
      'EmploymentExperience',
      'LanguageProficiency',
    ];
    const source = renderFile([], [block('Alpha', targets)], 'LIST');

    expect(source).toContain(
      [
        'import {',
        ...targets.map((target) => `  ${target},`),
        "} from '../entities';",
      ].join('\n'),
    );
  });

  it('registers every class once and sorts the targets of the import', () => {
    const source = renderFile(
      [],
      [block('Second', ['Skill', 'Profile']), block('First', ['Profile', 'Experience'])],
      'LIST',
    );

    expect(source).toContain(
      "import { Experience, Profile, Skill } from '../entities';",
    );
    expect(source).toContain('export const LIST = [Second, First];');
  });

  it('keeps the registration list on one line while it fits', () => {
    const source = renderFile([], [block('Alpha'), block('Beta')], 'LIST');

    expect(source).toContain('export const LIST = [Alpha, Beta];');
  });

  it('wraps a long registration list one class per line', () => {
    const names = [
      'BusinessCardProfileRelationsResolver',
      'EmploymentExperienceRelationsResolver',
      'LanguageProficiencyRelationsResolver',
    ];
    const source = renderFile([], names.map((name) => block(name)), 'REGISTRY');

    expect(source).toContain(
      ['export const REGISTRY = [', ...names.map((name) => `  ${name},`), '];'].join('\n'),
    );
  });

  it('puts the imports before the blocks and the registration list last', () => {
    const source = renderFile(
      ["import { Inject } from '@nestjs/common';"],
      [block('Alpha', ['Profile'])],
      'LIST',
    );

    expect(source.indexOf('@nestjs/common')).toBeLessThan(source.indexOf('export class Alpha'));
    expect(source.indexOf('export class Alpha')).toBeLessThan(source.indexOf('export const LIST'));
  });

  it('renders the same file for the same input', () => {
    const blocks = [block('Alpha', ['Profile']), block('Beta', ['Skill'])];

    expect(renderFile([], blocks, 'LIST')).toBe(renderFile([], blocks, 'LIST'));
  });
});
