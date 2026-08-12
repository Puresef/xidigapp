import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatDate, type MessageKey } from '@xidig/i18n';

import { Avatar } from '@/components/media/avatar';
import { MediaSlot } from '@/components/media/media-slot';
import { toAnigaBadge, type AnigaBadge, type BadgeClass } from '@/lib/aniga/badges';
import type { AnigaView } from '@/lib/aniga/view';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { ProfileBadge } from '@/lib/profile-view';
import { getLocale, getT } from '@/lib/locale';

import { AnigaModules, type AnigaModulesProps } from './aniga-modules';
import { BadgeChip } from './badge-chip';

/**
 * Aniga v3 — the profile page shell (spec §2, frames 10a/10b/10c/10d).
 *
 * Everything above the modules is FIXED CHROME: cover, avatar, name, headline,
 * badge chips, the caller's action row, bio, the contact row. Everything below
 * is the member's own ordered module column, which `AnigaModules` owns — this
 * file never decides what a module shows, only that the column sits here.
 *
 * It replaces `ProfileViewCard`, and the replacement is the point: that card
 * rendered its own skills section, links list and pinned Spaces, all three of
 * which are now modules. Appending the column beside the card would have
 * double-rendered them, so the chrome had to move rather than grow.
 *
 * What the card owned and this shell CARRIES OVER unchanged:
 *
 *  - the verification chip and its status→key map (§14);
 *  - the AI-account chip (§21);
 *  - the §13 contact row, `contactHref()` and all of it: whatsapp → wa.me
 *    digits, email → mailto, website → https-prefixed; the anon sign-in CTA
 *    (§28 top-of-funnel) in place of channels; and the `viewer === 'anon'`
 *    gate on contacts, which is belt AND braces — the public projection
 *    already omits `contact_options` entirely;
 *  - **tenure** ("member since") for EVERY viewer — a fact about joining, not
 *    a score;
 *  - **follower and vouch counts for the OWNER ONLY** (A1). The absence is
 *    structural: a visitor's DOM carries no count node to un-hide, and the
 *    ordering of the owner's row is preserved exactly as visitor-no-counts
 *    locks it (followers, vouches, tenure).
 *
 * Reputation chips are the one DEVIATION, and it is deliberate: the card
 * showed contribution/helper totals to everyone, but no design frame (5a–5d,
 * 8a–8b, 10a–10d) puts reputation on ANY visitor view. A visitor's evidence
 * surfaces are the helper-history module and endorsement counts — attested by
 * named people — not a platform-computed score. So the chips render for the
 * owner only. The concept is intact, its audience narrowed; awaiting Warya's
 * ruling, which so far covers follower/vouch counts only.
 *
 * Server component: it reads the request locale and translator directly, and
 * the only interactive parts (MediaSlot's defer button, BadgeChip, whatever
 * the caller passes as `actions`) are client components underneath it.
 */

/**
 * The cover a member uploads is a full-bleed banner (1600px source, ~110/150px
 * tall on screen). `profiles.cover_path` denormalizes the path but not the
 * bytes, and `media_uploads` is reachable only by storage_path, which is
 * unindexed — so this is the same order-of-magnitude estimate the Suuq hero
 * uses, one step up for a wider crop. MediaSlot shows it as "~120 KB", and an
 * estimate a viewer can act on beats a scan of a growing table. Lite defers
 * the BYTES, never the tile: the slot still renders, at the right size.
 */
const COVER_EST_BYTES = 120_000;

/** Where the member edits their own profile. §27's canonical href. */
const EDIT_HREF = '/settings/profile';

/** Carried over from ProfileViewCard — `profiles.verification_status` → chip. */
const VERIFICATION_KEYS: Record<string, MessageKey> = {
  unverified: 'profile.verifStatusUnverified',
  pending: 'profile.verifStatusPending',
  community_verified: 'profile.verifStatusCommunity',
  identity_verified: 'profile.verifStatusIdentity',
};

/**
 * The three channels the profile editor writes (§13 — whatsapp / email /
 * website, each individually optional). A channel with no label key renders
 * under its own stored name rather than vanishing: dropping a channel the
 * member deliberately published would be the worse failure, and the key is
 * data, not copy.
 */
const CONTACT_LABEL_KEYS: Record<string, MessageKey> = {
  whatsapp: 'profile.contactWhatsapp',
  email: 'profile.contactEmail',
  website: 'profile.contactWebsiteLabel',
};

const BADGE_CLASSES = new Set<string>(['identity', 'earned', 'tenure', 'role']);

/**
 * The badge CLASS comes from the row, never from a slug match (A9).
 *
 * An unrecognised value falls back to `role` — the one class that can never
 * wear trust orange. Guessing the other way would be worse than useless: the
 * column's DB default is 'earned', so a bad value would paint an unclassified
 * badge orange, which is exactly the failure ruling 10a exists to prevent.
 */
function badgeClassOf(definition: ProfileBadge['badge_definitions']): BadgeClass {
  const raw = definition?.badge_class;
  return typeof raw === 'string' && BADGE_CLASSES.has(raw) ? (raw as BadgeClass) : 'role';
}

/** `user_badges.tier` — Garab's ×N and nothing else. */
function badgeTier(badge: ProfileBadge): string | null {
  return badge.tier !== null && badge.tier !== '' ? badge.tier : null;
}

/** Carried over from ProfileViewCard, unchanged. */
function asContactEntries(value: unknown): Array<[string, string]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
  );
}

/** Carried over from ProfileViewCard, unchanged. */
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

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** Frame glyphs for the contact row — decorative, the chip label carries the meaning. */
function ContactGlyph({ channel }: { channel: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 12,
    height: 12,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  } as const;

  if (channel === 'whatsapp') {
    return (
      <svg {...common}>
        <path d="M6.8 3.6h3l1.5 4.2-2 1.4a12.5 12.5 0 0 0 5.5 5.5l1.4-2 4.2 1.5v3a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 4.8 5.8a2 2 0 0 1 2-2.2Z" />
      </svg>
    );
  }
  if (channel === 'email') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2M12 3.4c2.6 2.3 4 5.3 4 8.6s-1.4 6.3-4 8.6c-2.6-2.3-4-5.3-4-8.6s1.4-6.3 4-8.6Z" />
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16.5 3.9a2.2 2.2 0 0 1 3.1 3.1L8.4 18.2l-4.1 1 1-4.1Z" />
    </svg>
  );
}

export interface AnigaProfileProps {
  view: AnigaView;
  viewer: 'owner' | 'member' | 'anon';
  /** Viewer Lite prefs (§22) — the cover, the avatar and every module image ride them. */
  prefs: LitePrefs;
  /** Viewer-specific buttons (Fariin dir / Raac / Wax ka beddel / share). */
  actions?: ReactNode;
  /** Desktop rail (10b/10d): module manager, Bogagga dibadda, Xogta, report link. */
  rail?: ReactNode;
  /**
   * Additive pass-throughs to the module column. Both are writes against state
   * this shell does not hold — the owner's full ordered module set, and an
   * endorsement written on ANOTHER member's profile — so they belong to the
   * caller that holds them, exactly as `AnigaModules` documents. Omitting them
   * renders the same tree as before they existed.
   */
  visibilityToggles?: AnigaModulesProps['visibilityToggles'];
  endorseAction?: ReactNode;
}

export async function AnigaProfile({
  view,
  viewer,
  prefs,
  actions,
  rail,
  visibilityToggles,
  endorseAction,
}: AnigaProfileProps) {
  const t = await getT();
  const locale = await getLocale();
  const { profile, badges, counts, reputation, media, isAi } = view.base;
  const isOwner = viewer === 'owner';

  const verificationKey = VERIFICATION_KEYS[profile.verification_status];
  // The trust ring and the corner check are the IDENTITY-verified treatment
  // (§4). Community verification is real and keeps its chip, but the ring is
  // the strongest claim this page makes and it stays on the strongest check.
  const identityVerified = profile.verification_status === 'identity_verified';

  // "Injineer software · London" is ONE key with two placeholders: the
  // separator and the word order belong to the locale, not to this file. With
  // one half missing the surviving half stands alone — never a dangling dot.
  const place = profile.location_city ?? profile.location_country;
  const headlineLine =
    view.headline && place
      ? t('profile.headlineCity', { headline: view.headline, city: place })
      : (view.headline ?? place ?? null);

  const chips = badges.flatMap((row): AnigaBadge[] => {
    const definition = row.badge_definitions;
    if (!definition) return [];
    const badge = toAnigaBadge(definition.slug, badgeClassOf(definition), badgeTier(row));
    return badge ? [badge] : [];
  });

  // Belt and braces: the public projection omits contact_options outright, so
  // this gate is what keeps the rule readable at the point it matters.
  const contacts = viewer === 'anon' ? [] : asContactEntries(profile.contact_options);

  return (
    <article className="xidig-aniga">
      {/* No cover, no node — an empty banner is not a design element. */}
      {media.coverUrl ? (
        <MediaSlot
          kind="image"
          src={media.coverUrl}
          thumbSrc={media.coverThumbUrl ?? undefined}
          blurhash={media.coverBlurhash}
          alt={t('profile.coverAlt', { name: profile.display_name })}
          estBytes={COVER_EST_BYTES}
          prefs={prefs}
          className="xidig-aniga__cover"
          width={1600}
          height={600}
        />
      ) : null}

      <div className="xidig-aniga__body">
        <div className="xidig-aniga__main">
          <div className="xidig-aniga__identity">
            <div className="xidig-aniga__ident">
              <span className="xidig-aniga__avatar-wrap">
                <Avatar
                  name={profile.display_name}
                  handle={profile.handle}
                  src={media.avatarThumbUrl}
                  blurhash={media.avatarBlurhash}
                  size={64}
                  prefs={prefs}
                  className={`xidig-aniga__avatar${
                    identityVerified ? ' xidig-aniga__avatar--verified' : ''
                  }`}
                />
                {identityVerified ? (
                  // The ring is CSS, so Lite pays nothing for it (a5); the disc
                  // carries the claim on its own, so it names itself.
                  <span
                    className="xidig-aniga__check"
                    role="img"
                    aria-label={t('profile.verifiedRingAria')}
                    title={t('profile.verifiedRingAria')}
                  >
                    <CheckGlyph size={12} />
                  </span>
                ) : null}
              </span>
              <div className="xidig-aniga__names">
                <h1 className="xidig-aniga__name">{profile.display_name}</h1>
                {headlineLine ? <p className="xidig-aniga__headline">{headlineLine}</p> : null}
                {/* The frames drop the handle; mentions and sharing need it, so
                    it stays as the muted third line rather than disappearing
                    from the one page that is about this member. */}
                <p className="xidig-profile__handle">@{profile.handle}</p>
              </div>
            </div>

            {chips.length > 0 || verificationKey || isAi ? (
              <ul className="xidig-aniga__badges">
                {verificationKey && profile.verification_status !== 'unverified' ? (
                  /* Verified wears the trust treatment; a review still pending
                     is not yet an earned trust moment, so it stays neutral. */
                  <li key="verification">
                    <span
                      className={`xidig-tag${
                        profile.verification_status === 'pending' ? '' : ' xidig-tag--trust'
                      }`}
                    >
                      {t(verificationKey)}
                    </span>
                  </li>
                ) : null}
                {isAi ? (
                  <li key="ai">
                    <span
                      className="xidig-tag xidig-tag--seeded"
                      title={t('content.aiAccountTooltip')}
                    >
                      {t('content.aiAccount')}
                    </span>
                  </li>
                ) : null}
                {chips.map((badge) => (
                  <li key={badge.slug}>
                    <BadgeChip badge={badge} size="chip" />
                  </li>
                ))}
              </ul>
            ) : null}

            {actions ? <div className="xidig-aniga__actions">{actions}</div> : null}
          </div>

          {profile.bio ? <p className="xidig-aniga__bio">{profile.bio}</p> : null}

          {viewer === 'anon' ? (
            /* §28: a logged-out visitor gets no channels — the member picked
               them for members — so they get the reason instead. */
            <section className="xidig-section">
              <h2 className="xidig-section__title">{t('profile.contactSection')}</h2>
              <p className="xidig-card__meta">{t('profile.signInToContact')}</p>
              <Link href="/signin" className="xidig-button xidig-button--secondary">
                {t('action.signIn')}
              </Link>
            </section>
          ) : contacts.length > 0 ? (
            <div className="xidig-chip-row">
              <span className="xidig-card__meta">{t('profile.contactInline')}</span>
              {contacts.map(([channel, value]) => {
                const labelKey = CONTACT_LABEL_KEYS[channel];
                const label = labelKey ? t(labelKey) : channel;
                const href = contactHref(channel, value);
                const className = 'xidig-tag xidig-alinks__chip';
                // The chip is a destination for a visitor and a label for the
                // owner: on your own profile these are the channels you chose
                // to publish, and the one control that matters is the editor.
                // The VALUE never becomes text — the frame shows "WhatsApp",
                // not the number, and the href is the only place it belongs.
                return isOwner || !href ? (
                  <span key={channel} className={className}>
                    <ContactGlyph channel={channel} />
                    {label}
                  </span>
                ) : (
                  <a
                    key={channel}
                    className={className}
                    href={href}
                    rel="nofollow ugc noopener noreferrer"
                    target="_blank"
                  >
                    <ContactGlyph channel={channel} />
                    {label}
                  </a>
                );
              })}
              {isOwner ? (
                <Link
                  className="xidig-icon-button"
                  href={EDIT_HREF}
                  aria-label={t('profile.editContactOptions')}
                  title={t('profile.editContactOptions')}
                >
                  <PencilGlyph />
                </Link>
              ) : null}
            </div>
          ) : null}

          {/*
           * A1. Follower and vouch counts are OWNER-ONLY and the absence is
           * structural: a visitor's DOM carries no count node to read,
           * screen-scrape or un-hide. A profile here shows what someone did,
           * not how many people watched. Tenure stays for everyone — it is a
           * fact about joining, not a popularity score.
           */}
          <p className="xidig-profile__counts">
            {isOwner ? (
              <>
                <span>{t('profile.followersCount', { count: counts.followers })}</span>
                <span>{t('profile.vouchesCount', { count: counts.vouches })}</span>
              </>
            ) : null}
            <span>
              {t('profile.memberSince', { date: formatDate(new Date(profile.created_at), locale) })}
            </span>
          </p>

          {/* Reputation (§14) — owner only. See the file header: no visitor
              frame carries a platform-computed score, and the visitor's
              evidence is attested by people (endorsements, credited help). */}
          {isOwner ? (
            <ul className="xidig-chip-row">
              <li className="xidig-tag">
                {t('reputation.contributionChip', { count: reputation.contribution })}
              </li>
              <li className="xidig-tag">
                {t('reputation.helperChip', { count: reputation.helper })}
              </li>
            </ul>
          ) : null}

          {/* Lanes are still owner-only, but they left this column entirely
              (ruled 11 Aug): they render in the rail's Xogta card, labelled,
              as a <dl> rather than as chips. A ticked-checkbox lane in a
              `.xidig-tag` sat as an adjacent sibling to the reputation chips
              above, in identical markup — and in this product that pill is the
              typography of ATTESTED evidence, so the row quietly claimed a
              stranger had vouched for a self-declaration. See AnigaFacts. */}

          {/* AnigaModules renders `.xidig-aniga__modules` itself — wrapping it
              again would nest two grids and double the column's gap. */}
          <AnigaModules
            view={view}
            viewer={viewer}
            prefs={prefs}
            {...(visibilityToggles ? { visibilityToggles } : {})}
            endorseAction={endorseAction}
          />
        </div>

        {rail ? <div className="xidig-aniga__rail">{rail}</div> : null}
      </div>
    </article>
  );
}

export default AnigaProfile;
