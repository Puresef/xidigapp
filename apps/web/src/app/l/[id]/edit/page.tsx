import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { ListingForm, type ListingFormInitial } from '@/components/suuq/listing-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getCategories } from '@/lib/categories';
import { getMemberListingView } from '@/lib/listing-view';
import { asContactLinks, asOpeningHours } from '@/lib/listings';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Edit a business listing (Phase 4.5, §18). Listings were create-only until
 * now, so this is the first owner edit surface — it reuses ListingForm in
 * edit mode (PATCH + photos PUT instead of POST). Owner or mod only; the API
 * enforces the same rule (RLS + explicit checks), this gate is presentation.
 */

const idSchema = z.string().uuid();

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const ctx = await getAuthContext();
  if (!ctx) redirect(`/signin?next=/l/${id}/edit`);
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const view = await getMemberListingView(ctx.supabase, id);
  if (!view) notFound();

  const isMod = ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
  if (view.listing.owner_user_id !== ctx.appUser.id && !isMod) redirect(`/l/${id}`);

  const t = await getT();
  const locale = await getLocale();
  const lowBandwidth = await getLowBandwidth();
  const categories = await getCategories(ctx.supabase, locale);

  const { listing } = view;
  const initial: ListingFormInitial = {
    id: listing.id,
    business_name: listing.business_name,
    category_id: listing.category_id,
    short_description: listing.short_description,
    address: listing.address,
    landmark: listing.landmark,
    city: listing.city,
    country: listing.country,
    latitude: listing.latitude,
    longitude: listing.longitude,
    contact_links: asContactLinks(listing.contact_links).map((row) => ({
      type: row.type,
      value: row.value,
    })),
    openingHours: asOpeningHours(listing.opening_hours),
    priceRange: listing.price_range,
    services: view.services,
    // Photos whose media_uploads row was deleted can't be re-sent on PUT
    // (mediaId is the wire identity) — they drop out of the editable set.
    photos: view.photos
      .filter((photo) => photo.mediaId !== null)
      .map((photo) => ({
        mediaId: photo.mediaId as string,
        url: photo.url,
        thumbUrl: photo.thumbUrl,
        alt: photo.alt,
        blurhash: photo.blurhash,
        scanStatus: 'passed',
      })),
  };

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('suuq.editListingTitle')}</h1>
      <ListingForm categories={categories} lowBandwidth={lowBandwidth} listing={initial} />
    </main>
  );
}
