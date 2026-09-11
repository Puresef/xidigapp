import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({}) }));

import { resolveVentureViewer, type VentureRow } from './views';

/**
 * The venture viewer follows the ACCOUNT standing as well as the Space role
 * (owner ruling, 11 Sep): in the deletion grace a lead or member keeps READ
 * reach (ledger, per-member hours, export) but can no longer manage or
 * contribute; platform oversight (isMod, admin management) needs an active
 * account. The write routes enforce the same with requireActiveUser.
 */

const LEAD = '11111111-1111-4111-8111-111111111111';
const lab = {
  id: 'lab',
  lead_user_id: LEAD,
  ledger_visibility: 'leads',
  hours_visibility: 'leads',
} as unknown as VentureRow;
const member = { role: 'member', status: 'active' } as const;

describe('resolveVentureViewer and the account standing', () => {
  it('active lead: full reach (control)', () => {
    const v = resolveVentureViewer(lab, LEAD, { role: 'member', status: 'active' }, null);
    expect(v).toMatchObject({
      isLead: true,
      canManage: true,
      canContribute: true,
      canReadLedger: true,
      canReadHours: true,
    });
  });

  it('grace lead: reads everything a lead reads, writes nothing', () => {
    const v = resolveVentureViewer(lab, LEAD, { role: 'member', status: 'pending_deletion' }, null);
    expect(v).toMatchObject({
      isLead: true,
      canManage: false,
      canContribute: false,
      canReadLedger: true,
      canReadHours: true,
    });
  });

  it('grace member of a members-visible ledger: reads, cannot contribute', () => {
    const open = { ...lab, ledger_visibility: 'members' } as VentureRow;
    const v = resolveVentureViewer(
      open,
      'm',
      { role: 'member', status: 'pending_deletion' },
      member,
    );
    expect(v).toMatchObject({ isMember: true, canContribute: false, canReadLedger: true });
  });

  it('grace or blocked mod/admin outside the venture: no oversight at all', () => {
    for (const status of ['pending_deletion', 'suspended', 'deactivated', 'deleted'] as const) {
      for (const role of ['mod', 'admin'] as const) {
        const v = resolveVentureViewer(lab, 'x', { role, status }, null);
        expect(v, `${role} ${status}`).toMatchObject({
          isMod: false,
          canManage: false,
          canReadLedger: false,
          canReadHours: false,
        });
      }
    }
  });

  it('active admin outside the venture keeps oversight (control)', () => {
    const v = resolveVentureViewer(lab, 'x', { role: 'admin', status: 'active' }, null);
    expect(v).toMatchObject({ isMod: true, canManage: true, canReadLedger: true });
  });
});
