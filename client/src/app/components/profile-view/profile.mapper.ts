/**
 * Readable view of the response: the profile is copied field by field instead of being rendered
 * from `unknown` in the template, so the view only adds formatting. Nothing here throws — an
 * unexpected shape yields an empty value and the JSON block of the result panel shows the answer
 * anyway.
 */
import { asJsonArray, asJsonRecords, asOptionalText, asText, isJsonRecord } from '../../json.guard';
import type {
  IProfileDetails,
  IProfileExperience,
  IProfileLink,
  IProfileProject,
  IProfileSkill,
  ISkillGroup,
} from '../types';

/**
 * Pulls readable profiles out of the response: `profile` of the single-profile preset, `profiles`
 * of the page preset. An unexpected shape yields an empty list instead of an exception — the JSON
 * block of the result panel shows the answer anyway.
 */
export function extractProfiles(data: unknown): IProfileDetails[] {
  if (!isJsonRecord(data)) {
    return [];
  }
  if (data.profile !== undefined) {
    const profile = toProfile(data.profile);
    return profile === null ? [] : [profile];
  }
  return asJsonRecords(data.profiles).flatMap((entry) => {
    const profile = toProfile(entry);
    return profile === null ? [] : [profile];
  });
}

/** Groups skills by `category`, keeping the order of the response. */
export function groupSkills(skills: IProfileSkill[]): ISkillGroup[] {
  const groups = new Map<string, string[]>();

  for (const skill of skills) {
    const category = skill.category ?? 'без категории';
    const names = groups.get(category);
    if (names === undefined) {
      groups.set(category, [skill.name]);
      continue;
    }
    names.push(skill.name);
  }

  return [...groups.entries()].map(([category, names]) => ({ category, names }));
}

/** Calendar date of an API instant: the view shows the day, not the time of day. */
export function formatDate(value: string): string {
  return value.slice(0, 10);
}

function toProfile(value: unknown): IProfileDetails | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  return {
    id: asText(value.id),
    name: asText(value.name),
    description: asText(value.description),
    links: asJsonRecords(value.links).map(toLink),
    skills: asJsonRecords(value.skills).map(toSkill),
    experience: asJsonRecords(value.experience).map(toExperience),
    projects: asJsonRecords(value.projects).map(toProject),
  };
}

function toLink(value: Record<string, unknown>): IProfileLink {
  return {
    id: asText(value.id),
    label: asText(value.label),
    url: asText(value.url),
    kind: asText(value.kind),
  };
}

function toSkill(value: Record<string, unknown>): IProfileSkill {
  return {
    id: asText(value.id),
    name: asText(value.name),
    category: asOptionalText(value.category),
  };
}

function toExperience(value: Record<string, unknown>): IProfileExperience {
  return {
    id: asText(value.id),
    company: asText(value.company),
    position: asText(value.position),
    startedAt: asText(value.startedAt),
    endedAt: asOptionalText(value.endedAt),
    finished: value.finished === true,
    achievements: asJsonArray(value.achievements).map(asText),
  };
}

function toProject(value: Record<string, unknown>): IProfileProject {
  return {
    id: asText(value.id),
    name: asText(value.name),
    url: asOptionalText(value.url),
    description: asOptionalText(value.description),
  };
}
