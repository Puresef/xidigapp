import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ShareActions } from '@/components/share-actions';
import { ClaimListing } from '@/components/suuq/claim-listing';
import { ListingContacts } from '@/components/suuq/listing-contacts';
import { TrackListingView } from '@/components/suuq/track-listing-view';
import { getAuthContext } from '@/lib/auth/guards';
import {
  getMemberListingView,
  getPublicListingView,
  type ListingView,
} from '@/lib/listing-view';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Business listing permalink (§13, §18, §28 share pages). Login-free for
 * published listings — contact links stay visible to anonymous visitors on
 * purpose: a business listing exists to be contacted, and contact clicks are
 * the §4 funnel tail. Members additionally get the claim flow on unclaimed
 * listings. Coordinates render as an OpenStreetMap link, not an embedded map
 * — zero tile cost until the visitor asks for it (§22).
 */

const idSchema = z.string().uuid();

async function loadView(
  id: string,
): Promise<{ view: ListingView | null; viewerId: string | null; pendingClaim: boolean }> {
  const ctx = await getAuthContext();
  // Blocked accounts degrade to the public path (parity with requireUser's
  // 403 on the API); pending_deletion keeps member access (§19 grace).
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');
  if (!ctx || blocked) {
    return { view: await getPublicListingView(id), viewerId: null, pendingClaim: false };
  }
  const view = await getMemberListingView(ctx.supabase, id);
  let pendingClaim = false;
  if (view && view.listing.owner_user_id === null) {
    // .limit(1), not .maybeSingle(): before the one-pending-per-member index
    // (20260705020000) a member could hold >1 pending row, and maybeSingle
    // errors on multiple rows — which would silently re-offer the claim form.
    const { data: claims } = await ctx.supabase
      .from('listing_claims')
      .select('id')
      .eq('listing_id', id)
      .eq('claimant_user_id', ctx.appUser.id)
      .eq('status', 'pending')
      .limit(1);
    pendingClaim = (claims?.length ?? 0) > 0;
  }
  return { view, viewerId: ctx.appUser.id, pendingClaim };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return {};
  const view = await getPublicListingView(id);
  if (!view) return {};
  return {
    title: view.listing.business_name,
    description: view.listing.short_description ?? undefined,
  };
}

export default async function ListingPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const { view, viewerId, pendingClaim } = await loadView(id);
  if (!view) notFound();

  const t = await getT();
  const locale = await getLocale();
  const { listing, categoryName, owner } = view;

  const category =
    categoryName === null
      ? null
      : locale === 'so'
        ? (categoryName.so ?? categoryName.en)
        : categoryName.en;
  const location = [listing.address, listing.landmark, listing.city, listing.country]
    .filter(Boolean)
    .join(' · ');
  const hasCoords = listing.latitude !== null && listing.longitude !== null;

  return (
    <main>
      <TrackListingView listingId={listing.id} />
      <article className="xidig-profile">
        <header className="xidig-profile__header">
          <h1 className="xidig-auth__title">{listing.business_name}</h1>
          {listing.verification_status === 'verified' ? (
            <span className="xidig-tag xidig-tag--ok">{t('suuq.verifiedBusiness')}</span>
          ) : null}
          {listing.owner_user_id === null ? (
            <span className="xidig-tag">{t('suuq.unclaimed')}</span>
          ) : null}
        </header>

        {category ? <p className="xidig-card__meta">{category}</p> : null}
        {owner ? (
          <p className="xidig-card__meta">
            <Link href={`/u/${owner.handle}`}>
              {t('suuq.listedBy', { name: owner.display_name })}
            </Link>
          </p>
        ) : null}
        {listing.short_description ? (
          <p className="xidig-card__body">{listing.short_description}</p>
        ) : null}
        {location ? <p className="xidig-card__meta">{location}</p> : null}
        {hasCoords ? (
          <p>
            <a
              href={`https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=16/${listing.latitude}/${listing.longitude}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('suuq.osmLink')} →
            </a>
          </p>
        ) : null}

        <ShareActions path={`/l/${listing.id}`} text={listing.business_name} />

        <ListingContacts listingId={listing.id} contactLinks={listing.contact_links} />

        {viewerId && listing.owner_user_id === null ? (
          <ClaimListing listingId={listing.id} alreadyPending={pendingClaim} />
        ) : null}

        {!viewerId ? (
          <section className="xidig-section">
            <p className="xidig-card__body">{t('suuq.joinCta')}</p>
            <p>
              <Link href="/signup" className="xidig-button xidig-button--primary">
                {t('action.createAccount')}
              </Link>
            </p>
          </section>
        ) : null}
      </article>
    </main>
  );
}
