import { describe, expect, it } from 'vitest';

import { candidateControls, spaceControls } from './standing-controls';

/**
 * Which Space / candidate controls a viewer is OFFERED (owner ruling, 11 Sep:
 * the UI must not invite actions the server refuses). The server refuses a
 * pending_deletion account every escalation (promote, candidate handoff,
 * candidate edit/submit, Lab creation) and every Venture-state change (settings,
 * decisions, membership); ordinary Club/Lab management stays open to the grace.
 */

const base = { isLead: true, isContributor: true, activeAdmin: false } as const;

describe('spaceControls', () => {
  it('active lead of a Venture: everything (control)', () => {
    expect(spaceControls({ ...base, spaceMode: 'venture', accountActive: true })).toEqual({
      showSettingsLink: true,
      canRecordDecision: true,
      canEscalate: true,
    });
  });

  it('grace lead of a Venture: no settings, no decisions, no escalation', () => {
    expect(spaceControls({ ...base, spaceMode: 'venture', accountActive: false })).toEqual({
      showSettingsLink: false,
      canRecordDecision: false,
      canEscalate: false,
    });
  });

  it.each(['club', 'lab'] as const)(
    'grace lead of a %s: settings and decisions stay, escalation goes',
    (spaceMode) => {
      expect(spaceControls({ ...base, spaceMode, accountActive: false })).toEqual({
        showSettingsLink: true,
        canRecordDecision: true,
        canEscalate: false,
      });
    },
  );

  it('an active admin who is not the lead keeps oversight', () => {
    expect(
      spaceControls({
        spaceMode: 'venture',
        isLead: false,
        isContributor: false,
        activeAdmin: true,
        accountActive: true,
      }),
    ).toEqual({ showSettingsLink: true, canRecordDecision: false, canEscalate: true });
  });

  it('a plain member: nothing managerial', () => {
    expect(
      spaceControls({
        spaceMode: 'lab',
        isLead: false,
        isContributor: true,
        activeAdmin: false,
        accountActive: true,
      }),
    ).toEqual({ showSettingsLink: false, canRecordDecision: true, canEscalate: false });
  });
});

describe('candidateControls', () => {
  it('the editor may edit only while active', () => {
    expect(candidateControls({ isEditor: true, accountActive: true }).canEdit).toBe(true);
    expect(candidateControls({ isEditor: true, accountActive: false }).canEdit).toBe(false);
    expect(candidateControls({ isEditor: false, accountActive: true }).canEdit).toBe(false);
  });
});
