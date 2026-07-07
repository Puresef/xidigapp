import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { SOMALIA_ISO } from '@/lib/capital/constants';

/**
 * Somalia-region gate for Maalgeli / Invest intent (§17, compliance-critical).
 *
 * Investment features are shown ONLY when ALL THREE inputs agree that the member
 * is Somalia-based: their profile country is SO, the request's geo-IP-derived
 * country is SO, and they have ticked the self-attestation checkbox. Garab
 * (co-sign) and "I can help" are non-financial and NEVER gated — they don't go
 * through this path.
 *
 * `decideGate` is a PURE decision function (unit-tested exhaustively).
 * `evaluateCapitalGate` wraps it with an ALWAYS-on compliance write to
 * capital_gate_evaluations (append-only, service role) — every evaluation is
 * logged with its three inputs and the outcome, so the gate is auditable. The
 * raw IP is NEVER read or stored; only the derived country header is used.
 */

export type GateReason =
  | 'granted'
  | 'country_mismatch'
  | 'geo_mismatch'
  | 'no_attestation'
  | 'unknown_geo';

export interface GateDecision {
  granted: boolean;
  reason: GateReason;
}

export interface GateInputs {
  /** profiles.location_country for the caller (may be null if unset). */
  profileCountry: string | null | undefined;
  /** Country derived from the request's geo-IP header (null if unknown). */
  geoCountry: string | null | undefined;
  /** Whether the caller ticked the "I am based in Somalia" attestation. */
  attested: boolean;
}

function isSomalia(country: string | null | undefined): boolean {
  return typeof country === 'string' && country.trim().toLowerCase() === SOMALIA_ISO;
}

/**
 * PURE gate decision. Granted iff profileCountry==SO AND geoCountry==SO AND
 * attested. The reason encodes the FIRST failing condition in this precedence:
 * unknown geo → profile mismatch → geo mismatch → missing attestation. (Unknown
 * geo is reported distinctly from a known-but-wrong geo so ops can tell a member
 * behind a country-less proxy apart from a member abroad.)
 */
export function decideGate({ profileCountry, geoCountry, attested }: GateInputs): GateDecision {
  const geoKnown = typeof geoCountry === 'string' && geoCountry.trim() !== '';

  if (!geoKnown) return { granted: false, reason: 'unknown_geo' };
  if (!isSomalia(profileCountry)) return { granted: false, reason: 'country_mismatch' };
  if (!isSomalia(geoCountry)) return { granted: false, reason: 'geo_mismatch' };
  if (!attested) return { granted: false, reason: 'no_attestation' };

  return { granted: true, reason: 'granted' };
}

/**
 * Read the caller's country from the single PLATFORM-VERIFIED geo header.
 *
 * This is a COMPLIANCE-CRITICAL trust boundary (§17): the region gate is only as
 * strong as the header it trusts. The deployment target is Vercel, where
 * `x-vercel-ip-country` is set-and-overwritten by the platform edge on every
 * request — a client cannot forge it. We deliberately read ONLY that header.
 *
 * We do NOT fall back to `cf-ipcountry` / `x-country-code` / `x-geo-country`:
 * those are not platform-guaranteed on Vercel and are not stripped by the edge,
 * so a client fetch could simply attach `x-country-code: SO` and spoof its way
 * past the gate. Any request whose only country signal is a non-authoritative
 * header therefore resolves to unknown (→ `unknown_geo`, never granted). If the
 * deployment ever moves behind a proxy that overwrites a different header, trust
 * THAT one here and strip the untrusted variants in middleware before the route
 * sees them.
 *
 * IMPORTANT: this only ever reads a DERIVED COUNTRY. The raw client IP is never
 * read here and never stored (§17 compliance). Returns null when the trusted
 * header is absent — the caller then reports `unknown_geo`.
 */
export function getGeoCountry(req: { headers: Headers }): string | null {
  const value = req.headers.get('x-vercel-ip-country'); // Vercel edge (only trusted source)
  if (!value || value.trim() === '') return null;
  const normalized = value.trim().toLowerCase();
  // Some CDNs emit "XX"/"T1" (Tor) for unknown — treat as unknown.
  if (normalized === 'xx' || normalized === 't1') return null;
  return normalized;
}

/**
 * Evaluate the gate AND always record the evaluation (compliance log). Uses the
 * service role because capital_gate_evaluations is append-only with no client
 * write grant. Returns the decision regardless of whether the log write
 * succeeded — but a failed write is surfaced (thrown) so the route can 500
 * rather than silently drop an audit record.
 */
export async function evaluateCapitalGate(
  admin: SupabaseClient<Database>,
  inputs: GateInputs & { userId: string; candidateId?: string | null },
): Promise<GateDecision> {
  const decision = decideGate(inputs);

  const { error } = await admin.from('capital_gate_evaluations').insert({
    user_id: inputs.userId,
    profile_country: inputs.profileCountry ?? null,
    geo_ip_country: inputs.geoCountry ?? null,
    attested: inputs.attested,
    granted: decision.granted,
    reason: decision.reason,
    candidate_id: inputs.candidateId ?? null,
  });
  if (error) throw new Error(`capital gate log failed: ${error.message}`);

  return decision;
}
