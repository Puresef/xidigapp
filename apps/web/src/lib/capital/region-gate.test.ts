import { describe, expect, it } from 'vitest';

import { decideGate, getGeoCountry, type GateReason } from './region-gate';

/**
 * The Somalia region gate is compliance-critical (§17). decideGate is PURE, so
 * we test every combination of the three inputs and pin the reason precedence
 * (unknown geo → profile mismatch → geo mismatch → no attestation → granted).
 */

describe('decideGate', () => {
  it('grants ONLY when profile=SO, geo=SO and attested (the single true row)', () => {
    expect(decideGate({ profileCountry: 'SO', geoCountry: 'SO', attested: true })).toEqual({
      granted: true,
      reason: 'granted',
    });
  });

  it('is case-insensitive on both country inputs', () => {
    expect(decideGate({ profileCountry: 'so', geoCountry: 'So', attested: true }).granted).toBe(
      true,
    );
    expect(decideGate({ profileCountry: '  SO ', geoCountry: 'so', attested: true }).granted).toBe(
      true,
    );
  });

  // Exhaustive truth table: profile∈{SO,US,null} × geo∈{SO,US,null} × attested∈{T,F}.
  const countries = ['SO', 'US', null] as const;
  const expectedReason = (
    profile: string | null,
    geo: string | null,
    attested: boolean,
  ): GateReason => {
    const geoKnown = geo !== null;
    if (!geoKnown) return 'unknown_geo';
    if (profile?.toLowerCase() !== 'so') return 'country_mismatch';
    if (geo.toLowerCase() !== 'so') return 'geo_mismatch';
    if (!attested) return 'no_attestation';
    return 'granted';
  };

  for (const profile of countries) {
    for (const geo of countries) {
      for (const attested of [true, false]) {
        it(`profile=${profile} geo=${geo} attested=${attested}`, () => {
          const reason = expectedReason(profile, geo, attested);
          expect(
            decideGate({ profileCountry: profile, geoCountry: geo, attested }),
          ).toEqual({ granted: reason === 'granted', reason });
        });
      }
    }
  }

  it('never grants without attestation even when both countries are SO', () => {
    expect(decideGate({ profileCountry: 'SO', geoCountry: 'SO', attested: false })).toEqual({
      granted: false,
      reason: 'no_attestation',
    });
  });

  it('reports unknown_geo (not country_mismatch) when geo is empty string', () => {
    expect(
      decideGate({ profileCountry: 'US', geoCountry: '', attested: true }).reason,
    ).toBe('unknown_geo');
  });

  it('unknown geo takes precedence over a wrong profile country', () => {
    expect(
      decideGate({ profileCountry: 'US', geoCountry: null, attested: true }).reason,
    ).toBe('unknown_geo');
  });
});

describe('getGeoCountry', () => {
  const withHeaders = (h: Record<string, string>) => ({ headers: new Headers(h) });

  it('reads the Vercel country header as the only trusted source, lowercased', () => {
    expect(getGeoCountry(withHeaders({ 'x-vercel-ip-country': 'SO' }))).toBe('so');
  });

  it('IGNORES client-spoofable fallback headers (compliance trust boundary, §17)', () => {
    // These are not platform-guaranteed on Vercel and are not stripped by the
    // edge, so trusting them would let a client attach e.g. `x-country-code: SO`
    // and spoof the gate. The only country signal is a non-authoritative header
    // → unknown (never granted).
    expect(getGeoCountry(withHeaders({ 'cf-ipcountry': 'SO' }))).toBeNull();
    expect(getGeoCountry(withHeaders({ 'x-country-code': 'SO' }))).toBeNull();
    expect(getGeoCountry(withHeaders({ 'x-geo-country': 'SO' }))).toBeNull();
  });

  it('trusts ONLY the Vercel header even when spoofable ones disagree', () => {
    expect(
      getGeoCountry(withHeaders({ 'x-vercel-ip-country': 'US', 'cf-ipcountry': 'SO' })),
    ).toBe('us');
  });

  it('returns null when the trusted country header is absent', () => {
    expect(getGeoCountry(withHeaders({}))).toBeNull();
  });

  it('treats CDN unknown sentinels (XX / T1) as null', () => {
    expect(getGeoCountry(withHeaders({ 'x-vercel-ip-country': 'XX' }))).toBeNull();
    expect(getGeoCountry(withHeaders({ 'x-vercel-ip-country': 'T1' }))).toBeNull();
  });
});
