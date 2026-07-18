'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { GateReason } from '@/lib/capital/region-gate';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { AttestationModal } from './attestation-modal';
import { VentureFundModal } from './venture-fund-modal';
import { LoadingFlap } from '@/components/loading-flap';

/**
 * Maalgeli (Invest) CTA — the region gate's UI face (§17, compliance-critical).
 *
 * COMPLIANCE INVARIANTS:
 *  - A non-Somalia session NEVER sees the Invest button, invest copy, or amounts.
 *    On mount we evaluate the gate with attested=false. Only a
 *    location-eligible member (reason 'granted' | 'no_attestation') is shown the
 *    Maalgeli button; every other reason (country/geo mismatch, unknown geo)
 *    renders the §27 INFORMATIONAL notice with zero invest language.
 *  - The button ALWAYS opens the attestation modal, then re-evaluates the gate
 *    server-side WITH attestation, and only a granted result opens the Xidig
 *    Venture Fund modal (fund-first funnel). Garab / "I can help" are separate
 *    (interest-bar) and never gated.
 *
 * The client-side pre-check is a display gate only; the server re-evaluates and
 * logs every real invest action, so nothing here is the security boundary.
 */

type Phase = 'checking' | 'eligible' | 'informational';

interface GateResponse {
  granted: boolean;
  reason: GateReason;
}

export function MaalgeliCta({ candidateId }: { candidateId?: string | null }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('checking');
  const [attestOpen, setAttestOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  // Display pre-check: attested=false can never grant, but 'no_attestation'
  // vs a country/geo mismatch tells us whether this member is even in-region.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiPost<GateResponse>('/api/capital/gate', { attested: false });
        if (!active) return;
        setPhase(
          res.reason === 'granted' || res.reason === 'no_attestation'
            ? 'eligible'
            : 'informational',
        );
      } catch {
        // On any failure, fail CLOSED to the informational view — never leak
        // invest UI to a session we couldn't confirm as in-region.
        if (active) setPhase('informational');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function confirmAttestation() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const res = await apiPost<GateResponse>('/api/capital/gate', { attested: true });
        setAttestOpen(false);
        if (res.granted) {
          setFundOpen(true);
        } else {
          // Attested but geo/profile still not Somalia → informational.
          setPhase('informational');
        }
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  if (phase === 'checking') {
    return <LoadingFlap />;
  }

  if (phase === 'informational') {
    // §27 informational view: NO invest language, NO Maalgeli action anywhere.
    // Fund exploration copy is informational only — the fund-interest write is
    // itself region-gated server-side, so no action is offered to this session.
    return (
      <Banner kind="notice">
        {t('capital.regionGatedNotice')} {t('capital.exploreFundInfo')}
      </Banner>
    );
  }

  return (
    <div className="xidig-capital-maalgeli">
      {error ? <Banner kind="error">{error.message || t('error.server')}</Banner> : null}
      <button
        type="button"
        className="xidig-button xidig-button--primary xidig-capital-maalgeli__cta"
        disabled={pending}
        onClick={() => setAttestOpen(true)}
      >
        {t('term.maalgeli')}
      </button>
      <p className="xidig-card__meta">{t('capital.maalgeliHint')}</p>

      <AttestationModal
        open={attestOpen}
        pending={pending}
        onConfirm={confirmAttestation}
        onCancel={() => setAttestOpen(false)}
      />
      <VentureFundModal
        open={fundOpen}
        candidateId={candidateId ?? null}
        onClose={() => setFundOpen(false)}
      />
    </div>
  );
}
