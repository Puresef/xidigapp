import type { PluralMessage } from '../messages';
import type { en, MessageKey } from './en';

/**
 * Every key is optional (coverage climbs progressively and is tracked by
 * coverage.ts), must exist in English, and must keep the same shape — a
 * plural message in English stays plural in Somali.
 */
type SomaliDictionary = {
  readonly [K in MessageKey]?: (typeof en)[K] extends string ? string : PluralMessage;
};

/**
 * Somali dictionary.
 *
 * Somali is the product's first language (PRD §22): full coverage is the goal,
 * and the trust-defining surfaces — navigation, onboarding, errors, empty
 * states, core actions — are the launch floor (enforced by coverage.test.ts).
 * A key missing here falls back to English at runtime, never to an error.
 */
export const so = {
  // App identity
  'app.name': 'Xidig',
  'app.tagline':
    'Halka ay dhisayaasha Soomaalidu isku xirmaan, wax dhisaan, waxna maalgeliyaan — bilow ilaa dhammaad.',

  // Navigation — canonical tab names (locked by vocabulary.test.ts)
  'nav.home': 'Hoy',
  'nav.plaza': 'Madal',
  'nav.labs': 'Labs',
  'nav.suuq': 'Suuq',
  'nav.messages': 'Fariimo',
  'nav.capital': 'Maal',
  'nav.notifications': 'Digniino',
  'nav.profile': 'Aniga',

  // Canonical product terms
  'term.lab': 'Warshad',
  'term.club': 'Koox',
  'term.garab': 'Garab',
  'term.maalgeli': 'Maalgeli',

  // Core actions
  'action.getStarted': 'Bilow',
  'action.garab': 'Garab',
  'action.garabCount': { one: '{count} garab', other: '{count} garab' },
  'action.canHelp': 'Waan caawin karaa',
  'action.save': 'Kaydi',
  'action.cancel': 'Ka noqo',
  'action.back': 'Dib u noqo',
  'action.retry': 'Isku day mar kale',
  'action.close': 'Xir',
  'action.goHome': 'Ku laabo Hoyga',

  // Language switching
  'language.label': 'Luqadda',
  'language.switchHint': 'Beddel luqadda',

  // Shared UI states
  'state.loading': 'Waa la soo dejinayaa…',
  'state.empty': 'Weli waxba ma jiraan.',
  'state.emptyFeed': 'Noqo qofka ugu horreeya ee wax qora — Madashu waa furan tahay.',

  // Errors — plain language per PRD §27
  'error.offline':
    'Internet ma haysatid. Xidig wuxuu u baahan yahay xiriir si uu u furmo — hubi shabakadaada oo isku day mar kale.',
  'error.server':
    'Khalad ayaa dhankeenna ka dhacay. Si toos ah ayaa naloo ogeysiiyay — daqiiqad ka dib mar kale isku day.',
  'error.notFound':
    'Boggaas ma heli karno. Waxaa laga yaabaa in la tirtiray ama meel kale loo raray.',
  'error.forbidden':
    'Boggan gelitaan looma ogola. Haddii aad u malaynayso inay khalad tahay, la xiriir kooxda taageerada.',

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Dhamaystir boggaaga',
  'onboarding.pickLanes': 'Dooro waddooyinkaaga',
  'onboarding.followThree': 'Raac 3 dhise',
  'onboarding.firstPost': 'Qor qoraalkaaga ugu horreeya',

  // Home screen
  'home.welcome': 'Ku soo dhawoow Xidig.',
  'home.communityProof': 'Dhisayaashu halkan way isu garab istaagaan:',

  // Accessibility labels
  'a11y.mainNav': 'Hagitaanka guud',
} satisfies SomaliDictionary;
