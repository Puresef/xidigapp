import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@xidig/i18n';

import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/media/avatar';
import { getAuthContext } from '@/lib/auth/guards';
import {
  isTestAccount,
  loadAccountFlags,
  loadTestAccountIds,
  postgrestIdList,
} from '@/lib/account-flags';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Top Helpers leaderboard (§14). A ranked list of the members with the highest
 * Helper score — the aggregate "help that landed" signal (credited Ask answers).
 * reputation_scores is member-readable (RLS `select_all`) and the score is a
 * public/aggregate figure (same class as follower counts), so this reads under
 * the caller's own RLS client. Only positive scores rank; the list caps at ~20.
 * Quarantined test accounts (users.is_test) never rank (see below).
 */

const LIMIT = 20;

interface HelperRow {
  userId: string;
  helper: number;
  displayName: string;
  handle: string;
}

export default async function LeaderboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/leaderboard');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const locale = await getLocale();
  const admin = getSupabaseAdmin();

  // Quarantined seeded/test accounts (users.is_test) never take a rank. They
  // are excluded IN the query, before the limit, so a fixture account with a
  // top score can neither appear nor push a real member off the list — the 20
  // slots still fill with real members when there are 20.
  const testIds = await loadTestAccountIds(admin);
  let scoresQuery = ctx.supabase
    .from('reputation_scores')
    .select('user_id, helper_score')
    .gt('helper_score', 0);
  if (testIds.length > 0) {
    scoresQuery = scoresQuery.not('user_id', 'in', postgrestIdList(testIds));
  }
  const { data: scores } = await scoresQuery
    .order('helper_score', { ascending: false })
    .limit(LIMIT);

  // A deleted account holds no current rank: its tombstone profile row
  // survives anonymisation, so the "absent profile drops the row" rule below
  // never fired for it (retained content — awards/reputation must not imply a
  // current standing after deletion). Suspended members are unchanged here.
  // The test-account check repeats the query exclusion from the flags already
  // loaded (a marker set between the two reads still never ranks).
  const rawRows = scores ?? [];
  const rankFlags = await loadAccountFlags(
    admin,
    rawRows.map((row) => row.user_id),
  );
  const scoreRows = rawRows.filter(
    (row) =>
      rankFlags.get(row.user_id)?.status !== 'deleted' && !isTestAccount(rankFlags, row.user_id),
  );
  const userIds = scoreRows.map((row) => row.user_id);

  // Join display fields under the same RLS client (profiles carry a member
  // column grant). Absent handle/name (revoked/anonymised) drops the row.
  const profileById = new Map<string, { display_name: string; handle: string }>();
  if (userIds.length > 0) {
    const { data: profiles } = await ctx.supabase
      .from('profiles')
      .select('user_id, display_name, handle')
      .in('user_id', userIds);
    for (const profile of profiles ?? []) {
      profileById.set(profile.user_id, {
        display_name: profile.display_name,
        handle: profile.handle,
      });
    }
  }

  const rows: HelperRow[] = scoreRows.flatMap((row) => {
    const profile = profileById.get(row.user_id);
    if (!profile) return [];
    return [
      {
        userId: row.user_id,
        helper: row.helper_score,
        displayName: profile.display_name,
        handle: profile.handle,
      },
    ];
  });

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('reputation.leaderboardTitle')}</h1>
      <p className="xidig-card__meta">{t('reputation.leaderboardSubtitle')}</p>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('reputation.topHelpersHeading')}</h2>
        {rows.length === 0 ? (
          <EmptyState messageKey="reputation.leaderboardEmpty" />
        ) : (
          <ul className="xidig-card-list">
            {rows.map((row, index) => (
              <li key={row.userId} className="xidig-card">
                <div className="xidig-card__body">
                  <h3 className="xidig-card__title">
                    <span className="xidig-tag">#{formatNumber(index + 1, locale)}</span>{' '}
                    {/* 0-byte initials disc (Avatar is server-safe — no hooks);
                        no photo columns fetched here, deliberately. */}
                    <Avatar name={row.displayName} handle={row.handle} size={28} />{' '}
                    <Link href={`/u/${row.handle}`}>{row.displayName}</Link>
                  </h3>
                  <p className="xidig-card__meta">@{row.handle}</p>
                  <p className="xidig-card__meta">
                    {t('reputation.helperChip', { count: row.helper })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
