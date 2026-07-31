'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ContentSourceBadge } from '@/components/content-source-badge';
import { Avatar } from '@/components/media/avatar';
import { apiPost } from '@/lib/api-client';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { LabView, ViewerRelation } from '@/lib/labs/views';
import { CHROME_KEYS, STAGE_KEYS, STAGE_ORDER } from '@/lib/labs/labels';
import { toast } from '@/lib/toast';

/**
 * Directory summary card for a Space (§16): icon (initials disc fallback —
 * Spaces have names not handles, so the slug seeds the deterministic color),
 * name, dynamic Warshad/Koox chrome, the four-stage venture stepper, activity
 * line (members · updated + facepile when the roster is visible), one-liner,
 * "looking for" skills, sprint countdown / dormant badge, and a Join/View CTA.
 * The whole card is clickable (stretched title link); the CTA floats above it.
 * Chrome swaps purely off space_mode. The icon follows the Lite smallAvatars
 * rule (§22): thumb (<8KB) when allowed, 0-byte initials otherwise.
 */
export function LabCard({ view, prefs }: { view: LabView; prefs?: LitePrefs | undefined }) {
  const t = useT();
  const { locale } = useLocale();
  const { lab } = view;

  const currentStage = STAGE_ORDER.indexOf(lab.stage);

  return (
    <article className="xidig-card xidig-lab-card">
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
          <Link href={`/labs/${lab.slug}`} className="xidig-lab-card__link">
            {lab.name}
          </Link>
        </h3>
        <span className="xidig-badge">{t(CHROME_KEYS[view.kind])}</span>
        {/* §21 provenance chip — renders nothing for member-created Spaces. */}
        <ContentSourceBadge source={lab.source} />
      </div>

      {lab.short_description ? <p className="xidig-card__body">{lab.short_description}</p> : null}

      {/* All four §16 stages, honest position — never a trimmed track. */}
      <ol className="xidig-stage-track" aria-label={t('lab.stageTrack')}>
        {STAGE_ORDER.map((stage, index) => {
          const state = index < currentStage ? 'done' : index === currentStage ? 'current' : 'ahead';
          return (
            <li
              key={stage}
              className={`xidig-stage-track__step xidig-stage-track__step--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="xidig-stage-track__dot" aria-hidden="true" />
              <span className="xidig-stage-track__label">{t(STAGE_KEYS[stage])}</span>
            </li>
          );
        })}
      </ol>

      <div className="xidig-lab-card__activity">
        {view.memberPreview.length > 0 ? (
          // Decorative for AT — the member-count text is the accessible
          // signal (reading four names per card is noise, not information).
          <span className="xidig-facepile" aria-hidden="true">
            {view.memberPreview.map((member) => (
              <Avatar
                key={member.user_id}
                name={member.display_name}
                handle={member.handle}
                src={member.avatar_thumb_url}
                blurhash={member.avatar_blurhash}
                size={24}
                prefs={prefs}
              />
            ))}
          </span>
        ) : null}
        <p className="xidig-card__meta">
          <span>{t('lab.memberCount', { count: view.memberCount })}</span>
          {' · '}
          <span>
            {t('lab.updatedAgo', {
              when: formatRelativeTime(new Date(lab.last_activity_at), locale),
            })}
          </span>
          {view.lead ? (
            <>
              {' · '}
              <span>{t('lab.ledBy', { name: view.lead.display_name })}</span>
            </>
          ) : null}
        </p>
        {/* Dormant = credibility signal beside the activity facts, not shame. */}
        {view.isDormant ? (
          <span className="xidig-badge xidig-badge--muted">{t('lab.badgeDormant')}</span>
        ) : null}
      </div>

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

      <div className="xidig-lab-card__actions">
        <CardCta view={view} />
      </div>
    </article>
  );
}

/**
 * Card CTA off viewerRelation × join_mode (same branch table as
 * MembershipActions on the Space page): none+open → Join (POST, optimistic),
 * none+request → Request, none+invite → View, requested → pending, any
 * member/lead → View. Never shows Join on an invite-only Space.
 */
function CardCta({ view }: { view: LabView }) {
  const t = useT();
  const [relation, setRelation] = useState<ViewerRelation>(view.viewerRelation);
  const [pending, setPending] = useState(false);

  if (relation === 'none' && view.lab.join_mode !== 'invite') {
    const open = view.lab.join_mode === 'open';
    return (
      <button
        type="button"
        className="xidig-button xidig-button--primary"
        disabled={pending}
        onClick={(event) => {
          // The stretched link makes the card one big target — the CTA must
          // never fall through to navigation.
          event.stopPropagation();
          setPending(true);
          apiPost(`/api/labs/${view.lab.id}/members`, { action: 'join' })
            .then(() => {
              setRelation(open ? 'member' : 'requested');
              toast(open ? 'lab.joinedToast' : 'lab.noticeJoinRequested');
            })
            .catch(() => toast('state.errorTitle'))
            .finally(() => setPending(false));
        }}
      >
        {open ? t('lab.actionJoin') : t('lab.actionRequestJoin')}
      </button>
    );
  }

  if (relation === 'requested') {
    return (
      <button type="button" className="xidig-button xidig-button--secondary" disabled>
        {t('lab.actionRequested')}
      </button>
    );
  }

  return (
    <Link href={`/labs/${view.lab.slug}`} className="xidig-button xidig-button--secondary">
      {t('lab.actionView')}
    </Link>
  );
}
