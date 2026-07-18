import type { MessageKey } from '@xidig/i18n';

/**
 * Contextual header Create (18 Jul nav review): the button acts on the section
 * you're in instead of always opening the business-listing form. Feeds (and
 * everything without a create form of its own) compose a Plaza post — the
 * app's primary creative act; Labs/Suuq/Events go to their create forms;
 * Capital routes to starting a Space, since Candidates are submitted by Labs.
 */

export type CreateTarget =
  | { kind: 'compose'; labelKey: MessageKey }
  | { kind: 'link'; href: string; labelKey: MessageKey };

const COMPOSE: CreateTarget = { kind: 'compose', labelKey: 'plaza.composerTitle' };

const SECTIONS: ReadonlyArray<{ prefix: string; target: CreateTarget }> = [
  { prefix: '/labs', target: { kind: 'link', href: '/labs/new', labelKey: 'lab.createCta' } },
  { prefix: '/capital', target: { kind: 'link', href: '/labs/new', labelKey: 'lab.createCta' } },
  { prefix: '/suuq', target: { kind: 'link', href: '/suuq/new', labelKey: 'suuq.addListing' } },
  { prefix: '/events', target: { kind: 'link', href: '/events/new', labelKey: 'events.newEvent' } },
  // Short detail routes keep their section's context (the exact-or-slash
  // matcher below stops '/l' swallowing '/labs' and '/c' '/capital').
  { prefix: '/l', target: { kind: 'link', href: '/suuq/new', labelKey: 'suuq.addListing' } },
  { prefix: '/c', target: { kind: 'link', href: '/labs/new', labelKey: 'lab.createCta' } },
];

export function createTargetFor(pathname: string): CreateTarget {
  for (const section of SECTIONS) {
    if (pathname === section.prefix || pathname.startsWith(`${section.prefix}/`)) {
      return section.target;
    }
  }
  return COMPOSE;
}
