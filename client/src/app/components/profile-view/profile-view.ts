import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatDate, groupSkills } from '../profile.mapper';
import type { IProfileCard, IProfileDetails, IProfileExperience, IProfileView } from '../types';

/**
 * Readable view of the profile: it renders only when the response holds a profile and it does not
 * replace the JSON block — both are shown, one after the other.
 */
@Component({
  selector: 'app-profile-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'profile-view.html',
})
export class ProfileView implements IProfileView {
  readonly profiles = input.required<IProfileDetails[]>();

  readonly cards = computed<IProfileCard[]>(() =>
    this.profiles().map((profile) => ({ profile, skillGroups: groupSkills(profile.skills) })),
  );

  /** Period of a job: an open one has no end date, a finished one shows `endedAt`. */
  formatPeriod(item: IProfileExperience): string {
    const startedAt = formatDate(item.startedAt);
    if (!item.finished || item.endedAt === null) {
      return `${startedAt} — по сей день`;
    }
    return `${startedAt} — ${formatDate(item.endedAt)}`;
  }
}
