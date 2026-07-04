import type { Message } from '../messages';

/**
 * English dictionary — the dictionary of record.
 *
 * Every UI string in the app starts life as a key here (see docs/i18n.md for
 * naming conventions). Somali coverage is tracked against this file and other
 * locales fall back to it key-by-key.
 *
 * Canonical product terms (Bilingual UI Copy & Naming System) live in `nav.*`
 * and `term.*` and are locked by vocabulary.test.ts — do not rename them
 * without a naming-review decision in the PRD.
 */
export const en = {
  // App identity
  'app.name': 'Xidig',
  'app.tagline': 'Where Somali builders connect, build, and fund — end to end.',

  // Navigation — canonical tab names. Capital deliberately has no tab of its
  // own (PRD decision log: entry lives inside Labs), but its label is here for
  // every place the surface is named.
  'nav.home': 'Home',
  'nav.plaza': 'Plaza',
  'nav.labs': 'Labs',
  'nav.suuq': 'Directory & Map',
  'nav.messages': 'Messages',
  'nav.capital': 'Capital',
  'nav.notifications': 'Notifications',
  'nav.profile': 'Profile',

  // Canonical product terms used inside sentences and on buttons
  'term.lab': 'Lab',
  'term.club': 'Club',
  'term.garab': 'Co-sign',
  'term.maalgeli': 'Invest',

  // Core actions
  'action.getStarted': 'Get started',
  'action.garab': 'Co-sign',
  'action.garabCount': { one: '{count} co-sign', other: '{count} co-signs' },
  'action.canHelp': 'I can help',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.back': 'Back',
  'action.retry': 'Try again',
  'action.close': 'Close',
  'action.goHome': 'Go to Home',

  // Language switching
  'language.label': 'Language',
  'language.switchHint': 'Change language',

  // Shared UI states
  'state.loading': 'Loading…',
  'state.empty': 'Nothing here yet.',
  'state.emptyFeed': 'Be the first to post — the Plaza is open.',

  // Errors — plain language per PRD §27: what happened · why · what to do next
  'error.offline': "You're offline. Xidig needs a connection to load — check your signal and try again.",
  'error.server': "Something went wrong on our end. We've been notified automatically — try again in a moment.",
  'error.notFound': "We can't find that page. It may have been deleted or moved.",
  'error.forbidden': "You don't have access to this. If you think that's wrong, contact support.",

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Complete your profile',
  'onboarding.pickLanes': 'Pick your lanes',
  'onboarding.followThree': 'Follow 3 builders',
  'onboarding.firstPost': 'Write your first post',

  // Home screen
  'home.welcome': 'Welcome to Xidig.',
  'home.communityProof': 'Builders back each other here:',

  // Accessibility labels (screen-reader only)
  'a11y.mainNav': 'Main navigation',
} as const satisfies Record<string, Message>;

/** Every valid message key, derived from the English dictionary. */
export type MessageKey = keyof typeof en;
