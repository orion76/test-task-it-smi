import type { UOperationName } from '../types';

/** One selectable operation of the panel: a preset of the contract or the free-form mode. */
export interface IPreset {
  name: UOperationName;
  label: string;
  hint: string;
  query: string;
}

/** One `links` item of the profile. */
export interface IProfileLink {
  id: string;
  label: string;
  url: string;
  kind: string;
}

/** One `skills` item of the profile. */
export interface IProfileSkill {
  id: string;
  name: string;
  category: string | null;
}

/** One `experience` item of the profile. */
export interface IProfileExperience {
  id: string;
  company: string;
  position: string;
  startedAt: string;
  endedAt: string | null;
  finished: boolean;
  achievements: string[];
}

/** One `projects` item of the profile. */
export interface IProfileProject {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
}

/**
 * Readable view of a profile. It is a copy of the response, not a copy of the contract: the API
 * publishes fields as strings and the view only adds formatting, so the schema stays the single
 * source of truth.
 */
export interface IProfileDetails {
  id: string;
  name: string;
  description: string;
  links: IProfileLink[];
  skills: IProfileSkill[];
  experience: IProfileExperience[];
  projects: IProfileProject[];
}

/** Skills grouped by their category for display. */
export interface ISkillGroup {
  category: string;
  names: string[];
}

/** One profile with the skills already grouped: what the template iterates over. */
export interface IProfileCard {
  profile: IProfileDetails;
  skillGroups: ISkillGroup[];
}
