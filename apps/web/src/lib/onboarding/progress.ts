import type { AuthContext } from '@/lib/auth/guards';

/**
 * First-session checklist progress (§20). Computes done-state per item from the
 * live DB under the member's own RLS — never trusts a stale flag — plus the
 * dismiss state stored in users.onboarding_state.
 *
 *   profile  — display name + handle present (identity)
 *   lanes    — at least one lane picked
 *   follow   — following ≥ 3 (interest-based suggestions power this step)
 *   post     — authored ≥ 1 post
 *   password — shown ONLY for passwordless (magic-link / OTP) accounts that
 *              haven't set a password or dismissed the nudge (delivery-independent
 *              backup sign-in; stops showing once a password exists)
 */

export type ChecklistItemKey = 'profile' | 'lanes' | 'follow' | 'post' | 'password';

export interface ChecklistItem {
  key: ChecklistItemKey;
  done: boolean;
  href: string;
}

export interface OnboardingProgress {
  items: ChecklistItem[];
  completed: number;
  total: number;
  allDone: boolean;
  dismissed: boolean;
}

export const FOLLOW_TARGET = 3;

export async function getOnboardingProgress(ctx: AuthContext): Promise<OnboardingProgress> {
  const state = (ctx.appUser.onboarding_state ?? {}) as Record<string, unknown>;
  const dismissed = state.checklistDismissed === true;
  const passwordNudgeDismissed = state.passwordNudgeDismissed === true;

  const [{ data: profile }, followsRes, postsRes, { data: hasPassword }] = await Promise.all([
    ctx.supabase
      .from('profiles')
      .select('display_name, handle, lanes')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle(),
    ctx.supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_user_id', ctx.appUser.id),
    ctx.supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_user_id', ctx.appUser.id),
    ctx.supabase.rpc('has_password'),
  ]);

  const hasIdentity = Boolean(profile?.display_name?.trim()) && Boolean(profile?.handle?.trim());
  const lanesPicked = (profile?.lanes?.length ?? 0) > 0;
  const followCount = followsRes.count ?? 0;
  const postCount = postsRes.count ?? 0;

  const items: ChecklistItem[] = [
    { key: 'profile', done: hasIdentity, href: '/settings/profile' },
    { key: 'lanes', done: lanesPicked, href: '/settings/profile' },
    { key: 'follow', done: followCount >= FOLLOW_TARGET, href: '/suuq' },
    { key: 'post', done: postCount >= 1, href: '/plaza' },
  ];
  if (!hasPassword && !passwordNudgeDismissed) {
    items.push({ key: 'password', done: false, href: '/settings/account' });
  }

  const completed = items.filter((item) => item.done).length;
  return {
    items,
    completed,
    total: items.length,
    allDone: completed === items.length,
    dismissed,
  };
}
