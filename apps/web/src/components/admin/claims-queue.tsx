'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Mod claim-review queue (§18/§19). Decisions go through the existing
 * PATCH /api/claims/[id]; this is the discovery + action UI the mod side of
 * the claim flow needs. mod is a strict subset of admin here (page gates on
 * requireRole('mod')-equivalent).
 */

export interface ClaimRow {
  id: string;
  listing_id: string;
  claimant_user_id: string;
  evidence: string | null;
  status: string;
  created_at: string;
  listing: { id: string; business_name: string; city: string | null } | null;
  claimant: { user_id: string; display_name: string; handle: string } | null;
}

export function ClaimsQueue({ initialClaims }: { initialClaims: ClaimRow[] }) {
  const t = useT();
  const [claims, setClaims] = useState<ClaimRow[]>(initialClaims);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(id: string, status: 'approved' | 'rejected') {
    setPendingId(id);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(`/api/claims/${id}`, { status });
      setClaims((current) => current.filter((c) => c.id !== id));
      setNotice(status === 'approved' ? t('admin.claimApproved') : t('admin.claimRejected'));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  if (claims.length === 0 && !notice) {
    return <p className="xidig-card__meta">{t('admin.claimsEmpty')}</p>;
  }

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      <ul className="xidig-card-grid">
        {claims.map((claim) => (
          <li key={claim.id} className="xidig-card">
            <h3 className="xidig-card__title">
              {claim.listing ? claim.listing.business_name : claim.listing_id}
            </h3>
            <p className="xidig-card__meta">
              {t('admin.claimClaimant')}:{' '}
              {claim.claimant ? `${claim.claimant.display_name} (@${claim.claimant.handle})` : claim.claimant_user_id}
            </p>
            {claim.evidence ? (
              <p className="xidig-card__body">
                {t('admin.claimEvidence')}: {claim.evidence}
              </p>
            ) : null}
            <p className="xidig-profile__actions">
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={pendingId === claim.id}
                onClick={() => void decide(claim.id, 'approved')}
              >
                {t('admin.claimApprove')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === claim.id}
                onClick={() => void decide(claim.id, 'rejected')}
              >
                {t('admin.claimReject')}
              </button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
