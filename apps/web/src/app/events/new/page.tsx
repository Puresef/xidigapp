import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EventForm } from '@/components/events/event-form';
import { getAuthContext } from '@/lib/auth/guards';
import { loadCreationOptions, mayCreateAnything } from '@/lib/events/authz';
import { getLocale, getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Create an event (extras item 8) — RSC wrapper following /labs/new. The
 * container choices come from the SERVER (loadCreationOptions: the member's
 * organizer Labs + verified listings, or mod/admin community rights); a
 * member with no eligible container gets the plain "not eligible" note.
 * The API re-checks every right (assertCanCreateEvent) — this gate is
 * presentation, not security.
 */

export const metadata: Metadata = { title: 'New event — Xidig' };

export default async function NewEventPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/events/new');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const admin = getSupabaseAdmin();
  const [t, locale, options, categoriesResult] = await Promise.all([
    getT(),
    getLocale(),
    loadCreationOptions(ctx, admin),
    admin
      .from('event_categories')
      .select('slug, name_en, name_so')
      .eq('is_active', true)
      .order('position', { ascending: true }),
  ]);

  if (!mayCreateAnything(options)) {
    return (
      <main className="xidig-auth">
        <h1 className="xidig-auth__title">{t('events.newTitle')}</h1>
        <p className="xidig-card__body">{t('events.notEligible')}</p>
        <p>
          <Link href="/events" className="xidig-button xidig-button--secondary">
            {t('events.indexTitle')}
          </Link>
        </p>
      </main>
    );
  }

  const categories = (categoriesResult.data ?? []).map((row) => ({
    slug: row.slug,
    name: locale === 'so' && row.name_so ? row.name_so : row.name_en,
  }));

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('events.newTitle')}</h1>
      <EventForm
        options={{
          isModOrAdmin: options.isModOrAdmin,
          labs: options.labs,
          listings: options.listings,
          categories,
        }}
      />
    </main>
  );
}
