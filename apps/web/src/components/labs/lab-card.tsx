'use client';

import Link from 'next/link';

import { useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { LabView } from '@/lib/labs/views';
import { CHROME_KEYS, STAGE_KEYS } from '@/lib/labs/labels';

/**
 * Directory summary card for a Space (§16): icon (initials disc fallback —
 * Spaces have names not handles, so the slug seeds the deterministic color),
 * name, dynamic Warshad/Koox chrome, stage, member count, one-liner,
 * "looking for" skills, and the sprint countdown / dormant badge. Chrome
 * swaps purely off space_mode. The icon follows the Lite smallAvatars rule
 * (§22): thumb (<8KB) when allowed, 0-byte initials otherwise.
 */
export function LabCard({ view, prefs }: { view: LabView; prefs?: LitePrefs | undefined }) {
  const t = useT();
  const { lab } = view;

  return (
    <article className="xidig-card">
      <div className="xidig-card__header xidig-space-header">
        <Avatar
          name={lab.name}
          handle={lab.slug}
          src={view.media.iconThumbUrl}
          blurhash={view.media.iconBlurhash}
          size={40}
          prefs={prefs}
        />
        <h3 className="xidig-card__title">
          <Link href={`/labs/${lab.slug}`}>{lab.name}</Link>
        </h3>
        <span className="xidig-badge">{t(CHROME_KEYS[view.kind])}</span>
      </div>

      {lab.short_description ? <p className="xidig-card__body">{lab.short_description}</p> : null}

      <p className="xidig-card__meta">
        <span>{t(STAGE_KEYS[lab.stage])}</span>
        {' · '}
        <span>{t('lab.memberCount', { count: view.memberCount })}</span>
        {view.lead ? (
          <>
            {' · '}
            <span>{t('lab.ledBy', { name: view.lead.display_name })}</span>
          </>
        ) : null}
      </p>

      {view.skillNeeds.length > 0 ? (
        <p className="xidig-card__meta">
          {t('lab.lookingFor')}: {view.skillNeeds.map((s) => s.skill).join(', ')}
        </p>
      ) : null}

      {view.sprintDaysLeft !== null ? (
        <p className="xidig-card__meta">
          {view.sprintDaysLeft < 0
            ? t('lab.sprintEnded')
            : t('lab.sprintCountdown', { count: view.sprintDaysLeft })}
        </p>
      ) : null}

      {view.isDormant ? (
        <span className="xidig-badge xidig-badge--muted">{t('lab.badgeDormant')}</span>
      ) : null}
    </article>
  );
}
