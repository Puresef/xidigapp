import { ApiError, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Capital region-gate endpoint — DISABLED (A2 containment).
 *
 * Investment intent is not currently offered on Xidig: there is no approved
 * fund or offering, so there is nothing for this endpoint to gate. It refuses
 * every caller with the truthful capital_unavailable error — deliberately NOT
 * a geography message, because availability (not member location) is the
 * reason. No gate is evaluated and no capital_gate_evaluations row is written
 * (the append-only log records real evaluations only; the historical rows are
 * retained untouched). The pure region-gate lib (lib/capital/region-gate.ts)
 * and its tests are kept for any future, separately-approved activation —
 * which requires the PRD §15/D-08 legal gates plus an explicit code change
 * here, never a flag flip.
 */

export async function POST(): Promise<Response> {
  try {
    await requireUser();
    throw new ApiError('capital_unavailable', 403);
  } catch (error) {
    return handleApiError(error);
  }
}
