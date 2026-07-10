import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/guards';

/**
 * Event creation rights (locked, alpha-conservative — extras item 8):
 *
 *   * Lab/Club organizers (lead or core, ACTIVE membership) — events for
 *     THEIR Space (lab container);
 *   * verified businesses (listing owner + verification_status='verified')
 *     — events for THEIR listing;
 *   * mods/admins — community/official events (no container or any container;
 *     candidate-container events are mod/admin-only until Capital grows its
 *     own organizer notion).
 *
 * Plain members without a container come later if volume is healthy.
 * Role-based, NEVER Supporter-paywalled (locked). Enforced server-side here —
 * UI gating on /events/new is presentation only.
 */

export type EventContainer =
  | { kind: 'none' }
  | { kind: 'lab'; labId: string }
  | { kind: 'listing'; listingId: string }
  | { kind: 'candidate'; candidateId: string };

export interface CreationFacts {
  /** App role of the caller. */
  role: 'member' | 'mod' | 'admin';
  container: EventContainer['kind'];
  /** For lab containers: the caller's ACTIVE lab role, or null. */
  labRole?: string | null;
  /** For listing containers. */
  ownsListing?: boolean;
  listingVerified?: boolean;
}

/** Pure decision — unit-tested creation-authorization matrix. */
export function resolveCreationRight(facts: CreationFacts): boolean {
  if (facts.role === 'admin' || facts.role === 'mod') return true;
  switch (facts.container) {
    case 'lab':
      return facts.labRole === 'lead' || facts.labRole === 'core';
    case 'listing':
      return facts.ownsListing === true && facts.listingVerified === true;
    case 'candidate':
    case 'none':
      return false;
  }
}

export function containerOf(input: {
  labId?: string | null | undefined;
  listingId?: string | null | undefined;
  candidateId?: string | null | undefined;
}): EventContainer {
  if (input.labId) return { kind: 'lab', labId: input.labId };
  if (input.listingId) return { kind: 'listing', listingId: input.listingId };
  if (input.candidateId) return { kind: 'candidate', candidateId: input.candidateId };
  return { kind: 'none' };
}

/**
 * Load the facts and throw 403 forbidden when the caller may not create an
 * event for this container. Also 400s on a container row that doesn't exist
 * (invalid_request — never reveals whether a private row exists).
 */
export async function assertCanCreateEvent(
  ctx: AuthContext,
  admin: SupabaseClient<Database>,
  container: EventContainer,
): Promise<void> {
  const role = ctx.appUser.role as CreationFacts['role'];
  const facts: CreationFacts = { role, container: container.kind };

  if (container.kind === 'lab') {
    const { data, error } = await admin
      .from('lab_members')
      .select('role, status')
      .eq('lab_id', container.labId)
      .eq('user_id', ctx.appUser.id)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw new Error(`lab membership lookup failed: ${error.message}`);
    facts.labRole = data?.role ?? null;
    // Container must exist even for mods (FK would 500 otherwise).
    const { data: lab } = await admin.from('labs').select('id').eq('id', container.labId).maybeSingle();
    if (!lab) throw new ApiError('invalid_request', 400);
  } else if (container.kind === 'listing') {
    const { data, error } = await admin
      .from('business_listings')
      .select('owner_user_id, verification_status')
      .eq('id', container.listingId)
      .maybeSingle();
    if (error) throw new Error(`listing lookup failed: ${error.message}`);
    if (!data) throw new ApiError('invalid_request', 400);
    facts.ownsListing = data.owner_user_id === ctx.appUser.id;
    facts.listingVerified = data.verification_status === 'verified';
  } else if (container.kind === 'candidate') {
    const { data, error } = await admin
      .from('venture_candidates')
      .select('id')
      .eq('id', container.candidateId)
      .maybeSingle();
    if (error) throw new Error(`candidate lookup failed: ${error.message}`);
    if (!data) throw new ApiError('invalid_request', 400);
  }

  if (!resolveCreationRight(facts)) throw new ApiError('forbidden', 403);
}

/** Containers the caller may create events for — drives the /events/new form. */
export interface CreationOptions {
  isModOrAdmin: boolean;
  labs: Array<{ id: string; name: string }>;
  listings: Array<{ id: string; businessName: string }>;
}

export async function loadCreationOptions(
  ctx: AuthContext,
  admin: SupabaseClient<Database>,
): Promise<CreationOptions> {
  const isModOrAdmin = ctx.appUser.role === 'admin' || ctx.appUser.role === 'mod';

  const [labRows, listingRows] = await Promise.all([
    admin
      .from('lab_members')
      .select('lab_id, role, labs(id, name)')
      .eq('user_id', ctx.appUser.id)
      .eq('status', 'active')
      .in('role', ['lead', 'core']),
    admin
      .from('business_listings')
      .select('id, business_name')
      .eq('owner_user_id', ctx.appUser.id)
      .eq('verification_status', 'verified')
      .eq('status', 'published'),
  ]);
  if (labRows.error) throw new Error(`creation labs lookup failed: ${labRows.error.message}`);
  if (listingRows.error) {
    throw new Error(`creation listings lookup failed: ${listingRows.error.message}`);
  }

  const labs = (labRows.data ?? [])
    .map((row) => row.labs as unknown as { id: string; name: string } | null)
    .filter((lab): lab is { id: string; name: string } => lab !== null);
  const listings = (listingRows.data ?? []).map((row) => ({
    id: row.id,
    businessName: row.business_name,
  }));

  return { isModOrAdmin, labs, listings };
}

export function mayCreateAnything(options: CreationOptions): boolean {
  return options.isModOrAdmin || options.labs.length > 0 || options.listings.length > 0;
}
