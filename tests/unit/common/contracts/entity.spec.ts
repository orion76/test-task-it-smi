/**
 * `entityNameOf` is the mapping from a model name to the name of its Prisma client delegate and the
 * `type` value of a row: `SocialLink` → `socialLink`. The same spelling is used by the schema, the
 * client and the `references` block of the contract, so one value describes a table everywhere, and
 * a wrong mapping would split the name of a table across the layers.
 *
 * `columnOf` is the only place a row is read by a column name that comes from the contract: the
 * server declares no fields of an entity, so every other layer sees `id` and `type` only.
 */
import { columnOf, entityNameOf } from '@src/common/contracts/entity';
import type { IEntity } from '@src/common/contracts/types';

/** Fixture row of `skill`: a column the contract names and no other. */
interface ISkillRow extends IEntity {
  readonly profileId?: string | number;
}

const SKILL: ISkillRow = { id: 'skill-1', type: 'skill', profileId: 'profile-1' };

describe('entityNameOf', () => {
  it('lower-cases the first letter of a model name', () => {
    expect(entityNameOf('SocialLink')).toBe('socialLink');
    expect(entityNameOf('Profile')).toBe('profile');
    expect(entityNameOf('Experience')).toBe('experience');
    expect(entityNameOf('Skill')).toBe('skill');
    expect(entityNameOf('Project')).toBe('project');
  });

  it('keeps a one-letter name intact in meaning', () => {
    expect(entityNameOf('X')).toBe('x');
  });

  it('leaves the rest of the name untouched', () => {
    expect(entityNameOf('SocialLinkType')).toBe('socialLinkType');
    expect(entityNameOf('item')).toBe('item');
  });
});

describe('columnOf', () => {
  it('reads a column by the name the contract declares', () => {
    expect(columnOf(SKILL, 'profileId')).toBe('profile-1');
    expect(columnOf(SKILL, 'id')).toBe('skill-1');
    expect(columnOf(SKILL, 'type')).toBe('skill');
  });

  it('answers undefined for a column the row does not have', () => {
    expect(columnOf(SKILL, 'ghost')).toBeUndefined();
    expect(columnOf(SKILL, 'nmae')).toBeUndefined();
  });
});
