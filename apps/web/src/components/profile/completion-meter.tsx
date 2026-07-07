import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';

/**
 * Profile completion meter (Phase 4.5 §4). OWNER-ONLY — the page renders it
 * only on the member's own profile; it is a nudge, never a public score.
 *
 * Fields (per spec): displayName, bio, location, skills, lanes, links,
 * avatar. Equal weight; the hint points at the FIRST missing field (avatar
 * leads — media identity is the Phase 4.5 activation goal).
 */

export interface CompletionInput {
  displayName: string | null | undefined;
  bio: string | null | undefined;
  hasLocation: boolean;
  skillsCount: number;
  lanesCount: number;
  linksCount: number;
  hasAvatar: boolean;
}

interface FieldCheck {
  filled: boolean;
  hintKey: MessageKey;
}

function checks(input: CompletionInput): FieldCheck[] {
  return [
    { filled: input.hasAvatar, hintKey: 'profile.completionNextAvatar' as MessageKey },
    {
      filled: Boolean(input.displayName?.trim()),
      hintKey: 'profile.completionNextName' as MessageKey,
    },
    { filled: Boolean(input.bio?.trim()), hintKey: 'profile.completionNextBio' as MessageKey },
    { filled: input.hasLocation, hintKey: 'profile.completionNextLocation' as MessageKey },
    { filled: input.skillsCount > 0, hintKey: 'profile.completionNextSkills' as MessageKey },
    { filled: input.lanesCount > 0, hintKey: 'profile.completionNextLanes' as MessageKey },
    { filled: input.linksCount > 0, hintKey: 'profile.completionNextLinks' as MessageKey },
  ];
}

export async function CompletionMeter({ input }: { input: CompletionInput }) {
  const t = await getT();

  const fields = checks(input);
  const filled = fields.filter((field) => field.filled).length;
  const percent = Math.round((filled / fields.length) * 100);
  const next = fields.find((field) => !field.filled);

  return (
    <section className="xidig-completion" aria-label={t('profile.completionTitle')}>
      <p className="xidig-completion__row">
        <span className="xidig-completion__title">{t('profile.completionTitle')}</span>
        <span className="xidig-completion__percent">
          {t('profile.completionPercent', { percent })}
        </span>
      </p>
      <div
        className="xidig-completion__bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('profile.completionTitle')}
      >
        <div className="xidig-completion__fill" style={{ width: `${percent}%` }} />
      </div>
      {next ? (
        <p className="xidig-card__meta">
          <Link href="/settings/profile">{t(next.hintKey)} →</Link>
        </p>
      ) : (
        <p className="xidig-card__meta">{t('profile.completionDone')}</p>
      )}
    </section>
  );
}
