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
  'action.signIn': 'Soo gal',
  'action.signOut': 'Ka bax',
  'action.createAccount': 'Samee akoon',
  'action.joinWaitlist': 'Ku biir safka sugitaanka',
  'action.resetPassword': 'Dib u deji furaha sirta',
  'action.requestNewLink': 'Codso link cusub',
  'action.requestNewCode': 'Codso koodh cusub',
  'action.useMagicLink': 'Isticmaal link gelitaanka',
  'action.sendLink': 'Dir link gelitaanka',
  'action.sendCode': 'Dir koodhka',
  'action.verifyCode': 'Xaqiiji koodhka',
  'action.setPassword': 'Deji furaha sirta',
  'action.changePassword': 'Beddel furaha sirta',
  'action.dismiss': 'Iska dhaaf',
  'action.createInvite': 'Samee koodh martiqaad',
  'action.sendInvite': 'Dir martiqaad',
  'action.appeal': 'Codso racfaan',

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
  'error.sessionExpired': 'Waa lagaa saaray gudaha. Mar kale soo gal si aad u sii waddo.',
  'error.magicLinkExpired':
    'Linkigaas gelitaanku wuu dhacay — waxay shaqeeyaan 10 daqiiqo oo keliya. Codso mid cusub.',
  'error.otpInvalid':
    'Koodhkaasi ma shaqayn — koodhadhku waxay dhacaan 10 daqiiqo ka dib. Codso mid cusub, ama isticmaal link gelitaanka.',
  'error.wrongCredentials':
    'Emailkaas iyo furaha sirtu isuma dhigmaan. Mar kale isku day, dib u deji furaha sirta, ama ku gal link gelitaan.',
  'error.accountSuspended':
    'Akoonkaaga waa la hakiyay. Haddii aad u malaynayso inay khalad tahay, halkan racfaan ka codso.',
  'error.signupNotAllowed':
    'Xidig hadda waa beta gaar ah — waxaad u baahan tahay koodh martiqaad si aad ugu biirto. Koodh ma haysatid? Ku biir safka sugitaanka, boosna waan kuu haynaa.',
  'error.inviteInvalid':
    'Koodhkaas martiqaadku ma shaqayn. Hubi qoraalka — koodhadhku waxay u eg yihiin XIDIG-XXXX-XXXX. Koodh ma haysatid? Ku biir safka sugitaanka.',
  'error.inviteUsed':
    'Koodhkaas martiqaad horey ayaa loo isticmaalay — koodh kastaa hal mar buu shaqeeyaa. Weydii qofkii ku martiqaaday mid cusub, ama ku biir safka sugitaanka.',
  'error.alreadyRegistered':
    'Horey ayaad akoon ugu lahayd emailkaas ama lambarkaas. Soo gal — martiqaadkaaguna qof kale ayuu u furan yahay.',
  'error.emailNotConfirmed':
    'Marka hore xaqiiji emailkaaga — link ayaan kuu dirnay markaad isdiiwaangelisay. Waxaa laga yaabaa inuu dhacay; codso link gelitaan oo cusub, halkaasna waan kugu xaqiijin doonnaa.',
  'error.passwordTooShort':
    'Furaha sirtaasi aad buu u gaaban yahay. Isticmaal ugu yaraan {min} xaraf — dhawr eray oo aan la filayn ayaa aad u wanaagsan.',
  'error.passwordTooLong': 'Furaha sirtaasi aad buu u dheer yahay — ugu badnaan waa {max} xaraf.',
  'error.passwordBreached':
    'Furaha sirtaas waxaa laga helay xogo horey loo xaday, marka halkan kuma badbaadsana. Dooro mid kale — kan dheer ayaa ka xoog badan.',
  'error.emailTaken':
    'Emailkaas akoon kale oo Xidig ah ayuu ku xiran yahay. Kaas soo gal, ama isticmaal email kale.',
  'error.phoneTaken':
    'Lambarkaas taleefan akoon kale oo Xidig ah ayuu ku xiran yahay. Kaas soo gal, ama isticmaal lambar kale.',
  'error.phoneInvalid':
    'Kaasi uma eka lambar taleefan oo dhammaystiran. Ku dar koodhka dalka, sida +252 61 234 5678.',
  'error.smsUnavailable':
    'Hadda farriin qoraal ah kuma diri karno. Isku day link gelitaanka ama furaha sirta — annaguna waan ka shaqaynaynaa.',
  'error.rateLimited': 'Aad ayaad isku dayday hadda. Daqiiqad sug, kadibna mar kale isku day.',
  'error.invalidRequest':
    'Codsigaas wax khaldan ayaa ku jiray. Bogga cusboonaysii oo mar kale isku day.',

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Dhamaystir boggaaga',
  'onboarding.pickLanes': 'Dooro waddooyinkaaga',
  'onboarding.followThree': 'Raac 3 dhise',
  'onboarding.firstPost': 'Qor qoraalkaaga ugu horreeya',
  'onboarding.setPassword': 'Ku dar fure sirta dheeri ah',

  // Home screen
  'home.welcome': 'Ku soo dhawoow Xidig.',
  'home.communityProof': 'Dhisayaashu halkan way isu garab istaagaan:',

  // Auth flows (Phase 1)
  'auth.signInTitle': 'Soo gal Xidig',
  'auth.signUpTitle': 'Ku biir Xidig',
  'auth.methodPassword': 'Furaha sirta',
  'auth.methodMagicLink': 'Link gelitaan',
  'auth.methodSms': 'Koodh SMS',
  'auth.emailLabel': 'Email',
  'auth.phoneLabel': 'Lambarka taleefanka',
  'auth.phoneHint': 'Ku dar koodhka dalka, sida +252 61 234 5678.',
  'auth.passwordLabel': 'Furaha sirta',
  'auth.newPasswordLabel': 'Fure sirta oo cusub',
  'auth.passwordRules':
    'Ugu yaraan {min} xaraf. Kan dheer ayaa ka xoog badan — dhawr eray oo aan la filayn ayaa aad u wanaagsan.',
  'auth.otpCodeLabel': 'Koodhka gelitaanka',
  'auth.inviteCodeLabel': 'Koodhka martiqaadka',
  'auth.inviteCodeHint': 'Koodhadhku waxay u eg yihiin XIDIG-XXXX-XXXX.',
  'auth.termsAccept': 'Waan ogolahay Shuruudaha Adeegga iyo Siyaasadda Arrimaha Gaarka ah.',
  'auth.chooseMethod': 'Sidee doonaysaa inaad ku gasho?',
  'auth.magicLinkSent':
    'Haddii emailkaasu leeyahay akoon Xidig ah, link gelitaan ayaa soo socda — wuxuu shaqeynayaa 10 daqiiqo.',
  'auth.otpSent':
    'Haddii lambarkaasu leeyahay akoon Xidig ah, koodh gelitaan ayaa soo socda — wuxuu shaqeynayaa 10 daqiiqo.',
  'auth.confirmEmailSent':
    'Wax yar ayaa hadhay — ka eeg emailkaaga link xaqiijin si aad u dhammaystirto akoonkaaga. Wuxuu shaqeynayaa 10 daqiiqo.',
  'auth.resetSent':
    'Ka eeg emailkaaga link aad dib ugu dejiso furaha sirta — wuxuu shaqeynayaa 60 daqiiqo.',
  'auth.passwordUpdated': 'Furaha sirtu waa dejisan yahay. Mar kasta waad ku geli kartaa.',
  'auth.forgotPassword': 'Ma illowday furaha sirta?',
  'auth.noAccount': 'Ku cusub Xidig? Ku soo biir martiqaad',
  'auth.haveAccount': 'Horey xubin u ahayd? Soo gal',
  'auth.errorTitle': 'Dhibaato gelitaan',
  'auth.resetTitle': 'Dib u deji furaha sirta',
  'auth.chooseNewPassword': 'Dooro fure sirta oo cusub',

  // Waitlist / beta gate
  'waitlist.title': 'Ku biir safka sugitaanka Xidig',
  'waitlist.subtitle':
    'Xidig hadda waa beta gaar ah. Noo reeb emailkaaga ama lambarkaaga taleefanka, waana ku casuumi doonnaa marka boosas furmaan.',
  'waitlist.contactLabel': 'Email ama lambar taleefan',
  'waitlist.joined': 'Safka ayaad ku jirtaa! Isla markiiba waan kula soo xiriiri doonnaa marka boos furmo.',
  'waitlist.foundingCounter': {
    one: '{count} boos oo Xubin Aasaasi ah ayaa hadhay — 500-ka xubnood ee ugu horreeya waxay weligood sitaan sumadda.',
    other: '{count} boos oo Xubin Aasaasi ah ayaa hadhay — 500-ka xubnood ee ugu horreeya waxay weligood sitaan sumadda.',
  },
  'waitlist.haveCode': 'Koodh martiqaad ma haysaa?',

  // Account settings
  'settings.accountTitle': 'Akoonka & gelitaanka',
  'settings.methodsIntro': 'Mid kasta oo ka mid ah hababkan ayaa ku geliya isla akoonkan.',
  'settings.emailSection': 'Email',
  'settings.phoneSection': 'Taleefan',
  'settings.passwordSection': 'Furaha sirta',
  'settings.statusVerified': 'La xaqiijiyay',
  'settings.statusUnverified': 'Xaqiijin la sugayo',
  'settings.statusNotSet': 'Ma dejisna',
  'settings.passwordIsSet': 'Waa dejisan',
  'settings.passwordNudgeTitle': 'Ku dar fure sirta dheeri ah',
  'settings.passwordNudgeBody':
    "Waxaad isdiiwaangelisay fure sirta la'aan. Ku dar mid si aad mar kasta u geli karto — xitaa marka emailka ama SMS-ku gaabiyaan.",
  'settings.linkEmailLabel': 'Akoonkan ku dar email',
  'settings.linkPhoneLabel': 'Akoonkan ku dar lambar taleefan',
  'settings.linkEmailPending': 'Ka eeg {email} link xaqiijin si aad u dhammaystirto ku darista.',
  'settings.linkPhonePending': 'Koodh ayaan u dirnay {phone}. Geli si aad u dhammaystirto ku darista.',
  'settings.invitesTitle': 'Martiqaadyadaada',
  'settings.invitesIntro': 'La wadaag koodh si aad dhise kale u keento — koodh kastaa hal mar buu shaqeeyaa.',
  'settings.invitesEmpty': 'Weli koodh martiqaad ma lihid. Samee mid si aad ugu yeedho dhise aad ku kalsoon tahay.',
  'settings.inviteUsed': 'La isticmaalay',
  'settings.inviteOpen': 'Weli lama isticmaalin',

  // Accessibility labels
  'a11y.mainNav': 'Hagitaanka guud',
} satisfies SomaliDictionary;
