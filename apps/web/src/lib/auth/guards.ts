import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

import { ApiError } from '@/lib/api';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * RBAC guards (§26: member / mod / admin — admin inherits all mod powers).
 *
 * API-FIRST RULE: every route handler and server component that exposes or
 * mutates data calls one of these. UI hiding is presentation, not security —
 * these guards + RLS are the enforcement.
 */

export type AppUser = Pick<
  Tables<'users'>,
  'id' | 'email' | 'phone' | 'role' | 'status' | 'onboarding_state' | 'preferred_language'
>;

export interface AuthContext {
  /** Verified auth user (JWT validated against the auth server). */
  user: User;
  /** App-level account row (role, status, onboarding state). */
  appUser: AppUser;
  /** RLS-scoped client bound to this user's session cookies. */
  supabase: SupabaseClient<Database>;
}

/** Session lookup without side effects: null = signed out. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from('users')
    .select('id, email, phone, role, status, onboarding_state, preferred_language')
    .eq('id', user.id)
    .maybeSingle();

  // No shadow row = the account is mid-provisioning or was anonymised;
  // treat as signed out rather than half-authenticated.
  if (!appUser) return null;

  return { user, appUser, supabase };
}

/** 401 session_expired when signed out; 403 for suspended/lifecycle-blocked accounts. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new ApiError('session_expired', 401);

  if (ctx.appUser.status === 'suspended') throw new ApiError('account_suspended', 403);
  // pending_deletion keeps access during the 30-day grace (§19 — cancellable);
  // deactivated/deleted accounts are out.
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') {
    throw new ApiError('forbidden', 403);
  }
  return ctx;
}

/** Role gate. `mod` admits mods AND admins; `admin` admits admins only. */
export async function requireRole(minRole: 'mod' | 'admin'): Promise<AuthContext> {
  const ctx = await requireUser();
  const { role } = ctx.appUser;
  const allowed = minRole === 'admin' ? role === 'admin' : role === 'admin' || role === 'mod';
  if (!allowed) throw new ApiError('forbidden', 403);
  return ctx;
}
