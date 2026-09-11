// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { SpaceForm } from './space-form';
import { SpaceSettingsForm, type SettingsInitial } from './space-settings-form';

/**
 * The Space forms do not offer escalations the server refuses (owner ruling,
 * 11 Sep). A caller in the deletion grace keeps ordinary Space management but
 * is refused promotion (Club→Lab, Lab→Candidate handoff) and Lab creation, so
 * those controls are absent — not merely disabled — for them, and present for
 * an active lead.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const t = createTranslator('en');

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'en', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const initial = (spaceMode: SettingsInitial['spaceMode']): SettingsInitial => ({
  name: 'Zz',
  summary: '',
  visibility: 'members',
  memberListVisibility: 'members',
  joinMode: 'request',
  isListed: true,
  isSupporterOnly: false,
  problemStatement: 'p',
  hypothesis: 'h',
  successDefinition: 's',
  spaceMode,
});
const media = {
  iconUrl: null,
  iconThumbUrl: null,
  iconBlurhash: null,
  coverUrl: null,
  coverThumbUrl: null,
  coverBlurhash: null,
};
const settings = (spaceMode: SettingsInitial['spaceMode'], canEscalate: boolean) =>
  mount(
    createElement(SpaceSettingsForm, {
      labId: 'lab-1',
      slug: 'zz',
      initial: initial(spaceMode),
      media,
      skillNeeds: [],
      canEscalate,
    }),
  );
const buttons = (host: HTMLElement) =>
  [...host.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

describe('SpaceSettingsForm promotion ladder', () => {
  it('active Club lead is offered Promote to Lab (control)', async () => {
    expect(buttons(await settings('club', true))).toContain(t('lab.actionPromoteLab'));
  });

  it('active Lab lead is offered the Candidate handoff (control)', async () => {
    expect(buttons(await settings('lab', true))).toContain(t('lab.actionPromoteCandidate'));
  });

  it.each(['club', 'lab'] as const)(
    'a %s lead in the grace is offered neither promotion',
    async (mode) => {
      const host = await settings(mode, false);
      expect(buttons(host)).not.toContain(t('lab.actionPromoteLab'));
      expect(buttons(host)).not.toContain(t('lab.actionPromoteCandidate'));
      // Ordinary settings are still offered.
      expect(host.querySelectorAll('input, textarea, select').length).toBeGreaterThan(0);
    },
  );
});

describe('SpaceForm mode choice', () => {
  const radios = (host: HTMLElement) => host.querySelectorAll('input[type="radio"][name="mode"]');

  it('offers Club and Lab by default (control)', async () => {
    expect(radios(await mount(createElement(SpaceForm, {}))).length).toBe(2);
  });

  it('offers only Club when Lab creation is not available (the grace)', async () => {
    const host = await mount(createElement(SpaceForm, { allowLab: false }));
    expect(radios(host).length).toBe(1);
    expect(host.textContent).not.toContain(t('lab.modeLabHint'));
  });
});
