import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatDate, type MessageKey } from '@xidig/i18n';

import type { ProfileView } from '@/lib/profile-view';
import { getLocale, getT } from '@/lib/locale';

/**
 * Profile display (§10 fields, §14 badges/verification, §13 contact choices).
 * Async server component — shared by /profile, /u/[handle] (member view) and
 * the login-free share variant (§28). The viewer class decides how much
 * contact surface renders:
 *  - owner/member: links + the contact channels the member chose to show
 *  - anon: no channels; a sign-in CTA instead (top-of-funnel, §28)
 * `actions` is a slot for viewer-specific buttons (follow/edit/share).
 */

const BADGE_KEYS: Record<string, MessageKey> = {
  'founding-member': 'profile.badgeFoundingMember',
  'lab-lead': 'profile.badgeLabLead',
  'top-helper': 'profile.badgeTopHelper',
  'early-backer': 'profile.badgeEarlyBacker',
  'mentor-in-residence': 'profile.badgeMentorInResidence',
  'identity-verified': 'profile.badgeIdentityVerified',
  'community-verified': 'profile.badgeCommunityVerified',
  'verified-business': 'profile.badgeVerifiedBusiness',
};

const VERIFICATION_KEYS: Record<string, MessageKey> = {
  unverified: 'profile.verifStatusUnverified',
  pending: 'profile.verifStatusPending',
  community_verified: 'profile.verifStatusCommunity',
  identity_verified: 'profile.verifStatusIdentity',
};

interface LinkRow {
  label: string;
  url: string;
}

function asLinkRows(value: unknown): LinkRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is LinkRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as LinkRow).label === 'string' &&
      typeof (row as LinkRow).url === 'string',
  );
}

function asContactEntries(value: unknown): Array<[string, string]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
  );
}

function contactHref(channel: string, value: string): string | null {
  if (channel === 'whatsapp') {
    const digits = value.replace(/[^0-9]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (channel === 'email') return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (channel === 'website') return `https://${value}`;
  return null;
}

export async function ProfileViewCard({
  view,
  viewer,
  actions,
}: {
  view: ProfileView;
  viewer: 'owner' | 'member' | 'anon';
  actions?: ReactNode;
}) {
  const t = await getT();
  const locale = await getLocale();
  const { profile, badges, counts } = view;

  const verificationKey = VERIFICATION_KEYS[profile.verification_status];
  const links = viewer === 'anon' ? [] : asLinkRows(profile.links);
  const contacts = viewer === 'anon' ? [] : asContactEntries(profile.contact_options);

  return (
    <article className="xidig-profile">
      <header className="xidig-profile__header">
        <h1 className="xidig-auth__title">{profile.display_name}</h1>
        <span className="xidig-profile__handle">@{profile.handle}</span>
        {verificationKey && profile.verification_status !== 'unverified' ? (
          <span className="xidig-tag xidig-tag--ok">{t(verificationKey)}</span>
        ) : null}
      </header>

      <p className="xidig-profile__counts">
        <span>{t('profile.followersCount', { count: counts.followers })}</span>
        <span>{t('profile.vouchesCount', { count: counts.vouches })}</span>
        <span>
          {t('profile.memberSince', { date: formatDate(new Date(profile.created_at), locale) })}
        </span>
      </p>

      {actions ? <div className="xidig-profile__actions">{actions}</div> : null}

      {badges.length > 0 ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('profile.badgesSection')}</h2>
          <ul className="xidig-chip-row">
            {badges.map((badge) => {
              const slug = badge.badge_definitions?.slug ?? '';
              const key = BADGE_KEYS[slug];
              return (
                <li key={badge.badge_id} className="xidig-tag">
                  {key ? t(key) : (badge.badge_definitions?.name ?? slug)}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {profile.bio ? <p className="xidig-card__body">{profile.bio}</p> : null}

      {profile.location_city || profile.location_country ? (
        <p className="xidig-card__meta">
          {[profile.location_city, profile.location_country].filter(Boolean).join(', ')}
        </p>
      ) : null}

      {profile.skills.length > 0 ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('profile.skillsLabel')}</h2>
          <ul className="xidig-chip-row">
            {profile.skills.map((skill) => (
              <li key={skill} className="xidig-tag">
                {skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.lanes.length > 0 ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('profile.lanesLabel')}</h2>
          <ul className="xidig-chip-row">
            {profile.lanes.map((lane) => (
              <li key={lane} className="xidig-tag">
                {lane}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {viewer === 'anon' ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('profile.contactSection')}</h2>
          <p className="xidig-card__meta">{t('profile.signInToContact')}</p>
          <Link href="/signin" className="xidig-button xidig-button--secondary">
            {t('action.signIn')} →
          </Link>
        </section>
      ) : links.length > 0 || contacts.length > 0 ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('profile.contactSection')}</h2>
          <ul className="xidig-invite-list">
            {contacts.map(([channel, value]) => {
              const href = contactHref(channel, value);
              return (
                <li key={channel} className="xidig-invite-list__item">
                  <span>{channel}</span>
                  {href ? (
                    <a href={href} rel="noopener noreferrer" target="_blank">
                      {value}
                    </a>
                  ) : (
                    <span>{value}</span>
                  )}
                </li>
              );
            })}
            {links.map((link) => (
              <li key={link.url} className="xidig-invite-list__item">
                <span>{link.label}</span>
                <a href={link.url} rel="noopener noreferrer" target="_blank">
                  {link.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
