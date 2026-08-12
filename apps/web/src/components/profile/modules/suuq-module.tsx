import Link from 'next/link';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/media/avatar';
import { MediaSlot } from '@/components/media/media-slot';
import { BadgeChip } from '@/components/profile/badge-chip';
import { OpenNowChip } from '@/components/suuq/opening-hours-display';
import { toAnigaBadge } from '@/lib/aniga/badges';
import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Suuq — the member's business, as evidence rather than as an advert
 * (spec §3.9, frames 5b/5d/8b).
 *
 * The card carries two verified things and one unverified one, and keeps them
 * visibly separate: the "Ganacsi Xaqiiqeysan" chip (identity class — the check
 * comes from the §18 verification flow, never from the owner saying so), the
 * member testimonial, and the listing's own self-description.
 *
 * **The testimonial only renders when its customer resolves to a member.** An
 * unattributable quote is marketing copy: nobody can ask the customer, nobody
 * can tell whether the business wrote it. Attribution here is a LINK to a
 * profile, so the reader can go and check — which means a reference we cannot
 * turn into a link is not a weaker testimonial, it is a different thing, and
 * it drops. Silence costs the listing one paragraph; an unverifiable quote
 * costs the surface the reason anyone believes the chip beside it.
 *
 * The chip itself goes through `BadgeChip` rather than a hand-rolled tag, so
 * the glyph and the orange come from the badge canon (ruling 10a) instead of
 * from this file remembering them.
 */

export interface SuuqListingSummary {
  id: string;
  businessName: string;
  /** Localized category name, resolved by the caller from the lookup table. */
  categoryName: string | null;
  city: string | null;
  /** §18 verification — the ONLY source of the trust chip. */
  verified: boolean;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  photoBlurhash: string | null;
  /** Member-authored alt text; the business name is the fallback. */
  photoAlt: string | null;
  photoBytes: number | null;
  /** `business_listings.opening_hours`, read client-side against the viewer's clock. */
  openingHours?: unknown;
}

export interface SuuqTestimonial {
  quote: string;
  /**
   * The customer, resolved to a member. `null` when the reference does not
   * resolve to a linkable profile — the block then does not render.
   */
  customer: { displayName: string; handle: string; avatarUrl: string | null } | null;
}

interface ResolvedTestimonial {
  quote: string;
  customer: NonNullable<SuuqTestimonial['customer']>;
}

/**
 * The acceptance gate. A quote survives only with a customer we can link to:
 * a blank handle is as unresolvable as a missing customer, because both end at
 * a href nobody can follow.
 */
function resolveTestimonial(
  testimonial: SuuqTestimonial | null | undefined,
): ResolvedTestimonial | null {
  if (!testimonial) return null;
  const quote = testimonial.quote.trim();
  const customer = testimonial.customer;
  if (quote === '' || !customer || customer.handle.trim() === '') return null;
  return { quote, customer };
}

export interface SuuqModuleProps {
  /** Null when the member has no listing — the owner then gets the invitation. */
  listing: SuuqListingSummary | null;
  testimonial?: SuuqTestimonial | null | undefined;
  viewer: ModuleCardProps['viewer'];
  prefs: LitePrefs;
  /** Where the owner goes to create a listing. */
  addHref: string;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function SuuqModule({
  listing,
  testimonial,
  viewer,
  prefs,
  addHref,
  visibilityToggle,
}: SuuqModuleProps) {
  const isOwner = viewer === 'owner';
  // No listing is not an empty state for a visitor, it is an absent module —
  // most members do not run a business and a hole would imply they should.
  if (!listing && !isOwner) return null;

  const t = await getT();

  const card = (body: ReactNode) => (
    <ModuleCard
      moduleId="suuq"
      titleKey={ANIGA_MODULE_TITLE_KEYS.suuq}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
    >
      {body}
    </ModuleCard>
  );

  if (!listing) {
    return card(
      <div className="xidig-asuuq__empty">
        <span className="xidig-asuuq__empty-body">{t('profile.suuqEmptyOwn')}</span>
        <Link className="xidig-button xidig-button--secondary" href={addHref}>
          {t('profile.addSuuqListing')}
        </Link>
      </div>,
    );
  }

  const vouched = resolveTestimonial(testimonial);
  // Identity class: the chip wears the canon check and the canon orange.
  const verifiedBadge = listing.verified ? toAnigaBadge('verified-business', 'identity') : null;

  return card(
    <div className="xidig-asuuq">
      {listing.photoUrl ? (
        <MediaSlot
          kind="image"
          className="xidig-asuuq__cover"
          src={listing.photoUrl}
          thumbSrc={listing.photoThumbUrl ?? undefined}
          blurhash={listing.photoBlurhash}
          alt={listing.photoAlt ?? listing.businessName}
          estBytes={listing.photoBytes ?? undefined}
          prefs={prefs}
        />
      ) : null}

      <span className="xidig-asuuq__head">
        <span className="xidig-asuuq__name">{listing.businessName}</span>
        {/* Independent facts on one meta line, joined by the house interpunct.
            "Open now" is computed against the VIEWER's clock, so it stays the
            house client chip rather than a server-rendered claim. */}
        <span className="xidig-asuuq__meta">
          {[listing.categoryName, listing.city].filter(Boolean).join(' · ')}
          <OpenNowChip hours={listing.openingHours} />
        </span>
      </span>

      {verifiedBadge ? (
        <span className="xidig-asuuq__verified">
          <BadgeChip badge={verifiedBadge} />
        </span>
      ) : null}

      {vouched ? (
        <div className="xidig-asuuq__testimonial">
          <span className="xidig-asuuq__testimonial-label">{t('profile.testimonialTitle')}</span>
          <blockquote className="xidig-asuuq__quote">{vouched.quote}</blockquote>
          {/* The attribution IS the link — that is what makes the quote
              checkable, and why an unlinkable customer takes the block with it. */}
          <Link href={`/u/${vouched.customer.handle}`} className="xidig-asuuq__customer">
            <Avatar
              name={vouched.customer.displayName}
              handle={vouched.customer.handle}
              src={vouched.customer.avatarUrl}
              size={18}
              prefs={prefs}
              className="xidig-asuuq__customer-avatar"
            />
            {t('profile.testimonialBy', { name: vouched.customer.displayName })}
          </Link>
        </div>
      ) : null}

      <Link
        className="xidig-button xidig-button--secondary xidig-asuuq__cta"
        href={`/l/${listing.id}`}
      >
        {t('profile.openSuuqListing')}
      </Link>
    </div>,
  );
}

export default SuuqModule;
