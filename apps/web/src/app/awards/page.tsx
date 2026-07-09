import { redirect } from 'next/navigation';

import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';

import { AwardVoteControl, type VoteTargetOption } from '@/components/awards/award-vote-control';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Community Awards (§20) — quarterly member voting. Shows the 4 award
 * categories only while a cycle is open (award_cycles window); otherwise a
 * teaching empty state. Each category offers a bounded, RLS-visible target list
 * appropriate to it, and shows the member's existing vote once cast. Voting is
 * one-per-category and final for the quarter (enforced in the DB). The admin
 * tally + results-to-Plaza flow is a separate surface (parent follow-on).
 */

type AwardCategory = Enums<'award_category'>;

const CATEGORIES: readonly AwardCategory[] = ['best_lab', 'best_win', 'most_helpful', 'rising_builder'];

// Keys the parent adds to the dictionaries centrally (returned in i18n_keys);
// cast to MessageKey until they land, matching the existing app pattern
// (see components/profile/open-to.ts).
const CATEGORY_LABEL_KEYS: Record<AwardCategory, MessageKey> = {
  best_lab: 'awards.categoryBestLab' as MessageKey,
  best_win: 'awards.categoryBestWin' as MessageKey,
  most_helpful: 'awards.categoryMostHelpful' as MessageKey,
  rising_builder: 'awards.categoryRisingBuilder' as MessageKey,
};

const CATEGORY_DESC_KEYS: Record<AwardCategory, MessageKey> = {
  best_lab: 'awards.descBestLab' as MessageKey,
  best_win: 'awards.descBestWin' as MessageKey,
  most_helpful: 'awards.descMostHelpful' as MessageKey,
  rising_builder: 'awards.descRisingBuilder' as MessageKey,
};

const TARGET_LIMIT = 25;

interface CastVote {
  category: AwardCategory;
  targetType: 'lab' | 'post' | 'user';
  targetId: string;
}

export default async function AwardsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/awards');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const translate = await getT();
  // awards.* keys are added to the dictionaries by the parent (returned in
  // i18n_keys); until they land, resolve through a MessageKey cast — the app's
  // existing pattern for keys pending central registration.
  const t = (key: string, params?: Parameters<typeof translate>[1]): string =>
    translate(key as MessageKey, params);
  const { supabase } = ctx;

  // Resolve the OPEN cycle server-side (RLS: award_cycles_select_all).
  const nowIso = new Date().toISOString();
  const { data: cycle } = await supabase
    .from('award_cycles')
    .select('quarter, closes_at')
    .lte('opens_at', nowIso)
    .gt('closes_at', nowIso)
    .order('opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cycle) {
    return (
      <main className="xidig-section">
        <div className="xidig-card__header">
          <h1 className="xidig-auth__title">{t('awards.title')}</h1>
        </div>
        <div className="xidig-card">
          <h2 className="xidig-card__title">{t('awards.emptyTitle')}</h2>
          <p className="xidig-card__body">{t('awards.emptyBody')}</p>
        </div>
      </main>
    );
  }

  // The member's own ballots for this quarter (RLS: award_votes_select_own).
  const { data: voteRows } = await supabase
    .from('award_votes')
    .select('category, target_type, target_id')
    .eq('quarter', cycle.quarter);
  const votes: CastVote[] = (voteRows ?? []).map((v) => ({
    category: v.category,
    targetType: v.target_type as CastVote['targetType'],
    targetId: v.target_id,
  }));
  const voteByCategory = new Map<AwardCategory, CastVote>(votes.map((v) => [v.category, v]));

  // --- Bounded, RLS-visible option lists per category -----------------------
  // Best Lab → Labs the member can read (RLS scopes the fetch).
  const { data: labRows } = await supabase
    .from('labs')
    .select('id, name')
    .order('last_activity_at', { ascending: false })
    .limit(TARGET_LIMIT);
  const labOptions: VoteTargetOption[] = (labRows ?? []).map((l) => ({
    targetType: 'lab',
    targetId: l.id,
    label: l.name,
  }));

  // Best Win → recent Win posts (RLS scopes visibility).
  const { data: winRows } = await supabase
    .from('posts')
    .select('id, title, body')
    .eq('type', 'win')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(TARGET_LIMIT);
  const winOptions: VoteTargetOption[] = (winRows ?? []).map((p) => ({
    targetType: 'post',
    targetId: p.id,
    label: p.title?.trim() || truncate(p.body),
  }));

  // Most Helpful / Rising Builder → members the viewer follows.
  const { data: followRows } = await supabase
    .from('follows')
    .select('target_id')
    .eq('follower_user_id', ctx.appUser.id)
    .eq('target_type', 'user')
    .limit(TARGET_LIMIT);
  const followedIds = (followRows ?? []).map((f) => f.target_id);
  let memberOptions: VoteTargetOption[] = [];
  if (followedIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('user_id, display_name, handle')
      .in('user_id', followedIds);
    memberOptions = (profileRows ?? []).map((p) => ({
      targetType: 'user',
      targetId: p.user_id,
      label: p.display_name || `@${p.handle}`,
    }));
  }

  const optionsByCategory: Record<AwardCategory, VoteTargetOption[]> = {
    best_lab: labOptions,
    best_win: winOptions,
    most_helpful: memberOptions,
    rising_builder: memberOptions,
  };

  return (
    <main className="xidig-section">
      <div className="xidig-card__header">
        <h1 className="xidig-auth__title">{t('awards.title')}</h1>
      </div>
      <p className="xidig-card__body">{t('awards.subtitle', { quarter: cycle.quarter })}</p>

      <ul className="xidig-card-list">
        {CATEGORIES.map((category) => {
          const existing = voteByCategory.get(category);
          const options = optionsByCategory[category];
          const currentVoteLabel = existing
            ? (options.find((o) => o.targetId === existing.targetId)?.label ?? existing.targetId)
            : null;
          return (
            <li key={category} className="xidig-card">
              <div className="xidig-card__body">
                <h2 className="xidig-card__title">{t(CATEGORY_LABEL_KEYS[category])}</h2>
                <p className="xidig-card__meta">{t(CATEGORY_DESC_KEYS[category])}</p>
                <AwardVoteControl
                  category={category}
                  options={options}
                  currentVoteLabel={currentVoteLabel}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

/** First ~60 chars of a Win's body when it has no title (display label only). */
function truncate(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}
