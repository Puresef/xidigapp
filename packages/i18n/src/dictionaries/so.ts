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
  'nav.labs': 'Warshad',
  'nav.suuq': 'Suuq',
  'nav.messages': 'Fariimo',
  'nav.capital': 'Maal',
  'nav.notifications': 'Digniino',
  'nav.profile': 'Aniga',
  'nav.saved': 'Kayd',
  'nav.search': 'Raadi',
  'nav.searchPlaceholder': 'Raadi Xidig',
  'nav.settings': 'Dejinta',
  'nav.awards': 'Abaalmarin',
  'nav.events': 'Munaasabado',
  'nav.leaderboard': 'Caawiyayaasha',

  // Canonical product terms
  'term.lab': 'Warshad',
  'term.club': 'Koox',
  'term.garab': 'Garab',
  'term.maalgeli': 'Maalgeli',

  // Calaamadaha nuxurka la beeray / AI (§21) — SO drafts, need native review
  'content.seededLabel': 'La beeray',
  'content.aiLabel': 'AI la kaashaday',
  'content.aiAccount': 'Kaaliye AI',
  'content.seededTooltip': 'Nuxur bilow ah oo madasha ka yimid, maaha qoraal xubin.',
  'content.aiTooltip':
    'Waxaa sameeyay Xidig AI. Waa la calaamadeeyay si aad uga kala saarto nuxurka xubnaha.',
  'content.aiAccountTooltip': 'Akoon kaaliye AI ah oo si cad loo calaamadeeyay, maaha xubin bini-aadam ah.',

  // Maamul — dib u eegista nuxurka la beeray (§21) — SO drafts, native review
  'admin.seedTitle': 'Nuxurka la beeray',
  'admin.seedSubtitle':
    'Nuxur AI-caawiyay iyo mid la beeray — la calaamadeeyay, la hubin karo, marnaba looma tuso sida nuxur xubin.',
  'admin.seedRunsHeading': 'Wareegyada beerista',
  'admin.seedContentHeading': 'Tirooyinka nuxurka la beeray',
  'admin.seedNoRuns': 'Wali ma jiraan wareegyo beeris ah. Orod shaqada beerista si aad u buuxiso cufnaanta bilowga.',
  'admin.seedColLabel': 'Summad',
  'admin.seedColSource': 'Isha',
  'admin.seedColCreated': 'La abuuray',
  'admin.seedPosts': 'Qoraallada Madal',
  'admin.seedListings': 'Liisaska',
  'admin.seedPlaybooks': 'Qaabab Warshad',
  'admin.seedTags': 'Sumadaha',

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
  'action.resend': 'Dib u dir',
  'action.upgradeSupporter': 'Kor u qaad $1/bishii',
  // Abuur = the create action (locked by vocabulary.test.ts)
  'action.abuur': 'Abuur',
  'action.follow': 'Raac',
  'action.unfollow': 'Jooji raacitaanka',
  'action.following': 'Waad raacaysaa',
  'action.search': 'Raadi',
  'action.add': 'Ku dar',
  'action.remove': 'Ka saar',
  'action.addLink': 'Ku dar link',
  'action.loadMore': 'Muuji kuwo kale',
  'action.post': 'Faafi',
  'action.comment': 'Faallee',
  'action.edit': 'Wax ka beddel',
  'action.delete': 'Tirtir',
  'action.editProfile': 'Wax ka beddel bogga',
  'action.share': 'Wadaag',
  'action.copyLink': 'Koobiyee linkiga',
  'action.linkCopied': 'Linkiga waa la koobiyeeyay.',
  'action.viewOnMap': 'Ka eeg khariidadda',

  // Language switching
  'language.label': 'Luqadda',
  'language.switchHint': 'Beddel luqadda',

  // Shared UI states
  'state.loading': 'Waa la soo dejinayaa…',
  'state.empty': 'Weli waxba ma jiraan.',
  'state.emptyFeed': 'Noqo qofka ugu horreeya ee wax qora — Madashu waa furan tahay.',
  'state.comingSoon': 'Dhawaan ayay furmaysaa',
  'state.comingSoonBody':
    'Qaybtan Xidig waxay furmaysaa marxalad danbe. Suuqu hadda waa furan yahay — ka hel dhisayaal iyo ganacsiyo.',
  'state.endOfList': 'Intaas ayay ahayd.',

  // Errors — plain language per PRD §27
  'error.offline':
    'Internet ma haysatid. Xidig wuxuu u baahan yahay xiriir si uu u furmo — hubi shabakaddaada oo isku day mar kale.',
  'error.server':
    'Khalad ayaa dhankeenna ka dhacay. Si toos ah ayaa naloo ogeysiiyay — daqiiqad ka dib mar kale isku day.',
  'error.notFound':
    'Boggaas ma heli karno. Waxaa laga yaabaa in la tirtiray ama meel kale loo raray.',
  'error.forbidden':
    'Boggan gelitaan looma oggola. Haddii aad u malaynayso inay khalad tahay, la xiriir kooxda taageerada.',
  'error.sessionExpired': 'Gelitaankaagii wuu dhacay. Mar kale soo gal si aad u sii waddo.',
  'error.magicLinkExpired':
    'Linkigaas gelitaanku wuu dhacay — waxay shaqeeyaan 10 daqiiqo oo keliya. Codso mid cusub.',
  'error.otpInvalid':
    'Koodhkaasi ma shaqayn — koodhadhku waxay dhacaan 10 daqiiqo ka dib. Codso mid cusub, ama isticmaal link gelitaanka.',
  'error.wrongCredentials':
    'Emailkaas iyo furaha sirtu iskuma aadaan. Mar kale isku day, dib u deji furaha sirta, ama link gelitaan ku soo gal.',
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
  'error.passwordUnchanged':
    'Furaha sirta cusub waa inuu ka duwanaado kan aad hadda isticmaasho — dooro mid cusub.',
  'error.resetLinkExpired':
    'Linkigaas dib-u-dejinta furaha sirtu wuu dhacay — waxay shaqeeyaan 60 daqiiqo. Codso mid cusub.',
  'error.emailTaken':
    'Emailkaas akoon kale oo Xidig ah ayuu ku xiran yahay. Kaas soo gal, ama isticmaal email kale.',
  'error.phoneTaken':
    'Lambarkaas taleefan akoon kale oo Xidig ah ayuu ku xiran yahay. Kaas soo gal, ama isticmaal lambar kale.',
  'error.phoneInvalid':
    'Kaasi uma eka lambar taleefan oo dhammaystiran. Ku dar koodhka dalka, sida +252 61 234 5678.',
  'error.smsUnavailable':
    'Hadda farriin qoraal ah kuma diri karno. Isku day link gelitaanka ama furaha sirta — annaguna waan ka shaqaynaynaa.',
  'error.emailUndeliverable':
    'Hadda email uma diri karno cinwaankaas — fariimihii hore way soo laabteen. Hubi qoraalka, isticmaal email kale, ama ku sii wad lambarkaaga taleefanka.',
  'error.rateLimited':
    'Marar badan ayaad hadda isku dayday. Daqiiqad sug, ka dibna mar kale isku day.',
  'error.invalidRequest':
    'Codsigaas wax khaldan ayaa ku jiray. Bogga cusboonaysii oo mar kale isku day.',

  // --- Furayaasha API-ga dibadda / MCP (§21/§27) — native review needed ---
  'error.invalidApiKey':
    'Furahaas API sax maaha. Hubi furaha, ama mid cusub ka samayso goobaha Xidig.',
  'error.apiKeyExpired':
    'Furahaas API wuu dhacay. Mid cusub ka samayso goobaha Xidig si aad u sii wadato.',
  'error.insufficientScope':
    'Furahaas API oggolaansho uma laha ficilkan. Samee fure leh awoodda saxda ah.',

  // Bogga & tusmada (PRD §27)
  'error.handleTaken': 'Magacan hore ayaa loo qaatay. Isku day mid kale.',
  'error.handleInvalid':
    'Magacyadu waxay isticmaalaan 3–30 xaraf oo yaryar, tiro, ama hoos-xariiq — sida maxamed_a.',
  'error.profileIncomplete':
    'Marka hore dhammaystir boggaaga — waxay qaadanaysaa 2 daqiiqo oo keliya.',
  'error.duplicateListing':
    'Liis magacan leh oo kuu dhow ayaa hore u jiray. Ma ganacsigaagaa? Halkan ka sheeg inuu kaaga tahay.',
  'error.listingLimit':
    'Toddobaadkan waxaad gelisay 2 liis — taasi waa xadka hadda. Toddobaadka danbe ayaad mid kale ku dari kartaa.',

  // Madal / Plaza (PRD §27 qaybta Plaza + §15/§26)
  'error.postLimit':
    'Maanta wax badan ayaad faafisay — xubnaha bilaashka ahi waxay faafin karaan {max} jeer maalintii. Berri soo noqo, ama heerkaaga kor u qaad si aad xad dheeraad ah u hesho.',
  'error.commentLimit':
    'Maanta faallooyin badan ayaad qortay — xubnaha bilaashka ahi waxay qori karaan {max} faallo maalintii. Berri soo noqo.',
  'error.imageTooLarge':
    'Sawirkaasi wuu ka weyn yahay {maxMb}MB. Yaree ama dooro mid ka yar — waxaan aqbalnaa JPG, PNG, GIF iyo WebP.',
  'error.imageInvalid':
    'Faylkaasi uma eka sawir aan isticmaali karno. Waxaan aqbalnaa JPG, PNG, GIF iyo WebP.',
  'error.imageModerationBlocked':
    'Sawirkaasi kama gudbin baaritaanka nuxurka, lamana gelin. Isku day sawir kale — ama la xiriir kooxda taageerada haddii aad u malaynayso inay khalad tahay.',
  'error.askAlreadyAnswered':
    'Weydiintan waxaa lagu calaamadeeyay in laga jawaabay. Weli faallo waad qori kartaa haddii aad wax ku dartid.',
  'error.askNotOpen': 'Weydiintan waa la xiray. Faallooyinku way furan yihiin haddii aad wax ku dartid.',
  'error.askCreditInvalid':
    'Faalladaas jawaab looma xulan karo — dooro jawaab qof kale ka bixiyay Weydiintan.',
  'error.pollClosed':
    'Codbixintan waa la xiray — cod lama darin karo, lamana beddeli karo. Natiijadu waa kama-dambays.',
  'error.pollOptionsInvalid':
    'Codbixintu waxay u baahan tahay {min} ilaa {max} doorasho. Hagaaji doorashooyinkaaga oo mar kale isku day.',
  'error.mediaNotReady': 'Mid ka mid ah sawirradaadu si buuxda uma gelin. Ka saar oo mar kale geli.',
  'error.playbookInvalid':
    'Qorshahaas lama heli karo. Dooro mid kale, ama banaan ka bilow.',
  'error.tagInvalid':
    'Tags waxay isticmaalaan 2–50 xaraf yaryar, tiro, ama jiitin (-) — sida halal-finance.',
  'error.tagLimit':
    'Maanta tags badan oo cusub ayaad ku dartay. Isticmaal tag jira, ama berri mar kale isku day.',
  'error.postNotEditable':
    'Qoraalkan wax lagama beddeli karo maxaa yeelay waa la saaray. La xiriir kooxda taageerada haddii aad u malaynayso inay khalad tahay.',

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Dhammaystir boggaaga',
  'onboarding.pickLanes': 'Dooro waddooyinkaaga',
  'onboarding.followThree': 'Raac 3 dhise',
  'onboarding.firstPost': 'Qor qoraalkaaga ugu horreeya',
  'onboarding.setPassword': 'Ku dar fure sirta dheeri ah',
  'onboarding.title': 'Ku soo dhawoow Xidig — aan ku diyaarinno',
  'onboarding.checklistTitle': 'Diyaargarow',
  'onboarding.progress': '{completed} / {total} la dhammeeyay',
  'onboarding.dismiss': 'Xir',
  'onboarding.done': 'Waad diyaar tahay',

  // Looking-for matching (PRD §20)
  'matching.labsSeekingTitle': 'Warshadaha raadinaya xirfadahaaga',
  'matching.labsSeekingBody': 'Warshadahani waxay raadinayaan xirfad aad leedahay.',
  'matching.matchedSkills': 'Waxay raadinayaan:',

  // Interest-based follow suggestions (extras plan item 4)
  'matching.reasonSharesLane': 'Waxaad wadaagtaan waddada {lane}',
  'matching.reasonSharesSkill': 'Waxaad wadaagtaan xirfadda {skill}',
  'matching.reasonSameCity': 'Isku magaalo baad tihiin',
  'matching.reasonSameCountry': 'Isku waddan baad tihiin',
  'matching.reasonSharesOpenTo': 'Labadiinaba waxaad u furan tihiin {label}',
  'matching.reasonTheyHiring': 'Shaqaale bay raadinayaan — adna shaqo baad u furan tahay',
  'matching.reasonYouHiring': 'Shaqo bay u furan yihiin — adna shaqaale baad raadinaysaa',
  'matching.reasonLabSeeking': 'Waxay raadinaysaa xirfaddaada {skill}',
  'matching.skip': 'Iska dhaaf',
  'matching.viewLab': 'Booqo Warshaddan',
  'matching.suggestEmptyTitle': 'Weli wax kuu dhigma lama helin',
  'matching.suggestEmptyBody':
    'Dadkaagu weli Xidig ma joogaan — casuum, oo buuxi waddooyinkaaga, xirfadahaaga iyo magaaladaada si laguu helo.',
  'matching.suggestEmptyCta': 'Casuum dadkaaga',

  // Community Awards (PRD §20)
  'awards.title': 'Abaalmarinta Bulshada',
  'awards.subtitle': 'U codee kuwa ugu fiican rubucaan. Hal cod qeyb kasta — {quarter}.',
  'awards.emptyTitle': 'Wax abaalmarin ah oo furan ma jiraan hadda',
  'awards.emptyBody':
    'Abaalmarinta Bulshada waxay socotaa rubuc kasta. Marka codaynta la furo, waxaad dooran doontaa Lab-ka ugu fiican, Guusha ugu weyn, iyo xubnaha ugu caawiyay. Dib u soo eeg.',
  'awards.categoryBestLab': 'Lab-ka Ugu Fiican',
  'awards.categoryBestWin': 'Guusha Ugu Fiican',
  'awards.categoryMostHelpful': 'Kan Ugu Caawiya',
  'awards.categoryRisingBuilder': 'Dhisaha Soo Kacaya',
  'awards.descBestLab': 'Lab-ka ugu badan wax soo saaray oo dhiirrigeliyay rubucaan.',
  'awards.descBestWin': 'Guusha horay u qaadday bulshada.',
  'awards.descMostHelpful': 'Xubinta ugu caawisay dadka kale.',
  'awards.descRisingBuilder': 'Dhisaha cusub ee horumar dhab ah sameeya.',
  'awards.pickTargetLabel': 'Dooro doorashadaada',
  'awards.pickTargetPlaceholder': 'Xulo…',
  'awards.castVote': 'Cod dir',
  'awards.yourVote': 'Codkaaga',
  'awards.noTargets': 'Wali waxba lagu codeeyo ma jiraan — raac xubno ama baadh Labs iyo Guulo marka hore.',

  // Mentor-in-Residence (PRD §20)
  'mentor.featuredTitle': 'La-taliyaha Wakhtiga',
  'mentor.focusLabel': 'Diirada:',
  'mentor.asksAnswered': {
    one: "Wuxuu jawaabay {count} Su'aal usbuucan",
    other: "Wuxuu jawaabay {count} Su'aal usbuucan",
  },
  'mentor.periodTaken': 'La-taliye ayaa horeba loo magacaabay xilligaas. Dooro xilli kale.',

  // Reputation scores + Top Helper leaderboard (PRD §14)
  'reputation.scoresSection': 'Sumcad',
  'reputation.contributionChip': 'Wax-ku-darsi {count}',
  'reputation.helperChip': 'Caawiye {count}',
  'reputation.leaderboardTitle': 'Caawiyayaasha Ugu Sarreeya',
  'reputation.leaderboardSubtitle': 'Xubnaha jawaabahoodu shaqeeyeen oo kasbaday Helper score-ka ugu badan.',
  'reputation.topHelpersHeading': 'Caawiyayaasha Ugu Sarreeya',
  'reputation.leaderboardEmpty': "Weli Helper score ma jiro. Ka jawaab Ask furan si aad u kasbato.",

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
  'auth.inviteCodeLabelOptional': 'Koodhka martiqaadka (ikhtiyaari)',
  'auth.inviteCodeHint': 'Koodhadhku waxay u eg yihiin XIDIG-XXXX-XXXX.',
  'auth.inviteOptionalHint':
    'Koodh ma haysaa? Ku dar. Haddii kale, hadda waad ku biiri kartaa mid la’aan.',
  'auth.termsAccept': 'Waan ogolahay {terms} iyo {privacy}.',
  'auth.termsLinkText': 'Shuruudaha Adeegga',
  'auth.privacyLinkText': 'Siyaasadda Arrimaha Gaarka ah',
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
  'auth.emailCodeLabel': 'Koodhka emailka ku jira',
  'auth.emailCodeHint':
    'Linkigu ma imanayo mise ma furmayo? Isla emailkaas waxaa ku jira koodh 6-lambar ah — halkan geli.',
  'auth.checkSpam':
    'Sanduuqaaga waxba ma jiraan? Fiiri spam-ka ama promotions ka hor intaadan dib u dirin.',
  'auth.trySmsInstead': 'Emailku ma soo gaarayo? Isku day koodh SMS ah.',
  'auth.tryEmailInstead': 'Farriin qoraal ah ma imanayso? Isku day email.',
  'auth.resendWait': {
    one: '{count} ilbiriqsi ka dib ayaad dib u diri kartaa',
    other: '{count} ilbiriqsi ka dib ayaad dib u diri kartaa',
  },
  'auth.resendLimitHint':
    'Wax ma imanayaan dhawr isku day ka dib? Beddel habka — mid kastaa isla akoonkaaga ayuu ku geliyaa.',

  // Waitlist / beta gate
  'waitlist.title': 'Ku biir safka sugitaanka Xidig',
  'waitlist.subtitle':
    'Xidig hadda waa beta gaar ah. Noo reeb emailkaaga ama lambarkaaga taleefanka, waana ku casuumi doonnaa marka boosas furmaan.',
  'waitlist.contactLabel': 'Email ama lambar taleefan',
  'waitlist.joined':
    'Safka ayaad ku jirtaa! Isla markiiba waan kula soo xiriiri doonnaa marka boos furmo.',
  'waitlist.foundingCounter': {
    one: '{count} boos oo Xubin Aasaasi ah ayaa hadhay — 500-ka xubnood ee ugu horreeya waxay weligood sitaan sumadda.',
    other:
      '{count} boos oo Xubin Aasaasi ah ayaa hadhay — 500-ka xubnood ee ugu horreeya waxay weligood sitaan sumadda.',
  },
  'waitlist.haveCode': 'Koodh martiqaad ma haysaa?',
  // Front door (Phase A)
  'waitlist.updatesOnly': 'Kaliya ii soo dir wararka — ma codsanayo boos xubinnimo.',

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
  'settings.linkPhonePending':
    'Koodh ayaan u dirnay {phone}. Geli si aad u dhammaystirto ku darista.',
  'settings.invitesTitle': 'Martiqaadyadaada',
  'settings.invitesIntro':
    'La wadaag koodh si aad dhise kale u keento — koodh kastaa hal mar buu shaqeeyaa.',
  'settings.invitesEmpty':
    'Weli koodh martiqaad ma lihid. Samee mid si aad ugu yeedho dhise aad ku kalsoon tahay.',
  'settings.inviteUsed': 'La isticmaalay',
  'settings.inviteOpen': 'Weli lama isticmaalin',
  'settings.bandwidthTitle': 'Habka isticmaalka-yar',
  'settings.bandwidthBody':
    'Wuxuu damiyaa sawirrada iyo khariidadda si boggu u furmo degdeg, xoggunna u yaraato.',
  'settings.toggleOn': 'Daaran',
  'settings.toggleOff': 'Damsan',

  // Phase 4.5 — settings hub, privacy, notifications, appearance, data/Lite
  'settings.hubTitle': 'Dejinta',
  'settings.hubProfile': 'Aniga',
  'settings.hubProfileBody': 'Magacaaga, warbixintaada, xirfadahaaga, iyo xiriiriyeyaasha.',
  'settings.hubAccount': 'Akoonka & gelitaanka',
  'settings.hubAccountBody': 'Iimayl, telefoon, furaha, iyo martiqaadyadaada.',
  'settings.hubPrivacy': 'Sirta & badbaadada',
  'settings.hubPrivacyBody': 'Cidda kula soo xiriiri karta iyo meesha aad ka muuqato.',
  'settings.hubNotifications': 'Digniino',
  'settings.hubNotificationsBody': 'Kanaalada, saacadaha aamusnaanta, iyo warbixinta toddobaadlaha.',
  'settings.hubAppearance': 'Muuqaalka',
  'settings.hubAppearanceBody': 'Midabka, cabbirka qoraalka, iyo dhaqdhaqaaqa.',
  'settings.hubLanguage': 'Luqadda',
  'settings.hubLanguageBody': 'Somali ama English — mar kasta beddel.',
  'settings.hubData': 'Xogta & Xawli yar',
  'settings.hubDataBody': 'Kaydso xog, soo dejiso xogtaada, maamul akoonkaaga.',
  'settings.saved': 'Waa la kaydiyay.',
  // Privacy & safety
  'settings.privacyTitle': 'Sirta & badbaadada',
  'settings.privacyControls': 'Xakamaynta sirta',
  'settings.dmPrivacyLabel': 'Cidda fariin kuu soo diri karta',
  'settings.dmPrivacyHint': 'Sheeko cusub waxay had iyo jeer ku bilaabataa codsi aad aqbasho ama diido.',
  'settings.dmPrivacyEveryone': 'Qof kasta',
  'settings.dmPrivacyVerified': 'Xubnaha la xaqiijiyay oo keliya',
  'settings.dmPrivacyNone': 'Cidna',
  'settings.discoverableDirectory': 'Igu muuji buugga xubnaha',
  'settings.discoverableSearchEngines': 'U oggolow mishiinada raadinta inay helaan boggayga',
  'settings.locationGranularityLabel': 'Goobta lagu muujiyo boggaaga',
  'settings.locationGranularityHint': 'Dooro sida saxda ah ee goobtaadu ugu muuqato dadka kale.',
  'settings.locationExact': 'Goobta saxda ah',
  'settings.locationCity': 'Magaalada oo keliya',
  'settings.locationRegion': 'Gobolka oo keliya',
  'settings.locationHidden': 'Qarsoon',
  'settings.blockedTitle': 'Xubnaha la xannibay',
  'settings.blockedIntro': 'Xubnaha la xannibay fariin kuuma soo diri karaan.',
  'settings.blockedEmpty': 'Cidna ma aadan xannibin.',
  'settings.blockedUnknownMember': 'Xubin',
  'settings.unblock': 'Fur xannibaadda',
  'settings.mutedTitle': 'La aamusiyay',
  'settings.mutedIntro': 'Dadka iyo summadaha la aamusiyay kama muuqdaan bogaggaaga — lamana ogeysiiyo.',
  'settings.reportInfoTitle': 'Warbixin-gudbinta',
  'settings.reportInfoBody':
    'Waxaad ka warbixin kartaa qoraal, fariin, ama xubin kasta. Kuwani waa sababaha ay kormeeruhu ku shaqeeyaan:',
  // Notifications
  'settings.notificationsTitle': 'Digniino',
  'settings.notificationsIntro':
    'Dooro halka nooc kasta oo digniin ah kuugu yimaado. Gudaha app-ka had iyo jeer wuu daaran yahay.',
  'settings.matrixCaption': 'Noocyada digniinaha iyo kanaaladooda',
  'settings.matrixType': 'Digniin',
  'settings.matrixInApp': 'Gudaha',
  'settings.matrixEmail': 'Iimayl',
  'settings.matrixPush': 'Push',
  'settings.matrixCellAria': '{type} — {channel}',
  'settings.notifTypeReply': 'Jawaabaha qoraaladaada',
  'settings.notifTypeMention': 'Xusid',
  'settings.notifTypeNewDm': 'Fariimo cusub',
  'settings.notifTypeDmRequest': 'Codsiyada fariimaha',
  'settings.notifTypeDmAccepted': 'Codsi la aqbalay',
  'settings.notifTypeAskCredited': 'Jawaabtaada waa la aqoonsaday',
  'settings.notifTypeAskStale': 'Xusuusinta Weydiimaha furan',
  'settings.notifTypeModerationHold': 'Qoraal dib-u-eegis ku jira',
  'settings.notifTypeModerationRemoved': 'Qoraal la saaray',
  'settings.notifTypeCandidateStatus': 'Isbeddelka xaaladda mashruuca',
  'settings.notifTypeLabUpdate': 'Wararka Warshadda',
  'settings.notifTypeLabJoinRequest': 'Codsiyada ku-biirista Warshadda',
  'settings.notifTypeLabJoinResponse': 'Xubinnimada Warshadda',
  'settings.notifTypeLabPromoted': 'Dallacaadda Warshadda',
  'settings.notifTypeLabDormant': 'Xusuusinta Warshad aamusan',
  'settings.notifTypeLabSkillGap': 'Warshado raadinaya xirfadahaaga',
  'settings.notifTypeLabCollabInvite': 'Martiqaadyada wada-shaqaynta',
  'settings.notifTypeLabCollabResponse': 'Jawaabaha wada-shaqaynta',
  'settings.notifTypeWeeklyDigest': 'Warbixinta toddobaadlaha',
  'settings.quietHoursTitle': 'Saacadaha aamusnaanta',
  'settings.quietHoursEnable': 'Daar saacadaha aamusnaanta',
  'settings.quietHoursHint':
    'Digniinaha push way istaagaan saacadahan (waqtigaaga). Gudaha iyo iimaylka lama taabto.',
  'settings.quietHoursFrom': 'Laga bilaabo',
  'settings.quietHoursTo': 'Ilaa',
  'settings.digestLabel': 'Iimaylka warbixinta toddobaadlaha',
  'settings.digestHint': 'Hal iimayl toddobaadkii oo wata waxa muhiimka ah — weligeed kama badna.',
  'settings.digestWeekly': 'Toddobaadle',
  'settings.digestOff': 'Damsan',
  // Appearance
  'settings.appearanceTitle': 'Muuqaalka',
  'settings.appearanceIntro': 'Sida Xidig uga muuqato qalabkan.',
  'settings.appearanceApplied':
    'Isbeddeladu isla markiiba way dhaqan galaan, wayna ku raacaan marka aad gasho.',
  'settings.themeTitle': 'Midabka',
  'settings.themeSystem': 'Raac qalabka',
  'settings.themeLight': 'Iftiin',
  'settings.themeDark': 'Mugdi',
  'settings.textSizeTitle': 'Cabbirka qoraalka',
  'settings.textSizeS': 'Yar',
  'settings.textSizeM': 'Dhexe',
  'settings.textSizeL': 'Weyn',
  'settings.textSizeXl': 'Aad u weyn',
  'settings.motionTitle': 'Dhaqdhaqaaqa',
  'settings.motionHint': 'Yaree dhaqdhaqaaqa haddii uu ku mashquuliyo ama batari kaa qaato.',
  'settings.motionSystem': 'Raac qalabka',
  'settings.motionOff': 'Yaree dhaqdhaqaaqa',
  // Data & Lite mode
  'settings.dataTitle': 'Xogta & Xawli yar',
  'settings.liteTitle': 'Xawli yar',
  'settings.liteIntro':
    'Waxba lama saaro — sawirrada, muuqaallada, iyo khariidadaha culus waxay sugaan badhanka Muuji ilaa aad codsato.',
  'settings.liteImages': 'Si toos ah u soo rar sawirrada',
  'settings.liteEmbeds': 'Si toos ah u soo rar muuqaallada',
  'settings.liteMaps': 'Si toos ah u soo rar khariidadaha',
  'settings.liteAnimations': 'Daar dhaqdhaqaaqa',
  'settings.liteSmallAvatars': 'Soo rar sawirro yaryar oo xubnaha',
  'settings.liteBundlesAria': 'Gaaboyinka Xawli yar',
  'settings.liteBundleText': 'Qoraal keliya',
  'settings.liteBundleEssentials': 'Muhiimka',
  'settings.liteBundleEverything': 'Wax walba',
  'settings.liteSaved': 'Xawli yar wuxuu kuu kaydiyay qiyaastii {amount} toddobaadkan.',
  'settings.liteSavedNone': 'Weli xog lama kaydin toddobaadkan.',
  'settings.liteMoreLink': 'Xakamayn dheeraad ah: Xogta & Xawli yar',
  'settings.exportTitle': 'Soo dejiso xogtaada',
  'settings.exportBody':
    'Soo dejiso nuqul ka mid ah boggaaga, qoraaladaada, faallooyinkaaga, suuqyadaada, kaydkaaga, iyo qoraalada aan dhammayn — hal fayl.',
  'settings.exportButton': 'Soo dejiso xogtayda',
  'settings.exportDone': 'Xogtaadu way soo degaysaa.',
  'settings.accountStatusTitle': 'Hakii ama tirtir akoonka',
  'settings.accountStatusBody':
    'Hakintu way qarisaa wax walba ilaa aad dib u gasho. Tirtiriddu waa mid rasmi ah 30 maalmood kadib.',
  // SO needs native review
  'settings.accountStatusHelp':
    'Hakintu waxay qarisaa boggaaga iyo nuxurkaaga ilaa aad dib u gasho — waxba lama tirtiro. Codsashada tirtiridda waxay bilawdaa muddo 30 maalmood ah oo aad joojin karto waqti kasta; kadib akoonkaaga si joogto ah ayaa loo tirtiraa.',
  'settings.accountStatusLink': 'Aad dejinta akoonka',
  // Phase 6 (§19) xakamaynta akoonka iskaa ah.
  // SO needs native review
  'settings.accountStatusSectionTitle': 'Xaaladda akoonka',
  'settings.deactivateButton': 'Haki akoonka',
  'settings.deactivateConfirm':
    'Ma hakinaysaa akoonkaaga? Boggaaga iyo nuxurkaaga waa la qarinayaa ilaa aad dib u gasho. Waxba lama tirtiro.',
  'settings.requestDeletionButton': 'Codso tirtirid',
  'settings.cancelDeletionButton': 'Jooji tirtiridda',
  'settings.requestDeletionConfirm':
    'Ma codsanaysaa in akoonka la tirtiro? Waxaad haysataa 30 maalmood aad joojin karto ka hor inta aan wax walba si joogto ah loo tirtirin.',
  'settings.deletionPending':
    'Akoonkaaga waxaa loo qorsheeyay in la tirtiro. {days} maalmood ayaa haray oo aad joojin karto.',
  // Phase 6 (§14) codsiga xaqiijinta xsubinta.
  // SO needs native review
  'settings.verifyTitle': 'Isxaqiiji',
  'settings.verifyBody':
    'Wicitaan muuqaal gaaban ayaa xaqiijinaya inaad tahay qof dhab ah. Xubnaha la xaqiijiyay waxay helaan calaamad iyo kalsooni sare guud ahaan Xidig.',
  'settings.verifyConsentLabel':
    'Waan ogolahay in wicitaanka muuqaalka xaqiijintayda la duubo lagana keydiyo si ammaan ah dib-u-eegis awgeed.',
  'settings.verifyRequestButton': 'Codso xaqiijinta aqoonsiga',
  // Phase 6 (§19) foomka racfaanka xubinta.
  // SO needs native review
  'settings.appealTitle': 'Racfaan ka qaado go’aan kormeerid',
  'settings.appealIntro':
    'Haddii aad u malaynayso in go’aanku qalad ahaa, noo sheeg wixii dhacay. Kormeere ka duwan kii go’aanka gaaray ayaa racfaankaaga dib u eegi doona 72 saacadood gudahood.',
  'settings.appealEmpty':
    'Ma jiraan go’aanno kormeerid oo aad hadda racfaan ka qaadi karto.',
  'settings.appealActionLabel': 'Go’aanka',
  'settings.appealReasonLabel': 'Maxaan u dib u eegnaa?',
  'settings.appealReasonPlaceholder': 'Sharax wixii dhacay…',
  'settings.appealSubmit': 'Gudbi racfaanka',
  'settings.appealActionSuspend': 'Akoonka waa la hakiyay',
  'settings.appealActionWarn': 'Digniin ayaa la bixiyay',
  'settings.appealActionRemove': 'Nuxurka waa la saaray',
  'settings.appealActionHide': 'Nuxurka waa la qariyay',
  'settings.appealActionOther': 'Tallaabo kormeerid',
  // Phase 6 tilmaamaha bulshada (stub).
  // SO needs native review
  'settings.guidelinesTitle': 'Tilmaamaha bulshada',
  'settings.guidelinesBody':
    'Xidig waa meel loogu talagalay bulsho Soomaali oo isxushmaysa. Tilmaamahayaga bulshada oo dhamaystiran ayaa la dhamaystirayaa. Inta u dhaxaysa, daacad ahow, naxariis lahow, oo dhammaan u sii ammaan.',
  'settings.guidelinesLink': 'Wax dheeraad ah ka akhri xidig.net',
  // Account / sessions
  'settings.sessionsTitle': 'Fadhiyada',
  'settings.sessionsIntro': 'Halkan ka bax, ama meel walba ka bax haddii qalab lumo ama la wadaago.',
  'settings.signOutEverywhere': 'Meel walba ka bax',
  'settings.resendVerification': 'Dib u dir iimaylka xaqiijinta',

  // Admin — kormeerid (Phase 2 HITL queue). The rest of admin.* is
  // deliberately English-first (off the launch floor); the moderation queue
  // gets Somali because its reviewers are the Somali-language lane.
  'admin.modTitle': 'Dib-u-eegis kormeerid',
  'admin.modIntro':
    'Nuxur uu AI-gu calaamadeeyay ama uusan go’aan ka gaari karin — kiisaska af-Soomaaliga halkan ayay kormeerayaal ku eegaan.',
  'admin.modEmpty': 'Safku waa bannaan yahay.',
  'admin.modFilterStatus': 'Xaaladda',
  'admin.modFilterLanguage': 'Luqadda',
  'admin.modLangOther': 'Kale / aan la garanayn',
  'admin.modStatusPending': 'La sugayo',
  'admin.modStatusApproved': 'La ansixiyay',
  'admin.modStatusRemoved': 'La saaray',
  'admin.modStatusDismissed': 'La iska dhaafay',
  'admin.modReasonFlagged': 'AI wuu calaamadeeyay — waa la qariyay ilaa aad go’aan gaarto',
  'admin.modReasonUncertain': 'AI ma hubo — weli wuu muuqdaa, go’aan bini’aadmi ayuu u baahan yahay',
  'admin.modAuthor': 'Qoraa',
  'admin.modVerdict': 'Go’aanka AI-ga',
  'admin.modViewContent': 'Fur nuxurka',
  'admin.modNoteLabel': 'Qoraal (ikhtiyaari)',
  'admin.modApprove': 'Ansixi — ha sii muuqdo',
  'admin.modRemove': 'Saar',
  'admin.modDismiss': 'Iska dhaaf',
  'admin.modDecided': 'Go’aanka waa la kaydiyay.',

  // Site footer — links out to the marketing site (xidig.net) legal/about pages
  'footer.privacy': 'Arrimaha Gaarka ah',
  'footer.terms': 'Shuruudaha',
  'footer.about': 'Nagu saabsan',

  // Accessibility labels
  'a11y.mainNav': 'Hagitaanka guud',
  'a11y.footerNav': 'Hagitaanka hoose',
  'a11y.map': 'Khariidad',
  'a11y.notifications': 'Digniino',
  'a11y.notificationsUnread': {
    one: 'Digniino, {count} aan la akhriyin',
    other: 'Digniino, {count} aan la akhriyin',
  },
  'a11y.removeRow': 'Ka saar safkan',
  'a11y.search': 'Raadi',
  'a11y.userMenu': 'Menu-ga akoonka',
  'a11y.moveUp': 'Kor u qaad',
  'a11y.moveDown': 'Hoos u dhig',

  // Following feed on Home (§13)
  'feed.title': 'Kuwa aad raacdo',
  'feed.empty':
    'Weli waxba ma jiraan — raac dad iyo Meelo, qoraalladooda, cusbooneysiintooda, iyo liisaskooda cusubna halkan ayay ka soo muuqan doonaan.',
  'feed.emptyHint':
    'Raac dad iyo Meelo si aad halkan ugu aragto qoraalladooda, cusbooneysiintooda, iyo liisaskooda cusub.',
  'feed.newListingFrom': 'Liis cusub oo ka yimid {name}',
  'feed.labUpdateTag': 'Cusbooneysiinta {kind}',
  'feed.labUpdateCrossPost': 'La wadaagay',
  'feed.labUpdateBy': 'Waxaa qoray {name}',
  'feed.labUpdateOpen': 'Fur Meesha',

  // Share text — WhatsApp/link share of a Space or Venture candidate.
  'share.labText': '{name} oo Xidig ku jira',
  'share.candidateText': 'Eeg musharaxa: {name}',

  // Member profiles — display + edit (§10, §13, §14, §20)
  'profile.displayNameLabel': 'Magaca',
  'profile.handleLabel': 'Magaca gaarka (handle)',
  'profile.handleHint':
    'Xarfo yaryar, tiro, ama hoos-xariiq — 3 ilaa 30. Boggaagu wuxuu noqonayaa /u/magacaaga.',
  'profile.bioLabel': 'Ku saabsan',
  'profile.cityLabel': 'Magaalada',
  'profile.countryLabel': 'Dalka',
  'profile.skillsLabel': 'Xirfadaha',
  'profile.skillsHint': 'Xirfadaha ku kala saar comma (,) — sida design, flutter, logistics.',
  'profile.lanesLabel': 'Waddooyinka',
  'profile.lanesHint': 'Qaybaha aad wax ka dhisto.',
  'profile.linksLabel': 'Linkiyo',
  'profile.linkLabelLabel': 'Magaca linkiga',
  'profile.linkUrlLabel': 'URL',
  'profile.contactTitle': 'Xulashooyinka xiriirka',
  'profile.contactHint':
    'Waxa aad halkan ku darto oo keliya ayaa xubnaha la tusayaa. Bannaan ka tag haddii aadan rabin in lagula xiriiro.',
  'profile.contactWhatsappLabel': 'Lambarka WhatsApp',
  'profile.contactEmailLabel': 'Emailka xiriirka',
  'profile.contactWebsiteLabel': 'Websaydhka',
  'profile.saved': 'Bogga waa la kaydiyay.',
  'profile.followersCount': { one: '{count} raace', other: '{count} raacayaal' },
  'profile.vouchesCount': { one: '{count} dammaanad', other: '{count} dammaanad' },
  'profile.memberSince': 'Xubin ilaa {date}',
  'profile.contactSection': 'Xiriirka',
  'profile.signInToContact': 'Soo gal si aad u aragto xiriirka',
  'profile.badgesSection': 'Sumadaha',
  'profile.badgeFoundingMember': 'Xubin Aasaasi',
  'profile.badgeLabLead': 'Hoggaamiyaha Warshadda',
  'profile.badgeTopHelper': 'Caawiyaha Ugu Sarreeya',
  'profile.badgeEarlyBacker': 'Taageere Hore',
  'profile.badgeMentorInResidence': 'La-taliye Deggan',
  'profile.badgeIdentityVerified': 'Aqoonsi La Xaqiijiyay',
  'profile.badgeCommunityVerified': 'Bulsho La Xaqiijiyay',
  'profile.badgeVerifiedBusiness': 'Ganacsi La Xaqiijiyay',
  'profile.verifStatusUnverified': 'Aan la xaqiijin',
  'profile.verifStatusPending': 'Xaqiijin socota',
  'profile.verifStatusCommunity': 'Bulsho la xaqiijiyay',
  'profile.verifStatusIdentity': 'Aqoonsi la xaqiijiyay',
  'profile.joinCta': 'Ku biir Xidig si aad ula xiriirto {name}',
  'profile.notSetUp': 'Weli boggaaga ma aadan dejin — waxay qaadanaysaa 2 daqiiqo oo keliya.',
  // Phase 4.5 — media identity, open-to, pins, completion meter, suggested follows
  'profile.avatarLabel': 'Sawirka profile-ka',
  'profile.avatarUpdated': 'Sawirka waa la beddelay.',
  'profile.avatarUpload': 'Soo geli sawir',
  'profile.coverAlt': 'Sawirka daboolka ee {name}',
  'profile.coverLabel': 'Sawirka daboolka',
  'profile.coverUpdated': 'Daboolka waa la beddelay.',
  'profile.coverUpload': 'Soo geli dabool',
  'profile.mediaSection': 'Sawirro',
  'profile.mediaRemoved': 'Waa la saaray.',
  'profile.uploading': 'Waa la gelinayaa…',
  'profile.openToTitle': 'U furan',
  'profile.openToHint':
    'U sheeg xubnaha waxa aad u furan tahay — waxay ka muuqataa profile-kaaga iyo buugga xubnaha.',
  'profile.openToCofounding': 'Aasaas wadajir',
  'profile.openToHiring': 'Shaqaaleysiin',
  'profile.openToHireMe': 'Shaqo-doon',
  'profile.openToInvesting': 'Maalgelin',
  'profile.openToMentoring': 'La-talin',
  'profile.openToCollaborating': 'Iskaashi',
  'profile.pinsTitle': 'La dhejiyay',
  'profile.pinsEmpty': 'Weli waxba lama dhejin.',
  'profile.pinsHint': 'Ku dheji ilaa 3 qoraal, Warshad ama ganacsi profile-kaaga.',
  'profile.pinsMax': 'Ugu badnaan 3 shay baad dhejin kartaa.',
  'profile.pinsSaved': 'Waa la keydiyay.',
  'profile.pinAction': 'Dheji',
  'profile.pinTypePost': 'Qoraal',
  'profile.pinTypeLab': 'Warshad',
  'profile.pinTypeListing': 'Ganacsi',
  'profile.pinsPickerPosts': 'Qoraaladaada dhow',
  'profile.pinsPickerLabs': 'Warshadahaaga',
  'profile.pinsPickerListings': 'Ganacsiyadaada',
  'profile.completionTitle': 'Heerka profile-ka',
  'profile.completionPercent': '{percent}% dhamaystiran',
  'profile.completionDone': 'Profile-kaagu waa dhan yahay.',
  'profile.completionNextName': 'Qor magacaaga',
  'profile.completionNextBio': 'Ku dar bio gaaban',
  'profile.completionNextLocation': 'Ku dar goobtaada',
  'profile.completionNextSkills': 'Ku dar xirfadahaaga',
  'profile.completionNextLanes': 'Dooro waddo',
  'profile.completionNextLinks': 'Ku dar link',
  'profile.completionNextAvatar': 'Ku dar sawir',
  'profile.suggestedFollowsTitle': 'Dad aad raacdo',
  'profile.suggestedFollowsHint': 'Dhisayaal kula wadaaga waddo, xirfad ama magaalo.',

  // Suuq — directory, map, listings (§18)
  'suuq.tabPeople': 'Dadka',
  'suuq.tabBusinesses': 'Ganacsiyada',
  'suuq.tabMap': 'Khariidadda',
  'suuq.searchPeoplePlaceholder': 'Magac ama handle — qoraal kasta (Maxamed, Mohamed…)',
  'suuq.searchBusinessPlaceholder': 'Magaca ganacsiga ama waxa uu qabto',
  'suuq.filterSkill': 'Xirfad',
  'suuq.filterLane': 'Waddo',
  'suuq.filterCity': 'Magaalo',
  'suuq.filterCountry': 'Dal',
  'suuq.filterCategory': 'Qayb',
  'suuq.filterVerified': 'Xaqiijin',
  'suuq.filterVerifiedOption': 'Kuwa la xaqiijiyay kaliya',
  'suuq.anyOption': 'Dhammaan',
  'suuq.noResults': 'Natiijo lama helin. Isku day qoraal ka gaaban ama shaandho ka yar.',
  'suuq.emptyPeople': 'Weli xubno lama helin. Dhammaystir profiilkaaga oo ku casuun kuwa kale.',
  'suuq.emptyPeopleQuery': 'Cidna kuma habboona raadintaas. Isku day qoraal ka gaaban.',
  'suuq.emptyPeopleFilters': 'Xubno kuma habboona shaandhooyinkan. Isku day inaad mid ka saarto.',
  'suuq.emptyBusinesses': 'Weli ganacsi lama diiwaangelin — ku dar kaaga.',
  'suuq.emptyBusinessesQuery': 'Ganacsi kuma habboona raadintaas. Isku day erayo yar.',
  'suuq.emptyBusinessesFilters': 'Ganacsi kuma habboona shaandhooyinkan. Isku day inaad mid ka saarto.',
  'suuq.addListing': 'Ku dar ganacsigaaga',
  'suuq.newListingTitle': 'Ku dar liis ganacsi',
  'suuq.businessNameLabel': 'Magaca ganacsiga',
  'suuq.categoryLabel': 'Qaybta',
  'suuq.descriptionLabel': 'Sharaxaad kooban',
  'suuq.addressLabel': 'Cinwaanka (ikhtiyaari)',
  'suuq.landmarkLabel': 'Calaamad dhow (ikhtiyaari)',
  'suuq.landmarkHint': 'Meel caan ah oo u dhow — sida "ka soo horjeedka albaabka 4 ee Bakaaraha".',
  'suuq.pinLabel': 'Biinka goobta',
  'suuq.pinHint':
    'Khariidadda biin ku dhig si aad goobtaada u cayimto — biinka ayaan u isticmaalnaa cinwaanka koowaad ee goobaha Soomaaliya.',
  'suuq.pinPlaced': 'Biin waa la dhigay: {lat}, {lng}',
  'suuq.manualCoords': 'Khariidad ma jirto? Gacanta ku geli xogta goobta.',
  'suuq.latLabel': 'Latitude',
  'suuq.lngLabel': 'Longitude',
  'suuq.contactLinksLabel': 'Xiriirka ganacsiga',
  'suuq.contactTypeLabel': 'Nooca',
  'suuq.contactValueLabel': 'Lambar ama link',
  'suuq.duplicatesTitle': 'Liis kan la mid ah ayaa hore u jiray',
  'suuq.duplicatesBody': 'Liis {name} ah ayaa hore u jiray. Ma ganacsigaagaa? Halkan ka sheego.',
  'suuq.claimListing': 'Sheego liiskan',
  'suuq.createAnyway': 'Kaygu wuu ka duwan yahay — si kastaba u samee',
  'suuq.claimEvidenceLabel': 'Sideen ku ogaanaynaa inuu kaaga yahay? (ikhtiyaari)',
  'suuq.claimSubmitted':
    'Sheegashada waa la gudbiyay — kormeere ayaa eegi doona; haddii la ansixiyo, liiska adigaa lagu wareejinayaa.',
  'suuq.unclaimed': 'Aan la sheegan',
  'suuq.mapLowBandwidth': 'Khariidaddu waa damsan tahay habka isticmaalka-yar — halkan waxaa ah liiska.',
  'suuq.searchArea': 'Raadi aaggan',
  'suuq.listedBy': 'Waxaa geliyay {name}',
  'suuq.contactHeading': 'Xiriirka',
  'suuq.verifiedBusiness': 'Ganacsi la xaqiijiyay',
  'suuq.joinCta': 'Ku biir Xidig si aad ula xiriirto ganacsiyada iyo dhisayaasha Soomaalida.',
  'suuq.osmLink': 'Ka fur OpenStreetMap',
  // Phase 4.5 — listing edit, photos, hours, services, price range, filters
  'suuq.editListing': 'Wax ka beddel',
  'suuq.editListingTitle': 'Wax ka beddel xogta ganacsiga',
  'suuq.saveListing': 'Kaydi',
  'suuq.filterOpenTo': 'U furan',
  'suuq.openNowFilter': 'Kuwa hadda furan',
  'suuq.openNow': 'Hadda furan',
  'suuq.photosLabel': 'Sawirro',
  'suuq.photosHint': 'Ilaa {max} sawir, mid kastaa {maxMb}MB. Sawirka hore ayaa daboolka ah.',
  'suuq.photoAttach': 'Ku dar sawirka',
  'suuq.photoCover': 'Dabool',
  'suuq.photoAltLabel': 'Sharaxa sawirka',
  'suuq.photoAltHint':
    'Waajib — wuxuu muuqdaa marka sawirradu damman yihiin, akhristayaasha shaashadduna way akhriyaan.',
  'suuq.photoUploading': 'Waa la rarayaa…',
  'suuq.photoQueued': 'Waa la raray — hubin degdeg ah ayaa ku socota.',
  'suuq.hoursLabel': 'Saacadaha furitaanka',
  'suuq.hoursHint': 'Maalin kasta saacadaha dooro, ama calaamadee xiran.',
  'suuq.closedDay': 'Xiran',
  'suuq.openTimeLabel': 'Furitaan',
  'suuq.closeTimeLabel': 'Xiritaan',
  'suuq.dayMon': 'Isn',
  'suuq.dayTue': 'Tal',
  'suuq.dayWed': 'Arb',
  'suuq.dayThu': 'Kha',
  'suuq.dayFri': 'Jim',
  'suuq.daySat': 'Sab',
  'suuq.daySun': 'Axa',
  'suuq.servicesLabel': 'Adeegyo & qiimo',
  'suuq.servicesHint': 'Ilaa {max} adeeg.',
  'suuq.serviceNameLabel': 'Adeeg',
  'suuq.servicePriceLabel': 'Qiime (ikhtiyaari)',
  'suuq.priceRangeLabel': 'Heerka qiimaha',
  'suuq.priceRangeNone': 'Lama dejin',
  'suuq.priceRangeAria': 'Heerka qiimaha {level} ee 4-ta',
  'suuq.whatsappCta': 'Si toos ah ula hadal',

  // Madal / Plaza (§15, §20, §27)
  'plaza.filterAll': 'Dhammaan',
  'plaza.pinnedHeading': 'Xulka toddobaadkan',
  'plaza.typeIntro': 'Is-barasho',
  'plaza.typeAsk': 'Weydiin',
  'plaza.typeWin': 'Guul',
  'plaza.typeUpdate': 'War',
  'plaza.typePoll': 'Codbixin',
  'plaza.typeIntroHint': 'Bulshada isu soo bandhig.',
  'plaza.typeAskHint': 'Caawimaad weydiiso — xul jawaabta kugu anfacda.',
  'plaza.typeWinHint': 'Wadaag guul — weyn iyo yarba.',
  'plaza.typeUpdateHint': 'Horumarka waxa aad dhisayso.',
  'plaza.typePollHint': 'Su’aal u dhig codka bulshada.',
  'plaza.emptyIntro':
    'Weli is-barasho ma jirto. Ma ku cusub tahay? Is-bandhig — yaad tahay, maxaad dhisaysaa, maxaad u baahan tahay.',
  'plaza.emptyAsk':
    'Weydiimo furan ma jiraan. Wax ma kaa xiran yihiin? Weydiiso — caawiyayaashu halkan aqoonsi bay ku kasbadaan.',
  'plaza.emptyWin':
    'Weli guul lama faafin. Wax ma dhammaystirtay? Faafi guusha — caddayntu waa awoodda bulshadan.',
  'plaza.emptyUpdate': 'Weli war ma jiro. Wax ma dhisaysaa? Wadaag horumarkaaga.',
  'plaza.emptyPoll':
    'Weli codbixin ma jirto. Go’aan ma u baahan tahay? Bulshada weydiiso codbixin degdeg ah.',
  'plaza.composerTitle': 'La wadaag Madasha',
  'plaza.titleLabel': 'Cinwaan (ikhtiyaari)',
  'plaza.bodyLabel': 'Qoraalkaaga',
  'plaza.bodyLabelAsk': 'Maxaad caawimaad ugu baahan tahay?',
  'plaza.bodyLabelPoll': 'Su’aashaada',
  'plaza.linkLabel': 'Link (ikhtiyaari)',
  'plaza.linkHint': 'Linkiyada YouTube, TikTok, Vimeo, X iyo Instagram gudaha app-ka ayay ka ciyaaraan.',
  'plaza.linkNotEmbeddable':
    'Linkaas horudhac uma samayn karno. Wuxuu u baxayaa URL caadi ah — ama dhig link YouTube/TikTok/Vimeo si uu gudaha uga ciyaaro.',
  'plaza.imagesLabel': 'Sawirro',
  'plaza.imagesHint': 'Ilaa {max} sawir, mid kastaa {maxMb}MB — JPG, PNG, GIF ama WebP.',
  'plaza.imageUploading': 'Waa la gelinayaa…',
  'plaza.imageQueued': 'Waa la geliyay — kormeere ayaa si degdeg ah u eegi doona.',
  'plaza.imageAlt': 'Sawirka qoraalka {n}',
  'plaza.tagsLabel': 'Tags',
  'plaza.tagsHint': 'Ilaa {max}. Dooro tags jira ama ku dar mid cusub (xaraf-yaryar-iyo-jiitin).',
  'plaza.pollOptionsLabel': 'Doorashooyinka codbixinta',
  'plaza.pollOptionPlaceholder': 'Doorasho {n}',
  'plaza.pollDurationLabel': 'Codbixintu waxay socanaysaa',
  'plaza.pollDurationDays': { one: '{count} maalin', other: '{count} maalmood' },
  'plaza.askOpen': 'Furan',
  'plaza.askAnswered': 'La jawaabay',
  'plaza.askClosed': 'Xiran',
  'plaza.pollClosed': 'Codbixin xiran',
  'plaza.pollClosesIn': 'Waxay xirmaysaa {when}',
  'plaza.commentsCount': { one: '{count} faallo', other: '{count} faallo' },
  'plaza.reactionFire': 'Dab',
  'plaza.reactionStrong': 'Xoog',
  'plaza.reactionMashallah': 'Mashaallah',
  'plaza.reactionIdea': 'Fikrad',
  'plaza.reactionWatching': 'Daawasho',
  'plaza.edited': 'Wax laga beddelay',
  'plaza.pinned': 'Xul',
  'plaza.hiddenOwn':
    'Adiga keliya ayaa hadda arki kara qoraalkan — waxaa la sugayaa hubin kormeerid oo degdeg ah.',
  'plaza.removedOwn':
    'Qoraalkan waa la saaray. Haddii aad u malaynayso inay khalad tahay, la xiriir kooxda taageerada.',
  'plaza.lowBandwidthMedia': 'Sawirrada iyo muuqaalladu waa damsan yihiin habka isticmaalka-yar.',
  'plaza.commentsHeading': 'Faallooyinka',
  'plaza.commentLabel': 'Faallo ku dar',
  'plaza.creditAnswer': 'Ka dhig jawaabta',
  'plaza.creditedBadge': 'Jawaabta la xushay',
  'plaza.closeAsk': 'Xir Weydiintan',
  'plaza.askStaleTitle': 'Weli caawimaad ma raadinaysaa?',
  'plaza.askStaleBody':
    'Weydiintaadu {days} maalmood ayay furnayd. Xul jawaab haddii aad heshay, ama xir haddii ay xallisantay.',
  'plaza.helperCredited': 'Jawaabta waa la xushay — caawiyuhu wuxuu kasbaday dhibco Caawiye.',
  'plaza.askClosedNotice': 'Weydiinta waa la xiray.',
  'plaza.voteButton': 'Codee',
  'plaza.changeVote': 'Beddel codkaaga',
  'plaza.votesCount': { one: '{count} cod', other: '{count} cod' },
  'plaza.closePoll': 'Xir codbixinta',
  'plaza.yourVote': 'Codkaaga',
  'plaza.interstitialTitle': 'Waxaad ka baxaysaa Xidig',
  'plaza.interstitialBody':
    'Linkani wuxuu aadayaa {host} — bog aynaan dammaanad qaadi karin. Hubi cinwaanka ka hor intaadan sii wadin.',
  'plaza.interstitialContinue': 'U sii soco {host}',
  // Phase 4.5 — per-image alt text, drafts, post edit history
  'plaza.imageAltLabel': 'Sharaxaadda sawirka',
  'plaza.imageAltHint':
    'Sharaxaad gaaban ayaa caawisa akhristayaasha shaashadda iyo xubnaha xawaaraha gaabiya.',
  'plaza.imageAttach': 'Ku dar',
  'plaza.draftsHeading': 'Sii wad qabyo',
  'plaza.draftContinue': 'Sii wad',
  'plaza.draftSaved': 'Qabyada waa la kaydiyay',
  'plaza.draftUntitled': "(qabyo cinwaan la'aan)",
  'plaza.draftRestored': 'Waxaan soo celinnay qabyadaadii.',
  'plaza.draftDeleteLabel': 'Tirtir qabyada: {name}',
  'plaza.editPost': 'Wax ka beddel',
  'plaza.editedAfterReplies': 'La beddelay jawaabo ka dib',
  'plaza.editHistoryCount': 'Taariikhda beddelka ({count})',
  'plaza.editHistoryEmpty': 'Nooc hore ma jiro.',

  // Phase 3 (Fariimo) reusable actions
  'action.message': 'Fariin',
  'action.send': 'Dir',
  'action.accept': 'Aqbal',
  'action.decline': 'Diid',
  'action.block': 'Xannib',
  'action.unblock': 'Furfur',
  'action.report': 'Soo sheeg',
  'action.enable': 'Daar',
  'action.readGuidelines': 'Akhri hagaha',
  'action.manageAccount': 'Maamul akoonka',

  // DMs / Fariimo errors (§27)
  'error.dmBlocked': 'Ma fariimi kartid xubintan — waxay xaddiday fariimahooda.',
  'error.dmNotAccepted':
    'Codsigan fariinta weli lama aqbalin. Waad la sheekaysan doontaa marka la aqbalo.',

  // Labs / Warshad errors (§27)
  'error.notSupporter': 'Abuurista Warshad waxay u baahan tahay xubinnimo Taageere.',
  'error.charterIncomplete':
    'Axdiga Warshaddaadu wuxuu u baahan yahay dhawr meelood oo dheeraad ah ka hor inta aan la daabicin. Halkan ku dhammee.',
  'error.labSlugTaken': 'Ciwaankaas Warshad horey ayaa loo qaatay. Mid kale isku day.',
  'error.labJoinClosed': 'Warshaddan waa casuumaad-kaliya. Hoggaamiyaha weydiiso casuumaad.',
  'error.labAlreadyMember': 'Horey ayaad xubin uga ahayd Warshaddan.',
  'error.labCollabInvalid': 'Xiriirkaas iskaashi hadda ma jiro.',
  'error.pinnedFull':
    'Waxaad muujin kartaa ilaa 3 Warshadood prof-kaaga. Mid ka saar si aad mid u darto.',

  // --- Phase 4.5 experience expansion (§27) ---
  'error.imageAltRequired': 'Marka hore ku dar sharaxaad gaaban sawirkan.',
  'error.pinTargetInvalid': 'Mid ka mid ah waxyaabaha aad dhejinaysay lama helin.',
  'error.draftLimit': 'Waxaad haysataa 10 qabyo. Mid tirtir si aad mid kale u kaydiso.',

  // --- Capital / Maal (§27 Capital block) ---
  'error.reviewerConflict':
    'Waxaad xubin ka tahay Warshaddan, sidaas darteed ma eegi kartid Musharraxeeda. Taasi waa in dib-u-eegistu caddaalad ahaato.',
  'error.candidateNotVisible':
    'Musharraxan waxaa loo dejiyay dib-u-eegayaasha kaliya. Weydiiso hoggaamiyaha Warshadda si aad u gasho.',
  'error.notAReviewer': 'Kaliya dib-u-eegayaasha ayaa tan samayn kara.',
  'error.candidateNotSubmittable':
    'Musharraxan lama gudbin karo hadda. Kaliya qabyo ayaa dib-u-eegis loo diri karaa.',
  'error.voteClosed': 'Codbixinta Musharraxan waa xiran tahay.',

  // Habmaamul / akoon (§27 / §19) — SO waxaa loo baahan yahay dib-u-eegis afka hooyo
  'error.contentRemoved':
    'Qoraalkan waa la saaray sababtoo ah wuxuu ka hor imanayay siyaasadda nuxurkeena. Akhri hagaheena.',
  'error.reportDuplicate':
    'Horay ayaad u soo sheegtay tan — kooxdeennu way eegaysaa. Waad ku mahadsan tahay ilaalinta bulshada.',
  'error.appealAlreadySubmitted':
    'Horay ayaad uga racfaan qaadatay go’aankan. Hal racfaan ayaa loo oggol yahay ficil kasta, waxaanad jawaab ka heli doontaa habmaamule sare 72 saacadood gudahood.',
  'error.appealNotEligible': 'Wax laga racfaan qaato halkan ma jiraan, ama ficilkan adiga kuuma gaar aha.',
  'error.appealSelfReview':
    'Adigaa qaaday ficilkan, sidaas darteed racfaankiisa ma eegi kartid — wuxuu tagaa habmaamule kale.',
  'error.verificationPending':
    'Horay ayaad u leedahay codsi xaqiijin oo socda. Waan kula soo xiriiri doonnaa si aan u qorsheyno wicitaankaaga.',
  'error.notAVerifier': 'Kaliya xaqiijiyayaasha ayaa tan samayn kara.',
  'error.accountAlreadyDeactivated':
    'Akoonkaagu horay ayuu u damay. Mar kasta ku soo gal si aad dib ugu dhaqaajiso.',
  'error.deletionAlreadyRequested':
    'Akoonkaaga horay ayaa loo qorsheeyay in la tirtiro. Waad ka joojin kartaa goobaha akoonka inta lagu jiro muddada nasiinta.',
  'error.awardNoOpenCycle':
    'Codayntu ma furna hadda. Abaalmarinta Bulshada waxay socotaa rubuc kasta — dib u soo eeg.',
  'error.awardAlreadyVoted':
    'Horeba ayaad ugu codaysay qeybtan. Xubin kasta waxay codaysaa hal cod qeyb kasta.',

  'notice.capitalRegionGated':
    'Astaamaha maalgelintu waxay diyaar u yihiin xubnaha gobolka Soomaaliya. Waxaad arkaysaa muuqaalka macluumaadka.',

  // Fariimo — Messages / DMs
  'messages.subtitle': 'Sheekooyinkaaga 1:1 ee dhisayaasha kale.',
  'messages.tabChats': 'Sheekooyin',
  'messages.tabRequests': 'Codsiyo',
  'messages.empty': 'Weli sheeko ma jirto. Fur bogga dhisaha, kadibna taabo Fariin si aad u bilowdo.',
  'messages.emptyRequests': 'Hadda codsi fariin ah ma jiro.',
  'messages.requestsHeading': 'Codsiyada fariinta',
  'messages.you': 'Adiga',
  'messages.new': 'Cusub',
  'messages.unreadCount': { one: '{count} aan la akhriyin', other: '{count} aan la akhriyin' },
  'messages.noPreview': 'Weli fariin ma jirto.',
  'messages.requestExplainer':
    '{name} wuxuu doonayaa inuu ku fariimo. Aqbal si aad u bilowdo sheekada, ama diid — lama ogeysiin doono.',
  'messages.accepted': 'Codsiga waa la aqbalay — hadda waad sheekaysan kartaa.',
  'messages.declinedByYou': 'Codsiga waa la diiday.',
  'messages.pendingSentTitle': 'Codsiga waa la diray',
  'messages.pendingSentBody':
    'Waxaa la sugayaa {name} inuu aqbalo. Waad sii wadi doontaa sheekada marka uu aqbalo.',
  'messages.declinedNotice': 'Codsigan lama aqbalin.',
  'messages.blockedNotice': 'Ma fariimi kartid xubintan.',
  'messages.composerPlaceholder': 'Qor fariin…',
  'messages.requestComposerPlaceholder': 'Salaan bixi oo is-baro…',
  'messages.loadOlder': 'Soo raro fariimo hore',
  'messages.historyStart': 'Kani waa bilowga sheekadiina.',
  'messages.messageRemoved': 'Fariintan waa la saaray.',
  'messages.sendFailed': 'Fariinta lama dirin. Hubi xiriirkaaga oo mar kale isku day.',
  'messages.reconnecting': 'Dib-u-xiriirid…',
  'messages.offline': 'Waad offline tahay — fariimaha waa la diri doonaa marka aad online noqoto.',
  'messages.requestSent':
    'Codsigaaga fariinta waa la diray. Way arki doonaan marka xigta ee ay furaan Xidig.',
  'messages.reportSubmitted':
    'Waad ku mahadsan tahay soo-sheegista. Warbixinnada oo dhan waxaan dib u eegnaa 48 saacadood gudahood, waana kula soo socon doonnaa natiijada.',
  // Habmaamul / akoon (§27 / §19) — SO waxaa loo baahan yahay dib-u-eegis afka hooyo
  'messages.appealSubmitted':
    'Racfaankaaga waxaa loo diray habmaamule sare. Waxaan kaaga jawaabi doonnaa 72 saacadood gudahood.',
  'messages.verificationRequested':
    'Codsigaaga xaqiijinta waa la helay. Waan kula soo xiriiri doonnaa si aan u qorsheyno wicitaankaaga muuqaalka.',
  'messages.accountDeactivated':
    'Akoonkaagu waa damay. Mar kasta ku soo gal si aad dib ugu dhaqaajiso — waxba lama tirtirin.',
  'messages.deletionRequested':
    'Akoonkaaga waxaa loo qorsheeyay in la tirtiro 30 maalmood gudahood. Waad joojin kartaa waqti kasta ka hor, waxaanad ka soo dejisan kartaa nuqul xogtaada ah Goobaha.',
  'messages.deletionCancelled':
    'Ku soo dhawoow. Codsigaagii tirtiridda waa la joojiyay, akoonkaaguna mar kale wuu firfircoon yahay.',
  'messages.optionsLabel': 'Xulashooyinka sheekada',
  'messages.blockConfirm':
    'Ma xannibaysaa {name}? Kuma fariimi kari doono, sheekadanna waa la qarin doonaa.',
  'messages.blocked': '{name} waa la xannibay.',
  'messages.unblocked': '{name} waa laga furfuray.',
  'messages.reportTitle': 'Soo sheeg {name}',
  'messages.reportReasonLabel': 'Maxaad u soo sheegaysaa tan?',
  'messages.reportReasonSpam': 'Spam',
  'messages.reportReasonHarassment': 'Dhibaataynta',
  'messages.reportReasonImpersonation': 'Is-yeelyeelka',
  'messages.reportReasonFraud': 'Khiyaano ama dhagar',
  'messages.reportReasonInappropriate': 'Waxyaabo aan habboonayn',
  'messages.reportReasonMisinfo': 'Macluumaad been ah',
  'messages.reportReasonOther': 'Wax kale',
  'messages.reportDetailsLabel': 'Wax kale oo aan ogaano? (ikhtiyaari)',
  'messages.startError': 'Sheekada lama bilaabi karin. Mar kale isku day daqiiqad kadib.',

  // Fariimo — Notifications inbox
  'notif.subtitle': 'Jawaabo, xusniin, iyo fariimo — la kooxeeyay, ma buuqin.',
  'notif.empty':
    'Wax cusub ma jiraan. Jawaabaha, xusniinta, iyo fariimaha cusub halkan ayay ka soo muuqan doonaan.',
  'notif.markAllRead': 'Dhammaan calaamadee la akhriyay',
  'notif.allRead': 'Dhammaan waa la akhriyay.',
  'notif.reply': '{name} wuu ka jawaabay qoraalkaaga',
  'notif.replyBundle': '{name} iyo {count} kale ayaa ka jawaabay qoraalkaaga',
  'notif.mention': '{name} wuu ku xusay',
  'notif.mentionBundle': '{name} iyo {count} kale ayaa ku xusay',
  'notif.newDm': {
    one: '{name} wuxuu kuu soo diray fariin',
    other: '{name} wuxuu kuu soo diray {count} fariin',
  },
  'notif.dmRequest': '{name} wuxuu doonayaa inuu ku fariimo',
  'notif.dmAccepted': '{name} wuu aqbalay codsigaaga fariinta',
  'notif.askCredited': 'Jawaabtaada waa la xushay — waxaad kasbatay dhibco Caawiye',
  'notif.askStale': 'Weydiintaadu muddo ayay furnayd — xul jawaab ama xir',
  'notif.moderationHold': 'Qoraalkaaga waa la eegayaa',
  'notif.moderationRemoved': 'Qoraalkaaga waa la saaray',
  'notif.candidateStatus': 'Mashruuc aad raacdo ayaa xaaladdiisu isbeddeshay',
  'notif.labUpdate': 'Warbixin cusub oo {name}',
  'notif.labJoinRequest': '{name} wuxuu codsaday inuu ku biiro Warshaddaada',
  'notif.labJoinResponse': 'Xubinnimadaada Warshadda waa la cusboonaysiiyay',
  'notif.labPromoted': '{name} ayaa kor u kacay jaranjarada',
  'notif.labDormant': '{name} way aamustay — ku soo nooleey warbixin',
  'notif.labSkillGap': 'Warshad ayaa raadinaysa xirfadahaaga',
  'notif.labCollabInvite': '{name} wuxuu rabaa inuu kula kaashado',
  'notif.labCollabResponse': 'Codsigaaga iskaashi ayaa jawaab helay',
  'notif.generic': 'Dhaqdhaqaaq cusub oo Xidig ah',

  // Push opt-in
  'push.title': 'Ogeysiisyada riixista',
  'push.body': 'Hel digniin fariimo iyo xusniin cusub, xitaa marka Xidig xiran yahay.',
  'push.enabled': 'Ogeysiisyada riixistu way u shaqeeyaan qalabkan.',
  'push.enable': 'Daar ogeysiisyada',
  'push.disable': 'Dami ogeysiisyada',
  'push.unsupported': 'Browserkani ma taageero ogeysiisyada riixista.',
  'push.denied':
    'Riixistu waa ka xannaaban tahay dejinta browserkaaga. U ogolow ogeysiisyada Xidig si aad u daarto.',
  'push.unavailable':
    'Riixista weli lagama habayn server-ka — ogeysiisyada gudaha app-ku weli way shaqeeyaan.',

  // Labs / Spaces (§16, §20) — draft SO, pending native review.
  'lab.listTitle': 'Warshadaha',
  'lab.listSubtitle':
    'Meelo ay dhisayaasha Soomaaliyeed ku sameeyaan Koox iyo Warshad si ay wax u wada dhisaan.',
  'lab.filterAll': 'Dhammaan',
  'lab.filterClubs': 'Kooxaha',
  'lab.filterLabs': 'Warshadaha',
  'lab.filterMine': 'Meelahayga',
  'lab.emptyList':
    'Weli meelo ma jiraan. Bilow Koox si aad dad ugu soo ururiso fikrad, ama fur Warshad si aad ganacsi u dhisto.',
  'lab.createCta': 'Bilow Meel',
  'lab.createTitle': 'Bilow Meel',
  'lab.createModeQuestion': 'Maxaad bilaabaysaa?',
  'lab.modeClub': 'Koox',
  'lab.modeClubHint': 'Fudud — dad ku soo ururso mawduuc. Bilaash ah.',
  'lab.modeLab': 'Warshad',
  'lab.modeLabHint': 'Dhab ah — jid ganacsi oo axdi leh. Waxay u baahan tahay xubinnimo Taageere.',
  'lab.createSupporterNote': 'Abuurista Warshad waxay u baahan tahay xubinnimo Taageere.',
  'lab.fieldName': 'Magac',
  'lab.fieldSlug': 'Ciwaan',
  'lab.fieldSlugHint': 'Meeshaadu waxay ku taal /labs/ciwaankaaga. Xarfo yaryar, lambaro iyo jajab.',
  'lab.fieldSummary': 'Hal-sadar',
  'lab.fieldSummaryHint': 'Sharaxaad kooban oo ka muuqata kaararka iyo tusmada.',
  'lab.fieldVisibility': 'Yaa arki kara?',
  'lab.fieldJoinMode': 'Yaa ku biiri kara?',
  'lab.fieldSkills': 'Waxaa la raadinayaa',
  'lab.fieldSkillsHint': 'Xirfadaha aad u baahan tahay — xubnaha leh ayaa digniin heli doona.',
  'lab.charterHeading': 'Axdiga Warshadda',
  'lab.charterHint': 'Axdigu waa waxa fikrad u beddela Warshad. Wax ka bedeli kartaa mar dambe.',
  // Playbook picker — six seeded starters that pre-fill the charter fields.
  'lab.playbookLabel': 'Ka bilow qorshe diyaarsan (ikhtiyaari)',
  'lab.playbookNone': "Qorshe la'aan — banaan ka bilow",
  'lab.playbookPickerHint':
    'Dooro meel ku habboon fikraddaada. Waxay buuxinaysaa axdiga hoose — waad wax ka bedeli kartaa eray kasta ka hor inta aadan abuurin Meesha.',
  'lab.playbookOverwriteConfirm':
    'Qorshahani wuxuu leeyahay qoraal axdi oo kala duwan. Ma beddelaysaa waxaad hore u qortay?',
  'lab.playbookGeneric': 'Qorshe',
  'lab.playbookCommunity': 'Mashruuc bulsho',
  'lab.playbookCommunityHint': 'Isku dub-rid dad ku wareegsan baahi ama hadaf bulsho oo wadaag ah.',
  'lab.playbookStartup': 'Fikrad startup / ganacsi cusub',
  'lab.playbookStartupHint':
    'Dhis alaab lagu xalliyo dhibaato macmiil oo dhab ah oo aan si fiican loo daryeelin.',
  'lab.playbookResearch': 'Goob cilmi-baaris / barasho',
  'lab.playbookResearchHint': "Si habaysan wada baadh mowduuc ama su'aal.",
  'lab.playbookLocalService': 'Adeeg deegaan / iskaashi ganacsi',
  'lab.playbookLocalServiceHint': 'Iskaashi si aad u bixiso ama u hagaajiso adeeg deegaankaaga.',
  'lab.playbookCreative': 'Mashruuc hal-abuur / warbaahin',
  'lab.playbookCreativeHint': 'Gee sheeko, fariin, ama shaqo hal-abuur dhagaystayaal.',
  'lab.playbookTechnical': 'Dhisme farsamo / mashruuc software',
  'lab.playbookTechnicalHint': 'Dhis qalab ama nidaam shaqaynaya oo dadku dhab u isticmaalaan.',
  'lab.fieldProblem': 'Dhibaatada',
  'lab.fieldHypothesis': 'Mala-awaal',
  'lab.fieldSuccess': 'Waxa guushu u eg tahay',
  'lab.fieldSprintLength': 'Dhererka wareega (toddobaadyo)',
  'lab.fieldSprintDeadline': 'Wareegga hadda wuxuu dhammaanayaa',
  'lab.visPrivate': 'Gaar ah',
  'lab.visPrivateHint': 'Kaliya xubnaha Meeshan ayaa arki kara.',
  'lab.visMembers': 'Xubno',
  'lab.visMembersHint': 'Xubin kasta oo Xidig ah ayaa arki kara.',
  'lab.visPublic': 'Dadweyne',
  'lab.visPublicHint': 'Qof kasta oo internetka ku jira ayaa arki kara — waa u fiican dhisidda dadweyne.',
  'lab.memberView': 'Muuqaalka liiska xubnaha',
  'lab.joinOpen': 'Furan — qof kasta wuu biiri karaa',
  'lab.joinRequest': 'Codsi — hoggaamiyuhu wuu ansixiyaa',
  'lab.joinInvite': 'Casuumaad kaliya',
  'lab.tabOverview': 'Guudmar',
  'lab.tabUpdates': 'Warbixino',
  'lab.tabArtifacts': 'Wax-soo-saar',
  'lab.tabDecisions': "Go'aanno",
  'lab.tabMembers': 'Xubno',
  'lab.tabHistory': 'Taariikh',
  'lab.tabSettings': 'Dejinta',
  'lab.memberCount': { one: '{count} xubin', other: '{count} xubnood' },
  'lab.lookingFor': 'Waxaa la raadinayaa',
  'lab.ledBy': 'Waxaa hoggaaminaya {name}',
  'lab.stageIdea': 'Fikrad',
  'lab.stageBuilding': 'Dhisme',
  'lab.stageValidating': 'Xaqiijin',
  'lab.stageLaunched': 'La bilaabay',
  'lab.roleLead': 'Hoggaamiye',
  'lab.roleCore': 'Udub-dhexaad',
  'lab.roleMember': 'Xubin',
  'lab.roleObserver': 'Daawade',
  'lab.actionJoin': 'Ku biir',
  'lab.actionRequestJoin': 'Codso inaad ku biirto',
  'lab.actionRequested': 'Codsi sugaya',
  'lab.actionLeave': 'Ka bax',
  'lab.actionPin': 'Ku dheji prof-ka',
  'lab.actionUnpin': 'Ka qaad',
  'lab.actionAddUpdate': 'Warbixin qor',
  'lab.actionAddArtifact': 'Ku dar wax-soo-saar',
  'lab.actionAddDecision': "Diiwaan geli go'aan",
  // Composer field labels, per content kind.
  'lab.updateTitleLabel': 'Cinwaanka warbixinta (ikhtiyaari)',
  'lab.updateBodyLabel': 'Qoraalka warbixinta',
  'lab.artifactTitleLabel': 'Cinwaanka wax-soo-saarka',
  'lab.artifactDescriptionLabel': 'Sharaxaadda wax-soo-saarka',
  'lab.decisionTitleLabel': "Cinwaanka go'aanka",
  'lab.decisionNoteLabel': "Qoraalka go'aanka",
  'lab.crossPostNoteLabel': 'Qoraalka wadaag-dhexeed',
  'lab.actionAddSkill': 'Ku dar xirfad',
  'lab.actionPromoteLab': 'U dallaci Warshad',
  'lab.actionPromoteCandidate': 'U soo bandhig Mashruuc',
  'lab.actionProposeCollab': 'Soo jeedi iskaashi',
  'lab.actionSaveSettings': 'Kaydi isbeddellada',
  'lab.emptyUpdates':
    'Weli warbixino ma jiraan. Qor warbixin toddobaadle si aad horumar u muujiso.',
  'lab.emptyArtifacts':
    'Weli wax-soo-saar ma jiro. La wadaag xiriiri dukumeenti, tusaale, ama bandhig. (Xiriiro kaliya hadda.)',
  'lab.emptyDecisions':
    "Weli go'aanno lama diiwaan gelin. Diiwaangelinta go'aannada ayaa dhammaan isku xiraya.",
  'lab.emptyMembers':
    'Ilaa hadda hoggaamiyaha kaliya. Casuum iskaashato ama fur Meesha si dadku u biiraan.',
  'lab.emptyHistory': 'Taariikhda Meeshu halkan ayay ka bilaabmaysaa.',
  'lab.emptySkills': 'Hadda cid lama raadinayo.',
  'lab.noticeJoinRequested':
    'Codsigaaga ku biiritaanka waa la diray. Hoggaamiyaha Warshaddu wuu eegi doonaa — waxaad heli doontaa digniin marka ay ka jawaabaan.',
  'lab.dormantBanner':
    'Warshaddan waxay aamusnayd 4 toddobaad waana loo calaamadeeyay Hurdo. Weli ma ka shaqaynaysaa? Ku soo nooleey warbixin degdeg ah.',
  'lab.ipBanner':
    'Xusuusin: ilaa codbixinta xubnuhu ay xalliso xeerarka lahaanshaha, wax kasta oo aad halkan daabacdo adaa iska leh. Si taxadar leh u daabac wax-soo-saarka.',
  'lab.skillGapBannerLead':
    'In ka badan toddobaad ayaad raadinaysay {skill}. Ma rabtaa inaad ballaadhiso ama cusboonaysiiso codsiga?',
  'lab.crossPostedFrom': 'Laga soo daabacay {name}',
  'lab.candidateHandoffNote':
    'Tani waxay Warshadda u soo bandhigaysaa Mashruuc — calaamad wareejin. Qalabka maalgashigu wuu dambeeyaa.',
  'lab.sprintCountdown': {
    one: '{count} maalin ka harsan wareegan',
    other: '{count} maalmood ka harsan wareegan',
  },
  'lab.sprintEnded': 'Wareeggii wuu dhammaaday',
  'lab.sprintNone': 'Wakhti wareeg lama dejin',
  'lab.settingsTitle': 'Dejinta Meesha',
  'lab.settingsPromoteHint':
    'Kooxuhu waxay u dallacaan Warshad iyagoo dhammaystiraya axdiga. Dallacaadu wax walba way haysaa — xubnaha, taariikhda, iyo ciwaankan. Dib uma noqoto.',
  'lab.settingsSaved': 'Dejinta waa la kaydiyay.',
  'lab.publicBadge': 'Dhisid dadweyne',
  'lab.badgeDormant': 'Hurdo',
  'lab.signInToJoin': 'Gal si aad ugu biirto ama u raacdo Meeshan.',
  'lab.eventCreated': 'Meesha waa la sameeyay',
  'lab.eventPromoted': 'Waxaa loo dallaciyay Warshad',
  'lab.eventSettingsChanged': 'Dejinta waa la beddelay',
  'lab.eventUpdatePublished': 'Warbixin waa la qoray',
  'lab.eventUpdateCrossposted': 'Warbixin waa la wadaajiyay',
  'lab.eventArtifactAdded': 'Wax-soo-saar waa lagu daray',
  'lab.eventDecisionRecorded': "Go'aan waa la diiwaan geliyay",
  'lab.eventMemberJoined': 'Xubin ayaa ku biirtay',
  'lab.eventMemberLeft': 'Xubin ayaa ka baxday',
  'lab.eventMemberInvited': 'Xubin ayaa la casuumay',
  'lab.eventMemberRemoved': 'Xubin ayaa la saaray',
  'lab.eventJoinRequested': 'Qof ayaa codsaday inuu ku biiro',
  'lab.eventRequestDeclined': 'Codsi ku biiris waa la diiday',
  'lab.eventMemberRoleChanged': 'Doorka xubin ayaa beddelay',
  'lab.eventMarkedDormant': 'Waxaa loo calaamadeeyay Hurdo',
  'lab.eventCandidateCreated': 'Waxaa loo soo bandhigay Mashruuc',
  'lab.eventCollabProposed': 'Iskaashi waa la soo jeediyay',
  'lab.eventCollabAccepted': 'Iskaashi waa la aqbalay',
  'lab.eventCollabDeclined': 'Iskaashi waa la diiday',
  'lab.eventCollabEnded': 'Iskaashi waa la joojiyay',
  'lab.eventSkillNeedAdded': 'Waxaa lagu daray xirfad la raadinayo',
  'lab.eventSkillNeedRemoved': 'Xirfad waa la saaray',
  'lab.eventGeneric': 'Dhaqdhaqaaq',
  // Phase 4.5 — Space visual identity (icon + cover)
  'lab.mediaSection': 'Astaan & dabool',
  'lab.iconLabel': 'Astaanta goobta',
  'lab.iconUpload': 'Geli astaan',
  'lab.iconUpdated': 'Astaanta waa la cusboonaysiiyay',
  'lab.coverLabel': 'Sawirka daboolka',
  'lab.coverAlt': 'Sawirka daboolka ee {name}',
  'lab.coverUpload': 'Geli dabool',
  'lab.coverUpdated': 'Daboolka waa la cusboonaysiiyay',
  'lab.mediaUploading': 'Waa la gelinayaa…',
  'lab.mediaRemoved': 'Waa la saaray',

  // Lite mode — deferred-media placeholders. Show = "Muuji" (locked vocabulary).
  'lite.show': 'Muuji',
  'lite.showAria': 'Muuji {label}',
  'lite.showAllPage': 'Muuji dhammaan boggan',
  'lite.hiddenCount': '{count} qarsoon',
  'lite.estSize': '~{size}',
  'lite.loadFull': 'Soo deji sawirka buuxa',
  'lite.embedLabel': 'Muuqaal',
  'lite.mapLabel': 'Khariidad',
  'lite.promptTitle': 'Xidhiidh gaabis ah?',
  'lite.promptBody': 'U beddel Xawli yar si aad xog u badbaadiso — sawirrada iyo khariidadaha waxay soo baxaan markaad taabato Muuji.',
  'lite.promptAccept': 'Isticmaal Xawli yar',
  'lite.promptDismiss': 'Hadda maya',

  // Saved — bookmarks
  'saved.title': 'Kaydka',
  'saved.empty': 'Weli waxba lama kaydin. Riix Kaydi si aad halkan ugu hayso qoraal, ganacsi ama Warshad.',
  'saved.save': 'Kaydi',
  'saved.saved': 'La kaydiyay',
  'saved.tabPosts': 'Qoraallo',
  'saved.tabListings': 'Ganacsiyo',
  'saved.tabLabs': 'Warshado',

  // Social — mutes, mentions, post options
  'social.postOptions': 'Doorashooyinka qoraalka',
  'social.muteUser': 'Aamusi {name}',
  'social.muteTag': 'Aamusi #{tag}',
  'social.mutedNotice': 'Waa la aamusiyay. Kuma arki doontid boggaaga. Ka fur Dejinta → Sirta.',
  'social.mutedListTitle': 'Aamusan',
  'social.mutedEmpty': 'Weli waxba ma aamusin.',
  'social.mutedTypeUser': 'Xubin',
  'social.mutedTypeTag': 'Sumad',
  'social.mutedTypeLab': 'Warshad',
  'social.unmute': 'Ka fur',
  'social.unmuteLabel': 'Ka fur {name}',
  'social.mentionsLabel': 'Talooyinka @',

  // Search — grouped discovery
  'search.title': 'Raadi',
  'search.subtitle': 'Dad, ganacsiyo, meelo iyo qoraallo — hal sanduuq.',
  'search.inputLabel': 'Maxaad raadinaysaa?',
  'search.placeholder': 'Magac, ganacsi, meel ama qoraal — higgaad kasta',
  'search.minChars': 'Qor ugu yaraan {count} xaraf.',
  'search.noResults': 'Wax lama helin. Isku day higgaad gaaban ama eray kale.',
  'search.groupPeople': 'Dadka',
  'search.groupBusinesses': 'Ganacsiyada',
  'search.groupSpaces': 'Meelaha',
  'search.groupPosts': 'Qoraallada',
  'search.seeMore': 'Dheeraad',
  'search.signInForMore': 'Gal si aad u raadiso qoraallada iyo meelaha xubnaha.',
  'search.teachBody':
    'Hal sanduuq oo dhan: ku hel dadka higgaad kasta (Maxamed ama Mohamed), ganacsiyada, meelaha aad ku biiri karto, iyo qoraallada Madasha.',
  'search.teachExample': 'Isku day magac, xirfad ama mawduuc — “Maxamed”, “dawaarle”, “dhoofinta xalaasha”.',
  // Search polish (extras item 3): tab-yada, calaamadaha kala-soocidda,
  // iyo bogagga faaruqa ah ee wax bara.
  'search.tabAll': 'Dhammaan',
  'search.sortTransparency': 'Waa qoraal-raadin toos ah keliya — kala saarid qarsoon ma jirto.',
  'search.sortNewest': 'Kuwa ugu cusub marka hore',
  'search.sortActivity': 'Dhaqdhaqaaqii u dambeeyay marka hore',
  'search.emptyPeople':
    'Qof lama helin. Natiijada dadku waa bogagga xubnaha — isku day higgaad kasta oo magac (Maxamed, Mohamed) ama handle.',
  'search.emptyPeopleCta': 'Fiiri Suuqa',
  'search.emptyBusinesses':
    'Ganacsi lama helin. Ganacsiyadu waa liisaska xubnuhu ku hayaan Suuqa — dukaammo, adeegyo iyo xirfado.',
  'search.emptyBusinessesCta': 'Fiiri ganacsiyada',
  'search.emptySpaces':
    'Meel lama helin. Meelahu waa Kooxo iyo Warshado ay xubnuhu wax ku bartaan kuna dhisaan.',
  'search.emptySpacesCta': 'Fiiri Meelaha',
  'search.emptyPosts':
    'Qoraal lama helin. Qoraalladu waa wadahadallada Madasha — is-barasho, weydiimo, guulo iyo war-bixinno.',
  'search.emptyPostsCta': 'Tag Madasha',
  'search.postsMembersOnly': 'Qoraallada Madashu waxay u muuqdaan xubnaha keliya. Gal si aad u raadiso.',

  // Capital / Maal (§6/§17/§27). Launch-floor — trust surface, full SO.
  // Maalgeli (Invest) / Garab (Co-sign) reuse term.maalgeli / term.garab /
  // action.garab* — NOT redefined here (vocabulary lock).
  // Index + entry
  'capital.indexTitle': 'Maal',
  'capital.indexSubtitle': 'Mashaariicda bulshadu dhistayso oo taageerayso.',
  'capital.labsEntryLink': 'Fiiri Maalka',
  'capital.filterAll': 'Dhammaan',
  'capital.fromLab': 'Ka timid',
  'capital.emptyTitle': 'Weli ma jiraan Musharrixiin',
  'capital.emptyBody':
    'Musharraxu waa mashruuc Warshad soo bandhigtay si loo taageero. Marka Warshadaha ay soo gudbiyaan, halkan ayay ka muuqan doonaan.',
  'capital.emptyLabsLink': 'Fiiri Warshadaha',
  // Status badges
  'capital.statusDraft': 'Qabyo',
  'capital.statusSubmitted': 'La gudbiyay',
  'capital.statusInReview': 'Dib-u-eegis',
  'capital.statusApproved': 'La ansixiyay',
  'capital.statusParked': 'La dhigay',
  'capital.statusDeclined': 'La diiday',
  // Editor / pitch fields
  'capital.editTitle': 'Wax ka beddel Musharraxa',
  'capital.editSubtitle': 'Buuxi bandhigga, ka dibna u gudbi dib-u-eegis.',
  'capital.editorSaved': 'La kaydiyay.',
  'capital.fieldName': 'Magaca',
  'capital.fieldOneLiner': 'Hal sadar',
  'capital.fieldProblem': 'Dhibaatada',
  'capital.fieldSolution': 'Xalka',
  'capital.fieldTraction': 'Horumar',
  'capital.fieldTeam': 'Kooxda',
  'capital.fieldAsk': 'Codsiga',
  'capital.fieldLogo': 'Astaan',
  'capital.fieldCover': 'Sawirka daboolka',
  'capital.uploading': 'Waa la soo shubayaa…',
  'capital.reviewersOnlyLabel': 'Dib-u-eegayaasha oo keliya',
  'capital.reviewersOnlyHint':
    'Ka qari Musharraxan xubnaha ilaa la go’aamiyo; kaliya dib-u-eegayaasha iyo Warshaddaadu way arki karaan.',
  'capital.submitCta': 'U gudbi dib-u-eegis',
  'capital.submitHint':
    'Gudbintu waxay furaysaa cod Taageere 7-maalmood ah, waxayna u dirtaa dib-u-eegayaasha.',
  // Rubric / reviews
  'capital.rubricHeading': 'Dhibcaha dib-u-eegista',
  'capital.rubricTeam': 'Kooxda',
  'capital.rubricTraction': 'Horumar',
  'capital.rubricFeasibility': 'Suurtagalnimo',
  'capital.rubricOverall': 'Guud ahaan',
  'capital.rubricNoScores': 'Weli lama dhibcayn.',
  'capital.reviewHeading': 'Dib-u-eegistaada',
  'capital.reviewNotesLabel': 'Qoraal',
  'capital.reviewSubmit': 'Kaydi dib-u-eegista',
  'capital.reviewSaved': 'Dib-u-eegista waa la kaydiyay.',
  'capital.reviewerConflictNotice':
    'Waxaad xubin ka tahay Warshaddan, sidaas darteed ma dib-u-eegi kartid Musharraxeeda. Taasi waa in dib-u-eegistu cadaalad ahaato.',
  // Decision controls
  'capital.decisionHeading': "Go'aan",
  'capital.decisionInReview': 'U gudbi dib-u-eegis',
  'capital.decisionApprove': 'Ansixi',
  'capital.decisionPark': 'Dhig',
  'capital.decisionDecline': 'Diid',
  'capital.decisionReasonLabel': 'Sababta (Warshadda ayaa la tusi doonaa)',
  'capital.decisionReasonHint': 'Qoraal gaaban oo cadaalad ah oo Warshaddu arki doonto.',
  // Supporter governance vote
  'capital.voteHeading': 'Codka Taageeraha',
  'capital.voteSignalNote': "Calaamad bulsho oo aan qasab ahayn — way hagtaa, ma go'aamiso.",
  'capital.voteApprove': 'Ansixi',
  'capital.voteReject': 'Diid',
  'capital.voteRetract': 'Ka noqo codka',
  'capital.voteTally': '{approve} ansixi · {reject} diid · {total} wadar',
  // Interests bar (Garab / help / Maalgeli)
  'capital.interestHeading': 'Taageer mashruucan',
  'capital.signInToEngage': 'Soo gal si aad u taageerto mashruucan',
  'capital.cosignCount': { one: '{count} garab', other: '{count} garab' },
  'capital.cosignDone': 'La garbeeyay',
  'capital.canHelp': 'Waan caawin karaa',
  'capital.canHelpDone': 'Caawimo la bixiyay',
  'capital.maalgeliHint': 'Waxay furaysaa Sanduuqa Maalgashiga Xidig.',
  'capital.regionGatedNotice':
    'Sifooyinka maalgashigu waxay diyaar u yihiin xubnaha gobolka Soomaaliya. Waxaad arkaysaa muuqaalka macluumaadka.',
  'capital.exploreFundInfo': 'Wali waad baari kartaa Sanduuqa Maalgashiga Xidig.',
  // Region attestation modal
  'capital.attestTitle': 'Xaqiiji gobolkaaga',
  'capital.attestBody':
    'Ujeeddada maalgashigu waxay diyaar u tahay xubnaha ku sugan Soomaaliya. Fadlan xaqiiji ka hor intaadan sii wadin.',
  'capital.attestCheckbox': 'Waxaan xaqiijinayaa inaan ku sugnahay Soomaaliya.',
  'capital.attestConfirm': 'Xaqiiji',
  // Venture fund modal (fund-first funnel)
  'capital.fundTitle': 'Sanduuqa Maalgashiga Xidig',
  'capital.fundIntro':
    'Diiwaan geli xiisahaaga sanduuqa. Tanu waa habka ugu horreeya ee lagu taageero mashaariicda Xidig.',
  'capital.fundMessageLabel': 'Wax kasta oo aad rabto in sanduuqu ogaado (ikhtiyaari)',
  'capital.fundExpressCta': 'Diiwaan geli xiisaha sanduuqa',
  'capital.fundInterestRecorded':
    'Xiisahaaga sanduuqa waa la diiwaan geliyay. Kooxdu way kula soo xiriiri doontaa.',
  'capital.fundSecondaryToggle': 'Sidoo kale muuji xiisaha Musharraxan gaarka ah',
  'capital.candidateInterestLabel': 'Qoraal Musharraxan (ikhtiyaari)',
  'capital.candidateInterestCta': 'Muuji xiisaha Musharraxan',
  'capital.candidateInterestRecorded':
    'La diiwaan geliyay — xiisahaaga Musharraxan waa la kaydiyay.',
  'capital.securitiesDisclaimer':
    'Waxba halkan lagama bixinayo dammaanad-qaad maalgashi; nooca 1.0 waa kaliya ururinta ujeeddada.',
  // Venture timeline
  'capital.timelineHeading': 'Jadwalka mashruuca',
  'capital.timelineCreated': 'La abuuray',
  'capital.timelineSubmitted': 'Loo gudbiyay taageero',
  'capital.timelineDecided': 'Dib loo eegay',
  'capital.timelineFunded': 'La maalgeliyay',
  // Open member comments (§12)
  'capital.commentsHeading': 'Doodda',
  'capital.commentLabel': 'Ku dar faallo',
  'capital.commentsEmpty': 'Weli ma jiro faallo. Bilow wadahadalka.',

  // ── Front door (Phase A) ──────────────────────────────────────────────
  // SO qabyo (plain register) — dib-u-eegis Soomaali hooyo waa Alpha Hardening Debt.

  // Signed-out chrome
  'marketing.navProduct': 'Adeegga',
  'marketing.navReports': 'Warbixinno',
  'marketing.navMembership': 'Xubinnimo',
  'marketing.requestAccess': 'Codso gelitaan',

  // Landing (/ signed-out) — social-app-first (9 Jul reframe)
  'marketing.heroTitle': 'Barnaamijka bulshada Soomaalida ee xiriir, is-helid, iyo dhisme.',
  'marketing.heroSub':
    'Qor guulahaaga, weydii caawimaad, hel dad iyo ganacsiyo, raac Warshadaha, la fariiso xubnaha, taageerna waxa bulshadu dhisayso — hal barnaamij oo laba-luqadle ah, xog-yarna ku shaqeeya.',
  'marketing.seeProduct': 'Arag waxa gudaha ku jira',
  'marketing.groupsTitle': 'Wax kasta oo grupyadaadu maqan yihiin',
  'marketing.groupsBody':
    'WhatsApp waxa uu ku fiican yahay fariimo degdeg ah — Xidig se wuxuu bulshada siiyaa xusuus. Boggag shakhsi, raadin, qoraallo dadweyne, diiwaanka ganacsiga, goobo mashruuc, iyo fariimo aan ku lumin qulqulka.',
  'marketing.groupsKeep':
    'WhatsApp u hay sheekada qoyska. Xidig waa bulshada Soomaalida ee aad raadin karto, raaci karto, wax la dhisan karto, kuna soo laaban karto.',
  'marketing.blockPlazaTitle': 'Quudin ujeeddo leh',
  'marketing.blockPlazaBody':
    'Qor is-barasho, codsiyo, guulo, iyo ra’yi-ururin — kuna fal-celi si inoo eg. Wadahadaladu waxay noqdaan xusuusta bulshada, ma aha buuq la dhaafo.',
  'marketing.blockProfilesTitle': 'Boggaaga internetka Soomaalida',
  'marketing.blockProfilesBody':
    'Muuji xirfadahaaga, magaaladaada, xiriiriyayaashaada, Warshadahaaga, sumadahaaga, iyo waxa aad u furan tahay. Wadaag hal xiriiriye halkii aad mar walba is-sharxi lahayd.',
  'marketing.blockSuuqTitle': 'Hel dad iyo ganacsiyo',
  'marketing.blockSuuqBody':
    'Raadi tayada Soomaalida, adeegyo, dukaammo, iyo ganacsiyo — magaalo, xirfad, ama qayb ahaan — kadibna si toos ah ula xiriir marka aad diyaar tahay.',
  'marketing.blockDmTitle': 'Fariimo xudduud leh',
  'marketing.blockDmBody':
    'Codsiyada fariimaha, xannibaadda, warbixinta, iyo digniino deggan ayaa wadahadalka faa’iido ku haya — buuqa grupyada la’aantiis.',
  'marketing.blockLabsTitle': 'Fikradaha ka dhig qolal',
  'marketing.blockLabsBody':
    'Ku bilow Koox fudud; u dallacsii Warshad marka ay fikraddu culus noqoto. Warbixinno, go’aanno, xiriiriyayaal, iyo xubno — hal meel ayay ku wada jiraan.',
  'marketing.blockCapitalTitle': 'Taageer waxa la dhisayo',
  'marketing.blockCapitalBody':
    'Garab sii mashaariicda mustaqbalka leh, caawimaad fidi, raacna jadwallada si furan loo dhisayo. Adeegyada ujeeddada maalgashigu waa kuwo gobol ku xaddidan oo ujeeddo-keliya ah — ma jiraan lacago socda.',
  'marketing.blockLiteTitle': 'Loo dhisay internetkeenna',
  'marketing.blockLiteBody':
    'Soomaali iyo Ingiriisi maalinta koowaad. Hab Lite ah oo loogu talagalay xiriirrada gaabis ah — sawirrada, khariidadaha, iyo lifaaqyadu waxay soo baxaan kaliya marka aad taabato.',
  'marketing.blockOwnedTitle': 'Bulshadaa leh, algorithm-ku ma leh',
  'marketing.blockOwnedBody':
    'Maamul hufan, xeerar muuqda, maamul xubneed — iyo kala-horreyn aan ku salaysnayn dabin-jiidasho. Waxa aad raacdo ayaa ah waxa aad aragto.',
  'marketing.finalCta': 'Ku soo laabo gurigaaga — barnaamijka bulshada Soomaalida.',
  'marketing.honestyTitle': 'Run ayaa aasaas ah',
  'marketing.honestyBody':
    'Ma jiraan xubno la been-abuuray, tiro been ah, ama sawirro la sameeyay. Waxa Xidig muujiyo waa dhaqdhaqaaq xubnood oo run ah — tiro kasta oo boggan ku taalna waa mid run ah.',
  'marketing.reportsTeaserBody':
    'Cilmi-baaris ay bulshadu isu keentay oo ku saabsan dhaqaalaha Soomaalida iyo qurbajoogta — la xigtay, daacad ah, lacag la’aanna la akhrisan karo.',
  'marketing.membershipTeaserBody':
    'Ku biirid lacag la’aan ah. Xubinnimada Taageeraha — qiyaastii $1/bishii — waxay furtaa abuurista Warshadaha iyo codaynta maamulka.',

  // Kaadhka "xiga" ee bogga hore (extras item 8) — wuxuu soo baxaa kaliya
  // marka munaasabad dadweyne oo soo socota jirto.
  'marketing.eventNextTitle': 'Waxa xiga',
  'marketing.eventNextCta': 'Arag munaasabadda',

  // Summado qurxin ah oo ku dhex jira muuqaallada astaamaha bogga hore
  // (aria-hidden, guud oo aan magacyo lahayn — xeerka daacadnimada waa taagan
  // yahay).
  'marketing.vigSuuqQuery': 'dawaarle · Hargeysa',
  'marketing.vigSkillOne': 'Naqshad',
  'marketing.vigSkillTwo': 'Ganacsi',
  'marketing.vigSkillThree': 'Dawaarnimo',
  'marketing.vigBaitLabel': 'Kala-horreyn dabin-jiidasho',

  // /product
  'marketing.productTitle': 'Waxa Xidig maanta ku siinayo',
  'marketing.productIntro':
    'Waxa hoos ku qoran oo dhan waa la dhisay wayna shaqeeyaan — kani waa adeegga ay xubnaha aasaasigu maanta isticmaalaan, ma aha qorshe mustaqbal.',
  'marketing.productTrustTitle': 'Kalsooni & xaqiijin',
  'marketing.productTrustBody':
    'Calaamado xaqiijin ah oo aqoonsi, bulsho, iyo ganacsi; maamul bini’aadam ah oo racfaan leh; iyo hab Lite ah oo xushmeeya xiriir kasta oo internet.',
  'marketing.productBetaNote':
    'Xidig wuxuu ku jiraa beta gaar ah. Codso gelitaan, waxaanu kuu haynaa booskaaga aasaasiga ah.',

  // /labs iyo /capital teasers
  'marketing.labsTeaserTitle': 'Warshad — si furan wax u dhis',
  'marketing.labsTeaserBody':
    'Warshaddu waa koox yar oo si furan wax u dhisaysa: axdi, warbixin toddobaadle, horumar, iyo calaamad daacad ah marka hawshu hakato. Warshadaha xooggan waxay bulshada hor keeni karaan musharrax mashruuc.',
  'marketing.labsTeaserNote':
    'Warshad kasta oo dadweyne horeba waxay u leedahay bog la wadaagi karo. Buugga Warshadaha oo dhammaystiran ayaa halkan ku furmaya dhawaan.',
  'marketing.capitalTeaserTitle': 'Maal — mashaariic ay bulshadu taageerto',
  'marketing.capitalTeaserBody':
    'Musharraxiinta mashaariicdu waxay ka soo baxaan Warshadaha, si furan ayaa dib loogu eegaa, xubnuhuna way u codeeyaan. Maanta Xidig wuxuu diiwaangeliyaa ujeeddo keliya — ma jiraan lacago socda.',

  // /about
  'marketing.aboutTitle': 'Ku saabsan Xidig',
  'marketing.aboutStory1':
    'Xidig macnihiisu waa xiddig. Waxaanu dhisaynaa meesha ay dhisayaasha ummadda Soomaaliyeed — gudaha iyo qurbaha — isku helaan oo ay wax wada dhisaan.',
  'marketing.aboutStory2':
    'Tayo iyo karti meel walba ayay bulshadeenna ka jiraan; kalsooni iyo is-helid se way yar yihiin. Xidig waa kaabayaal ay xubnuhu leeyihiin oo labadaba xalliya: madal dadweyne, warshado si furan wax loogu dhiso, buug ganacsi, iyo bulsho taageerta dadkeeda.',
  'marketing.aboutStory3':
    'Si furan ayaanu wax u dhisnaa, tiro been ah ma sameyno, waxaanuna marka hore u naqshadeynaa xiriirka 2G ee Muqdisho.',
  'marketing.aboutCapitalTitle': 'Sida Maal u shaqeeyo',
  'marketing.aboutCapitalBody':
    'Mashaariicdu waxay ku bilaabmaan Warshad, waxay noqdaan musharrax, si furanna xubnaha ayaa dib u eega oo u codeeya. Maanta tani waa hab-socod iyo diiwaangelin ujeeddo — ma aha sanduuq maalgashi, mana aha dalab maalgashi.',
  'marketing.aboutRolesTitle': 'Doorar, ma aha shaqooyin',
  'marketing.aboutRolesBody':
    'Xidig ma laha bog shaqo. Doorarka bulshada — maamulayaal, xaqiijiyayaal, la-taliyayaal — waxaa laga soo doortaa xubnaha gudahooda.',
  'marketing.aboutContactBody': 'Su’aalo, saxaafad, ama iskaashi: nagala soo xiriir bogga xiriirka.',

  // /membership
  'marketing.memberTitle': 'Xubinnimo',
  'marketing.memberIntro': 'Hal bulsho, laba heer. Qiimaha waxaa lala xaqiijiyaa xubnaha — laguma soo rogo.',
  'marketing.memberFreeTitle': 'Xubin — lacag la’aan',
  'marketing.memberFreeBody':
    'Bog shakhsi iyo diiwaan ganacsi, Madasha, buugga, fariimaha, iyo ku biirista Kooxaha. Lacag la’aantu waa joogto.',
  'marketing.memberSupporterTitle': 'Taageere — qiyaastii $1/bishii',
  'marketing.memberSupporterBody':
    'Dhammaan waxa bilaashka ah, oo lagu daray abuurista Warshadaha, soo bandhigista musharraxiinta, iyo codaynta maamulka bulshada.',
  'marketing.memberBillingNote':
    'Lacag-bixintu weli ma shaqeyso. Qiimaha rasmiga ah waxaa lala xaqiijiyaa xubnaha ka hor inta aan qofna lacag laga qaadin.',

  // /contact
  'marketing.contactTitle': 'Xiriir',
  'marketing.contactIntro': 'Su’aalo, saxaafad, iskaashi, ama fikrado — dhammaan waanu akhrinaa.',
  'marketing.contactNameLabel': 'Magacaaga',
  'marketing.contactMessageLabel': 'Fariintaada',
  'marketing.contactSend': 'Dir fariinta',
  'marketing.contactUnavailable':
    'Foomka xiriirku weli ma diyaarsana. Ku biir safka sugitaanka, annagaa kula soo xiriiri doonna.',

  // Legal — nool, la indeksay, sahmiyaha aasaasaha dib u eegay. Meelaha
  // xigmadaysan (Xidig, Somalia) ayaa ah wax
  // kaliya oo aasaasuhu buuxiyo.
  'marketing.privacyUpdatedNotice':
    'Markii ugu dambeysay la cusboonaysiiyay 10 Luulyo 2026. Siyaasaddan waanu cusboonaysiin karnaa; xubnaha waa loo sheegaa ka hor inta uusan isbeddel muhiim ah dhaqan-gelin.',
  'marketing.termsUpdatedNotice':
    'Markii ugu dambeysay la cusboonaysiiyay 10 Luulyo 2026. Shuruudahan waanu cusboonaysiin karnaa; xubnaha waa loo sheegaa ka hor inta uusan isbeddel muhiim ah dhaqan-gelin.',
  'marketing.legalEntityNote':
    'Xidig waxaa laga maamulaa Somalia; shuruudahan iyo siyaasadahanna waxaa xukuma sharciga Soomaaliya.',

  'marketing.privacyTitle': 'Siyaasadda Arrimaha Gaarka ah',
  'marketing.privacyIntro':
    'Siyaasaddani waxay sharxaysaa waxa Xidig ururiyo, sababta, iyo xakamaynta aad ku leedahay. Waxay khusaysaa daalacashada boggagan guud iyo isticmaalka barnaamijka adigoo akoon leh. Xidig, oo fadhigeedu yahay Somalia, ayaa mas’uul ka ah xogtaada shakhsiga ah.',
  'marketing.privacyCollectTitle': 'Waxa aanu ururinno',
  'marketing.privacyCollectBody':
    'Aqoonsiyada akoonka ee aad na siiso markaad biirto (magac, email ama taleefan, iyo furaha sirta ah ee uu maamulo bixiyahayaga xaqiijinta). Xogta bogga ee aad dooratid inaad ku darto (magaalo, xirfado, xiriirro, faah-faahin). Waxa aad soo qorto — qoraallo dadweyne, codbixinno, liisas, fariimo, iyo falcelinno. Faah-faahinta xaqiijinta aqoonsiga iyo ganacsiga ee ikhtiyaariga ah, ku salaysan ogolaansho, haddii aad dooratid inaad xaqiijiso. Waxa aad soo dirto foomka xiriirka markaad noo qorto. Iyo ugu yaraan farsamada loo baahan yahay si adeeggu si ammaan ah u shaqeeyo — sida gobolka laga soo qiyaaso IP-ga, xogta qalabka iyo browser-ka, iyo cookies-ka fadhiga.',
  'marketing.privacyBasisTitle': 'Sababta aanu u isticmaali karno',
  'marketing.privacyBasisBody':
    'Inta badan xogtaada waxaanu u shaqeynaa sababtoo ah waa lagama maarmaan si aanu kuu siinno adeeg aad codsatay — maamulka akoonkaaga, muujinta qoraalladaada dadka aad la wadaagto, gaarsiinta fariimaha, iyo ilaalinta ammaanka goobta. Sifooyinka ikhtiyaariga ah sida falanqaynta iyo xaqiijinta waxay ku tiirsan yihiin ogolaanshahaaga cad, oo aad bixin karto ama laga noqon karto wakhti kasta. Waxaanu ku koobnaa in aan ururinno waxa sifo kasta dhab ahaan u baahan tahay.',
  'marketing.privacyUseTitle': 'Sida aanu u isticmaalno',
  'marketing.privacyUseBody':
    'Si aanu Xidig ku shaqeysiinno: abuurista iyo ammaanka akoonnada, dhisidda quudintaada, gaarsiinta fariimaha, shaqaynta raadinta iyo tusmada, maamulka waxyaabaha la qoro, iyo ilaalinta xubnaha xadgudubka iyo khiyaanada. Xog shakhsi ma iibinno, ujeeddo xayeysiis dadka kalena ma wadaagno, xayeysiis dhinac saddexaadna kuma wadno Xidig.',
  'marketing.privacyAnalyticsTitle': 'Falanqayntu waa ikhtiyaari (opt-in)',
  'marketing.privacyAnalyticsBody':
    'Falanqaynta adeeggu si caadi ah way damsan tahay. Wax akoonkaaga ku saabsan lama diiwaangeliyo ilaa aad ka shideyso falanqaynta oo aad ka marto banaanka ogolaanshaha ama dejintaada arrimaha gaarka ah. Haddii aadan waligaa ogolaan, dhacdo falanqayn oo adiga ku saabsan lama ururiyo, booqdayaasha aan magaca lahayn ee boggagan guudna shakhsi ahaan looma raaco. Doorashadaada wakhti kasta waad ka beddeli kartaa Dejinta.',
  'marketing.privacyCookiesTitle': 'Cookies',
  'marketing.privacyCookiesBody':
    'Waxaanu isticmaalnaa tiro yar oo cookies lagama maarmaan ah oo loo baahan yahay in lagugu geliyo, la ammaaniyo fadhigaaga, oo la xasuusto luqaddaada iyo doorashooyinkaaga arrimaha gaarka ah — kuwaas lama demin karo maxaa yeelay barnaamijku ma shaqeyn karo la’aantood. Cookies-ka ikhtiyaariga ah, sida kuwa loo isticmaalo falanqaynta adeegga, waxaa kaliya la dhigaa ka dib markaad ogolaato banaanka ogolaanshaha. Ma isticmaalno cookies xayeysiis ama raadraac goobo-dhexaad ah.',
  'marketing.privacyVerificationTitle': 'Xaqiijin',
  'marketing.privacyVerificationBody':
    'Xaqiijinta aqoonsiga iyo ganacsigu waa ikhtiyaari, ku salaysan ogolaansho — weligaa laguma qasbo inaad xaqiijiso si aad Xidig u isticmaasho. Sababtoo ah xaqiijintu waxay ku lug yeelan kartaa xog xasaasi ah, faah-faahinta buuxda ee waxa hab kasta baaro oo kaydiyo waxaa lagu daabacaa ogeysiis gaar ah ka hor inta aan xaqiijintu u furmin xubnaha, waana lagaa codsan doonaa ogolaansho markaas.',
  'marketing.privacyRetentionTitle': 'Muddada aanu haynno',
  'marketing.privacyRetentionBody':
    'Xogta akoonkaaga waxaanu haynaa inta uu akoonkaagu firfircoon yahay. Markaad akoonkaaga tirtirto waxaa jira muddo nasasho oo gaaban oo aad go’aankaaga ku beddeli karto; ka dib markay dhaafto, xogtaada shakhsiga ah waa la saaraa halkii la kaydin lahaa. Xog qaar waa la sii hayn karaa oo kaliya haddii sharci na khasbo, ama si loo xalliyo warbixin ammaan ama muran — oo kaliya inta ay ujeeddadaasi socoto.',
  'marketing.privacyRightsTitle': 'Xuquuqdaada iyo xakamayntaada',
  'marketing.privacyRightsBody':
    'Waad heli kartaa oo dib u eegi kartaa xogtaada, waad soo dejisan kartaa nuqul xogtaada ah, waad saxi kartaa boggaaga, akoonkaagana waad tirtiri kartaa — dhammaan Dejinta, qaybta xogta iyo arrimaha gaarka ah. Waxa kale oo aad ka geli kartaa ama ka bixi kartaa falanqaynta wakhti kasta. Haddii aad caawimo u baahan tahay adeegsiga xuquuqdan, nala soo xiriir waanu kuu jawaabi doonnaa.',
  'marketing.privacyTransfersTitle': 'Meesha xogtaada laga maamulo',
  'marketing.privacyTransfersBody':
    'Xidig wuxuu u adeegaa bulsho Soomaali oo caalami ah, gudaha iyo qurbaha, sidaas darteed xogtaada waxaa laga maamuli karaa server-o ku yaal dal aan kuu ahayn annaga iyo bixiyayaasha adeegga ee naga caawiya socodsiinta goobta. Meel kasta oo laga maamuloba, waxaanu ku dabaqnaa ilaalinta lagu sharxay siyaasaddan.',
  'marketing.privacyChildrenTitle': 'Da’',
  'marketing.privacyChildrenBody':
    'Xidig looma talagalin carruur. Waa inaad gaartaa da’da ugu yar ee lagu qeexay Shuruudaha Adeeggayaga si aad akoon u haysato. Haddii aanu ogaanno in qof da’diisu ka yar tahay uu akoon abuuray, waanu tirtiri doonnaa.',
  'marketing.privacyContactTitle': 'Nala soo xiriir arrimaha gaarka ah',
  'marketing.privacyContactBody':
    'Su’aal kasta oo ku saabsan siyaasaddan, xogtaada, ama xuquuqdaada, isticmaal bogga xiriirka waanu kuu jawaabi doonnaa. Xidig, oo fadhigeedu yahay Somalia, ayaa mas’uul ka ah xogtaada shakhsiga ah.',

  'marketing.termsTitle': 'Shuruudaha Adeegga',
  'marketing.termsIntro':
    'Shuruudahani waa heshiiska adiga iyo Xidig, oo laga maamulo Somalia. Isticmaalka Xidig — boggagan guud ama barnaamijka — waxay ka dhigan tahay inaad aqbashay. Fadlan la akhri Siyaasadda Arrimaha Gaarka ah.',
  'marketing.termsEligibilityTitle': 'Cidda biiri karta',
  'marketing.termsEligibilityBody':
    'Xidig hadda waa tijaabo gaar ah oo martiqaad kaliya ah: gelitaanku waa martiqaad ama saf sugitaan. Waa inaad ugu yaraan gaartaa da’da uu u baahan yahay Somalia — oo aanad ka yaraan 16 sano — si aad akoon u haysato, waana inaad awoodid inaad gasho heshiis xujaysan. Waxaanu ku dari karnaa, xaddidi karnaa, ama ka noqon karnaa gelitaanka inta lagu jiro tijaabada.',
  'marketing.termsAccountsTitle': 'Akoonkaaga',
  'marketing.termsAccountsBody':
    'Hal qof, hal akoon. Xog-gelintaada si ammaan ah u hay oo ha la wadaagin; adigaa mas’uul ka ah wax kasta oo akoonkaaga hoostiisa ka dhaca. Xog sax ah na sii oo cusbooneysii. Degdeg noogu sheeg haddii aad u malaynayso in akoonkaaga la galay ogolaanshahaaga la’aantiis.',
  'marketing.termsContentTitle': 'Waxa aad qorto',
  'marketing.termsContentBody':
    'Waxa aad soo qortaa adigaa iska leh — lahaanshaha waad hayso. Si loo shaqeysiiyo goobta, waxaad Xidig siinaysaa oggolaansho aan gaar ahayn, caalami ah, lacag la’aan ah oo lagu marti-geliyo, kaydiyo, muujiyo, oo lagu gaarsiiyo xubnaha iyo booqdayaasha aad dooratay, iyo in laga sameeyo nuqullada farsamo ee loo baahan yahay socodsiinta iyo kaydinta adeegga. Oggolaanshahani wuxuu u jiraa oo kaliya si Xidig ugu muujiyo waxa aad qorto sidaad u rabtay; wuxuu dhammaadaa markaad tirtirto qoraalka ama akoonkaaga, marka laga reebo nuqullo aanu waajib ku ahayn inaan si gaaban u hayno kayd ama sabab sharci.',
  'marketing.termsConductTitle': 'Isticmaalka la aqbali karo',
  'marketing.termsConductBody':
    'Daacad ahow, sharciga raac, Xidigna badbaado. Ha dhibin, ha khiyaanayn, ha is-moodsiin, spam ha dirin, waxyaabo sharci-darro ama waxyeello leh ha qorin, goobtana ha weerarin. Heerarka buuxa waxay ku jiraan Tilmaamaha Bulshadayada, oo qayb ka ah shuruudahan. Waxa jebiya waa la saari karaa.',
  'marketing.termsFeesTitle': 'Xubinnimo iyo khidmado',
  'marketing.termsFeesBody':
    'Ku biirista iyo xubinnimada aasaasiga ah waa lacag la’aan, lacag la’aantuna way sii jiri doontaa. Xubinnimada Taageeruhu — oo furta abuurista Warshad, hor-dhigista musharraxiin, iyo codbixin maamul-bulsheed — waxay ku kici doontaa qiyaastii $1 bishii marka lacag-bixintu shaqeyso. Lacag-bixintu weli firfircoon ma aha; qiimaha rasmiga ah waxaa lagu dhawaaqaa xubnaha ka hor inta aan qofna lacag laga qaadin, wax lacag ahna lama qaado ogolaanshahaaga la’aantiis.',
  'marketing.termsCapitalTitle': 'Maal',
  'marketing.termsCapitalBody':
    'Adeegyada Maal waxay diiwaangeliyaan xiise iyo ujeeddo oo keliya. Waxba halkan kuma jiraan dalab dammaanado; v1.0 waa qabashada ujeeddo oo keliya. Waxba Xidig kuma jiraan talo maalgashi ama dalab maalgashi, waxna lacageed oo nool ma socdaan. Shuruudaha buuxa ee adeeg kasta oo lacageed waa la daabici doonaa ka hor inta uusan shaqayn.',
  'marketing.termsModerationTitle': 'Maamul iyo hirgelin',
  'marketing.termsModerationBody':
    'Xidig waxaa maamula dad, ma aha kaliya farsamo. Waxaanu saari karnaa waxa la qoro, ama u digi karnaa, hakin karnaa, ama xidhi karnaa akoonnada jebiya shuruudahan ama Tilmaamaha Bulshada. Marka aanu wax ka qabanno akoonkaaga ama waxa aad qorto, waad racfaan qaadan kartaa go’aanka adigoo maraya habka barnaamijka, maamuluhuna wuu dib u eegi doonaa.',
  'marketing.termsDisclaimerTitle': 'Ka-fogaansho iyo mas’uuliyad',
  'marketing.termsDisclaimerBody':
    'Xidig waa tijaabo gaar ah, waxaana lagu bixiyaa “sida uu yahay”, iyada oo aan dammaanad nooc kasta ah lahayn. Si adag ayaanu ugu shaqeynaa in aanu socodsiinno oo ammaanno, laakiin ma balan qaadi karno inuu had iyo jeer diyaar noqon doono, khalad la’aan ahaan doono, ama in waxa xubnuhu qoraan sax yahiin. Ilaa xadka ugu badan ee sharcigu ogol yahay, Xidig mas’uul kama aha khasaarooyin dadban ama ka dhasha, ama waxa xubnuhu qoraan. Waxba shuruudahan kuma xaddidayaan mas’uuliyad aan sharciga lagu xaddidi karin.',
  'marketing.termsChangesTitle': 'Isbeddellada shuruudahan',
  'marketing.termsChangesBody':
    'Waxaanu cusboonaysiin karnaa shuruudahan marka Xidig kobco. Isbeddel muhiim ah waxaanu xubnaha u sheegnaa ka hor inta uusan dhaqan-gelin, si aad dib u eegi karto. Sii wadista isticmaalka Xidig ka dib markuu isbeddelku dhaqan-galo waxay ka dhigan tahay inaad aqbashay shuruudaha cusub.',
  'marketing.termsGoverningTitle': 'Sharciga xukuma',
  'marketing.termsGoverningBody':
    'Shuruudahan waxaa xukuma sharciyada Somalia, muran kasta oo la xiriirana waxaa lagu maamuli doonaa xukunkaas, iyada oo aan la saameyn xuquuq kasta oo waajib ah oo aad ku leedahay sharciga meesha aad ku nooshahay.',

  // /reports chrome
  'marketing.reportsTitle': 'Warbixinno',
  'marketing.reportsIntro':
    'Cilmi-baaris ay bulshadu isu keentay oo ku saabsan dhaqaalaha Soomaalida iyo qurbajoogta. La xigtay meesha suurtogal ah, daacad ka ah hubanti-la’aanta, lacag la’aanna la akhrisan karo.',
  'marketing.reportsCompiledLabel': 'Bulshadaa isu keentay',
  'marketing.reportsDisclaimer':
    'Waxaa isu keenay wax-ku-biiriyayaal bulsho iyagoo ka duulaya ilo dadweyne. Tirooyinku waxay noqon karaan qiyaaso — si madax-bannaan u xaqiiji ka hor inta aadan ku tiirsan.',
  'marketing.reportsAll': 'Dhammaan warbixinnada',
  'marketing.reportsFaqTitle': 'Su’aalaha inta badan la isweydiiyo',

  // Success-path notice (§27)
  'notice.contactSent': 'Fariinta waa la diray — mahadsanid. Dhawaan ayaanu kula soo xiriiri doonnaa.',

  // Consent capture (§12 — qabyo, dib-u-eegis af Soomaali ah ayaa la sugayaa)
  'consent.regionAria': 'Doorashooyinka sirta',
  'consent.bannerTitle': 'Doorashooyinkaaga sirta',
  'consent.bannerBody':
    'Xidig horta ayuu ku weydiinayaa. Dooro in falanqayn adeeg iyo la-socod khaladaad oo ikhtiyaari ah ay u shaqeeyaan akoonkaaga — cookies-ka lagama maarmaanka ah had iyo jeer way shaqeeyaan. Goor kasta waad ka beddeli kartaa Dejinta.',
  'consent.privacyLink': 'Siyaasadda Arrimaha Gaarka ah',
  'consent.acceptAll': 'Ogolow dhammaan',
  'consent.rejectAll': 'Diid dhammaan',
  'consent.manage': 'Maamul doorashooyinka',
  'consent.save': 'Kaydi doorashooyinka',
  'consent.analyticsLabel': 'Falanqaynta adeegga',
  'consent.analyticsHint':
    'Dhacdooyin isticmaal oo naga caawiya horumarinta Xidig — waligeed fariimahaaga, magacyada, ama xogta xiriirka ma aha.',
  'consent.errorMonitoringLabel': 'La-socodka khaladaadka (dheeraad)',
  'consent.errorMonitoringHint':
    'Dib-u-ciyaarid fadhi iyo raad-raac waxqabad oo naga caawiya inaanu dhibaatooyinka si dhaqso ah u hagaajinno. Warbixinnada aasaasiga ah ee khaladaadku way sii shaqeeyaan — waxay ilaaliyaan Xidig.',
  'consent.settingsTitle': 'Doorashooyinka sirta',
  'consent.settingsIntro':
    'Xakamee xogta ikhtiyaariga ah ee Xidig ka ururin karo akoonkaaga. Isbeddeladu isla markiiba way dhaqan galaan.',
  'consent.saved': 'Doorashooyinka waa la kaydiyay.',

  // Munaasabado + ka-qaybgal (extras item 8 — qabyo, dib-u-eegis af Soomaali ah ayaa la sugayaa)
  'events.indexTitle': 'Munaasabado',
  'events.indexIntro':
    'Kulamo bulsho, hadallo, maalmo bandhig, tababarro iyo munaasabado ganacsi — ay martigeliyaan xubnaha.',
  'events.publicIndexIntro':
    'Munaasabadaha dadweynaha ee bulshada Xidig. Xubnuhu waxay arkaan wax dheeraad ah, wayna ka qaybgeli karaan.',
  'events.empty':
    'Weli ma jiraan munaasabado soo socda. Hoggaamiyeyaasha Labs-ka, ganacsiyada la xaqiijiyay iyo maamulayaashu way martigelin karaan.',
  'events.categoryAll': 'Dhammaan',
  'events.newEvent': 'Martigeli munaasabad',
  'events.upcomingTitle': 'Munaasabado soo socda',
  'events.hostedBy': 'Waxaa martigelinaya {name}',
  'events.partOf': 'Qayb ka mid ah {name}',
  'events.modeOnline': 'Onlayn',
  'events.modeInPerson': 'Fool-ka-fool',
  'events.modeHybrid': 'Isku-dhaf',
  'events.statusCancelled': 'Munaasabaddan waa la joojiyay.',
  'events.statusDraft': 'Qabyo — adiga kaliya ayaa arki kara.',
  'events.awaitingReview': 'Munaasabaddan dib-u-eegis ayay sugaysaa.',
  'events.venueLabel': 'Goobta',
  'events.addressForAttendees':
    'Cinwaanka saxda ah waxaa la wadaagaa dadka xaqiijiyay inay imanayaan.',
  'events.onlineForAttendees':
    'Linkiga onlaynka waxaa la wadaagaa dadka xaqiijiyay inay imanayaan.',
  'events.joinOnline': 'Ku soo biir onlayn',
  'events.goingCount': '{count} ayaa imanaya',
  'events.interestedCount': '{count} ayaa xiiseynaya',
  'events.fullLabel': 'Waa buuxdaa — weli waxaad calaamadin kartaa inaad xiiseynayso.',
  'events.capacityGoing': '{count} oo ka mid ah {capacity} ayaa imanaya',
  'events.rsvpGoing': 'Waan imanayaa',
  'events.rsvpInterested': 'Waan xiiseynayaa',
  'events.rsvpRemove': 'Ka noqo',
  'events.showPubliclyLabel': 'Xubnaha kale ha arkeen inaan imanayo',
  'events.attendeesTitle': 'Ka-qaybgalayaasha',
  'events.attendeesHostNote':
    'Adiga kaliya ayaa arka liiska oo dhan. Xubnaha kale waxay arkaan kuwa ogolaaday oo keliya.',
  'events.attendeesMemberNote': 'Xubnaha doortay inay si fagaare ah u muuqdaan.',
  'events.addToCalendar': 'Ku dar kalandarka (.ics)',
  'events.googleCalendar': 'Google Calendar',
  'events.shareText': 'Kaalay "{title}" gudaha Xidig',
  'events.requestAccessCta': 'Codso gelitaan si aad uga qaybgasho',
  'events.signedOutNote':
    'Xubnaha Xidig way ka qaybgeli karaan, arki karaan cidda kale ee imanaysa, helina faahfaahinta oo dhan.',
  'events.autopostLead': 'Munaasabad cusub — faahfaahin iyo ka-qaybgal:',
  'events.newTitle': 'Martigeli munaasabad',
  'events.formTitle': 'Cinwaan',
  'events.formDescription': 'Faahfaahin',
  'events.formCategory': 'Qayb',
  'events.formStartsAt': 'Bilaw',
  'events.formEndsAt': 'Dhammaad (ikhtiyaari)',
  'events.formTimezone': 'Waqti-goboleed',
  'events.formMode': 'Qaab',
  'events.formVenueName': 'Magaca goobta',
  'events.formVenueAddress': 'Cinwaanka goobta',
  'events.formAddressVisibility': 'Yaa arki kara cinwaanka?',
  'events.addressEveryone': 'Qof kasta oo arki kara munaasabadda',
  'events.addressAttendees': 'Kuwa xaqiijiyay inay imanayaan oo keliya',
  'events.formOnlineUrl': 'Link onlayn',
  'events.formOnlineUrlHint': 'Kuwa xaqiijiyay inay imanayaan oo keliya ayaa arka linkigan.',
  'events.formContainer': 'Ku martigeli magaca',
  'events.containerCommunity': 'Munaasabad bulsho',
  'events.formVisibility': 'Yaa arki kara munaasabaddan?',
  'events.visibilityPublic': 'Dadweyne — qof kasta oo linkiga haysta',
  'events.visibilityMembers': 'Xubnaha oo keliya',
  'events.visibilitySpaceOnly': 'Xubnaha Space-ka oo keliya',
  'events.formCapacity': 'Tirada ugu badan (ikhtiyaari)',
  'events.formSubmit': 'Daabac munaasabadda',
  'events.notEligible':
    'Martigelinta munaasabadaha waxaa hadda u furan hoggaamiyeyaasha Labs-ka, ganacsiyada la xaqiijiyay iyo maamulayaasha.',
  'events.cancelEvent': 'Jooji munaasabadda',
  'events.cancelConfirm': 'Ma joojinaysaa munaasabaddan? Qof kasta oo ka qaybgalay waa loo sheegi doonaa.',

  // Munaasabado — khaladaadka §27
  'error.eventFull': 'Munaasabaddan waa buuxdaa. Weli waxaad calaamadin kartaa inaad xiiseynayso.',
  'error.eventNotOpen': 'Ka-qaybgalka munaasabaddan waa xidhan yahay.',
  'error.eventCategoryInvalid': 'Dooro qayb munaasabadeed oo sax ah.',
  'error.eventCreationNotAllowed':
    'Martigelinta munaasabadaha waxaa hadda u furan hoggaamiyeyaasha Labs-ka, ganacsiyada la xaqiijiyay iyo maamulayaasha.',

  // Munaasabado — ogeysiisyada
  'notif.eventRsvp': '{name} ayaa ka jawaabay munaasabaddaada',
  'notif.eventRsvpBundle': '{count} qof ayaa ka jawaabay munaasabaddaada',
  'notif.eventCancelled': 'Munaasabad aad ka qaybgashay waa la joojiyay',
  'notif.eventReminder': 'Munaasabad aad ka qaybgalayso waxay bilaabanaysaa 24 saacadood gudahood',

  // Albaabka hore — kaadhka "kan xiga"
  'marketing.nextEventTitle': 'Kan xiga',
  'marketing.nextEventCta': 'Arag munaasabadda',
} satisfies SomaliDictionary;
