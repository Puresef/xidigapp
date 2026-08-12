import Link from 'next/link';
import type { ReactNode } from 'react';

import { MediaSlot } from '@/components/media/media-slot';
import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaLink } from '@/lib/aniga/view';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Bogagga dibadda — the three-tier Xaqiiq ladder (spec §3.3, state v6).
 *
 *   Tier 1  chip           always, for every link
 *   Tier 2  OG preview     only when og_status = 'ok'
 *   Tier 3  verified check only after a completed link-back check
 *
 * The tiers are strictly additive, and that is the whole design: a link the
 * platform could not fetch and a link the platform could not verify BOTH fall
 * back to the tier below without leaving a hole. So the failure paths render
 * NOTHING — no skeleton that collapses, no "preview unavailable" box, no
 * reserved height (A6). The chip was never a placeholder waiting for a card;
 * it is the complete tier-1 answer, and the card is a bonus that either
 * arrives or doesn't.
 *
 * Tier 3 is the only orange on this surface and it is legal orange: a
 * link-back check is identity verification of a page, granted by the server
 * after fetching that page — never by the member asserting it.
 */

/**
 * Where the module is mounted. The frames give the desktop rail (10b/10d) a
 * different visitor sentence and a ladder explainer the mobile column does not
 * get, and translated copy cannot be swapped by a media query — so the caller
 * says which surface this is.
 */
export type LinksPlacement = 'column' | 'rail';

/**
 * OG images are re-hosted into our own bucket at preview size, so this is an
 * order-of-magnitude estimate rather than a guess at a third party's payload.
 * It is still an estimate: `profile_link_meta` stores the path, not the bytes.
 */
const OG_THUMB_EST_BYTES = 45_000;

function GlobeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2M12 3.4c2.6 2.3 4 5.3 4 8.6s-1.4 6.3-4 8.6c-2.6-2.3-4-5.3-4-8.6s1.4-6.3 4-8.6Z" />
    </svg>
  );
}

/** Pending REPLACES the globe rather than sitting beside it — the chip says
 *  "being checked", not "a web page that is also being checked". */
function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.3 1.9" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="8"
      height="8"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/**
 * `profile_link_meta.url_key` is the normalized form — scheme-less, host
 * lowercased — so everything before the first slash is the host. Deriving the
 * source line from the key rather than re-parsing `url` keeps what the member
 * reads identical to the string the verification check was keyed on.
 */
function linkHost(link: AnigaLink): string {
  const host = link.urlKey.split('/')[0];
  return host && host.length > 0 ? host : link.label;
}

export interface LinksModuleProps {
  links: readonly AnigaLink[];
  viewer: ModuleCardProps['viewer'];
  /** Where the owner goes to add or edit a link. */
  addHref: string;
  placement?: LinksPlacement;
  /** Viewer Lite prefs (§22) — OG thumbs ride MediaSlot like every other image. */
  prefs: LitePrefs;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function LinksModule({
  links,
  viewer,
  addHref,
  placement = 'column',
  prefs,
  visibilityToggle,
}: LinksModuleProps) {
  const isOwner = viewer === 'owner';

  // A visitor gets no empty state: the module simply isn't there, the same
  // rule the rest of the set follows. The owner keeps the card because the
  // "+ Ku dar" affordance needs somewhere to live.
  if (links.length === 0 && !isOwner) return null;

  const t = await getT();
  const verified = links.find((link) => link.verificationStatus === 'verified');

  // Tier 2 is decided per link, not per module — `ogStatus` lives on the row.
  // Built as an array FIRST so an empty result renders nothing at all: mapping
  // over an empty array inside a wrapper would still ship the wrapper's box.
  const previews = links.filter(
    (link) => link.ogStatus === 'ok' && link.ogTitle !== null && link.ogTitle !== '',
  );

  const verifiedTitle = t('profile.linkVerifiedTitle');

  // Owner copy explains where the badge came from once one exists, and how to
  // earn one while none does. Visitor copy names the verified site, so with
  // nothing verified there is nothing honest to say and the note is dropped.
  const footnote = isOwner
    ? verified
      ? t('profile.linksOwnerNote')
      : t('profile.linkAddVerification')
    : verified
      ? t(placement === 'rail' ? 'profile.linksVisitorNoteLong' : 'profile.linksVisitorNote', {
          site: verified.label,
        })
      : null;

  return (
    <ModuleCard
      moduleId="links"
      titleKey={ANIGA_MODULE_TITLE_KEYS.links}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      footnote={footnote}
    >
      <div className="xidig-alinks__chips">
        {links.map((link) => {
          const pending = link.verificationStatus === 'pending';
          const className = `xidig-tag xidig-alinks__chip${
            pending ? ' xidig-alinks__chip--pending' : ''
          }`;
          const body = (
            <>
              {pending ? <ClockGlyph /> : <GlobeGlyph />}
              {link.label}
              {pending ? (
                <span className="xidig-alinks__pending">{t('profile.linkPending')}</span>
              ) : null}
              {link.verificationStatus === 'verified' ? (
                // The disc carries the claim on its own, so it names itself —
                // `title` alone is a hover affordance, not an accessible name.
                <span
                  className="xidig-alinks__check"
                  role="img"
                  aria-label={verifiedTitle}
                  title={verifiedTitle}
                >
                  <CheckGlyph />
                </span>
              ) : null}
            </>
          );

          // Tier 1 is a destination for visitors and a label for the owner: on
          // your own profile the chip is something you edit, and the editor is
          // one control below rather than thirteen tiny ones.
          return isOwner ? (
            <span key={link.urlKey} className={className}>
              {body}
            </span>
          ) : (
            <a
              key={link.urlKey}
              className={className}
              href={link.url}
              // Member-supplied outbound links on a public page: ugc + nofollow
              // so an unverified link can never be farmed for rank.
              rel="nofollow ugc noopener noreferrer"
              target="_blank"
            >
              {body}
            </a>
          );
        })}
        {isOwner ? (
          <Link className="xidig-tag xidig-alinks__add" href={addHref}>
            <PlusGlyph />
            {t('action.add')}
          </Link>
        ) : null}
      </div>

      {previews.map((link) => (
        // Deliberately not an anchor: the chip above is the link, and wrapping
        // this would nest MediaSlot's "Muuji" button inside one.
        <div key={link.urlKey} className="xidig-alinks__preview">
          {link.ogImageUrl ? (
            <MediaSlot
              kind="image"
              src={link.ogImageUrl}
              alt={link.ogTitle ?? link.label}
              estBytes={OG_THUMB_EST_BYTES}
              prefs={prefs}
              className="xidig-alinks__thumb"
              width={640}
              height={400}
            />
          ) : null}
          <span className="xidig-alinks__preview-text">
            <span className="xidig-alinks__preview-title">{link.ogTitle}</span>
            <span className="xidig-alinks__preview-source">
              {link.ogSiteName ?? linkHost(link)}
            </span>
          </span>
        </div>
      ))}

      {placement === 'rail' && !isOwner ? (
        <div className="xidig-alinks__ladder">
          <h3 className="xidig-alinks__ladder-title">{t('profile.linksLadderTitle')}</h3>
          <p className="xidig-alinks__ladder-note">{t('profile.linksLadderNote')}</p>
        </div>
      ) : null}
    </ModuleCard>
  );
}

export default LinksModule;
