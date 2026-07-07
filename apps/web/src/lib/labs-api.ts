import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database, Enums } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/guards';
import {
  hydrateLabs,
  LAB_COLUMNS,
  LAB_PUBLIC_COLUMNS,
  labMediaView,
  type LabMediaView,
  type LabRow,
  type LabView,
} from '@/lib/labs/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Shared helpers for the /api/labs* route family. Reads run under the CALLER's
 * RLS (so private/members/public visibility is DB-enforced and hidden rows are
 * a plain 404); hydration + privileged writes use the service role AFTER the
 * route has done its own role check. Mirrors lib/posts-api.ts.
 */

const uuidSchema = z.string().uuid();

/** Invalid uuid → 404 (don't leak the path-shape problem). */
export function parseLabId(raw: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

/** RLS-scoped single-lab load by id; whatever RLS hides is a plain 404. */
export async function loadLabForViewer(ctx: AuthContext, id: string): Promise<LabRow> {
  const { data, error } = await ctx.supabase.from('labs').select(LAB_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`lab lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data as LabRow;
}

/** RLS-scoped single-lab load by slug. */
export async function loadLabBySlugForViewer(ctx: AuthContext, slug: string): Promise<LabRow> {
  const { data, error } = await ctx.supabase
    .from('labs')
    .select(LAB_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`lab lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data as LabRow;
}

export async function hydrateOneLab(
  admin: SupabaseClient<Database>,
  viewerId: string,
  row: LabRow,
): Promise<LabView> {
  const [view] = await hydrateLabs(admin, viewerId, [row]);
  if (!view) throw new Error('lab hydration produced no view');
  return view;
}

export interface LabMembership {
  role: Enums<'lab_member_role'>;
  status: Enums<'lab_member_status'>;
}

/** Read the caller's membership on a Space via the service role (authoritative). */
export async function getLabMembership(
  admin: SupabaseClient<Database>,
  labId: string,
  userId: string,
): Promise<LabMembership | null> {
  const { data, error } = await admin
    .from('lab_members')
    .select('role, status')
    .eq('lab_id', labId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`membership lookup failed: ${error.message}`);
  return data ?? null;
}

/** True for the Space lead or a platform admin — who may change settings/promote. */
export function isLabManager(ctx: AuthContext, lab: LabRow): boolean {
  return lab.lead_user_id === ctx.appUser.id || ctx.appUser.role === 'admin';
}

/** 403 unless the caller manages this Space (lead or platform admin). */
export function requireLabManager(ctx: AuthContext, lab: LabRow): void {
  if (!isLabManager(ctx, lab)) throw new ApiError('forbidden', 403);
}

/**
 * 403 unless the caller may contribute content (active lead/core/member; an
 * observer reads but does not post). The lead is always a contributor.
 */
export async function requireLabContributor(
  ctx: AuthContext,
  admin: SupabaseClient<Database>,
  lab: LabRow,
): Promise<void> {
  if (lab.lead_user_id === ctx.appUser.id || ctx.appUser.role === 'admin') return;
  const membership = await getLabMembership(admin, lab.id, ctx.appUser.id);
  if (!membership || membership.status !== 'active' || membership.role === 'observer') {
    throw new ApiError('forbidden', 403);
  }
}

/**
 * Public Space projection for anonymous SSR (build-in-public / SEO). Uses the
 * service role with a NARROW column set and only returns a row when the Space
 * is genuinely public — anon has no RLS read, so this is the only public path.
 */
export async function getPublicLabView(slug: string): Promise<{
  lab: Partial<LabRow>;
  lead: { display_name: string; handle: string } | null;
  memberCount: number;
  media: LabMediaView;
} | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('labs')
    .select(LAB_PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('visibility', 'public')
    .maybeSingle();
  if (error) throw new Error(`public lab lookup failed: ${error.message}`);
  if (!data) return null;

  const lab = data as Partial<LabRow> & {
    lead_user_id: string;
    icon_path: string | null;
    icon_blurhash: string | null;
    cover_path: string | null;
    cover_blurhash: string | null;
  };
  const [{ data: lead }, { count }] = await Promise.all([
    admin.from('profiles').select('display_name, handle').eq('user_id', lab.lead_user_id).maybeSingle(),
    admin
      .from('lab_members')
      .select('*', { count: 'exact', head: true })
      .eq('lab_id', lab.id as string)
      .eq('status', 'active'),
  ]);

  return { lab, lead: lead ?? null, memberCount: count ?? 0, media: labMediaView(lab) };
}
