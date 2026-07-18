import { describe, expect, it } from 'vitest';

import { createTargetFor } from './create-target';

/**
 * Contextual Create contract: the header button acts on the section you're in
 * — composer on the feeds, the section's create form elsewhere, composer as
 * the default primary creative act everywhere else.
 */

describe('createTargetFor', () => {
  it('composes on the feeds and by default', () => {
    expect(createTargetFor('/')).toEqual({ kind: 'compose', labelKey: 'plaza.composerTitle' });
    expect(createTargetFor('/plaza')).toEqual({ kind: 'compose', labelKey: 'plaza.composerTitle' });
    expect(createTargetFor('/messages/abc')).toEqual({
      kind: 'compose',
      labelKey: 'plaza.composerTitle',
    });
    expect(createTargetFor('/notifications')).toEqual({
      kind: 'compose',
      labelKey: 'plaza.composerTitle',
    });
  });

  it('targets the section create form in Labs, Suuq, and Events', () => {
    expect(createTargetFor('/labs')).toEqual({
      kind: 'link',
      href: '/labs/new',
      labelKey: 'lab.createCta',
    });
    expect(createTargetFor('/labs/writing-club')).toEqual({
      kind: 'link',
      href: '/labs/new',
      labelKey: 'lab.createCta',
    });
    expect(createTargetFor('/suuq/map')).toEqual({
      kind: 'link',
      href: '/suuq/new',
      labelKey: 'suuq.addListing',
    });
    expect(createTargetFor('/events')).toEqual({
      kind: 'link',
      href: '/events/new',
      labelKey: 'events.newEvent',
    });
  });

  it('routes Capital to starting a Space (the path to a Candidate)', () => {
    expect(createTargetFor('/capital')).toEqual({
      kind: 'link',
      href: '/labs/new',
      labelKey: 'lab.createCta',
    });
  });

  it('keeps section context on the short detail routes /l and /c', () => {
    expect(createTargetFor('/l/abc123')).toEqual({
      kind: 'link',
      href: '/suuq/new',
      labelKey: 'suuq.addListing',
    });
    expect(createTargetFor('/l/abc123/edit')).toEqual({
      kind: 'link',
      href: '/suuq/new',
      labelKey: 'suuq.addListing',
    });
    expect(createTargetFor('/c/xyz789')).toEqual({
      kind: 'link',
      href: '/labs/new',
      labelKey: 'lab.createCta',
    });
    // the short prefixes must never swallow their long siblings
    expect(createTargetFor('/labs')).toMatchObject({ href: '/labs/new' });
    expect(createTargetFor('/capital')).toMatchObject({ href: '/labs/new' });
  });

  it('never targets a create form from within that same form', () => {
    expect(createTargetFor('/suuq/new')).toEqual({
      kind: 'link',
      href: '/suuq/new',
      labelKey: 'suuq.addListing',
    });
  });
});
