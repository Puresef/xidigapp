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
  // Phase 4.5 secondary nav entries (Saved bookmarks, Search, Settings hub).
  'nav.saved': 'Saved',
  'nav.search': 'Search',
  'nav.searchPlaceholder': 'Search Xidig',
  'nav.settings': 'Settings',
  'nav.awards': 'Awards',
  'nav.events': 'Events',
  'nav.leaderboard': 'Top Helpers',

  // Canonical product terms used inside sentences and on buttons
  'term.lab': 'Lab',
  'term.club': 'Club',
  // The non-financial support action (key name `garab` is a legacy internal
  // identifier). EN label "Support" / SO provisional "Taageer" — owner-edited
  // PRD Relook §24 (supersedes the interim "Show support" and the bare "Garab").
  // (PRD Relook §24 / D-10, owner ruling Packet B). It is encouragement only:
  // never an investment, a vote, a verification, a review or a ranking, and
  // it unlocks nothing — counts are visible to everyone either way.
  'term.garab': 'Support',
  'term.maalgeli': 'Invest',

  // Seeded / AI content labels (§21) — shown on cards for non-member content.
  'content.seededLabel': 'Seeded',
  'content.aiLabel': 'AI-assisted',
  'content.aiAccount': 'AI assistant',
  'content.seededTooltip': 'Platform-provided starter content, not a member post.',
  'content.aiTooltip':
    'Created with Xidig AI. Labelled so you can tell it apart from member content.',
  'content.aiAccountTooltip': 'A clearly-labelled AI assistant account, not a human member.',
  // Munaasabado dispatch (Task 2) — the Community Awards result card's
  // "published by the system" label, reusing the §21 seeded/AI provenance
  // pattern for a system-authored (not member-authored) post.
  'content.systemLabel': 'Xidig system',
  'content.systemTooltip': 'Posted automatically by the system — not by a member.',

  // Admin — seed content review (§21)
  'admin.seedTitle': 'Seeded content',
  'admin.seedSubtitle':
    'AI-assisted and seeded content — labelled, auditable, and never shown as member content.',
  'admin.seedRunsHeading': 'Seed runs',
  'admin.seedContentHeading': 'Seeded content counts',
  'admin.seedNoRuns': 'No seed runs yet. Run the seed job to populate launch density.',
  'admin.seedColLabel': 'Label',
  'admin.seedColSource': 'Source',
  'admin.seedColCreated': 'Created',
  'admin.seedPosts': 'Plaza posts',
  'admin.seedListings': 'Listings',
  'admin.seedPlaybooks': 'Lab templates',
  'admin.seedTags': 'Tags',

  // Core actions
  'action.getStarted': 'Get started',
  // One support vocabulary for every surface that carries the control (the
  // fulfilled-Ask GarabButton and the candidate InterestBar):
  // Support → Supporting → Remove support · "{count} people support this".
  'action.garab': 'Support',
  'action.garabActive': 'Supporting',
  'action.garabRemove': 'Remove support',
  'action.garabCount': { one: '{count} person supports this', other: '{count} people support this' },
  'action.garabNote':
    'Support is encouragement only — not an investment, a vote, a rating, or a check of anyone’s work.',
  'action.canHelp': 'I can help',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.back': 'Back',
  'action.retry': 'Try again',
  'action.close': 'Close',
  'action.goHome': 'Go to Home',
  'action.signIn': 'Sign in',
  'action.signOut': 'Sign out',
  'action.createAccount': 'Create account',
  'action.joinWaitlist': 'Join the waitlist',
  'action.resetPassword': 'Reset password',
  'action.requestNewLink': 'Request a new link',
  'action.requestNewCode': 'Request a new code',
  'action.useMagicLink': 'Use a magic link',
  'action.sendLink': 'Send sign-in link',
  'action.sendCode': 'Send code',
  'action.verifyCode': 'Verify code',
  'action.setPassword': 'Set password',
  'action.changePassword': 'Change password',
  'action.dismiss': 'Dismiss',
  'action.createInvite': 'Create invite code',
  'action.sendInvite': 'Send invite',
  'action.appeal': 'Appeal',
  'action.resend': 'Resend',
  'action.upgradeSupporter': 'Upgrade for $1/month',
  // Abuur = the create action (naming review 5 Jul: header button, not a nav
  // tab — locked by vocabulary.test.ts alongside the tab names).
  'action.abuur': 'Create',
  'action.follow': 'Follow',
  'action.unfollow': 'Unfollow',
  'action.following': 'Following',
  'action.search': 'Search',
  'action.add': 'Add',
  'action.remove': 'Remove',
  'action.addLink': 'Add link',
  'action.loadMore': 'Load more',
  'action.post': 'Post',
  'action.comment': 'Comment',
  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.editProfile': 'Edit profile',
  'action.share': 'Share',
  'action.copyLink': 'Copy link',
  'action.linkCopied': 'Link copied.',
  'action.viewOnMap': 'View on map',
  'action.view': 'View',
  // Phase 3 (Fariimo) reusable actions
  'action.message': 'Message',
  'action.send': 'Send',
  'action.accept': 'Accept',
  'action.decline': 'Decline',
  'action.block': 'Block',
  'action.unblock': 'Unblock',
  'action.report': 'Report',
  'action.enable': 'Enable',
  // Phase 6 (Moderation / account lifecycle)
  'action.readGuidelines': 'Read our guidelines',
  'action.manageAccount': 'Manage account',

  // Language switching
  'language.label': 'Language',
  'language.switchHint': 'Change language',

  // Shared UI states
  'state.loading': 'Loading…',
  'state.empty': 'Nothing here yet.',
  // Offline read + queued-write grammar (shared pattern: clock chip +
  // "it sends when the internet returns" + Delete; true timestamps kept).
  'state.offlineCached': 'No internet — you’re reading a saved copy. Your replies will wait.',
  'state.queuedChip': 'Waiting',
  'state.queuedNote': 'It will send when the internet comes back.',
  'state.emptyFeed': 'Be the first to post — the Plaza is open.',
  'state.comingSoon': 'Coming soon',
  'state.comingSoonBody':
    'This part of Xidig opens in a later phase. The Directory is live now — find builders and businesses.',
  'state.endOfList': 'That’s everything.',
  'state.errorTitle': 'Something went wrong',

  // Errors — plain language per PRD §27: what happened · why · what to do next
  'error.offline':
    "You're offline. Xidig needs a connection to load — check your signal and try again.",
  'error.server':
    "Something went wrong on our end. We've been notified automatically — try again in a moment.",
  'error.notFound': "We can't find that page. It may have been deleted or moved.",
  'error.forbidden': "You don't have access to this. If you think that's wrong, contact support.",
  'error.sessionExpired': "You've been signed out. Sign back in to continue.",
  'error.magicLinkExpired':
    "That sign-in link has expired — they're only valid for 10 minutes. Request a new one.",
  'error.otpInvalid':
    "That code didn't work — codes expire after 10 minutes. Request a new one, or use the magic link instead.",
  'error.wrongCredentials':
    "That email or password doesn't match. Try again, reset your password, or sign in with a magic link instead.",
  'error.accountSuspended':
    'Your account has been suspended. If you think this is a mistake, appeal here.',
  'error.signupNotAllowed':
    'Xidig is in private beta — you need an invite code to join. No code? Join the waitlist and we’ll save your spot.',
  'error.inviteInvalid':
    "That invite code didn't work. Check for typos — codes look like XIDIG-XXXX-XXXX. No code? Join the waitlist.",
  'error.inviteUsed':
    'That invite code has already been used — codes are single-use. Ask your inviter for a fresh one, or join the waitlist.',
  'error.alreadyRegistered':
    'You already have an account with that email or phone. Sign in instead — your invite stays valid for someone else.',
  'error.emailNotConfirmed':
    'Confirm your email first — we sent you a link when you signed up. It may have expired; request a fresh sign-in link and we’ll confirm you on the way in.',
  'error.passwordTooShort':
    'That password is too short. Use at least {min} characters — a few random words work great.',
  'error.passwordTooLong': 'That password is too long — the maximum is {max} characters.',
  'error.passwordBreached':
    'That password has shown up in known data breaches, so it isn’t safe to use here. Pick a different one — longer is stronger.',
  'error.passwordUnchanged':
    'Your new password must be different from your current one — pick a fresh one.',
  'error.resetLinkExpired':
    "That reset link has expired — they're valid for 60 minutes. Request a new one.",
  'error.emailTaken':
    'That email is already attached to another Xidig account. Sign in to that account instead, or use a different email.',
  'error.phoneTaken':
    'That phone number is already attached to another Xidig account. Sign in to that account instead, or use a different number.',
  'error.phoneInvalid':
    'That doesn’t look like a full phone number. Include your country code, like +252 61 234 5678.',
  'error.smsUnavailable':
    'We couldn’t send a text message right now. Try the magic link or password instead — we’re on it.',
  'error.emailUndeliverable':
    'We can’t deliver email to that address right now — earlier messages bounced back. Double-check the spelling, use a different address, or continue with your phone number instead.',
  'error.rateLimited': 'You’ve tried that a lot just now. Wait a minute and try again.',
  'error.invalidRequest':
    'Something about that request didn’t look right. Refresh the page and try again.',

  // --- External API / MCP keys (§21/§27) — returned to trusted integrations ---
  'error.invalidApiKey':
    'That API key isn’t valid. Check the key, or create a new one in your Xidig settings.',
  'error.apiKeyExpired':
    'That API key has expired. Create a new one in your Xidig settings to continue.',
  'error.insufficientScope':
    'That API key doesn’t have permission for this action. Create a key with the right scope.',

  // --- Profile & directory (§27) ---
  'error.handleTaken': 'That handle is taken. Try a different one.',
  'error.handleInvalid':
    'Handles use 3–30 lowercase letters, numbers, or underscores — like maxamed_a.',
  'error.profileIncomplete': 'Finish setting up your profile first — it only takes 2 minutes.',
  'error.duplicateListing':
    'A listing with this name already exists nearby. Is this your business? Claim it instead.',
  'error.listingLimit':
    'You’ve added 2 listings this week — that’s the limit for now. You can add more next week.',

  // --- Plaza (§27 Plaza block + §15/§26 mechanics) ---
  'error.postLimit':
    'You’ve posted a lot today — free members can post {max} times per day. Come back tomorrow or upgrade for higher limits.',
  'error.commentLimit':
    'You’ve commented a lot today — free members can comment {max} times per day. Come back tomorrow.',
  'error.imageTooLarge':
    'That image is over {maxMb}MB. Compress it or choose a smaller one — we accept JPG, PNG, GIF, and WebP.',
  'error.imageInvalid':
    'That file doesn’t look like an image we can use. We accept JPG, PNG, GIF, and WebP.',
  'error.voiceTooLarge':
    'That voice note is over the 3MB limit. Record a shorter one and try again.',
  'error.voiceInvalid': 'That file doesn’t look like a voice note we can use. Record it again.',
  'error.imageModerationBlocked':
    'That image didn’t pass our content check, so it wasn’t uploaded. Try a different image — or contact support if you think this is a mistake.',
  'error.askAlreadyFulfilled':
    'This Ask has been marked solved — its status can’t change any more. You can still comment if you have something to add.',
  'error.askNotOpen':
    'This Ask can’t move to that state right now — its status may have just changed. Refresh the page and check again.',
  'error.pollClosed':
    'This poll has closed, so votes can’t be added or changed. The results are final.',
  'error.pollOptionsInvalid':
    'Polls need {min} to {max} options. Adjust your options and try again.',
  'error.mediaNotReady': 'One of your images didn’t upload cleanly. Remove it and upload it again.',
  'error.playbookInvalid':
    'That playbook is no longer available. Pick another, or start from a blank charter.',
  'error.tagInvalid': 'Tags use 2–50 lowercase letters, numbers, or dashes — like halal-finance.',
  'error.tagLimit':
    'You’ve added a lot of new tags today. Reuse an existing tag, or try again tomorrow.',
  'error.postNotEditable':
    'This post can’t be edited because it was removed. Contact support if you think that’s wrong.',

  // --- DMs / Fariimo (§27 DMs block) ---
  'error.dmBlocked': "You can't message this member — they've restricted their messages.",
  'error.dmNotAccepted':
    'This message request hasn’t been accepted yet. You’ll be able to chat once they accept.',

  // --- Labs / Warshad (§27 Labs block) ---
  // Paid tier = "Xidig Plus" (owner-edited PRD Relook §24; formerly "Supporter").
  'error.notSupporter': 'Creating a Lab requires Xidig Plus.',
  'error.capitalUnavailable': "Investing isn't offered on Xidig right now.",
  'error.charterIncomplete':
    'Your Lab charter needs a few more fields before it can go live. Complete them here.',
  'error.labSlugTaken': 'That Lab address is already taken. Try a different one.',
  'error.labJoinClosed': 'This Lab is invite-only. Ask the lead for an invite to join.',
  'error.labAlreadyMember': 'You’re already a member of this Lab.',
  'error.labCollabInvalid': 'That collaboration link isn’t available anymore.',
  'error.pinnedFull': 'You can feature up to 3 Labs on your profile. Unpin one to add another.',

  // --- Phase 4.5 experience expansion (§27) ---
  'error.imageAltRequired': 'Add a short description for this photo first.',
  'error.pinTargetInvalid': "One of the items you tried to pin can't be found.",
  'error.draftLimit': 'You already have 10 drafts. Delete one to save another.',

  // --- Capital / Maal (§27 Capital block) ---
  'error.reviewerConflict':
    "You're a member of this Lab, so you can't review its Candidate. That's to keep reviews fair.",
  'error.candidateNotVisible':
    'This Candidate is set to reviewers-only. Ask the Lab lead for access.',
  'error.notAReviewer': 'Only reviewers can do this.',
  'error.candidateNotSubmittable':
    "This Candidate can't be submitted right now. Only a draft can be sent for review.",
  'error.voteClosed': 'Voting on this Candidate is closed.',

  // --- Moderation / account (§27 Moderation block + §19 lifecycle) ---
  // Generic by design — cites the policy, never the specific rule or the
  // reporter, so removals can't be reverse-engineered or gamed (§19).
  'error.contentRemoved':
    'This post was removed for violating our content policy. Read our guidelines.',
  'error.reportDuplicate':
    "You've already reported this — our team is on it. Thanks for looking out for the community.",
  'error.appealAlreadySubmitted':
    "You've already appealed this decision. There's one appeal per action, and a moderator who was not involved in it will review yours.",
  'error.appealNotEligible':
    "There's nothing to appeal here, or this action isn't yours to appeal.",
  'error.appealSelfReview':
    "You took this action, so its appeal can't be yours to review — it goes to another moderator.",
  'error.verificationPending':
    "You already have a verification request in progress. We'll be in touch to schedule your call.",
  'error.notAVerifier': 'Only verifiers can do this.',
  'error.accountAlreadyDeactivated':
    'Your account is already deactivated. Sign in again anytime to reactivate it.',
  'error.deletionAlreadyRequested':
    'Your account is already scheduled for deletion. You can cancel it from account settings during the grace period.',
  'error.awardNoOpenCycle':
    "Voting isn't open right now. Community Awards run each quarter — check back soon.",
  'error.awardAlreadyVoted':
    "You've already voted in this category. Each member gets one vote per category.",
  // Munaasabado dispatch (Task 2) — Community Awards results, Mentor booking.
  'error.awardCycleNotClosed': 'Voting is still open for that cycle.',

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Complete your profile',
  'onboarding.pickLanes': 'Pick your lanes',
  'onboarding.followThree': 'Follow 3 builders',
  'onboarding.firstPost': 'Write your first post',
  'onboarding.setPassword': 'Add a backup password',
  'onboarding.title': 'Welcome to Xidig — let’s get you set up',
  'onboarding.checklistTitle': 'Get set up',
  'onboarding.progress': '{completed} of {total} done',
  'onboarding.dismiss': 'Dismiss',
  'onboarding.done': 'You’re all set 🦋',

  // Looking-for matching (PRD §20)
  'matching.labsSeekingTitle': 'Labs looking for your skills',
  'matching.labsSeekingBody': 'These Labs are seeking a skill you have.',
  'matching.matchedSkills': 'Looking for:',

  // Interest-based follow suggestions (extras plan item 4) — every card names
  // its declared-field reason; the reason IS the ranking, nothing hidden.
  'matching.reasonSharesLane': 'Shares your {lane} lane',
  'matching.reasonSharesSkill': 'Also into {skill}',
  'matching.reasonSameCity': 'Same city as you',
  'matching.reasonSameCountry': 'Same country as you',
  'matching.reasonSharesOpenTo': 'Also open to {label}',
  'matching.reasonTheyHiring': 'Hiring — you’re open to work',
  'matching.reasonYouHiring': 'Open to work — you’re hiring',
  'matching.reasonLabSeeking': 'Looking for your {skill} skill',
  'matching.skip': 'Skip',
  'matching.viewLab': 'Visit this Lab',
  'matching.suggestEmptyTitle': 'No matches yet',
  'matching.suggestEmptyBody':
    'Your people aren’t on Xidig yet — invite them, and fill in your lanes, skills and city so matches can find you.',
  'matching.suggestEmptyCta': 'Invite your people',
  // Munaasabado dispatch (Task 2) — the "Suggested for you" matching module.
  'matching.suggestModuleTitle': 'Suggested for you',
  'matching.reasonsPrefix': 'Why:',
  'matching.privacyNote': 'Only your profile data was used — every reason is shown.',

  // Community Awards (PRD §20)
  'awards.title': 'Community Awards',
  'awards.subtitle': "Vote for this quarter's standouts. One vote per category — {quarter}.",
  'awards.emptyTitle': 'No awards open right now',
  'awards.emptyBody':
    "Community Awards run each quarter. When voting opens, you'll pick the best Lab, the best Win, and the members who helped most. Check back soon.",
  'awards.categoryBestLab': 'Best Lab',
  'awards.categoryBestWin': 'Best Win',
  'awards.categoryMostHelpful': 'Most Helpful',
  'awards.categoryRisingBuilder': 'Rising Builder',
  'awards.descBestLab': 'The Lab that shipped and inspired the most this quarter.',
  'awards.descBestWin': 'The Win that moved the community forward.',
  'awards.descMostHelpful': 'The member who helped others the most.',
  'awards.descRisingBuilder': 'A newer builder making real progress.',
  'awards.pickTargetLabel': 'Choose your pick',
  'awards.pickTargetPlaceholder': 'Select…',
  'awards.castVote': 'Cast vote',
  'awards.yourVote': 'Your vote',
  'awards.noTargets':
    'Nothing to vote for here yet — follow members or explore Labs and Wins first.',
  // Munaasabado dispatch (Task 2) — the published-result card (Mentor in
  // Residence "past winners" style module).
  'awards.resultTitle': '{category} — {period}: {name}',
  'awards.evidenceMostHelpful': {
    one: '{count} Ask resolved · confirmed by the asker',
    other: '{count} Asks resolved · each confirmed by the asker',
  },
  'awards.evidenceVotes': {
    one: '{count} member vote',
    other: '{count} member votes',
  },
  'awards.systemProvenance': 'Published by the Xidig system — member vote, one member one vote',

  // Mentor-in-Residence (PRD §20)
  'mentor.featuredTitle': 'Mentor in Residence',
  'mentor.focusLabel': 'Focus:',
  'mentor.asksAnswered': {
    one: 'Answered {count} Ask this week',
    other: 'Answered {count} Asks this week',
  },
  'mentor.periodTaken': 'A mentor is already appointed for that period. Pick a different period.',
  // Munaasabado dispatch (Task 2) — the Mentor-in-Residence module card +
  // slot booking flow.
  'mentor.residenceTitle': 'Mentor in residence — {period}',
  'mentor.hoursLabel': 'Hours',
  'mentor.hostLabel': 'Host',
  'mentor.bookCta': 'Book a slot',
  'mentor.freeNote': 'Free — the Lab hosts. {minutes} minutes each.',
  'mentor.slotsTitle': 'Pick a time',
  'mentor.noSlots': 'No open slots right now.',
  'mentor.yourBooking': 'Your booking: {when}',
  'mentor.unbook': 'Cancel booking',
  // Ruling 7 (12 Aug): mentor_slots has no timezone column yet, so every
  // slot time shown to a member must carry an explicit UTC marker rather
  // than reading as an ambiguous bare time.
  'mentor.slotTimeUtc': '{time} UTC',

  // Reputation scores + Top Helper leaderboard (PRD §14)
  'reputation.scoresSection': 'Reputation',
  'reputation.contributionChip': 'Contribution {count}',
  'reputation.helperChip': 'Helper {count}',
  'reputation.leaderboardTitle': 'Top Helpers',
  'reputation.leaderboardSubtitle':
    'Members whose answers landed and earned the most Helper score.',
  'reputation.topHelpersHeading': 'Top Helpers',
  'reputation.leaderboardEmpty': 'No Helper scores yet. Answer an open Ask to earn credit.',

  // Home screen
  'home.welcome': 'Welcome to Xidig.',
  'home.communityProof': 'Builders support each other here:',

  // Auth flows (Phase 1: three co-equal sign-in methods, §9/§26)
  'auth.signInTitle': 'Sign in to Xidig',
  'auth.signUpTitle': 'Join Xidig',
  'auth.methodPassword': 'Password',
  'auth.methodMagicLink': 'Magic link',
  'auth.methodSms': 'SMS code',
  'auth.emailLabel': 'Email',
  'auth.phoneLabel': 'Phone number',
  'auth.phoneHint': 'Include your country code, like +252 61 234 5678.',
  'auth.passwordLabel': 'Password',
  'auth.newPasswordLabel': 'New password',
  'auth.passwordRules':
    'At least {min} characters. Longer is stronger — a few random words work great.',
  'auth.otpCodeLabel': 'Sign-in code',
  'auth.inviteCodeLabel': 'Invite code',
  'auth.inviteCodeLabelOptional': 'Invite code (optional)',
  'auth.inviteCodeHint': 'Codes look like XIDIG-XXXX-XXXX.',
  'auth.inviteOptionalHint': 'Have a code? Add it. If not, you can join without one right now.',
  // Composed with two links: the sentence template owns word order (Somali
  // and English differ), and each {placeholder} is replaced with an <a> whose
  // text is the matching *LinkText key. See SignUpForm's renderTermsLabel.
  'auth.termsAccept': 'I agree to the {terms} and {privacy}.',
  'auth.termsLinkText': 'Terms of Service',
  'auth.privacyLinkText': 'Privacy Policy',
  'auth.chooseMethod': 'How do you want to sign in?',
  'auth.magicLinkSent':
    'If that email has a Xidig account, a sign-in link is on its way — it’s valid for 10 minutes.',
  'auth.otpSent':
    'If that number has a Xidig account, a sign-in code is on its way — it’s valid for 10 minutes.',
  'auth.confirmEmailSent':
    'Almost there — check your email for a confirmation link to finish creating your account. It’s valid for 10 minutes.',
  'auth.resetSent':
    "Check your email for a link to reset your password — it's valid for 60 minutes.",
  'auth.passwordUpdated': 'Your password is set. You can sign in with it any time.',
  'auth.forgotPassword': 'Forgot your password?',
  'auth.noAccount': 'New to Xidig? Join with an invite',
  'auth.haveAccount': 'Already a member? Sign in',
  'auth.errorTitle': 'Sign-in problem',
  'auth.resetTitle': 'Reset your password',
  'auth.chooseNewPassword': 'Choose a new password',
  'auth.emailCodeLabel': 'Code from the email',
  'auth.emailCodeHint':
    'Link not arriving or won’t open? The same email carries a 6-digit code — enter it here instead.',
  'auth.checkSpam': 'Nothing in your inbox? Check spam or promotions before resending.',
  'auth.trySmsInstead': 'Email not coming through? Try an SMS code instead.',
  'auth.tryEmailInstead': 'No text arriving? Try email instead.',
  'auth.resendWait': {
    one: 'You can resend in {count} second',
    other: 'You can resend in {count} seconds',
  },
  'auth.resendLimitHint':
    'Still nothing after a few tries? Switch method — any of them signs you in to the same account.',

  // Waitlist / beta gate (§9, §20)
  'waitlist.title': 'Join the Xidig waitlist',
  'waitlist.subtitle':
    'Xidig is in private beta. Leave your email or phone number and we’ll invite you as spots open.',
  'waitlist.contactLabel': 'Email or phone number',
  'waitlist.joined': 'You’re on the list! We’ll reach out the moment a spot opens.',
  'waitlist.foundingCounter': {
    one: '{count} Founding Member spot left — the first 500 members carry the badge for life.',
    other: '{count} Founding Member spots left — the first 500 members carry the badge for life.',
  },
  'waitlist.haveCode': 'Have an invite code?',
  // Front door (Phase A): the waitlist doubles as the updates-capture lane
  // until the digest email rail ships — this flag keeps the two honest.
  'waitlist.updatesOnly': 'Just send me updates — I’m not requesting a membership spot.',

  // Account settings (Phase 1 scaffold)
  'settings.accountTitle': 'Account & sign-in',
  'settings.methodsIntro': 'Any of these methods signs you in to this same account.',
  'settings.emailSection': 'Email',
  'settings.phoneSection': 'Phone',
  'settings.passwordSection': 'Password',
  'settings.statusVerified': 'Verified',
  'settings.statusUnverified': 'Pending verification',
  'settings.statusNotSet': 'Not set',
  'settings.passwordIsSet': 'Set',
  'settings.passwordNudgeTitle': 'Add a backup password',
  'settings.passwordNudgeBody':
    'You signed up without a password. Add one so you can always sign in — even when email or SMS is slow.',
  'settings.linkEmailLabel': 'Add an email to this account',
  'settings.linkPhoneLabel': 'Add a phone number to this account',
  'settings.linkEmailPending': 'Check {email} for a confirmation link to finish adding it.',
  'settings.linkPhonePending': 'We texted a code to {phone}. Enter it to finish adding it.',
  'settings.invitesTitle': 'Your invites',
  'settings.invitesIntro': 'Share a code to bring another builder in — codes are single-use.',
  'settings.invitesEmpty': 'No invite codes yet. Create one to invite a builder you trust.',
  'settings.inviteUsed': 'Used',
  'settings.inviteOpen': 'Not used yet',
  'settings.bandwidthTitle': 'Low-bandwidth mode',
  'settings.bandwidthBody':
    'Turns off images and map tiles so pages load faster and cost less data.',
  'settings.toggleOn': 'On',
  'settings.toggleOff': 'Off',

  // Phase 4.5 — settings hub, privacy, notifications, appearance, data/Lite
  'settings.hubTitle': 'Settings',
  'settings.hubProfile': 'Profile',
  'settings.hubProfileBody': 'Your name, bio, skills, and links.',
  'settings.hubAccount': 'Account & sign-in',
  'settings.hubAccountBody': 'Email, phone, password, and your invites.',
  'settings.hubPrivacy': 'Privacy & safety',
  'settings.hubPrivacyBody': 'Who can message you and where you appear.',
  'settings.hubNotifications': 'Notifications',
  'settings.hubNotificationsBody': 'Channels, quiet hours, and the weekly digest.',
  'settings.hubAppearance': 'Appearance',
  'settings.hubAppearanceBody': 'Theme, text size, and motion.',
  'settings.hubLanguage': 'Language',
  'settings.hubLanguageBody': 'Somali or English — switch anytime.',
  'settings.hubData': 'Data & Lite mode',
  'settings.hubDataBody': 'Save data, export your data, manage your account.',
  'settings.saved': 'Saved.',
  // Privacy & safety
  'settings.privacyTitle': 'Privacy & safety',
  'settings.privacyControls': 'Privacy controls',
  'settings.dmPrivacyLabel': 'Who can message you',
  'settings.dmPrivacyHint': 'New chats always start as a request you accept or decline.',
  'settings.dmPrivacyEveryone': 'Everyone',
  'settings.dmPrivacyVerified': 'Verified members only',
  'settings.dmPrivacyNone': 'No one',
  'settings.discoverableDirectory': 'Show me in the member directory',
  'settings.discoverableSearchEngines': 'Let search engines find my profile',
  'settings.locationGranularityLabel': 'Location shown on your profile',
  'settings.locationGranularityHint': 'Choose how precisely your location appears to others.',
  'settings.locationExact': 'Exact location',
  'settings.locationCity': 'City only',
  'settings.locationRegion': 'Region only',
  'settings.locationHidden': 'Hidden',
  'settings.blockedTitle': 'Blocked members',
  'settings.blockedIntro': 'Blocked members cannot message you or see your activity.',
  'settings.blockedEmpty': 'You have not blocked anyone.',
  'settings.blockedUnknownMember': 'Member',
  'settings.unblock': 'Unblock',
  'settings.mutedTitle': 'Muted',
  'settings.mutedIntro': 'Muted people and tags disappear from your feeds — they are never told.',
  'settings.reportInfoTitle': 'Reporting',
  'settings.reportInfoBody':
    'You can report any post, message, or member. These are the reasons our moderators act on:',
  // Notifications
  'settings.notificationsTitle': 'Notifications',
  'settings.notificationsIntro':
    'Pick where each kind of notification reaches you. In-app is always on.',
  'settings.matrixCaption': 'Notification types and their channels',
  'settings.matrixType': 'Notification',
  'settings.matrixInApp': 'In-app',
  'settings.matrixEmail': 'Email',
  'settings.matrixPush': 'Push',
  'settings.matrixCellAria': '{type} — {channel}',
  'settings.notifTypeReply': 'Replies to your posts',
  'settings.notifTypeMention': 'Mentions',
  'settings.notifTypeNewDm': 'New messages',
  'settings.notifTypeDmRequest': 'Message requests',
  'settings.notifTypeDmAccepted': 'Request accepted',
  'settings.notifTypeAskCredited': 'Your answer was credited',
  'settings.notifTypeAskStale': 'Open Ask reminders',
  'settings.notifTypeModerationHold': 'Post under review',
  'settings.notifTypeModerationRemoved': 'Post removed',
  'settings.notifTypeCandidateStatus': 'Venture status changes',
  'settings.notifTypeLabUpdate': 'Space updates',
  'settings.notifTypeLabJoinRequest': 'Space join requests',
  'settings.notifTypeLabJoinResponse': 'Space membership updates',
  'settings.notifTypeLabPromoted': 'Space promotions',
  'settings.notifTypeLabDormant': 'Quiet Space reminders',
  'settings.notifTypeLabSkillGap': 'Spaces seeking your skills',
  'settings.notifTypeLabCollabInvite': 'Collaboration invites',
  'settings.notifTypeLabCollabResponse': 'Collaboration responses',
  'settings.notifTypeWeeklyDigest': 'Weekly digest',
  'settings.notifTypeMentorSlotBooked': 'Mentor bookings',
  'settings.notifTypeVentureDemotionWarning': 'Venture stage warnings',
  'settings.notifTypeVentureDemoted': 'Venture stage changes',
  'settings.quietHoursTitle': 'Quiet hours',
  'settings.quietHoursEnable': 'Turn on quiet hours',
  'settings.quietHoursHint':
    'Push notifications pause during these hours (your local time). In-app and email are not affected.',
  'settings.quietHoursFrom': 'From',
  'settings.quietHoursTo': 'Until',
  'settings.digestLabel': 'Weekly digest email',
  'settings.digestHint': 'One email a week with what mattered — never more.',
  'settings.digestWeekly': 'Weekly',
  'settings.digestOff': 'Off',
  // Appearance
  'settings.appearanceTitle': 'Appearance',
  'settings.appearanceIntro': 'How Xidig looks on this device.',
  'settings.appearanceApplied':
    'Changes apply instantly on this device and follow you when signed in.',
  'settings.themeTitle': 'Theme',
  'settings.themeSystem': 'Match device',
  // Habeen/Maalin theme naming (brand-rethink adoption): EN pairs as
  // Night/Day to match the SO names. Renaming SO away from 'Iftiin' also
  // frees that word for the founding-badge candidate name "Iftiinka Hore"
  // (docs/brand-direction.md §5 collision, now resolved).
  'settings.themeLight': 'Day',
  'settings.themeDark': 'Night',
  'settings.textSizeTitle': 'Text size',
  'settings.textSizeS': 'Small',
  'settings.textSizeM': 'Medium',
  'settings.textSizeL': 'Large',
  'settings.textSizeXl': 'Extra large',
  'settings.motionTitle': 'Motion',
  'settings.motionHint': 'Reduce animations if they distract you or cost battery.',
  'settings.motionSystem': 'Match device',
  'settings.motionOff': 'Reduce motion',
  // Data & Lite mode
  'settings.dataTitle': 'Data & Lite mode',
  'settings.liteTitle': 'Lite mode',
  'settings.liteIntro':
    'Nothing is removed — heavy images, videos, and maps wait behind a Show button until you ask for them.',
  'settings.liteImages': 'Load images automatically',
  'settings.liteEmbeds': 'Load video embeds automatically',
  'settings.liteMaps': 'Load maps automatically',
  'settings.liteAnimations': 'Play animations',
  'settings.liteSmallAvatars': 'Load tiny profile photos',
  'settings.liteBundlesAria': 'Lite mode shortcuts',
  'settings.liteBundleText': 'Text only',
  'settings.liteBundleEssentials': 'Essentials',
  'settings.liteBundleEverything': 'Everything',
  'settings.liteSaved': 'Lite mode saved you about {amount} this week.',
  'settings.liteSavedNone': 'No data saved yet this week.',
  'settings.liteMoreLink': 'More data-saving controls in Data & Lite mode',
  'settings.exportTitle': 'Export your data',
  'settings.exportBody':
    'Download a copy of your profile, posts, comments, listings, bookmarks, and drafts as one file.',
  'settings.exportButton': 'Download my data',
  'settings.exportDone': 'Your export is downloading.',
  'settings.accountStatusTitle': 'Deactivate or delete account',
  'settings.accountStatusBody':
    'Deactivating hides everything until you sign back in. Deleting is permanent after a 30-day grace period.',
  'settings.accountStatusHelp':
    'Deactivating hides your profile and content until you sign back in — nothing is deleted. Requesting deletion starts a 30-day grace period you can cancel any time; after that your account is permanently removed.',
  'settings.accountStatusLink': 'Go to account settings',
  // Phase 6 (§19) self-service account lifecycle controls.
  'settings.accountStatusSectionTitle': 'Account status',
  'settings.deactivateButton': 'Deactivate account',
  'settings.deactivateConfirm':
    'Deactivate your account? Your profile and content are hidden until you sign back in. Nothing is deleted.',
  'settings.requestDeletionButton': 'Request deletion',
  'settings.requestDeletionConfirm':
    'Request account deletion? You have 30 days to cancel before everything is permanently removed.',
  'settings.cancelDeletionButton': 'Cancel deletion',
  'settings.deletionPending': 'Your account is scheduled for deletion. {days} days left to cancel.',
  // Phase 6 (§14) member verification request.
  'settings.verifyTitle': 'Get verified',
  'settings.verifyBody':
    'A short video call confirms you are a real person. Verified members get a badge and higher trust across Xidig.',
  'settings.verifyConsentLabel':
    'I agree to my verification video call being recorded and stored securely for review.',
  'settings.verifyRequestButton': 'Request identity verification',
  // Phase 6 (§19) member appeal form (replaces the mailto stub).
  'settings.appealTitle': 'Appeal a moderation decision',
  'settings.appealIntro':
    'If you think a decision was wrong, tell us what happened. A different moderator than the one who made the decision will review your appeal.',
  'settings.appealEmpty': 'You have no moderation decisions to appeal right now.',
  'settings.appealActionLabel': 'Decision',
  'settings.appealReasonLabel': 'Why should we reconsider?',
  'settings.appealReasonPlaceholder': 'Explain what happened…',
  'settings.appealSubmit': 'Submit appeal',
  'settings.appealActionSuspend': 'Account suspended',
  'settings.appealActionWarn': 'Warning issued',
  'settings.appealActionRemove': 'Content removed',
  'settings.appealActionHide': 'Content hidden',
  'settings.appealActionOther': 'Moderation action',
  // Phase 6 community guidelines stub (error.contentRemoved CTA target).
  'settings.guidelinesTitle': 'Community guidelines',
  'settings.guidelinesBody':
    'Xidig is a place for a respectful Somali community. Our full community guidelines are being finalised. In the meantime, be honest, be kind, and keep it safe for everyone.',
  'settings.guidelinesLink': 'Read more at xidig.net',
  // Account / sessions
  'settings.sessionsTitle': 'Sessions',
  'settings.sessionsIntro': 'Sign out here, or everywhere if a device is lost or shared.',
  'settings.signOutEverywhere': 'Sign out everywhere',
  'settings.resendVerification': 'Resend verification email',

  // Admin (Phase 1: beta gating + roles)
  'admin.title': 'Admin',
  'admin.betaTitle': 'Beta gating',
  'admin.signupModeLabel': 'Signup mode',
  'admin.modeInviteOnly':
    'Invite-only — new members join with a code; the public page offers the waitlist.',
  'admin.modeWaitlist': 'Open waitlist — anyone can queue; you invite in batches.',
  'admin.waitlistTitle': 'Waitlist',
  'admin.waitlistEmpty': 'Nobody is waiting right now.',
  'admin.waitlistInvitedTag': 'Invited',
  'admin.saved': 'Saved.',
  'admin.claimsTitle': 'Listing claims',
  'admin.claimsIntro':
    'Members claiming ownership of unclaimed listings. Approving transfers the listing.',
  'admin.claimsEmpty': 'No pending claims.',
  'admin.claimClaimant': 'Claimant',
  'admin.claimListing': 'Listing',
  'admin.claimEvidence': 'Evidence',
  'admin.claimApprove': 'Approve',
  'admin.claimReject': 'Reject',
  'admin.claimApproved': 'Approved — listing transferred.',
  'admin.claimRejected': 'Rejected.',

  // Admin — Phase 2 human-in-the-loop moderation review queue (AI pre-scan
  // escalations only; the member-reports queue is Phase 6)
  'admin.modTitle': 'Moderation review',
  'admin.modIntro':
    'Content the AI pre-scan flagged or couldn’t judge — Somali-language cases land here for human review.',
  'admin.modEmpty': 'Queue is clear.',
  'admin.modFilterStatus': 'Status',
  'admin.modFilterLanguage': 'Language',
  'admin.modLangOther': 'Other / unknown',
  'admin.modStatusPending': 'Pending',
  'admin.modStatusApproved': 'Approved',
  'admin.modStatusRemoved': 'Removed',
  'admin.modStatusDismissed': 'Dismissed',
  'admin.modReasonFlagged': 'AI flagged — auto-hidden pending your decision',
  'admin.modReasonUncertain': 'AI unsure — still live, needs a human call',
  'admin.modAuthor': 'Author',
  'admin.modVerdict': 'AI verdict',
  'admin.modViewContent': 'Open content',
  'admin.modNoteLabel': 'Note (optional)',
  'admin.modApprove': 'Approve — keep it up',
  'admin.modRemove': 'Remove',
  'admin.modDismiss': 'Dismiss',
  'admin.modDecided': 'Decision saved.',

  // Admin — Phase 6 mod reports queue (§19 member reports; distinct from the
  // Phase 2 AI-escalation queue above). Off the launch floor — internal tooling.
  'admin.reportsTitle': 'Member reports',
  'admin.reportsIntro':
    'Reports members filed, oldest first. Claim one to review, then decide. The badge turns red past our internal 24-hour first-review target (a planning target, not a promise made to members).',
  'admin.reportsEmpty': 'No reports in this view.',
  'admin.reportStatusOpen': 'Open',
  'admin.reportStatusInReview': 'In review',
  'admin.reportStatusResolved': 'Resolved',
  'admin.reportStatusDismissed': 'Dismissed',
  'admin.reportStatusAll': 'All',
  'admin.reportReporter': 'Reported by',
  'admin.reportTarget': 'Target',
  'admin.reportReason': 'Reason',
  'admin.reportSnapshot': 'Captured evidence',
  'admin.reportAgeHours': '{hours}h old',
  'admin.reportSlaBreached': 'Past target',
  'admin.reportClaim': 'Claim',
  'admin.reportNoViolation': 'No violation',
  'admin.reportDismiss': 'Dismiss report',
  'admin.reportHide': 'Hide content',
  'admin.reportRemove': 'Remove content',
  'admin.reportWarn': 'Warn user',
  'admin.reportSuspend': 'Suspend user',
  'admin.reportNoteLabel': 'Internal note (not shown to anyone)',
  'admin.reportResolutionLabel': 'Outcome shown to the reporter (optional)',
  'admin.reportDecided': 'Decision saved.',

  // Admin — Phase 6 appeals review queue (§19 second-mod review).
  'admin.appealsTitle': 'Appeals',
  'admin.appealsIntro':
    'Members appealing a moderation action. You cannot review an appeal of your own action — those are hidden. The badge turns red past our internal 72-hour first-review target (a planning target, not a promise made to members).',
  'admin.appealsEmpty': 'No appeals to review.',
  'admin.appealAppellant': 'Appeal from',
  'admin.appealOriginalAction': 'Action under appeal',
  'admin.appealBody': 'Their appeal',
  'admin.appealModNote': 'Original mod note',
  'admin.appealUphold': 'Uphold action',
  'admin.appealOverturn': 'Overturn (restore)',
  'admin.appealNotesLabel': 'Decision notes (optional)',
  'admin.appealDecided': 'Appeal decided.',

  // Admin — Phase 6 verification queue (§14 verifier tooling).
  'admin.verifyTitle': 'Verification queue',
  'admin.verifyIntro':
    'Identity and business verification requests, oldest first. The badge turns red past our internal 7-day first-review target. Opening a recording is logged.',
  'admin.verifyEmpty': 'No verification requests waiting.',
  'admin.verifyTypeIdentity': 'Identity',
  'admin.verifyTypeBusiness': 'Business',
  'admin.verifyRequester': 'Requested by',
  'admin.verifyBusinessName': 'Business',
  'admin.verifyConsentGiven': 'Recording consent given',
  'admin.verifyConsentMissing': 'No recording consent',
  'admin.verifyAgeDays': '{days}d old',
  'admin.verifyStatusPending': 'Pending',
  'admin.verifyStatusScheduled': 'Scheduled',
  'admin.verifyBookingLabel': 'Booking link',
  'admin.verifySchedule': 'Schedule call',
  'admin.verifyApprove': 'Approve',
  'admin.verifyDecline': 'Decline',
  'admin.verifyMoreInfo': 'Request more info',
  'admin.verifyNotesLabel': 'Notes to the member (optional)',
  'admin.verifyViewRecording': 'View recording',
  'admin.verifyRecordingError': 'No recording is available for this request.',
  'admin.verifyDecided': 'Saved.',

  // Site footer — links out to the public marketing site (xidig.net) for the
  // legal + about pages, which live there, not in the app.
  'footer.privacy': 'Privacy',
  'footer.terms': 'Terms',
  'footer.about': 'About',

  // Accessibility labels (screen-reader only)
  'a11y.mainNav': 'Main navigation',
  'a11y.footerNav': 'Footer',
  'a11y.map': 'Map',
  'a11y.notifications': 'Notifications',
  'a11y.notificationsUnread': {
    one: 'Notifications, {count} unread',
    other: 'Notifications, {count} unread',
  },
  'a11y.removeRow': 'Remove row',
  'a11y.search': 'Search',
  'a11y.userMenu': 'Account menu',
  'a11y.userMenuUnread': {
    one: 'Account menu, {count} unread message',
    other: 'Account menu, {count} unread messages',
  },
  'a11y.skipCelebration': 'Skip celebration',
  'a11y.moveUp': 'Move up',
  'a11y.moveDown': 'Move down',

  // Following feed on Home (§13 — Phase 1 feed = new listings from people you follow)
  'feed.title': 'Following',
  // Home tabs (Task 7): Following (default) / Latest (global Plaza feed).
  // Link-based ?tab= — shareable URLs, back-button friendly.
  'feed.tabFollowing': 'Following',
  'feed.tabLatest': 'Latest',
  // Published sort rule (chronological honesty): rides the Latest tab caption
  // AND the per-card "Why this?" popover — one key, one truth.
  'feed.sortTransparency': 'Newest first — no hidden ranking.',
  'feed.empty':
    'Nothing here yet — follow people and Spaces, and their posts, updates, and new listings will show up here.',
  'feed.emptyHint': 'Follow people and Spaces to see their posts, updates, and new listings here.',
  'feed.emptyLatestCta': 'See the latest posts',
  'feed.newListingFrom': 'New listing from {name}',
  // End-of-feed terminus + per-card transparency (brand-rethink adoption):
  // feed.end is the REACHED-THE-END state (distinct from feed.empty); the
  // feed.why* lines are mechanism-true to the following_feed view's union
  // predicates (docs/rls-following-feed.md) — never claim more than the query.
  'feed.end': 'You’re all caught up — that’s everything from your people.',
  'feed.whyThis': 'Why this?',
  'feed.whyPost': 'You follow {name} — that’s the only reason it’s here.',
  'feed.whyLab': 'From {name}, a Space you follow or belong to — no other reason.',
  'feed.whyListing': 'From {name}, who you follow — no other reason.',
  'feed.labUpdateTag': '{kind} update',
  'feed.labUpdateCrossPost': 'Cross-posted',
  'feed.labUpdateBy': 'By {name}',
  'feed.labUpdateOpen': 'Open Space',

  // Share text — WhatsApp/link share of a Space or Venture candidate. Kept
  // compliance-safe: candidate share carries NO invest/returns language so it
  // is safe to surface publicly in any region (§17 region gate, sprint spec).
  'share.labText': '{name} on Xidig',
  'share.candidateText': 'View candidate: {name}',

  // Member profiles — display + edit (§10, §13, §14, §20)
  'profile.displayNameLabel': 'Name',
  'profile.handleLabel': 'Handle',
  'profile.handleHint':
    'Lowercase letters, numbers, or underscores — 3 to 30. Your page lives at /u/your-handle.',
  'profile.bioLabel': 'Bio',
  'profile.cityLabel': 'City',
  'profile.countryLabel': 'Country',
  'profile.skillsLabel': 'Skills',
  'profile.skillsHint': 'Type to search — pick a suggestion or add your own.',
  'profile.skillSuggestions': 'Skill suggestions',
  'profile.removeSkill': 'Remove {name}',
  'profile.suggestLane': 'Missing your sector? Suggest one',
  'profile.suggestPlaceholder': 'New sector',
  'profile.suggestThanks': 'Thanks — an admin will review your suggestion.',
  'action.suggest': 'Suggest',
  'action.approve': 'Approve',
  'admin.taxonomyTitle': 'Term suggestions',
  'admin.taxonomySubtitle': 'Member-proposed sectors and categories awaiting review.',
  'admin.taxonomyEmpty': 'No pending suggestions.',
  'profile.lanesLabel': 'Lanes',
  'profile.lanesHint': 'The sectors you build in.',
  'profile.linksLabel': 'Links',
  'profile.linkLabelLabel': 'Label',
  'profile.linkUrlLabel': 'URL',
  'profile.contactTitle': 'Contact options',
  'profile.contactHint':
    'Only what you add here is shown to members. Leave blank to stay unreachable.',
  'profile.contactWhatsappLabel': 'WhatsApp number',
  'profile.contactEmailLabel': 'Contact email',
  'profile.contactWebsiteLabel': 'Website',
  'profile.saved': 'Profile saved.',
  'profile.followersCount': { one: '{count} follower', other: '{count} followers' },
  'profile.vouchesCount': { one: '{count} vouch', other: '{count} vouches' },
  'profile.memberSince': 'Member since {date}',
  'profile.contactSection': 'Contact',
  'profile.signInToContact': 'Sign in to see contact options',
  'profile.badgesSection': 'Badges',
  'profile.badgeFoundingMember': 'Founding Member',
  'profile.badgeLabLead': 'Lab Lead',
  'profile.badgeTopHelper': 'Top Helper',
  'profile.badgeEarlyBacker': 'Early Backer',
  'profile.badgeMentorInResidence': 'Mentor in Residence',
  'profile.badgeIdentityVerified': 'Identity Verified',
  'profile.badgeCommunityVerified': 'Community Verified',
  'profile.badgeVerifiedBusiness': 'Verified Business',
  // Aniga v3 Badge Canon (ruling 10): tooltips carry the full earning
  // criterion the short chip label cannot. (The Garab milestone badge and its
  // two keys were retired in the Packet B follow-up — see lib/aniga/badges.ts
  // RETIRED_BADGE_SLUGS.)
  'profile.badgeTopHelperTooltip':
    'Last month’s most-verified helper. Chosen by member vote — one vote per member.',
  'profile.badgeFoundingMemberTooltip': 'One of the first 500 members who built this community.',
  'profile.verifStatusUnverified': 'Unverified',
  'profile.verifStatusPending': 'Verification pending',
  'profile.verifStatusCommunity': 'Community Verified',
  'profile.verifStatusIdentity': 'Identity Verified',
  'profile.joinCta': 'Join Xidig to connect with {name}',
  'profile.notSetUp': 'You haven’t set up your profile yet — it takes 2 minutes.',
  // Phase 4.5 — media identity, open-to, pins, completion meter, suggested follows
  'profile.avatarLabel': 'Profile photo',
  'profile.avatarUpdated': 'Photo updated.',
  'profile.avatarUpload': 'Upload photo',
  'profile.coverAlt': 'Cover image for {name}',
  'profile.coverLabel': 'Cover image',
  'profile.coverUpdated': 'Cover updated.',
  'profile.coverUpload': 'Upload cover',
  'profile.mediaSection': 'Photos',
  'profile.mediaRemoved': 'Removed.',
  'profile.uploading': 'Uploading…',
  'profile.openToTitle': 'Open to',
  'profile.openToHint':
    "Tell members what you're open to — it shows on your profile and in the directory.",
  'profile.openToCofounding': 'Co-founding',
  'profile.openToHiring': 'Hiring',
  'profile.openToHireMe': 'Open to work',
  'profile.openToInvesting': 'Investing',
  'profile.openToMentoring': 'Mentoring',
  'profile.openToCollaborating': 'Collaborating',
  'profile.pinsTitle': 'Pinned',
  'profile.pinsEmpty': 'Nothing pinned yet.',
  'profile.pinsHint': 'Pin up to 3 posts, Spaces or listings to the top of your profile.',
  'profile.pinsMax': 'You can pin up to 3 items.',
  'profile.pinsSaved': 'Pins updated.',
  'profile.pinAction': 'Pin',
  'profile.pinTypePost': 'Post',
  'profile.pinTypeLab': 'Space',
  'profile.pinTypeListing': 'Business',
  'profile.pinsPickerPosts': 'Your recent posts',
  'profile.pinsPickerLabs': 'Your Spaces',
  'profile.pinsPickerListings': 'Your listings',
  // Aniga v3 module shell. The flag chip states what is true right now — a
  // platform decision, not a countdown (ruling 7).
  'profile.moduleVisitorsOff': 'Visitors: off',
  'profile.moduleHiddenA11y': 'This section is hidden',
  'profile.completionTitle': 'Profile strength',
  'profile.completionPercent': '{percent}% complete',
  'profile.completionDone': 'Your profile is complete.',
  'profile.completionNextName': 'Add your name',
  'profile.completionNextBio': 'Add a short bio',
  'profile.completionNextLocation': 'Add your location',
  'profile.completionNextSkills': 'Add your skills',
  'profile.completionNextLanes': 'Pick a lane',
  'profile.completionNextLinks': 'Add a link',
  'profile.completionNextAvatar': 'Add a profile photo',
  'profile.suggestedFollowsTitle': 'People to follow',
  'profile.suggestedFollowsHint': 'Builders who share your lanes, skills or city.',

  // Suuq — directory, map, listings (§18)
  'suuq.tabPeople': 'People',
  'suuq.tabBusinesses': 'Businesses',
  'suuq.tabMap': 'Map',
  'suuq.searchPeoplePlaceholder': 'Name or handle — any spelling (Maxamed, Mohamed…)',
  'suuq.searchBusinessPlaceholder': 'Business name or what they do',
  'suuq.filterSkill': 'Skill',
  'suuq.filterLane': 'Lane',
  'suuq.filterCity': 'City',
  'suuq.filterCountry': 'Country',
  'suuq.filterCategory': 'Category',
  'suuq.filterVerified': 'Verification',
  'suuq.filterVerifiedOption': 'Verified only',
  'suuq.anyOption': 'Any',
  'suuq.noResults': 'No results. Try a shorter spelling or fewer filters.',
  // Teaching empty states — split by cause so the CTA fits the situation.
  'suuq.emptyPeople': 'No members here yet. Complete your profile and invite others to join.',
  'suuq.emptyPeopleQuery': 'No one matched that search. Try a shorter spelling.',
  'suuq.emptyPeopleFilters': 'No members match these filters. Try removing one.',
  'suuq.emptyBusinesses': 'No businesses listed yet — add yours.',
  'suuq.emptyBusinessesQuery': 'No businesses matched that search. Try fewer words.',
  'suuq.emptyBusinessesFilters': 'No businesses match these filters. Try removing one.',
  'suuq.addListing': 'Add your business',
  'suuq.newListingTitle': 'Add a business listing',
  'suuq.businessNameLabel': 'Business name',
  'suuq.categoryLabel': 'Category',
  'suuq.descriptionLabel': 'Short description',
  'suuq.addressLabel': 'Address (optional)',
  'suuq.landmarkLabel': 'Landmark (optional)',
  'suuq.landmarkHint': 'A nearby known place — like “opposite Bakaaraha gate 4”.',
  'suuq.pinLabel': 'Location pin',
  'suuq.pinHint':
    'Drop a pin on the map to set your location — we use the pin as the primary address for Somalia locations.',
  'suuq.pinPlaced': 'Pin set: {lat}, {lng}',
  'suuq.manualCoords': 'No map? Enter coordinates by hand.',
  'suuq.latLabel': 'Latitude',
  'suuq.lngLabel': 'Longitude',
  'suuq.contactLinksLabel': 'Contact links',
  'suuq.contactTypeLabel': 'Type',
  'suuq.contactValueLabel': 'Number or link',
  'suuq.duplicatesTitle': 'A listing like this already exists',
  'suuq.duplicatesBody':
    'A listing for {name} already exists. Is this your business? Claim it here.',
  'suuq.claimListing': 'Claim this listing',
  'suuq.createAnyway': 'Mine is different — create it anyway',
  'suuq.claimEvidenceLabel': 'How do we know it’s yours? (optional)',
  'suuq.claimSubmitted':
    'Claim submitted — a moderator will review it and transfer the listing to you if approved.',
  'suuq.unclaimed': 'Unclaimed',
  'suuq.searchArea': 'Search this area',
  // Task 12 — cluster badge tooltip/accessible name (count is the visible label).
  'suuq.mapCluster': '{count} listings — select to zoom in',
  'suuq.listedBy': 'Listed by {name}',
  'suuq.contactHeading': 'Contact',
  'suuq.verifiedBusiness': 'Verified Business',
  // Task 11 — published directory sort rule + Verified chip explainer (§14/§18).
  'suuq.sortTransparency': 'Recently updated · Verified first — no hidden ranking.',
  'suuq.verifiedExplainerBody':
    'A community verifier checked this business is real — a video call with the owner, a premises video, or documents. It means the business exists and the listing is genuine; it is not a rating or an endorsement.',
  'suuq.verifiedCheckedDate': 'Checked: {date}',
  'suuq.joinCta': 'Join Xidig to connect with Somali businesses and builders.',
  'suuq.osmLink': 'Open in OpenStreetMap',
  // Phase 4.5 — listing edit, photos, hours, services, price range, filters
  'suuq.editListing': 'Edit listing',
  'suuq.editListingTitle': 'Edit business listing',
  'suuq.saveListing': 'Save changes',
  'suuq.filterOpenTo': 'Open to',
  'suuq.openNowFilter': 'Open now only',
  'suuq.openNow': 'Open now',
  'suuq.photosLabel': 'Photos',
  'suuq.photosHint': 'Up to {max} photos, {maxMb}MB each. The first photo is the cover.',
  'suuq.photoAttach': 'Add photo',
  'suuq.photoCover': 'Cover',
  'suuq.photoAltLabel': 'Photo description',
  'suuq.photoAltHint': 'Required — shown when photos are off and read by screen readers.',
  'suuq.photoUploading': 'Uploading…',
  'suuq.photoQueued': 'Uploaded — flagged for a quick human check.',
  'suuq.hoursLabel': 'Opening hours',
  'suuq.hoursHint': 'Set hours for each day, or mark it closed.',
  'suuq.closedDay': 'Closed',
  'suuq.openTimeLabel': 'Opens',
  'suuq.closeTimeLabel': 'Closes',
  'suuq.dayMon': 'Mon',
  'suuq.dayTue': 'Tue',
  'suuq.dayWed': 'Wed',
  'suuq.dayThu': 'Thu',
  'suuq.dayFri': 'Fri',
  'suuq.daySat': 'Sat',
  'suuq.daySun': 'Sun',
  'suuq.servicesLabel': 'Services & prices',
  'suuq.servicesHint': 'Up to {max} services.',
  'suuq.serviceNameLabel': 'Service',
  'suuq.servicePriceLabel': 'Price (optional)',
  'suuq.priceRangeLabel': 'Price range',
  'suuq.priceRangeNone': 'Not set',
  'suuq.priceRangeAria': 'Price range {level} of 4',
  'suuq.whatsappCta': 'Message directly',
  // Task 10 (31 Jul) — sticky filter bar + filters sheet
  'suuq.filtersButton': 'Filters',
  'suuq.filtersButtonCount': 'Filters · {count}',
  'suuq.openNowClientNote':
    '“Open now” checks only the results already loaded here, using your device’s clock.',

  // Plaza / Madal (§15, §20, §27) — feed, composer, asks, polls, reactions
  'plaza.filterAll': 'All',
  'plaza.pinnedHeading': 'This week’s highlights',
  'plaza.typeIntro': 'Intro',
  'plaza.typeAsk': 'Ask',
  'plaza.typeWin': 'Win',
  'plaza.typeUpdate': 'Update',
  'plaza.typePoll': 'Poll',
  'plaza.typeIntroHint': 'Introduce yourself to the community.',
  'plaza.typeAskHint': 'Ask for help — offers to help arrive as private messages.',
  'plaza.typeWinHint': 'Share a win, big or small.',
  'plaza.typeUpdateHint': 'Progress on what you’re building.',
  'plaza.typePollHint': 'Put a question to a community vote.',
  // Teaching empty states (§20) — one per feed filter
  'plaza.emptyIntro':
    'No intros yet. New here? Introduce yourself — who you are, what you build, what you need.',
  'plaza.emptyAsk': 'No open Asks. Stuck on something? Ask — helpers earn credit here.',
  'plaza.emptyWin':
    'No Wins posted yet. Shipped something? Closed a deal? Post the win — proof powers this community.',
  'plaza.emptyUpdate': 'No updates yet. Building something? Share your progress.',
  'plaza.emptyPoll': 'No polls yet. Need a decision? Ask the community with a quick poll.',
  'plaza.emptyCta': 'Start the first post',
  'plaza.imageChoose': 'Add images',
  'action.chooseImage': 'Choose image',
  // Composer
  'plaza.composerTitle': 'Share with the Plaza',
  'plaza.composerPrompt': 'Share something with the Plaza…',
  'plaza.titleLabel': 'Title (optional)',
  'plaza.bodyLabel': 'Your post',
  'plaza.bodyLabelAsk': 'What do you need help with?',
  'plaza.bodyLabelPoll': 'Your question',
  'plaza.linkLabel': 'Link (optional)',
  'plaza.linkHint': 'YouTube, TikTok, Vimeo, X, and Instagram links play right here in the app.',
  'plaza.linkNotEmbeddable':
    'We can’t preview that link. It’ll still post as a plain URL — or paste a YouTube/TikTok/Vimeo link for an in-app player.',
  'plaza.imagesLabel': 'Images',
  'plaza.imagesHint': 'Up to {max} images, {maxMb}MB each — JPG, PNG, GIF, or WebP.',
  'plaza.imageUploading': 'Uploading…',
  'plaza.imageQueued': 'Uploaded — flagged for a quick human check.',
  'plaza.imageAlt': 'Post image {n}',
  'plaza.tagsLabel': 'Tags',
  'plaza.tagsHint': 'Up to {max}. Pick existing tags or add a new one (lowercase-with-dashes).',
  'plaza.pollOptionsLabel': 'Poll options',
  'plaza.pollOptionPlaceholder': 'Option {n}',
  'plaza.pollDurationLabel': 'Poll runs for',
  'plaza.pollDurationDays': { one: '{count} day', other: '{count} days' },
  // Post card
  'plaza.askOpen': 'Open',
  'plaza.askInProgress': 'Being helped',
  'plaza.askFulfilled': 'Solved',
  'plaza.askAnswered': 'Answered',
  'plaza.askClosed': 'Closed',
  // Codsi detail (P1 · frames 1a–3b): offer = private DM, helper named on
  // acceptance, asker-only lifecycle.
  'plaza.offerCta': 'I can help',
  'plaza.offerCtaSecondary': 'I can help too',
  'plaza.offerPrivacyNote': 'A private message goes to {name} — it never appears in this thread.',
  'plaza.offerStillOpenNote': 'This ask is still open — {name} can still hear from other helpers.',
  'plaza.offerMessageLabel': 'Your offer message',
  'plaza.offerMessagePlaceholder': 'Say how you can help…',
  'plaza.offersCardTitle': 'Offers to help',
  'plaza.offerAccept': 'Accept',
  'plaza.helperHelping': '{name} is helping',
  'plaza.helperHelpingOwn': '{name} is helping you',
  'plaza.helperHelped': '{name} helped',
  'plaza.helperAcceptedAgo': '{name} accepted · {time}',
  'plaza.helperAcceptedYouAgo': 'You accepted {time}',
  'plaza.helperOpenDm': 'Open the message',
  'plaza.helperCardTitle': 'Helper',
  'plaza.helperViewProfile': 'View profile',
  'plaza.ownerCardTitle': 'This ask is yours',
  'plaza.markFulfilled': 'Mark as solved',
  // Ruling 8 follow-up (9 Aug): the terminal action confirms via Dialog.
  'plaza.fulfillConfirmBody': 'The ask becomes "Solved" — this can’t be undone.',
  'plaza.fulfillConfirmCta': 'Yes, mark it solved',
  'plaza.reopenAsk': 'Reopen it',
  'plaza.ownerOnlyNote':
    'Only you can change this ask’s status. Xidig never changes it on its own.',
  'plaza.fulfilledTitle': 'This ask is solved',
  'plaza.fulfilledByAfter': '{helper} helped — solved after {duration}.',
  'plaza.fulfilledAfter': 'Solved after {duration}.',
  'plaza.durationDays': { one: '{count} day', other: '{count} days' },
  'plaza.guulPromptTitle': 'Make it a Win?',
  'plaza.guulPromptBody': 'Share the story on the Plaza so others learn what worked. You write it.',
  'plaza.guulPromptCta': 'Write the Win',
  'plaza.guulPromptDismiss': 'No, thanks',
  'plaza.guulPromptClose': 'Dismiss this suggestion',
  'plaza.timelineTitle': 'Ask timeline',
  'plaza.detailsTitle': 'Details',
  'plaza.detailsCategory': 'Category',
  'plaza.detailsLocation': 'Location',
  'plaza.detailsDuration': 'Duration',
  'plaza.threadHeadingCount': 'Thread · {count}',
  'plaza.emptyThreadTitle': 'No replies yet',
  'plaza.emptyThreadBody':
    'This ask opened {duration}. If you know something, write the first reply.',
  'plaza.threadError':
    'The thread couldn’t load. You can still read the ask — the replies are missing. Try again.',
  'plaza.commentLabelOwner': 'Add an update',
  'plaza.commentPlaceholder': 'Write a reply…',
  'plaza.reportCodsi': 'Report this ask',
  'plaza.threadPublicNote':
    'The help conversation happens in Messages. What’s written here is public — the whole community sees it.',
  'plaza.pollClosed': 'Poll closed',
  'plaza.pollClosesIn': 'Closes {when}',
  'plaza.commentsCount': { one: '{count} comment', other: '{count} comments' },
  // Feed-card body clamp escape hatch + inline newest-comment teaser (Task 7)
  'plaza.readMore': 'Read more',
  'plaza.latestComment': 'Latest comment',
  'plaza.reactionFire': 'Fire',
  'plaza.reactionStrong': 'Strong',
  'plaza.reactionMashallah': 'Mashallah',
  'plaza.reactionIdea': 'Idea',
  'plaza.reactionWatching': 'Watching',
  'plaza.addReaction': 'React',
  'plaza.edited': 'Edited',
  'plaza.pinned': 'Highlight',
  'plaza.hiddenOwn':
    'Only you can see this post right now — it’s waiting for a quick moderation check.',
  // Composed with a link: {link} is replaced with an <a> to /support/appeal
  // whose text is plaza.removedOwnLinkText (SystemNotice, bracketed-sentinel
  // pattern — see SignUpForm's renderTermsLabel).
  'plaza.removedOwn': 'This post was removed. If you think that’s wrong, {link}.',
  'plaza.removedOwnLinkText': 'appeal the decision',
  'plaza.lowBandwidthMedia': 'Images and embeds are off in low-bandwidth mode.',
  // Detail page — comments, Ask lifecycle, polls
  'plaza.commentsHeading': 'Comments',
  'plaza.commentLabel': 'Add a comment',
  // plaza.creditedBadge survives the P1 helper migration: pre-migration
  // credited answers keep their badge in old threads (record stays honest).
  'plaza.creditedBadge': 'Credited answer',
  'plaza.askStaleTitle': 'Still looking for help?',
  'plaza.askStaleBody':
    'Your Ask has been open for {days} days. Mark it solved if it’s sorted — or leave it open if you’re still looking.',
  'plaza.voteButton': 'Vote',
  'plaza.changeVote': 'Change vote',
  'plaza.votesCount': { one: '{count} vote', other: '{count} votes' },
  'plaza.closePoll': 'Close poll',
  'plaza.yourVote': 'Your vote',
  // Unknown-link warning interstitial (§15)
  'plaza.interstitialTitle': 'You’re leaving Xidig',
  'plaza.interstitialBody':
    'This link goes to {host} — a site we can’t vouch for. Check the address before you continue.',
  'plaza.interstitialContinue': 'Continue to {host}',
  // Phase 4.5 — per-image alt text, drafts, post edit history
  'plaza.imageAltLabel': 'Image description',
  'plaza.imageAltHint': 'A short description helps screen readers and members on slow connections.',
  'plaza.imageAttach': 'Attach',
  'plaza.draftsHeading': 'Continue a draft',
  'plaza.draftContinue': 'Continue',
  'plaza.draftSaved': 'Draft saved',
  'plaza.draftUntitled': '(untitled draft)',
  'plaza.draftRestored': 'We restored your unposted draft.',
  'plaza.draftDeleteLabel': 'Delete draft: {name}',
  'plaza.editPost': 'Edit post',
  'plaza.editedAfterReplies': 'Edited after replies',
  'plaza.editHistoryCount': 'Edit history ({count})',
  'plaza.editHistoryEmpty': 'No earlier versions.',

  // Fariimo — Messages / DMs (§13, §27). Trust surface: full Somali at launch.
  'messages.subtitle': 'Your 1:1 conversations with other builders.',
  // 6c empty — a warm surface: one fact, one route out.
  'messages.empty':
    'Conversations start on the Plaza — reply to an ask, or send a salaan to someone you’d like to know.',
  'messages.emptyTitle': 'No messages yet',
  'messages.emptyCta': 'Open the Plaza',
  'messages.emptyFootnote':
    'Anyone can send you one message before you accept. You decide who you talk to.',
  'messages.emptyRequests': 'No message requests right now.',
  // 6a/6d inline sections (tabs retired — requests are never a second inbox).
  'messages.requestsHeading': 'Message requests',
  'messages.chatsHeading': 'Chats',
  'messages.requestTag': 'Request',
  'messages.requestsFootnote':
    'They can send one message until you accept. Declining is silent — they are never told.',
  'messages.you': 'You',
  'messages.new': 'New',
  'messages.unreadCount': { one: '{count} unread', other: '{count} unread' },
  'messages.noPreview': 'No messages yet.',
  'messages.emptyThread': 'No messages yet — say salaam to break the ice.',
  // 6d request pane — the informed-consent chrome.
  'messages.requestExplainer':
    'This is a message request. {name} can’t see that you’ve read it, and they can send only one message until you accept.',
  'messages.acceptAndReply': 'Accept and reply',
  'messages.senderContextTitle': 'What you know about {name}',
  'messages.contextLabs': 'Labs',
  'messages.contextLabsShared': '{name} — you both',
  'messages.contextPlaza': 'Plaza',
  'messages.contextRepliedYourAsk': 'Replied to your ask: {title}',
  'messages.contextVerification': 'Verification',
  'messages.contextNotVerified': 'Not yet verified',
  'messages.contextVerified': 'Verified',
  'messages.declineFootnote':
    'Declining is silent — {name} is never told. The message deletes after 30 days.',
  'messages.memberSince': 'Member {year}',
  'messages.accepted': 'Request accepted — you can chat now.',
  // RECIPIENT-side confirmation only (screen-reader live region) — the
  // silent-decline contract governs what the SENDER observes, never this.
  'messages.declinedByYou': 'Request declined.',
  'messages.acceptedDivider': 'You accepted the request · {time}',
  // f5 — the silence is the design: the sender sees "sent", a normalising
  // note, and a closed composer. Declined renders EXACTLY the same.
  'messages.pendingSentMeta': 'Request · sent {time}',
  'messages.sentAt': 'Sent · {time}',
  'messages.pendingSentNotice':
    'You can send one message until {name} responds. No answer means busy or not interested — both are normal.',
  'messages.pendingSentFooter': 'The composer opens if {name} accepts.',
  // f4 — blocker's view: chrome, not content. The neutral blockedNotice
  // below stays for the OTHER side (restricted — never reveals a block).
  'messages.blockedHeaderName': 'Blocked member',
  'messages.blockedByMeNotice':
    'You blocked this member — {date}. They can’t message you, and you can’t message them. The history stays in case you need it for a report.',
  'messages.blockedComposer': 'The composer is closed.',
  'messages.unblock': 'Unblock',
  'messages.blockedNotice': 'You can’t message this member.',
  'messages.composerPlaceholder': 'Write a message…',
  'messages.composerKeyHint': 'Enter sends; Shift+Enter adds a new line.',
  'messages.newMessage': 'New message',
  'messages.searchMembers': 'Search members…',
  'messages.searchResultsCount': {
    one: '{count} member found',
    other: '{count} members found',
  },
  'messages.loadOlder': 'Load older messages',
  'messages.historyStart': 'This is the start of your conversation.',
  'messages.messageRemoved': 'This message was removed.',
  'messages.sendFailed': 'Message didn’t send. Check your connection and try again.',
  // f2 — per-message failure: dim in place, retry/delete, order preserved.
  'messages.sendFailedChip': 'Not sent',
  'messages.retrySend': 'Send again',
  // f3 — offline outbox: composer stays live, the queue chip promises.
  'messages.queuedChip': 'Waiting — it will send when the internet returns',
  'messages.reconnecting': 'Reconnecting…',
  'messages.offline': 'No internet — your messages will wait.',
  // 6b — voice notes: self-recorded, duration shown, no transcription.
  'messages.voiceNote': 'Voice note',
  'messages.voiceNoteWithDuration': 'Voice note — {duration}',
  'messages.voicePlay': 'Play',
  'messages.voicePause': 'Pause',
  'messages.voiceRecord': 'Record a voice note',
  'messages.voiceStop': 'Stop recording',
  'messages.voiceDiscard': 'Discard recording',
  'messages.voiceRecording': 'Recording… {duration}',
  'messages.voiceUnavailable': 'Voice isn’t available',
  // §27 DMs block (success notices)
  'messages.requestSent':
    'Your message request has been sent. They’ll see it when they next open Xidig.',
  'messages.reportSubmitted':
    'Thanks for the report. A person reviews every report, and we will update you on the outcome.',
  // Phase 6 (§27 Moderation + §19 account lifecycle) success notices
  'messages.appealSubmitted':
    'Your appeal has been sent to a moderator who was not involved in the original decision. We will come back to you with the outcome.',
  'messages.verificationRequested':
    "Your verification request is in. We'll be in touch to schedule your video call.",
  'messages.accountDeactivated':
    'Your account is deactivated. Sign in anytime to reactivate it — nothing has been deleted.',
  'messages.deletionRequested':
    'Your account is scheduled for deletion in 30 days. You can cancel any time before then — and you can download a copy of your data from Settings.',
  'messages.deletionCancelled':
    'Welcome back. Your deletion request is cancelled and your account is active again.',
  // Conversation options (block / report)
  'messages.optionsLabel': 'Conversation options',
  'messages.blockConfirm':
    'Block {name}? They won’t be able to message you, and this chat will be hidden.',
  'messages.blocked': '{name} is blocked.',
  'messages.unblocked': '{name} is unblocked.',
  'messages.reportTitle': 'Report {name}',
  'messages.reportReasonLabel': 'Why are you reporting this?',
  'messages.reportReasonSpam': 'Spam',
  'messages.reportReasonHarassment': 'Harassment',
  'messages.reportReasonImpersonation': 'Impersonation',
  'messages.reportReasonFraud': 'Fraud or scam',
  'messages.reportReasonInappropriate': 'Inappropriate content',
  'messages.reportReasonMisinfo': 'Misinformation',
  'messages.reportReasonOther': 'Something else',
  'messages.reportDetailsLabel': 'Anything else we should know? (optional)',
  'messages.startError': 'Couldn’t start that conversation. Try again in a moment.',

  // Fariimo — Notifications inbox (§9, §22 bundling, §26 matrix)
  'notif.subtitle': 'Replies, mentions, and messages — grouped, not noisy.',
  'notif.empty': 'You’re all caught up. Replies, mentions, and new messages will show up here.',
  'notif.markAllRead': 'Mark all read',
  'notif.viewAll': 'See all notifications',
  'notif.loadedCount': 'Notifications loaded: {count}',
  'notif.allRead': 'All caught up.',
  // Bundled summary lines — {name} is the most recent actor, {count} the extras
  'notif.reply': '{name} replied to your post',
  'notif.replyBundle': '{name} and {count} others replied to your post',
  'notif.mention': '{name} mentioned you',
  'notif.mentionBundle': '{name} and {count} others mentioned you',
  'notif.newDm': { one: '{name} sent you a message', other: '{name} sent you {count} messages' },
  'notif.dmRequest': '{name} wants to message you',
  'notif.dmAccepted': '{name} accepted your message request',
  'notif.askCredited': 'The ask you helped was marked solved — you earned Helper score',
  'notif.askHelperNamed': 'Your offer was accepted — you’re named as the helper on this Ask',
  'notif.askStale': 'Your Ask has been open a while — mark it solved if it’s sorted',
  'notif.moderationHold': 'A post of yours is being reviewed',
  'notif.moderationRemoved': 'A post of yours was removed',
  'notif.candidateStatus': 'A venture you follow changed status',
  'notif.labUpdate': 'New update in {name}',
  'notif.labJoinRequest': '{name} asked to join your Lab',
  'notif.labJoinResponse': 'Your Lab membership was updated',
  'notif.labPromoted': '{name} moved up the ladder',
  'notif.labDormant': '{name} has gone quiet — revive it with an update',
  'notif.labSkillGap': 'A Lab is looking for your skills',
  'notif.labCollabInvite': '{name} wants to collaborate',
  'notif.labCollabResponse': 'Your collaboration request got a response',
  // Munaasabado dispatch (Task 2) — Mentor-in-Residence booking notification.
  'notif.mentorSlotBooked': '{name} booked a mentor slot — {when}',
  'notif.generic': 'New activity on Xidig',

  // Push opt-in (§22 PWA push)
  'push.title': 'Push notifications',
  'push.body': 'Get a heads-up on new messages and mentions, even when Xidig is closed.',
  'push.enabled': 'Push notifications are on for this device.',
  'push.enable': 'Turn on push',
  'push.disable': 'Turn off push',
  'push.unsupported': 'This browser doesn’t support push notifications.',
  'push.denied':
    'Push is blocked in your browser settings. Allow notifications for Xidig to turn it on.',
  'push.unavailable':
    'Push is coming soon — replies and mentions keep showing up right here in the app.',

  // Labs / Spaces (§16, §20). Chrome (Warshad/Koox) reuses term.lab / term.club.
  'lab.listTitle': 'Labs',
  'lab.listSubtitle': 'Spaces where Somali builders form Clubs and Labs to build together.',
  'lab.filterAll': 'All',
  'lab.filterClubs': 'Clubs',
  'lab.filterLabs': 'Labs',
  'lab.filterMine': 'My Spaces',
  // Discover tab label + its RLS-honest count ("All (12)").
  'lab.tabWithCount': '{label} ({count})',
  'lab.emptyList':
    'No Spaces yet. Start a Club to gather people around an idea, or open a Lab to build a venture.',
  'lab.createCta': 'Start a Space',
  'lab.createTitle': 'Start a Space',
  'lab.createModeQuestion': 'What are you starting?',
  'lab.modeClub': 'Club',
  'lab.modeClubHint': 'Casual — gather people around a topic. Free to start.',
  'lab.modeLab': 'Lab',
  'lab.modeLabHint': 'Serious — a charter-backed venture track. Needs Xidig Plus.',
  'lab.createSupporterNote': 'Creating a Lab requires Xidig Plus.',
  'lab.fieldName': 'Name',
  'lab.fieldSlug': 'Address',
  'lab.fieldSlugHint':
    'Your Space lives at /labs/your-address. Lowercase letters, numbers and dashes.',
  'lab.fieldSummary': 'One-liner',
  'lab.fieldSummaryHint': 'A short description shown on cards and in the directory.',
  'lab.fieldVisibility': 'Who can see this?',
  'lab.fieldJoinMode': 'Who can join?',
  'lab.fieldSkills': 'Looking for',
  'lab.fieldSkillsHint': 'Skills you need — members with these get a nudge.',
  'lab.charterHeading': 'Lab charter',
  'lab.charterHint': 'The charter is what turns an idea into a Lab. You can refine it later.',
  // Playbook picker — six seeded starters that pre-fill the charter fields
  // (§16, sprint §1b). Selecting one only fills empty fields (or confirms
  // before overwriting edited text). Names are English; labels localize here.
  'lab.playbookLabel': 'Start from a playbook (optional)',
  'lab.playbookNone': 'No playbook — start blank',
  'lab.playbookPickerHint':
    'Pick a starting point that fits your idea. It fills in the charter below — you can edit every word before you create the Space.',
  'lab.playbookOverwriteConfirm':
    'This playbook has different charter text. Replace what you already wrote?',
  'lab.playbookGeneric': 'Playbook',
  'lab.playbookCommunity': 'Community project',
  'lab.playbookCommunityHint': 'Organize people around a shared community need or goal.',
  'lab.playbookStartup': 'Startup / venture idea',
  'lab.playbookStartupHint': 'Build a product around a real, underserved customer problem.',
  'lab.playbookResearch': 'Research / learning circle',
  'lab.playbookResearchHint': 'Explore a topic or question together in a structured way.',
  'lab.playbookLocalService': 'Local service / business collaboration',
  'lab.playbookLocalServiceHint': 'Partner to offer or improve a service in your area.',
  'lab.playbookCreative': 'Creative / media project',
  'lab.playbookCreativeHint': 'Bring a story, message, or creative work to an audience.',
  'lab.playbookTechnical': 'Technical build / software project',
  'lab.playbookTechnicalHint': 'Build a working tool or system people actually use.',
  'lab.fieldProblem': 'Problem',
  'lab.fieldHypothesis': 'Hypothesis',
  'lab.fieldSuccess': 'What success looks like',
  'lab.fieldSprintLength': 'Sprint length (weeks)',
  'lab.fieldSprintDeadline': 'Current sprint ends',
  'lab.visPrivate': 'Private',
  'lab.visPrivateHint': 'Only members of this Space can see it.',
  'lab.visMembers': 'Members',
  'lab.visMembersHint': 'Any Xidig member can see it.',
  'lab.visPublic': 'Public',
  'lab.visPublicHint': 'Anyone on the web can see it — great for building in public.',
  'lab.memberView': 'Member list visibility',
  'lab.joinOpen': 'Open — anyone can join',
  'lab.joinRequest': 'Request — the lead approves',
  'lab.joinInvite': 'Invite only',
  'lab.tabOverview': 'Overview',
  'lab.tabUpdates': 'Updates',
  'lab.tabArtifacts': 'Artifacts',
  'lab.tabDecisions': 'Decisions',
  'lab.tabMembers': 'Members',
  'lab.tabHistory': 'History',
  'lab.tabSettings': 'Settings',
  'lab.memberCount': { one: '{count} member', other: '{count} members' },
  'lab.lookingFor': 'Looking for',
  'lab.ledBy': 'Led by {name}',
  // {when} is a locale-formatted relative time ("3 days ago").
  'lab.updatedAgo': 'Updated {when}',
  'lab.stageTrack': 'Stage',
  'lab.stageIdea': 'Idea',
  'lab.stageBuilding': 'Building',
  'lab.stageValidating': 'Validating',
  'lab.stageLaunched': 'Launched',
  'lab.roleLead': 'Lead',
  'lab.roleCore': 'Core',
  'lab.roleMember': 'Member',
  'lab.roleObserver': 'Observer',
  'lab.actionJoin': 'Join',
  'lab.actionRequestJoin': 'Request to join',
  'lab.actionRequested': 'Request pending',
  'lab.actionView': 'View',
  'lab.joinedToast': 'Joined.',
  'lab.actionLeave': 'Leave',
  'lab.actionPin': 'Pin to profile',
  'lab.actionUnpin': 'Unpin',
  'lab.actionAddUpdate': 'Post an update',
  'lab.actionAddArtifact': 'Add an artifact',
  'lab.actionAddDecision': 'Record a decision',
  // Composer field labels, per content kind (§16, sprint §7). The composer
  // picks the pair that matches the kind being posted.
  'lab.updateTitleLabel': 'Update title (optional)',
  'lab.updateBodyLabel': 'Update body',
  'lab.artifactTitleLabel': 'Artifact title',
  'lab.artifactDescriptionLabel': 'Artifact description',
  'lab.decisionTitleLabel': 'Decision title',
  'lab.decisionNoteLabel': 'Decision note',
  'lab.crossPostNoteLabel': 'Cross-post note',
  'lab.actionAddSkill': 'Add a skill',
  'lab.actionPromoteLab': 'Promote to Lab',
  'lab.actionPromoteCandidate': 'Put forward as a Venture',
  'lab.actionProposeCollab': 'Propose collaboration',
  'lab.actionSaveSettings': 'Save changes',
  'lab.emptyUpdates':
    'No updates yet. Post a weekly update to show progress — spectators love a build-in-public log.',
  'lab.emptyArtifacts':
    'No artifacts yet. Share a link to a doc, prototype, or demo. (Links only for now.)',
  'lab.emptyDecisions':
    'No decisions logged yet. Recording key calls keeps everyone aligned and builds your track record.',
  'lab.emptyMembers':
    'Just the lead so far. Invite collaborators or open the Space so people can join.',
  'lab.emptyHistory': 'The Space timeline starts here.',
  'lab.emptySkills': 'Not looking for anyone right now.',
  'lab.noticeJoinRequested':
    'Your request to join has been sent. The Lab lead will review it — you’ll get a notification when they respond.',
  'lab.dormantBanner':
    'This Lab has been quiet for 4 weeks and is marked Dormant. Are you still working on this? Revive it with a quick update.',
  'lab.ipBanner':
    'Reminder: what you publish here stays yours. Publish artifacts thoughtfully.',
  'lab.skillGapBannerLead':
    'You’ve been looking for {skill} for over a week. Want to widen the net or refresh the ask?',
  'lab.crossPostedFrom': 'Cross-posted from {name}',
  'lab.candidateHandoffNote':
    'This puts the Lab forward as a Venture Candidate — a hand-off marker. No investment tools are attached.',
  'lab.sprintCountdown': {
    one: '{count} day left in this sprint',
    other: '{count} days left in this sprint',
  },
  'lab.sprintEnded': 'Sprint ended',
  'lab.sprintNone': 'No sprint deadline set',
  'lab.settingsTitle': 'Space settings',
  'lab.settingsPromoteHint':
    'Clubs promote to Labs by completing the charter. Promotion keeps everything — members, history, and this address. There’s no going back down.',
  'lab.settingsSaved': 'Settings saved.',
  'lab.publicBadge': 'Building in public',
  'lab.badgeDormant': 'Dormant',
  'lab.signInToJoin': 'Sign in to join or follow this Space.',
  'lab.eventCreated': 'Space created',
  // `promoted` covers two rungs (Club → Lab and Lab → Venture), so the bare key
  // is stage-neutral and the two specific ones are chosen from the event's own
  // metadata. A history line that says "Promoted to Lab" about a Venture
  // promotion is wrong in the one place a member goes to check what happened.
  'lab.eventPromoted': 'Promoted',
  'lab.eventPromotedLab': 'Promoted to Lab',
  'lab.eventSettingsChanged': 'Settings changed',
  'lab.eventUpdatePublished': 'Update posted',
  'lab.eventUpdateCrossposted': 'Update cross-posted',
  'lab.eventArtifactAdded': 'Artifact added',
  'lab.eventDecisionRecorded': 'Decision recorded',
  'lab.eventMemberJoined': 'A member joined',
  'lab.eventMemberLeft': 'A member left',
  'lab.eventMemberInvited': 'A member was invited',
  'lab.eventMemberRemoved': 'A member was removed',
  'lab.eventJoinRequested': 'Someone requested to join',
  'lab.eventRequestDeclined': 'A join request was declined',
  'lab.eventMemberRoleChanged': 'A member’s role changed',
  'lab.eventMarkedDormant': 'Marked dormant',
  'lab.eventCandidateCreated': 'Put forward as a Venture',
  'lab.eventCollabProposed': 'Collaboration proposed',
  'lab.eventCollabAccepted': 'Collaboration accepted',
  'lab.eventCollabDeclined': 'Collaboration declined',
  'lab.eventCollabEnded': 'Collaboration ended',
  'lab.eventSkillNeedAdded': 'Added a skill they’re looking for',
  'lab.eventSkillNeedRemoved': 'Removed a skill',
  'lab.eventGeneric': 'Activity',
  // Phase 4.5 — Space visual identity (icon + cover)
  'lab.mediaSection': 'Icon & cover',
  'lab.iconLabel': 'Space icon',
  'lab.iconUpload': 'Upload icon',
  'lab.iconUpdated': 'Icon updated',
  'lab.coverLabel': 'Cover image',
  'lab.coverAlt': 'Cover image for {name}',
  'lab.coverUpload': 'Upload cover',
  'lab.coverUpdated': 'Cover updated',
  'lab.mediaUploading': 'Uploading…',
  'lab.mediaRemoved': 'Removed',

  // Lite mode — deferred-media placeholders (§22 defer-don't-disable). Show =
  // "Muuji" is locked canonical vocabulary.
  'lite.show': 'Show',
  'lite.showAria': 'Show {label}',
  'lite.showAllPage': 'Show all on this page',
  'lite.hiddenCount': '{count} hidden',
  'lite.estSize': '~{size}',
  'lite.loadFull': 'Load full image',
  'lite.embedLabel': 'Video',
  'lite.mapLabel': 'Map',
  'lite.promptTitle': 'Slow connection?',
  'lite.promptBody': 'Switch to Lite to save data — images and maps load only when you tap Show.',
  'lite.promptAccept': 'Use Lite',
  'lite.promptDismiss': 'Not now',

  // Saved — bookmarks (§13 social). New launch-floor namespace.
  'saved.title': 'Saved',
  'saved.empty': 'Nothing saved yet. Tap Save on a post, business, or Space to keep it here.',
  'saved.save': 'Save',
  'saved.saved': 'Saved',
  'saved.tabPosts': 'Posts',
  'saved.tabListings': 'Businesses',
  'saved.tabLabs': 'Spaces',

  // Social — mutes, mentions, post options (§13). New launch-floor namespace.
  'social.postOptions': 'Post options',
  'social.muteUser': 'Mute {name}',
  'social.muteTag': 'Mute #{tag}',
  'social.mutedNotice':
    "Muted. You won't see this in your feed anymore. You can unmute in Settings → Privacy.",
  'social.mutedListTitle': 'Muted',
  'social.mutedEmpty': "You haven't muted anyone or anything.",
  'social.mutedTypeUser': 'Member',
  'social.mutedTypeTag': 'Tag',
  'social.mutedTypeLab': 'Space',
  'social.unmute': 'Unmute',
  'social.unmuteLabel': 'Unmute {name}',
  'social.mentionsLabel': 'Mention suggestions',

  // Search — grouped discovery (§18). New launch-floor namespace.
  'search.title': 'Search',
  'search.subtitle': 'People, businesses, Spaces and posts — one box.',
  'search.inputLabel': 'What are you looking for?',
  'search.placeholder': 'Name, business, Space or post — any spelling',
  'search.minChars': 'Type at least {count} characters.',
  'search.noResults': 'No matches. Try a shorter spelling or a different word.',
  'search.groupPeople': 'People',
  'search.groupBusinesses': 'Businesses',
  'search.groupSpaces': 'Spaces',
  'search.groupPosts': 'Posts',
  'search.seeMore': 'See more',
  'search.signInForMore': 'Sign in to search posts and member-only Spaces.',
  'search.teachBody':
    'One box for the whole community: find people by any spelling (Maxamed or Mohamed), businesses by name or what they do, Spaces to join, and Plaza posts.',
  'search.teachExample': 'Try a name, a trade, or a topic — “Maxamed”, “tailor”, “halal export”.',
  // Search polish (extras item 3): entity tabs, transparent sort labels,
  // per-tab teaching empty states.
  'search.tabAll': 'All',
  'search.sortTransparency': 'Plain text matching only — no hidden ranking.',
  'search.sortNewest': 'Newest first',
  'search.sortActivity': 'Latest activity first',
  'search.emptyPeople':
    'No people matched. People results are member profiles — try any spelling of a name (Maxamed, Mohamed) or a handle.',
  'search.emptyPeopleCta': 'Browse the directory',
  'search.emptyBusinesses':
    'No businesses matched. Businesses are member-run listings in the directory — shops, services and trades.',
  'search.emptyBusinessesCta': 'Browse businesses',
  'search.emptySpaces':
    'No Spaces matched. Spaces are Clubs and Labs where members learn and build together.',
  'search.emptySpacesCta': 'Explore Spaces',
  'search.emptyPosts':
    'No posts matched. Posts are Plaza conversations — intros, asks, wins and updates.',
  'search.emptyPostsCta': 'Go to the Plaza',
  'search.postsMembersOnly': 'Plaza posts are members-only. Sign in to search them.',
  'search.resultsFor': '{label} · “{query}”',
  'search.tabsLabel': 'Result types',
  'search.emptyTitle': 'No matches for “{query}”',
  'search.crossTabCta': 'See {count} in {label}',

  // Capital / Maal (§6/§17/§27). New launch-floor namespace — a trust surface.
  // Canonical terms Maalgeli (Invest) / Support (key garab) are NOT redefined
  // here; reuse term.maalgeli / term.garab / action.garab*.
  // "Back/backing/community-backed" is reserved for a future, legally reviewed
  // capital context. Encouragement says "support"; the Candidate process (open
  // review + member vote) says "review" — never "support", which is not a vote.
  // Index + entry
  'capital.indexTitle': 'Capital',
  'capital.indexSubtitle': 'Ventures the community is building and supporting.',
  'capital.labsEntryLink': 'Explore Capital',
  // The Phase-5 candidate board's own name. /capital is the Maal index (D1),
  // so the board moved to /capital/candidates and needs a title that is not
  // the section's — `capital.indexTitle` now heads the Maal index.
  'capital.candidatesTitle': 'Venture Candidates',
  'capital.filterAll': 'All',
  'capital.fromLab': 'From',
  'capital.emptyTitle': 'No Candidates yet',
  'capital.emptyBody':
    'A Candidate is a venture a Lab has put forward for open review. When Labs submit theirs, they show up here.',
  'capital.emptyLabsLink': 'Browse Labs',
  // Status badges
  'capital.statusDraft': 'Draft',
  'capital.statusSubmitted': 'Submitted',
  'capital.statusInReview': 'In review',
  'capital.statusApproved': 'Approved',
  'capital.statusParked': 'Parked',
  'capital.statusDeclined': 'Declined',
  // Editor / pitch fields
  'capital.editTitle': 'Edit Candidate',
  'capital.editSubtitle': 'Fill in the pitch, then submit for review.',
  'capital.editorSaved': 'Saved.',
  'capital.fieldName': 'Name',
  'capital.fieldOneLiner': 'One-liner',
  'capital.fieldProblem': 'Problem',
  'capital.fieldSolution': 'Solution',
  'capital.fieldTraction': 'Traction',
  'capital.fieldTeam': 'Team',
  'capital.fieldAsk': 'Ask',
  'capital.fieldLogo': 'Logo',
  'capital.fieldCover': 'Cover image',
  'capital.uploading': 'Uploading…',
  'capital.reviewersOnlyLabel': 'Reviewers only',
  'capital.reviewersOnlyHint':
    "Hide this Candidate from members until it's decided; only reviewers and your Lab can see it.",
  'capital.submitCta': 'Submit for review',
  // Owner ruling (12 Sep): the candidate vote is NOT a paid-tier benefit. The
  // mechanics still gate it on the paid tier today, so copy states that as a
  // temporary eligibility constraint — never as a value proposition. The
  // mechanics conflict is a separate gated issue (reconciliation record).
  'capital.submitHint':
    'Submitting opens a 7-day candidate vote and sends it to reviewers. Eligibility is under review; current voting access requires Xidig Plus.',
  // Rubric / reviews
  'capital.rubricHeading': 'Review scores',
  'capital.rubricTeam': 'Team',
  'capital.rubricTraction': 'Traction',
  'capital.rubricFeasibility': 'Feasibility',
  'capital.rubricOverall': 'Overall',
  'capital.rubricNoScores': 'Not scored yet.',
  'capital.reviewHeading': 'Your review',
  'capital.reviewNotesLabel': 'Notes',
  'capital.reviewSubmit': 'Save review',
  'capital.reviewSaved': 'Review saved.',
  'capital.reviewerConflictNotice':
    "You're a member of this Lab, so you can't review its Candidate. That's to keep reviews fair.",
  // Decision controls
  'capital.decisionHeading': 'Decision',
  'capital.decisionInReview': 'Move to review',
  'capital.decisionApprove': 'Approve',
  'capital.decisionPark': 'Park',
  'capital.decisionDecline': 'Decline',
  'capital.decisionReasonLabel': 'Reason (shown to the Lab)',
  'capital.decisionReasonHint': 'A short, fair note the Lab will see.',
  // Candidate vote (formerly "Supporter vote" — never "Xidig Plus vote").
  'capital.voteHeading': 'Candidate vote',
  'capital.voteEligibilityNote': 'Eligibility is under review. Current access requires Xidig Plus.',
  'capital.voteNotEligible': 'Not currently eligible',
  'capital.voteSignalNote': "A non-binding community signal — it guides, it doesn't decide.",
  'capital.voteApprove': 'Approve',
  'capital.voteReject': 'Reject',
  // Ballot option-card descriptions (brand-rethink adoption): signal
  // language only — mirrors voteSignalNote, never decision/invest language.
  // "Support" is the non-financial support action; a ballot option must not
  // borrow its word.
  'capital.voteApproveDesc': 'Signal that this venture should go before the community.',
  'capital.voteRejectDesc': 'Signal that this one isn’t ready yet.',
  'capital.voteRetract': 'Retract vote',
  'capital.voteTally': '{approve} approve · {reject} reject · {total} total',
  // Interests bar (Support / help). "Back" read as financial backing on
  // a surface where investing is not offered — the control says support.
  'capital.interestHeading': 'Support this venture',
  'capital.signInToEngage': 'Sign in to support or offer help',
  'capital.canHelp': 'I can help',
  'capital.canHelpDone': 'Offered to help',
  // A2 containment: invest/fund promotional keys removed with their surfaces —
  // investing is not currently offered, and copy must not advertise a fund or
  // frame unavailability as a geography rule. The disclaimer stays on the
  // standalone Capital/About surfaces and states the plain status.
  'capital.securitiesDisclaimer':
    'Nothing here is an offer of securities, and Xidig does not currently offer investment.',
  // Venture timeline
  'capital.timelineHeading': 'Venture timeline',
  'capital.timelineCreated': 'Created',
  'capital.timelineSubmitted': 'Submitted for review',
  'capital.timelineDecided': 'Reviewed',
  'capital.timelineFunded': 'Funded',
  // Open member comments (§12)
  'capital.commentsHeading': 'Discussion',
  'capital.commentLabel': 'Add a comment',
  'capital.commentsEmpty': 'No comments yet. Start the conversation.',

  // ── Front door (Phase A) ──────────────────────────────────────────────
  // Public marketing surfaces served by the app itself (docs/front-door-plan.md).
  // Proof-first: no fabricated numbers or social proof anywhere in this copy.
  // SO is plain register; native review tracked as Alpha Hardening Debt.

  // Signed-out chrome
  'marketing.navProduct': 'Product',
  'marketing.navReports': 'Reports',
  'marketing.navMembership': 'Membership',
  'marketing.requestAccess': 'Request Access',

  // Landing (/ signed-out) — social-app-first positioning (9 Jul reframe):
  // the casual visitor comes for the social home; Labs/Capital reveal deeper.
  'marketing.heroTitle': 'The Somali social app for connection, discovery, and building.',
  'marketing.heroSub':
    'Post wins, ask for help, find people and businesses, follow Labs, message members, and support what the community is building — in one bilingual, low-data app.',
  'marketing.seeProduct': 'Explore what’s inside',
  'marketing.groupsTitle': 'Everything your groups are missing',
  'marketing.groupsBody':
    'Group chats are great for quick messages — Xidig gives the community memory. Profiles, search, public posts, business listings, project spaces, and DMs that don’t disappear into the scroll.',
  'marketing.groupsKeep':
    'Keep the group chat for family. Xidig is the Somali community you can search, follow, build with, and come back to.',
  'marketing.blockPlazaTitle': 'A feed with purpose',
  'marketing.blockPlazaBody':
    'Post intros, asks, wins, and polls — and react in a way that feels like us. Conversations become community memory, not scroll-past noise.',
  'marketing.blockProfilesTitle': 'Your Somali internet profile',
  'marketing.blockProfilesBody':
    'Show your skills, city, links, Labs, badges, and what you’re open to. Share one link instead of explaining yourself every time.',
  'marketing.blockSuuqTitle': 'Find people and businesses',
  'marketing.blockSuuqBody':
    'Search Somali talent, services, shops, and businesses by city, skill, or category — then contact them directly when you’re ready.',
  'marketing.blockDmTitle': 'DMs with boundaries',
  'marketing.blockDmBody':
    'Message requests, blocks, reports, and calm notifications keep conversations useful — without group-chat chaos.',
  'marketing.blockLabsTitle': 'Turn ideas into rooms',
  'marketing.blockLabsBody':
    'Start a casual Club; promote it to a Lab when it gets serious. Updates, decisions, links, and members stay in one place.',
  'marketing.blockCapitalTitle': 'Support what’s being built',
  'marketing.blockCapitalBody':
    'Support promising ventures, offer help, and follow build-in-public timelines. Investing is not currently offered on Xidig.',
  'marketing.blockLiteTitle': 'Built for our internet',
  'marketing.blockLiteBody':
    'Somali and English from day one. Lite mode for slow connections — images, maps, and embeds load only when you tap.',
  // A3 claims containment: ownership/governance wording must reflect rights
  // that actually exist (owner ruling). "Community-led" and "member
  // participation" replace ownership/governance claims until a legal
  // structure exists; final wording subject to legal review.
  'marketing.blockOwnedTitle': 'Community-led, not algorithm-led',
  'marketing.blockOwnedBody':
    'Transparent moderation, visible rules, member participation — and no engagement-bait ranking. What you follow is what you see.',
  'marketing.finalCta': 'Come home to the Somali social app.',
  'marketing.honestyTitle': 'Real by default',
  'marketing.honestyBody':
    'No invented members, no fake numbers, no staged screenshots. What Xidig shows is real member activity — and any number on this page is a real one.',
  'marketing.reportsTeaserBody':
    'Community-compiled research on the Somali economy and diaspora — cited, honest, and free to read.',
  // {count} is DERIVED from getAllReports().length at render — never hardcode
  // a report count into copy (it would go stale into a fake number).
  'marketing.reportsTeaserCount': 'Read all {count} reports',
  'marketing.membershipTeaserBody':
    'Free to join. Xidig Plus — around $1/month — helps keep Xidig running and raises your daily posting and comment allowances. Xidig Plus does not buy trust, verification, ranking, governance rights or capital access.',

  // Homepage "next up" event card (extras item 8) — renders only when a real
  // upcoming public event exists.
  'marketing.eventNextTitle': 'Next up',
  'marketing.eventNextCta': 'See the event',

  // Decorative labels inside the front-door feature vignettes (aria-hidden
  // schematic scenes — generic and nameless; the no-fabrication rule holds).
  'marketing.vigSuuqQuery': 'tailor · Hargeisa',
  'marketing.vigSkillOne': 'Design',
  'marketing.vigSkillTwo': 'Trade',
  'marketing.vigSkillThree': 'Tailoring',
  'marketing.vigBaitLabel': 'Engagement-bait ranking',

  // /product
  'marketing.productTitle': 'What Xidig gives you today',
  'marketing.productIntro':
    'Everything below is built and live — this is the product founding members use today, not a roadmap.',
  // Meta description for /product (search snippet + share card) — standalone
  // copy; productIntro's "Everything below" is deictic and reads wrong there.
  'marketing.productDescription':
    'The live product tour: a purposeful feed, member profiles, a searchable directory of people and businesses, DMs with boundaries, Labs, and community-supported ventures.',
  'marketing.productTrustTitle': 'Trust & verification',
  'marketing.productTrustBody':
    'Identity, community, and business verification badges; human moderation with appeals; and a low-bandwidth Lite mode that respects every connection.',
  'marketing.productBetaNote':
    'Xidig is in private beta. Request access and we’ll save your founding spot.',

  // /labs and /capital signed-out teasers (replaced by live public
  // directories in Phase B — until then these explain, never fake)
  'marketing.labsTeaserTitle': 'Labs — build in public',
  'marketing.labsTeaserBody':
    'A Lab is a small team building openly: a charter, weekly updates, milestones, and an honest dormant flag when life happens. Strong Labs can put a venture candidate before the community.',
  'marketing.labsTeaserNote':
    'Every public Lab already has a shareable page. The full Lab directory opens here soon.',
  'marketing.capitalTeaserTitle': 'Capital — community-supported ventures',
  'marketing.capitalTeaserBody':
    'Venture candidates rise from Labs, get reviewed in the open, and face a member vote. Investing is not offered on Xidig and there are no financial flows — what you can do is offer help or support the work.',

  // /about
  'marketing.aboutTitle': 'About Xidig',
  'marketing.aboutStory1':
    'Xidig means star. We are building the place where the Somali nation’s builders — at home and across the diaspora — find each other and build together.',
  'marketing.aboutStory2':
    'Talent is everywhere in our community; trust and discovery are not. Xidig is community-led infrastructure for both: a public square, build-in-public workshops, a business directory, and a community that supports its own.',
  'marketing.aboutStory3':
    'We build in public, we don’t fake numbers, and we design for a 2G connection in Mogadishu first.',
  'marketing.aboutCapitalTitle': 'How Capital works',
  'marketing.aboutCapitalBody':
    'Ventures start as Labs, become candidates, and are reviewed in the open. Investing is not currently offered on Xidig — there is no fund and no offer of investment, and any future financial feature is subject to legal review before it exists.',
  'marketing.aboutRolesTitle': 'Roles, not careers',
  'marketing.aboutRolesBody':
    'Xidig has no hiring page. Community roles — moderators, verifiers, mentors — are earned and appointed from within the membership.',
  'marketing.aboutContactBody':
    'Questions, press, or partnerships: reach us through the contact page.',

  // /membership
  'marketing.memberTitle': 'Membership',
  'marketing.memberIntro':
    'One community, two levels. Pricing is confirmed with members — not imposed on them.',
  'marketing.memberFreeTitle': 'Member — free',
  'marketing.memberFreeBody':
    'A profile and business listing, the Plaza, the directory, messages, and joining Clubs. Free stays free.',
  'marketing.memberSupporterTitle': 'Xidig Plus — around $1/month',
  'marketing.memberSupporterBody':
    'Everything in free, plus higher daily posting and comment allowances — and it helps keep Xidig running. Xidig Plus does not buy trust, verification, ranking, governance rights or capital access.',
  'marketing.memberBillingNote':
    'Billing isn’t live yet. The exact price is confirmed with members before anyone is charged.',

  // /contact
  'marketing.contactTitle': 'Contact',
  'marketing.contactIntro': 'Questions, press, partnerships, or feedback — we read everything.',
  'marketing.contactNameLabel': 'Your name',
  'marketing.contactMessageLabel': 'Your message',
  'marketing.contactSend': 'Send message',
  'marketing.contactUnavailable':
    'The contact form isn’t wired up yet. Join the waitlist and we’ll reach out instead.',

  // Legal — live, indexed, founder-reviewed. Bracketed placeholders
  // (Xidig, Somalia) are the ONLY facts the
  // founder must fill; every other statement matches a shipped app capability.
  'marketing.privacyUpdatedNotice':
    'Last updated 10 July 2026. We may update this policy; the current version is always the one published here.',
  'marketing.termsUpdatedNotice':
    'Last updated 10 July 2026. We may update these terms; the current version is always the one published here.',
  'marketing.legalEntityNote':
    'Xidig is operated from Somalia, and these terms and policies are governed by Somali law.',

  'marketing.privacyTitle': 'Privacy Policy',
  'marketing.privacyIntro':
    'This policy explains what Xidig collects, why, and the control you have over it. It covers both browsing these public pages and using the app with an account. Xidig, based in Somalia, is the controller responsible for your personal data.',
  'marketing.privacyCollectTitle': 'What we collect',
  'marketing.privacyCollectBody':
    'Account identifiers you give us when you join (name, email or phone number, and a password managed by our authentication provider). Profile information you choose to add (city, skills, links, bio). The content you post — public posts, polls, listings, messages, and reactions. Optional, consent-based identity and business verification details, if you choose to get verified. Contact-form submissions when you write to us. And the technical minimum needed to run the service securely, such as IP-derived region, device and browser information, and session cookies.',
  'marketing.privacyBasisTitle': 'Why we can use it',
  'marketing.privacyBasisBody':
    'We process most of your data because it is necessary to provide a service you asked for — running your account, showing your posts to the people you shared them with, delivering messages, and keeping the platform safe. Optional features such as product analytics and verification rely on your explicit consent, which you can give or withdraw at any time. We keep the amount of data we collect to what each feature actually needs.',
  'marketing.privacyUseTitle': 'How we use it',
  'marketing.privacyUseBody':
    'To run Xidig: creating and securing accounts, building your feed, delivering messages, powering search and the directory, moderating content, and protecting members from abuse and fraud. We do not sell personal data, we do not share it for others’ advertising, and we do not run third-party advertising on Xidig.',
  'marketing.privacyAnalyticsTitle': 'Analytics is opt-in',
  'marketing.privacyAnalyticsBody':
    'Product analytics is off by default. Nothing about your account is recorded until you turn analytics on through the consent banner or your privacy settings. If you never opt in, no analytics events about you are collected, and anonymous visitors to these public pages are not individually tracked. You can change your choice at any time in Settings.',
  'marketing.privacyCookiesTitle': 'Cookies',
  'marketing.privacyCookiesBody':
    'We use a small number of essential cookies that are required to sign you in, keep your session secure, and remember your language and privacy choices — these cannot be switched off because the app cannot work without them. Optional cookies, such as those used for product analytics, are only set after you opt in through the consent banner. We do not use advertising or cross-site tracking cookies.',
  'marketing.privacyVerificationTitle': 'Verification',
  'marketing.privacyVerificationBody':
    'Identity and business verification are optional and consent-based — you are never required to verify to use Xidig. Because verification can involve sensitive information, the full detail of what each process reviews and stores is published in a dedicated notice before verification opens to members, and you will be asked to consent at that point.',
  'marketing.privacyRetentionTitle': 'How long we keep it',
  'marketing.privacyRetentionBody':
    'We keep your account data for as long as your account is active. When you delete your account there is a short grace period in which you can change your mind; after it passes, your personal data is removed rather than archived. Some records may be kept longer only where we are legally required to, or to resolve a safety report or dispute — and only for as long as that purpose lasts.',
  'marketing.privacyRightsTitle': 'Your rights and controls',
  'marketing.privacyRightsBody':
    'You can access and review your information, export a copy of your data, correct your profile, and delete your account — all from Settings, under the data and privacy section. You can also opt in or out of analytics at any time. If you would like help exercising any of these rights, contact us and we will respond.',
  'marketing.privacyTransfersTitle': 'Where your data is handled',
  'marketing.privacyTransfersBody':
    'Xidig serves a global Somali community, at home and across the diaspora, so your data may be processed on servers located outside your own country by us and by the service providers who help us run the platform. Wherever it is handled, we apply the protections described in this policy.',
  'marketing.privacyChildrenTitle': 'Age',
  'marketing.privacyChildrenBody':
    'Xidig is not intended for children. You must meet the minimum age set in our Terms of Service to hold an account. If we learn that an underage person has created an account, we will remove it.',
  'marketing.privacyContactTitle': 'Contact us about privacy',
  'marketing.privacyContactBody':
    'For any question about this policy, your data, or your rights, use the contact page and we will respond. Xidig, based in Somalia, is the controller of your personal data.',

  'marketing.termsTitle': 'Terms of Service',
  'marketing.termsIntro':
    'These terms are the agreement between you and Xidig, the service operated from Somalia. Using Xidig — these public pages or the app — means you accept them. Please read them alongside our Privacy Policy.',
  'marketing.termsEligibilityTitle': 'Who can join',
  'marketing.termsEligibilityBody':
    'Xidig is currently a private, invite-only beta: access is by invitation or from the waitlist. You must be at least the minimum age required by Somalia — and no younger than 16 — to hold an account, and you must be able to enter into a binding agreement. We may add, limit, or withdraw access during the beta.',
  'marketing.termsAccountsTitle': 'Your account',
  'marketing.termsAccountsBody':
    'One person, one account. Keep your sign-in details secure and don’t share them; you are responsible for everything that happens under your account. Give us accurate information and keep it current. Tell us promptly if you think your account has been accessed without your permission.',
  'marketing.termsContentTitle': 'Your content',
  'marketing.termsContentBody':
    'What you post stays yours — you keep ownership of your content. To operate the platform, you grant Xidig a non-exclusive, worldwide, royalty-free licence to host, store, display, and distribute your content to the members and visitors you chose to share it with, and to make the technical copies needed to run and back up the service. This licence exists only so Xidig can show your content the way you intended; it ends when you delete the content or your account, except for copies we must retain briefly for backups or legal reasons.',
  'marketing.termsConductTitle': 'Acceptable use',
  'marketing.termsConductBody':
    'Be honest, be lawful, and keep Xidig safe. Don’t harass, deceive, impersonate, spam, or post unlawful or harmful content, and don’t abuse or attack the platform. The full standards live in our Community Guidelines, which form part of these terms. Content that breaks them can be removed.',
  'marketing.termsFeesTitle': 'Membership and fees',
  'marketing.termsFeesBody':
    'Joining and core membership are free, and free stays free. Xidig Plus membership — which unlocks creating Labs, putting candidates forward, and voting in community governance — will cost around $1 per month once billing goes live. Billing is not active yet; the confirmed price is announced to members before anyone is charged, and nothing is billed without your agreement.',
  'marketing.termsCapitalTitle': 'Capital',
  // A3: conservative post-A2 wording — investment is not offered and intent is
  // no longer captured. Placeholder pending exact legal-reviewed ToS text.
  'marketing.termsCapitalBody':
    'Xidig does not currently offer investment. Nothing on Xidig is an offer of securities, investment advice, or a solicitation to invest, and there are no financial flows. If any financial feature is ever offered, its full terms will be published and legally reviewed before it goes live.',
  'marketing.termsModerationTitle': 'Moderation and enforcement',
  'marketing.termsModerationBody':
    'Xidig is moderated by people, not just automation. We may remove content, or warn, suspend, or close accounts that break these terms or the Community Guidelines. Where we act against your account or content, you can appeal the decision through the in-app process, and a moderator will review it.',
  'marketing.termsDisclaimerTitle': 'Disclaimers and liability',
  'marketing.termsDisclaimerBody':
    'Xidig is a private beta and is provided “as is”, without warranties of any kind. We work hard to keep it running and safe, but we can’t promise it will always be available, error-free, or that content posted by members is accurate. To the fullest extent the law allows, Xidig is not liable for indirect or consequential losses, or for content posted by members. Nothing in these terms limits any liability that cannot be limited by law.',
  'marketing.termsChangesTitle': 'Changes to these terms',
  'marketing.termsChangesBody':
    'We may update these terms as Xidig grows. We will tell members about material changes before they take effect, so you can review them. Continuing to use Xidig after a change takes effect means you accept the updated terms.',
  'marketing.termsGoverningTitle': 'Governing law',
  'marketing.termsGoverningBody':
    'These terms are governed by the laws of Somalia, and any dispute relating to them will be handled under that jurisdiction, without affecting any mandatory rights you have under the law where you live.',

  // /reports chrome (report bodies are community-compiled content, not UI copy)
  'marketing.reportsTitle': 'Reports',
  'marketing.reportsIntro':
    'Community-compiled research on the Somali economy and diaspora. Cited where possible, honest about uncertainty, free to read.',
  'marketing.reportsCompiledLabel': 'Community-compiled',
  'marketing.reportsDisclaimer':
    'Compiled by community contributors from public sources. Figures may be estimates — verify independently before relying on them.',
  'marketing.reportsAll': 'All reports',
  'marketing.reportsFaqTitle': 'Frequently asked questions',

  // Success-path notice (§27) for the contact intake
  'notice.contactSent': 'Message sent — thank you. We’ll get back to you soon.',

  // Consent capture (§12 — signed-in banner + Settings › Data privacy choices)
  'consent.regionAria': 'Privacy choices',
  'consent.bannerTitle': 'Your privacy choices',
  'consent.bannerBody':
    'Xidig asks first. Choose whether optional product analytics and error-monitoring extras may run for your account — essential cookies are always on. You can change this any time in Settings.',
  'consent.privacyLink': 'Privacy Policy',
  'consent.acceptAll': 'Accept all',
  'consent.rejectAll': 'Reject all',
  'consent.manage': 'Manage choices',
  'consent.save': 'Save choices',
  'consent.analyticsLabel': 'Product analytics',
  'consent.analyticsHint':
    'Usage events that help us improve Xidig — never your messages, names, or contact details.',
  'consent.errorMonitoringLabel': 'Error-monitoring extras',
  'consent.errorMonitoringHint':
    'Session replays and performance traces that help us fix problems faster. Basic error reports stay on — they keep Xidig running.',
  'consent.liteLabel': 'Low-data mode (Xawli yar)',
  'consent.liteHint': 'Heavy images and media wait behind a tap.',
  'consent.liteCta': 'Turn on',
  'consent.settingsTitle': 'Privacy choices',
  'consent.settingsIntro':
    'Control the optional data Xidig may collect about your account. Changes apply right away.',
  'consent.saved': 'Choices saved.',

  // Events + RSVP (extras item 8 — design locked 10 Jul)
  'events.indexTitle': 'Events',
  'events.indexIntro':
    'Community meetups, talks, demo days, workshops and business events — hosted by members.',
  'events.publicIndexIntro':
    'Public events from the Xidig community. Members see more and can RSVP.',
  'events.empty':
    'No upcoming events yet. Lab organizers, verified businesses and moderators can host one.',
  'events.categoryAll': 'All',
  'events.newEvent': 'Host an event',
  'events.upcomingTitle': 'Upcoming events',
  'events.hostedBy': 'Hosted by {name}',
  'events.partOf': 'Part of {name}',
  'events.modeOnline': 'Online',
  'events.modeInPerson': 'In person',
  'events.modeHybrid': 'Hybrid',
  // Munaasabado dispatch (Task 2 Copy Table): the new EventCard/detail-page
  // design (docs/superpowers/plans/2026-08-12-munaasabado-events.md, frame
  // 9a/9c) renders this as a compact status TAG, not a banner sentence — the
  // fuller banner is the new `events.cancelledNotice` key. Task 3+ wires the
  // new usage; the current banner at app/events/[slug]/page.tsx will read
  // this shorter string until that lands.
  'events.statusCancelled': 'Cancelled',
  'events.statusDraft': 'Draft — only you can see this event.',
  'events.awaitingReview': 'This event is awaiting review.',
  'events.venueLabel': 'Venue',
  'events.addressForAttendees': 'The exact address is shared with confirmed attendees.',
  'events.onlineForAttendees': 'The online link is shared with confirmed attendees.',
  'events.joinOnline': 'Join online',
  'events.goingCount': '{count} going',
  'events.interestedCount': '{count} interested',
  'events.fullLabel': 'Full — you can still mark yourself interested.',
  'events.capacityGoing': '{count} of {capacity} going',
  // Munaasabado dispatch (Task 2 Copy Table): card RSVP island's single-verb
  // button (frame 9a) — was 'Going'.
  'events.rsvpGoing': "I'm coming",
  'events.rsvpInterested': 'Interested',
  'events.rsvpRemove': 'Remove RSVP',
  'events.showPubliclyLabel': 'Show me as attending to other members',
  // Munaasabado dispatch (Task 2 Copy Table): attendee wall card label
  // (frame 9c) — was 'Attendees'.
  'events.attendeesTitle': "Who's coming",
  'events.attendeesHostNote':
    'Only you see the full list. Other members only see people who opted in.',
  'events.attendeesMemberNote': 'Members who chose to appear publicly.',
  'events.addToCalendar': 'Add to calendar (.ics)',
  'events.googleCalendar': 'Google Calendar',
  'events.shareText': 'Join "{title}" on Xidig',
  'events.requestAccessCta': 'Request access to RSVP',
  'events.signedOutNote':
    'Xidig members can RSVP, see who else is going, and get the full details.',
  'events.autopostLead': 'New event — details and RSVP:',
  'events.newTitle': 'Host an event',
  'events.formTitle': 'Title',
  'events.formDescription': 'Description',
  'events.formCategory': 'Category',
  'events.formStartsAt': 'Starts',
  'events.formEndsAt': 'Ends (optional)',
  'events.formTimezone': 'Timezone',
  'events.formMode': 'Format',
  'events.formVenueName': 'Venue name',
  'events.formVenueAddress': 'Venue address',
  'events.formAddressVisibility': 'Who can see the address?',
  'events.addressEveryone': 'Everyone who can see the event',
  'events.addressAttendees': 'Confirmed attendees only',
  'events.formOnlineUrl': 'Online link',
  'events.formOnlineUrlHint': 'Only confirmed attendees see this link.',
  'events.formContainer': 'Host as',
  'events.containerCommunity': 'Community event',
  'events.formVisibility': 'Who can see this event?',
  'events.visibilityPublic': 'Public — anyone with the link',
  'events.visibilityMembers': 'Members only',
  'events.visibilitySpaceOnly': 'Space members only',
  'events.formCapacity': 'Capacity (optional)',
  'events.formSubmit': 'Publish event',
  'events.notEligible':
    'Event hosting is open to Lab organizers, verified businesses and moderators for now.',
  'events.cancelEvent': 'Cancel event',
  'events.cancelConfirm': 'Cancel this event? Everyone who RSVPed will be told.',

  // Munaasabado dispatch (Task 2 copy table) — event list tabs, RSVP grammar,
  // past-event honesty copy, attendees, agenda, capacity/cancel states,
  // check-in, host card, empty/offline/error states, form additions.
  'events.tabUpcoming': 'Upcoming',
  'events.tabPast': 'Past',
  'events.tabMine': 'Mine',
  'events.createAria': 'New event',
  'events.hostLineLab': 'Host: {name} · Lab',
  'events.hostLineMember': 'Host: {name}',
  // Card meta line stand-in when an online event has no venue name (9a).
  'events.venueOnline': 'Online',
  'events.capacityConfirmed': '{going} / {capacity} seats confirmed',
  'events.confirmedNoLimit': '{count} confirmed · no seat limit',
  'events.rsvpConfirmed': "You're confirmed",
  'events.pastAttended': {
    one: 'Held · {count} person came',
    other: 'Held · {count} people came',
  },
  'events.pastPhotosReport': 'Photos and report',
  'events.honestyNote':
    'Numbers are confirmed RSVPs — no more, no less. A finished event says what actually happened.',
  'events.backToAll': 'All events',
  'events.statusOpen': 'Open',
  'events.capacitySeats': '{going} / {capacity} seats',
  'events.moreAttendees': '+{count} more',
  'events.namesVisibleNote':
    'Names are visible — an RSVP is a social commitment, not a hidden number.',
  'events.agendaTitle': 'Programme',
  'events.factWhen': 'When',
  'events.factWhere': 'Where',
  'events.factSeats': 'Seats',
  'events.capacityConfirmedShort': '{going} / {capacity} confirmed',
  'events.cancelReleaseNote': 'Backing out is one tap — your seat frees up for someone else.',
  'events.hostCardTitle': 'Host',
  'events.hostPastEventsLab': {
    one: 'Lab · {count} past event',
    other: 'Lab · {count} past events',
  },
  'events.hostPastEventsMember': {
    one: '{count} past event',
    other: '{count} past events',
  },
  'events.reportEvent': 'Report this event',
  'events.emptyTitle': 'No upcoming events',
  'events.emptyBody':
    "Events are born in Labs, the Directory, and community posts — that's where they'll appear for you.",
  'events.emptyCtaLabs': 'Browse Labs',
  'events.emptyCtaCreate': 'Create an event',
  'events.offlineStale': 'No internet. This list is from {age}.',
  'events.queuedRsvp': 'RSVP — waiting',
  'events.queuedNote': 'It will go out when the internet returns',
  'events.errorTitle': "Events didn't load",
  'events.errorBody': 'Something went wrong. Try again.',
  'events.retry': 'Try again',
  'events.capacityFullLine': '{capacity} / {capacity} — no seats free',
  'events.fullReleaseNote':
    "If someone backs out, the seat opens immediately. There is no waitlist — priority can't be bought.",
  'events.cancelledNotice':
    'The host cancelled this event on {date}. All {count} RSVPs were notified.',
  'events.checkinTitle': 'Record attendance',
  'events.checkinHint': 'Mark who came — the count becomes the official record.',
  'events.checkedInLabel': 'Came',
  'events.formAgenda': 'Programme',
  'events.formAgendaTime': 'Time',
  'events.formAgendaItem': 'Item',
  'events.formAgendaAdd': 'Add item',
  'events.formCover': 'Event cover',
  'events.coverAlt': 'Event cover: {title}',
  'events.reminderCancelRsvp': 'Cancel RSVP',

  // Events — §27 plain-language errors
  'error.eventFull': 'This event is full. You can still mark yourself as interested.',
  'error.eventNotOpen': 'RSVPs are closed for this event.',
  'error.eventCategoryInvalid': 'Pick a valid event category.',
  'error.eventCreationNotAllowed':
    'Event hosting is open to Lab organizers, verified businesses and moderators for now.',
  // Munaasabado dispatch (Task 2) — check-in / mentor-slot errors reuse the
  // events/mentor §27 plain-language pattern.
  'error.eventEnded': 'This event has ended — its record is fixed.',
  'error.eventCheckinNotOpen': 'Attendance can be recorded once the event starts.',
  'error.mentorSlotTaken': 'That slot was just taken — pick another.',
  'error.mentorAlreadyBooked': 'You can book one slot per residency.',

  // Events — notification copy
  'notif.eventRsvp': '{name} RSVPed to your event',
  'notif.eventRsvpBundle': '{count} people RSVPed to your event',
  'notif.eventCancelled': 'An event you RSVPed to was cancelled',
  'notif.eventReminder': '3 days away: {title}',
  'notif.eventReminderMetaGoing': "{when} · you're confirmed · {going}/{capacity}",
  'notif.eventReminderMetaGoingNoCap': "{when} · you're confirmed · {going} confirmed",
  'notif.eventReminderMetaInterested': '{when} · you marked interested · {going}/{capacity}',
  'notif.eventReminderMetaInterestedNoCap': '{when} · you marked interested · {going} confirmed',

  // Front door — homepage "next up" featured event card (renders only when a
  // real upcoming public event exists; zero events = block absent)
  'marketing.nextEventTitle': 'Next up',
  'marketing.nextEventCta': 'See the event',

  // Relative time — bylines, feeds, notifications, the Codsi timeline.
  // Dictionary-owned on purpose: Intl.RelativeTimeFormat output depends on the
  // runtime's ICU build (a server without Somali CLDR silently emits English —
  // no throw), which hydration-mismatched every Somali time node. One data
  // source here keeps SSR and browser output byte-identical (see format.ts).
  'time.now': 'now',
  'time.yesterday': 'yesterday',
  'time.tomorrow': 'tomorrow',
  'time.secondsAgo': { one: '{count} second ago', other: '{count} seconds ago' },
  'time.minutesAgo': { one: '{count} minute ago', other: '{count} minutes ago' },
  'time.hoursAgo': { one: '{count} hour ago', other: '{count} hours ago' },
  'time.daysAgo': { one: '{count} day ago', other: '{count} days ago' },
  'time.weeksAgo': { one: '{count} week ago', other: '{count} weeks ago' },
  'time.monthsAgo': { one: '{count} month ago', other: '{count} months ago' },
  'time.yearsAgo': { one: '{count} year ago', other: '{count} years ago' },
  'time.inSeconds': { one: 'in {count} second', other: 'in {count} seconds' },
  'time.inMinutes': { one: 'in {count} minute', other: 'in {count} minutes' },
  'time.inHours': { one: 'in {count} hour', other: 'in {count} hours' },
  'time.inDays': { one: 'in {count} day', other: 'in {count} days' },
  'time.inWeeks': { one: 'in {count} week', other: 'in {count} weeks' },
  'time.inMonths': { one: 'in {count} month', other: 'in {count} months' },
  'time.inYears': { one: 'in {count} year', other: 'in {count} years' },

  // Month / weekday NAMES (Munaasabado dispatch, Task 2) — dictionary-owned
  // for the same reason as the relative-time strings above: event date
  // formatting derives only the numeric index from Intl (locale 'en-US',
  // always ICU-present) and resolves the display name here, so SSR and
  // hydration output are byte-identical regardless of the runtime's Somali
  // CLDR support. See apps/web/src/lib/events/datetime.ts.
  'time.month1': 'January',
  'time.month2': 'February',
  'time.month3': 'March',
  'time.month4': 'April',
  'time.month5': 'May',
  'time.month6': 'June',
  'time.month7': 'July',
  'time.month8': 'August',
  'time.month9': 'September',
  'time.month10': 'October',
  'time.month11': 'November',
  'time.month12': 'December',
  'time.monthShort1': 'Jan',
  'time.monthShort2': 'Feb',
  'time.monthShort3': 'Mar',
  'time.monthShort4': 'Apr',
  'time.monthShort5': 'May',
  'time.monthShort6': 'Jun',
  'time.monthShort7': 'Jul',
  'time.monthShort8': 'Aug',
  'time.monthShort9': 'Sep',
  'time.monthShort10': 'Oct',
  'time.monthShort11': 'Nov',
  'time.monthShort12': 'Dec',
  // ISO weekday index: Monday = 1 … Sunday = 7.
  'time.weekday1': 'Monday',
  'time.weekday2': 'Tuesday',
  'time.weekday3': 'Wednesday',
  'time.weekday4': 'Thursday',
  'time.weekday5': 'Friday',
  'time.weekday6': 'Saturday',
  'time.weekday7': 'Sunday',

  // ── Aniga v3 — the modular profile (design frames 5a–5d / 8a–8b / 10a–10e,
  // states a1–a5 / v1–v7, Badge Canon b1–b4). Everything below the bio is an
  // owner-ordered module, so each module owns its title, its footnote and its
  // own loading / empty / error / offline / Lite strings — a module fails
  // alone and says so in place.
  //
  // Somali is frame-verbatim wherever the design carries the string; English
  // is written here for the first time. Reuse before adding: the "+ Ku dar"
  // chips are `action.add`, the source chips are `plaza.typeWin` /
  // `term.lab` / `plaza.typeUpdate`, the resolved-Codsi chip is
  // `plaza.askFulfilled`, match member counts are `lab.memberCount`.

  // Module titles — one per profile_module_kinds row (ANIGA_MODULE_TITLE_KEYS).
  // Spaces carries two: the owner says "I chose", the visitor "were chosen".
  'profile.moduleShowcase': 'Showcase',
  'profile.moduleSkills': 'Skills',
  'profile.moduleLinks': 'External pages',
  'profile.moduleLookingFor': 'Looking for',
  'profile.moduleSpaces': 'Chosen Spaces',
  'profile.moduleSpacesOwn': 'Spaces I chose',
  'profile.moduleHelper': 'Help given',
  'profile.moduleSuuq': 'Directory listing',
  'profile.moduleMetrics': 'Metrics',

  // Header chrome — fixed above the modules (cover, avatar, name, headline).
  'profile.headlineLabel': 'Headline',
  'profile.headlineHint': 'One line — what you do and where. It sits under your name.',
  // The line under the name. One key, two placeholders: the separator and the
  // order of the two halves belong to the locale, never to string concatenation.
  'profile.headlineCity': '{headline} · {city}',
  'profile.editFull': 'Edit profile',
  'profile.sendMessage': 'Send message',
  'profile.shareProfile': 'Share profile',
  'profile.moreActions': 'More',
  'profile.changeCover': 'Change cover',
  'profile.changeAvatar': 'Change photo',
  'profile.coverSlotLabel': 'Cover',
  'profile.verifiedRingAria': 'Verified member',
  'profile.contactInline': 'Contact:',
  'profile.contactWhatsapp': 'WhatsApp',
  'profile.contactEmail': 'Email',
  'profile.editContactOptions': 'Edit contact options',

  // The two closing notes that carry the fairness rule out loud (A1).
  'profile.visitorOrderNote':
    'You’re seeing what {name} published, in the order they chose. There are no follower counts.',
  'profile.evidenceNote':
    'This profile shows no follower or post counts — it shows evidence: endorsements, verified help, and customer testimony.',

  // Showcase (Bandhig) — member-pinned refs only, never engagement-sourced (A5).
  'profile.showcaseAddAria': 'Add to showcase',
  'profile.showcaseOwnerNote':
    'You choose what sits here — a Win, Lab artwork, or an Update photo. Nothing appears automatically.',
  'profile.showcaseVisitorNote':
    '{name} chose this showcase — these are not the most active items.',
  'profile.showcaseEmptyTitle': 'Your showcase is empty',
  'profile.showcaseEmptyBody': 'Pin a Win, Lab artwork, or an Update photo — you choose.',
  'profile.showcaseErrorTitle': 'The showcase didn’t load',
  'profile.showcaseErrorBody': 'Something went wrong while loading it. Try again.',
  'profile.showcaseLiteNote': 'Lite: images wait. The layout is the same.',
  'profile.retryShort': 'Retry',
  'profile.pinQueuedTitle': 'New Win — waiting',

  // Skills (Xirfadaha) — §14 endorsements. Counts are distinct endorsers (A8)
  // and are attested evidence, so they stay on the visitor view.
  'profile.skillsMetaOwner': 'Peer endorsements',
  'profile.skillsMetaVisitor': 'Peer endorsements · you can endorse too',
  'profile.endorse': 'Endorse',
  'profile.endorseSkill': 'Endorse a skill',
  'profile.endorseSkillAria': 'Endorse {skill}',
  'profile.endorsed': 'Endorsed',
  'profile.endorsementCount': '×{count}',
  'profile.endorserCount': {
    one: '{count} member endorsed this',
    other: '{count} members endorsed this',
  },
  'profile.skillsOwnerNote':
    'The number is how many people endorsed each skill — evidence, not popularity. Size shows depth.',
  'profile.skillsAll': 'All',
  'profile.endorseSaved': 'Endorsement recorded.',
  'profile.errorSelfEndorse': 'You can’t endorse your own skills.',

  // External links (Bogagga dibadda) — the 3-tier ladder: chip → OG preview →
  // verified link-back. A failed preview degrades to the chip (A6); the check
  // badge is granted only by a completed link-back (A7).
  'profile.linksOwnerNote':
    'The verification check comes from a link-back: the page itself points at this profile.',
  'profile.linksVisitorNote':
    '{site} is verified: the page links back to this profile. The other links are not verified.',
  'profile.linksVisitorNoteLong':
    'The {site} check came from a verified link-back — tier three of the Verified ladder.',
  'profile.linkVerifiedTitle': 'Verified',
  'profile.linkPending': 'Waiting',
  'profile.linkAddVerification': 'Add a link-back check so the chip earns its badge.',
  'profile.linksLadderTitle': 'Verification ladder',
  'profile.linksLadderNote':
    'Chip → preview → verified link-back. Only the check grants the badge.',
  'profile.linkPreviewLoading': 'Preview loading',
  'profile.linkPreviewFailed': 'No preview — the chip stands alone',
  'profile.linkVerifyStart': 'Verify with a link-back',
  'profile.linkVerifyToken': 'Put this code on your page, then check.',
  'profile.linkVerifyCheck': 'Check now',
  'profile.linkVerifyFailed': 'We couldn’t find a link back to this profile yet.',
  'profile.editLink': 'Edit link',

  // Looking for (Waxaan raadinayaa) — every match carries a reason, always shown.
  'profile.lookingForNote':
    'Matching uses only what you wrote — skills, place, and what you’re looking for. Every reason is shown.',
  'profile.matchLookingFor': '{lab} is looking for “{need}”',
  'profile.matchReasonSkill': 'Matches your skills',
  'profile.matchReasonCity': 'Matches your city',
  'profile.matchReasonLookingFor': 'Matches what you’re looking for',
  'profile.viewAction': 'View',

  // Metrics (Tirakoobka) — flag-gated OFF platform-wide (A3/A4). Plain system
  // state: never promotional, never "coming soon", never a countdown. The
  // header chip is `profile.moduleVisitorsOff` from the module-shell block.
  'profile.metricsNote':
    'The section is built. Showing it to visitors is switched off by a platform-wide flag — a platform decision.',
  'profile.metricsManagerSub':
    'Off by a platform-wide flag — a platform decision, not a setting of yours',
  'profile.metricsRailSub': 'Platform flag — off',
  'profile.flagOff': 'Off',
  'profile.statPosts': 'Posts',
  'profile.statAsksHelped': 'Asks helped',
  'profile.statConnections': 'Connections',
  'profile.statPostsPublished': 'Posts published',
  'profile.statAsksYouHelped': 'Asks you helped',
  'profile.errorModuleFlagDisabled':
    'That section is switched off platform-wide — it can’t be turned on here.',

  // Owner-private stats — the one place real numbers live, clearly labelled.
  'profile.privateStatsTitle': 'Only you can see this',
  'profile.privateStatsNote':
    'No one else sees these numbers. Your profile shows what you made — not how often.',
  'profile.cachedAge': 'Cached: {age}',

  // Helper history (Caawimo) — asker-credited resolutions only.
  'profile.helperNote':
    'Asks {name} helped that were resolved. The person who asked confirmed it — this is not self-reported.',
  'profile.helperVerifiedTitle': 'Verified help',
  'profile.helperCreditedBy': '{name} confirmed it',
  'profile.helperCreditedByCity': '{name} confirmed it · {city}',

  // Pinned Spaces + Suuq listing.
  'profile.editSpaces': 'Change chosen Spaces',
  'profile.spacesEmptyOwn': 'You haven’t chosen any Spaces yet. You can pin up to 3.',
  'profile.testimonialTitle': 'Member testimonial',
  'profile.testimonialBy': '{name} · verified customer',
  'profile.openSuuqListing': 'Open the Directory listing',
  'profile.addSuuqListing': 'Add a Directory listing',
  'profile.suuqEmptyOwn':
    'You don’t have a Directory listing yet. If you run a business, add it so people can find you.',

  // Mutuals — computed from shared Spaces only, never a contacts upload.
  'profile.mutuals': 'You both know: {names}',
  'profile.mutualsWithSpace': 'You both know: {names} — {space}',
  'profile.mutualsJoinLast': '{names} and {last}',
  'profile.mutualsOthers': { one: '{count} other', other: '{count} others' },

  // Owner rail — the facts card. Ruled owner-only (11 Aug): every fact a visitor
  // card would carry already renders elsewhere, and the fold state below is itself
  // something the member chose not to publish. The report link stays outside the
  // card — it is a safety affordance, not a row in a facts table.
  'profile.factsTitle': 'Details',
  // The owner read path skips the privacy fold, so a member who chose `hidden` sees
  // their real city on their own page forever and never learns nobody local can find
  // them. Rendered only when the fold actually bites — a notice that never changes
  // teaches nothing.
  'profile.factsFoldRegion': 'Visitors see {place} only.',
  'profile.factsFoldHidden': 'Your location is hidden from visitors.',
  // Lanes decide who finds you; they are not an achievement. Without this the row
  // reads as a claim, which is also why lanes render as a dl and never as a tag pill.
  'profile.factsLanesNote':
    'Lanes are how members find you in the directory — they are not shown on your profile.',
  'profile.reportProfile': 'Report this profile',
  'profile.reportAction': 'Report',

  // Module manager — mobile sheet (10e) and desktop rail card (10b).
  'profile.managerTitle': 'Profile sections',
  'profile.managerOpen': 'Arrange sections',
  'profile.managerSubtitle': 'Drag · switch off',
  'profile.managerDragHint': 'Drag to reorder',
  'profile.managerDragAria': 'Drag to reorder {section}',
  'profile.managerSave': 'Save arrangement',
  'profile.managerNote': 'Visitors see only the sections you switched on, in the order you set.',
  'profile.managerInstantNote': 'Changes apply instantly — visitors see this arrangement.',
  'profile.managerQueuedTitle': 'Your arrangement is saved',
  'profile.managerQueuedNote':
    'This page already shows the new arrangement — visitors see it once it syncs.',
  'profile.managerRowSkills': 'Skills and endorsements',
  'profile.managerSaved': 'Arrangement saved.',
  'profile.managerSaveFailed': 'The arrangement didn’t save. Try again.',
  'profile.moduleShown': 'Visible',
  'profile.moduleHidden': 'Hidden',
  // Pairs with `profile.moduleHiddenA11y` in the module-shell block above.
  'profile.moduleShownA11y': 'This section is visible',
  // Manager rows repeat the same controls eight times, so each control names
  // the row it belongs to — "Visible, pressed" eight times over identifies
  // nothing. Same {section} shape as `profile.managerDragAria`.
  'profile.moduleShownAria': 'The {section} section is visible',
  'profile.moduleHiddenAria': 'The {section} section is hidden',
  'profile.managerMoveUp': 'Move {section} up',
  'profile.managerMoveDown': 'Move {section} down',

  // Page-scale states a1–a5. The new-member state carries no zeroed counters:
  // an empty profile is normal, not a scoreboard at zero.
  'profile.loadingAria': 'Loading',
  'profile.emptyOwnTitle': 'Your profile is empty — that’s normal',
  'profile.emptyOwnBody':
    'What people will see is what you do: write an Intro, answer an Ask, or join a Lab. There are no numbers to fill in.',
  'profile.emptyOwnWriteIntro': 'Write an Intro',
  'profile.emptyOwnFillBio': 'Fill in your bio',
  'profile.verificationTitle': 'Verification',
  'profile.verificationBody': '3 verified members can vouch for you, or a short video call.',
  'profile.verificationStart': 'Start verification',
  'profile.memberYear': 'Member {year}',
  'profile.notVerified': 'Not verified',
  'profile.loadErrorTitle': 'This profile couldn’t be loaded',
  'profile.loadErrorBody':
    'Your connection may be weak. Try again — if it keeps happening, tell us.',
  'profile.offlineBar': 'No internet — you’re reading a saved copy.',
  'profile.queuedEditTitle': 'Your new bio is waiting',
  'profile.queuedEditBody': 'Your edit is saved — it will send when the internet comes back.',
  'profile.queuedEditView': 'See the change',
  'profile.litePhotoSize': 'photo ~{size}',
  'profile.liteFooterNote': 'Lite: photos are paused. Your avatar is initials — nothing downloads.',

  // Badge canon (b1–b4 + ruling 10). The identity / earned / tenure labels and
  // the three long tooltips already live in the `profile.badge*` block above —
  // these are the role labels the canon adds, and roles are neutral by class,
  // never orange (A9).
  'profile.badgeFounder': 'Founder',
  'profile.badgeAuthor': 'Author',

  // --- Maal (venture workspace) ---------------------------------------------
  // Frames 7a–7g + states m1–m5 (docs/superpowers/plans/2026-08-12-maal-venture.md).
  // A Maal is a Space at `space_mode = 'venture'`; the Somali here is the
  // design's own copy and is the register of record, so English is the
  // translation for once — plain, never promotional, and never softer than the
  // Somali about what money cannot do yet.
  //
  // Deliberately NOT redefined here (reuse them): `capital.indexTitle`
  // (EN Capital · SO Maal) for the index heading, `term.lab` for the Warshad
  // stage badge, `lab.badgeDormant` ('Hurdo'), `lab.tabDecisions` ("Go'aanno",
  // identical in both locales), `lab.tabMembers`, `lab.actionJoin` ('Ku biir'),
  // `lab.actionView` ('Fiiri'), `lab.actionRequestJoin` ('Codso inaad ku
  // biirto'), `lab.roleLead|roleMember|roleObserver`, `profile.badgeFounder`
  // ('Aasaase'), `action.accept|decline|retry|delete|back`, and the `lite.*`
  // deferred-media keys the frames show over the cover image.
  //
  // Money never renders through a key: `$0` and every share/ratio is a number,
  // formatted by formatNumber, so the dictionary cannot drift from the ledger.

  // 7a — the Maal index. Koox is never listed here (ruling 4).
  'maal.indexSubtitle':
    'Labs and ventures. Join one, or grow your Lab into a Venture once it has a purpose and a structure.',
  // Signed-out teaser + page metadata for /capital. Since F2 §5 this route is the
  // Maal index, not the candidate board — marketing.capitalTeaser* stayed with the
  // board at /capital/candidates, where it is still true. No invest language here
  // either: this describes work organisations, and Xidig moves no money.
  'maal.teaserTitle': 'Capital — work organisations you can join',
  'maal.teaserBody':
    'Labs and ventures in one place: a stated purpose, workstreams with named owners, a decision log, and an open contribution ledger. Stage is earned by work, never awarded — and no money moves through Xidig.',
  'maal.newLab': 'New Lab',
  'maal.chipAll': 'All · {count}',
  'maal.chipVentures': 'Ventures · {count}',
  'maal.chipLabs': 'Labs · {count}',
  'maal.chipMine': 'Ones I’m in · {count}',
  'maal.sortLabel': 'Sort by:',
  'maal.sortActivity': 'Activity',
  'maal.colName': 'Name & purpose',
  'maal.colStage': 'Stage',
  'maal.colMembers': 'Members',
  'maal.colOpenWork': 'Open work',
  // The accent stage tag. Its Warshad counterpart is `term.lab` — one canonical
  // word per stage, so a rename can never disagree with itself.
  'maal.stageVenture': 'Venture',
  'maal.stageDemoted': 'Returned from Venture',
  // Rendered after the Space's own one-liner, as its own sentence — never
  // glued onto it.
  'maal.demotedPremise':
    'It returned to being a Lab after a timeout — it is written in the public log.',
  'maal.rowFounder': 'Founder {name}',
  'maal.rowOpenedBy': 'Opened by {name}',
  'maal.rowRound': {
    one: 'Round {round} — {count} day left',
    other: 'Round {round} — {count} days left',
  },
  'maal.rowLastActivity': 'Last active {time}',
  'maal.openSeats': { one: '{count} open seat', other: '{count} open seats' },
  'maal.openToAnyone': 'Open to anyone',
  // The open-work cell renders "—" when a space has neither open seats nor an
  // open door. The dash is the frame's mark; this is the sentence a screen
  // reader gets, because "nothing announced" reads as "column failed to load".
  'maal.noOpenWork': 'No open work',
  'maal.actionOpen': 'Open',
  'maal.actionRequest': 'Request',
  // The quiet link off the index to the Phase-5 candidate board (D1: it moved
  // to /capital/candidates when /capital became the Maal index — nothing was
  // deleted, so nothing may become unreachable either).
  'maal.candidatesLink': 'The Venture Candidates board',
  // The footer law. One key: it is a single statement of what the stage is and
  // how it is lost, and a split would let one half ship without the other.
  'maal.indexLaw':
    'Venture is a stage, not a reward. A Lab becomes a Venture when it writes a purpose, names a lead, and takes on the structure of work — and it returns to being a Lab if inactivity passes the timeout limit — automatically, with notice in advance and a public log. Nothing is lost in the return: the charter, the ledger and the decisions all stay, and it becomes a Venture again once the conditions are met. Both live in the same place so nobody’s real stage is hidden.',

  // 7b — the venture overview. The tab row is the frames' own register: it says
  // Guud / Wada-hadal / Lifaaqyo where the Warshad row says Guudmar /
  // Warbixino / Wax-soo-saar. Kept as separate keys so the venture reads the
  // way it was designed without renaming a tab on every Koox and Warshad.
  'maal.backToIndex': 'All Ventures',
  'maal.actionAdd': 'Add',
  'maal.tabOverview': 'Overview',
  'maal.tabWork': 'Work',
  'maal.tabUpdates': 'Discussion',
  'maal.tabArtifacts': 'Attachments',
  'maal.tabLedger': 'Contributions',
  'maal.tabCapital': 'Investment',
  'maal.charterTitle': 'Charter',
  'maal.charterUpdated': 'Updated {time} · {name}',
  // The meter's accessible name. The visible tail is a number, a slash and the
  // venture's own goal unit — data, not copy.
  'maal.goalAria': '{done} of {target} {unit}',
  'maal.workstreamsTitle': 'Workstreams',
  'maal.workstreamsNote': 'Everyone owns one',
  'maal.colWorkstream': 'Workstream',
  'maal.colOwner': 'Owner',
  'maal.colTasks': 'Tasks',
  'maal.colStatus': 'Status',
  'maal.openSeat': 'Open seat',
  'maal.workstreamActive': 'Active',
  'maal.workstreamWaiting': 'Waiting',
  'maal.decisionsTitle': 'Latest decisions',
  'maal.decisionsAll': 'The full log',
  // Post-close tallies only (Phase 5 pattern) — a decision in flight shows no
  // numbers at all, so there is no "so far" phrasing to translate.
  'maal.decisionTally': {
    one: '{count} member agreed, {rejected} against',
    other: '{count} members agreed, {rejected} against',
  },
  'maal.decisionTallyUnanimous': {
    one: '{count} member agreed',
    other: '{count} members agreed',
  },
  'maal.membersWithCount': 'Members · {count}',
  'maal.activeNow': '{count} active now',
  'maal.activeDot': 'Active',
  'maal.applicationsTitle': 'Membership applications · {count}',
  // Reads after the applicant's skill and a middot, so it starts lower-case in
  // both locales — one clause, not a fragment waiting for a verb.
  'maal.applicationRequested': 'wants to work in {workstream}',
  'maal.visibilityTitle': 'Visibility',
  'maal.visPublicPage': 'Public page',
  'maal.visPublicPageHint': 'The purpose and the members are visible',
  'maal.visLedgerMembers': 'Contributions open to members',
  'maal.visLedgerMembersHint': 'Everyone sees what everyone added',
  'maal.visHoursLeads': 'Hours for leads only',
  'maal.visHoursLeadsHint': 'Other members see a total',
  'maal.visibilityFooter':
    'The members chose this. Xidig does not choose — and nothing is recorded secretly.',
  'maal.capitalDormantTitle': 'Investment — dormant',
  'maal.capitalDormantBody':
    'Money does not move on Xidig, and no investment or pledging is currently offered. The ledger records contributions only.',
  'maal.capitalDormantLink': 'See the structure',

  // 7c — the work board. Hours are one contribution type, entered by the
  // member; nothing here is observed or measured for them.
  'maal.logContribution': 'Log a contribution',
  'maal.newTask': 'Task',
  'maal.filterAllWorkstreams': 'Every workstream',
  'maal.weekLogged': {
    one: 'You logged {count} hour this week',
    other: 'You logged {count} hours this week',
  },
  'maal.boardPlanned': 'Planned',
  'maal.boardInProgress': 'In progress',
  'maal.boardAttestation': 'Witness & approval',
  'maal.boardDone': 'Complete',
  'maal.hoursShort': { one: '{count} hr', other: '{count} hrs' },
  'maal.unassignedAria': 'No owner named',
  // The guul star on an attested row — the one earned mark allowed to be
  // orange on a Maal surface (badge canon 10a).
  'maal.attestedAria': 'Verified contribution',
  'maal.logTaskLabel': 'Task',
  'maal.logTypeLabel': 'Type',
  'maal.logAmountLabel': 'How much',
  // Money is the one contribution whose unit is ambiguous — the ledger stores
  // and renders cents, a member thinks in dollars — so the money field says its
  // unit in its own label, and the hint echoes the exact figure that will be
  // appended. This guard has to sit BEFORE the write: the ledger is
  // append-only, so "$500 logged as $5.00" can only ever be corrected by a
  // public reversal event that stays in the chain forever.
  'maal.logAmountMoneyLabel': 'Amount ({currency})',
  'maal.logAmountMoneyHint':
    'Enter the amount in {currency}, not in cents. It is recorded in the ledger — money never moves.',
  'maal.logAmountMoneyPreview': 'Recorded as {amount}',
  'maal.logSubmit': 'Log it',
  // work_event_type. 'Introduction' rather than 'Intro' so it can never be read
  // as the Plaza post type (plaza.typeIntro / Salaan).
  'maal.typeHours': 'Hours',
  'maal.typeCode': 'Code',
  'maal.typeDesign': 'Design',
  'maal.typeIntro': 'Introduction',
  'maal.typeMoney': 'Money',
  // The board moves. Each verb names what actually happens to the card, and
  // the two witnessing verbs are separate words on purpose: a witness says
  // "I saw this", an approval says "this counts" — collapsing them into one
  // "Done" button would erase the recusal rule the ledger rests on. (The
  // approval verb itself reuses `action.approve`, the app-wide word.)
  'maal.taskClaim': 'Take it',
  'maal.taskRelease': 'Put it back',
  'maal.taskSubmit': 'Submit',
  'maal.taskAttest': 'Witness it',
  // The "no task" / "no workstream" option in the log and create forms. One
  // key: it is the same absence in both, and two words for it would drift.
  'maal.optionNone': 'None',

  // 7d — the ledger. The notice is one key: it is one utterance about what the
  // ledger is, what it is not, and what a correction does. Split it and a
  // translator can ship "this is real" without "it has no legal force".
  'maal.ledgerNotice':
    'This ledger works and it is real: it records what each person added. The share shown has no legal force until a company is registered, and it never weights a vote — every verified member has one vote. It is an agreement between the members; Xidig does not mediate it. The ledger is append-only and hash-chained: nothing is edited and nothing is deleted — a correction is a new reversal event.',
  'maal.statTotalHours': 'Total hours',
  'maal.statEventsLogged': 'Contributions logged',
  'maal.statContributors': 'Members who contributed',
  'maal.statMoneyClosed': 'Money — not open yet',
  'maal.colMember': 'Member',
  'maal.colUnits': 'Units',
  'maal.colShare': 'Share',
  'maal.unitsValue': { one: '{count} unit', other: '{count} units' },
  'maal.prCount': { one: '{count} PR', other: '{count} PRs' },
  'maal.weightsTitle': 'How units are counted',
  // The four weights are params, not literals: they are the seeded scheme and
  // the members can vote a different one (venture_weight_schemes), so a
  // hard-coded 8/12/10/25 would start lying the day they do. Every word around
  // them is the design's own.
  'maal.weightsBody':
    'The members chose the weights: an hour = {hours} units, an approved PR = {code}, an approved design = {design}, an introduction that brought a customer = {intro}. Changing the weights is a decision the members vote on — one member, one vote, and a share never weights a vote — and it goes into the decision log. The share is read out of the events: the scheme can change without touching the history. A verified unit needs a witness — a co-sign from members or a lead — and a lead cannot approve their own work.',
  'maal.weightsLink': 'See the weights',
  'maal.moneyCardTitle': 'Money as a contribution',
  'maal.moneyCardBody':
    'The money contribution type exists in the ledger, but it is not open. Xidig does not currently offer any way to move money.',
  'maal.exportCsv': 'Download CSV',
  // The CSV's own header row. Localised like any other label: a member's copy of
  // the ledger is their record of an agreement between members, and it is read
  // in the language they read everything else in. The remaining columns reuse
  // the table's keys (colMember / logTypeLabel / logAmountLabel / colUnits /
  // logTaskLabel) — one word cannot mean two things across two surfaces.
  'maal.csvSeq': 'Seq',
  'maal.csvWhen': 'When',
  'maal.csvWitnesses': 'Witnesses',
  'maal.csvNote': 'Note',

  // 7g — the same ledger on mobile. Ruling 1: full capability, responsive
  // presentation. These are the compact labels the 402px layout needs, not a
  // reduced feature set.
  'maal.ledgerSubtitle': '{name} · the whole ledger',
  'maal.filterSheet': 'Filter',
  'maal.filterMember': 'Member: {value}',
  'maal.filterType': 'Type: {value}',
  'maal.filterAll': 'All',
  'maal.filterDays': { one: '{count} day', other: '{count} days' },
  'maal.statHoursShort': 'Hours',
  'maal.statEventsShort': 'Events',
  'maal.statMembersShort': 'Members',
  'maal.statMoneyShort': 'Money',
  'maal.statPrShort': 'PRs',
  'maal.statIntrosShort': 'Intros',
  'maal.statUnitsShort': 'Units',
  'maal.ledgerNoticeCompact':
    'Append-only, hash-chained. The share has no legal force until a company is registered, and it never weights a vote — every member has one vote.',
  'maal.memberEventsLink': {
    one: '{count} event · open the ledger',
    other: '{count} events · open the ledger',
  },
  'maal.eventTrailTitle': 'Latest events',
  'maal.eventTrailAll': 'All · {count}',
  // One whole row per contribution type — never a name glued to a fragment.
  'maal.eventHours': {
    one: '{name} · {count} hour {task}',
    other: '{name} · {count} hours {task}',
  },
  'maal.eventCode': '{name} · PR #{ref} approved',
  // The same event with no reference given. The quantity is a COUNT of approved
  // PRs, never a PR number, so it must never slide into the "#{ref}" sentence —
  // "3 PRs" rendered as "PR #3" invents a pull request that may not exist.
  'maal.eventCodeCount': {
    one: '{name} · {count} approved PR',
    other: '{name} · {count} approved PRs',
  },
  'maal.eventDesign': {
    one: '{name} · {count} design approved',
    other: '{name} · {count} designs approved',
  },
  'maal.eventIntro': {
    one: '{name} · {count} introduction that brought a customer',
    other: '{name} · {count} introductions that brought customers',
  },
  'maal.eventMoney': '{name} · {amount} recorded — not moved',
  // A reversal names the TYPE it corrects — one key per work_event_type, the
  // mirror of the five sentences above. One shared "…{count} hours…" sentence
  // would describe a reversed introduction, PR or recorded sum as hours, which
  // on an append-only ledger is a permanent misstatement of what was undone.
  'maal.eventReversalHours': {
    one: 'Reversal: {name} · {count} hour ({reason})',
    other: 'Reversal: {name} · {count} hours ({reason})',
  },
  'maal.eventReversalCode': {
    one: 'Reversal: {name} · {count} approved PR ({reason})',
    other: 'Reversal: {name} · {count} approved PRs ({reason})',
  },
  'maal.eventReversalDesign': {
    one: 'Reversal: {name} · {count} approved design ({reason})',
    other: 'Reversal: {name} · {count} approved designs ({reason})',
  },
  'maal.eventReversalIntro': {
    one: 'Reversal: {name} · {count} introduction that brought a customer ({reason})',
    other: 'Reversal: {name} · {count} introductions that brought customers ({reason})',
  },
  'maal.eventReversalMoney': 'Reversal: {name} · {amount} ({reason})',
  'maal.reversalTag': 'Reversal',
  'maal.attestationCount': { one: '{count} witness', other: '{count} witnesses' },

  // 7e — the non-member view. Charter and structure before joining, so an
  // application is an informed one.
  'maal.shareAria': 'Share',
  'maal.moreAria': 'More',
  'maal.joinNote': 'The leads review the request. You choose the workstream you want to work in.',
  'maal.openSeatsTitle': 'Open seats · {count}',
  'maal.seatWaitingUnowned': {
    one: '{count} task waiting · no owner named',
    other: '{count} tasks waiting · no owner named',
  },
  'maal.seatLedNeedsHelp': '{name} is leading · help wanted',
  'maal.allMembers': 'All members',
  'maal.publicSeesTitle': 'What the public sees',
  'maal.publicSeesBody':
    'The purpose, the members, and the open seats. The work, the files, and the contribution ledger are open to members only — the members chose that.',

  // 7f — capital. Every control is built and disabled, and the reason is the
  // real one. No date is promised anywhere on this surface.
  'maal.escrowNotice':
    'Money cannot move here. Xidig holds no one’s money, and no escrow or pledging is currently offered.',
  'maal.needTitle': 'The declared need',
  'maal.needAmount': 'Amount',
  'maal.needPurpose': 'Purpose',
  'maal.needDecision': 'The decision',
  'maal.pledgeTitle': 'Pledge',
  'maal.pledgeCta': 'Pledge',
  'maal.pledgeAmountAria': 'Pledge amount',
  'maal.pledgeLockNote':
    'Locked — pledging is not currently offered on Xidig, and money never goes straight to a founder’s account.',
  'maal.worksNowTitle': 'What works today',
  'maal.worksLedger': 'The contribution and share ledger',
  'maal.worksNeed': 'The declared need and its decision',
  'maal.worksMoneyWeight': 'Money weighted as a contribution',
  'maal.worksPledgeLocked': 'Money pledges — locked',
  'maal.worksEscrow': 'Escrow — not offered',
  'maal.capitalFooter':
    'We are not promising an escrow or a date. Money does not currently move on Xidig — the work is what matters.',

  // States m1–m5. The dormancy notice and the ledger-read error are one key
  // each: both say "nothing was lost" in the same breath as "something is
  // wrong", and only one half of that is worth reading.
  'maal.loadingAria': 'Loading',
  'maal.emptyTitle': 'No ventures yet',
  'maal.emptyBody':
    'Big things start as a Lab — an idea, a group, a purpose. When they are ready, they show up here.',
  'maal.emptyCta': 'Open Labs',
  'maal.emptyFooter': {
    one: '{count} Lab is working right now. None of them is required to become a Venture.',
    other: '{count} Labs are working right now. None of them is required to become a Venture.',
  },
  'maal.dormantNotice': {
    one: '{name} has had no activity for {count} week. Its stage, its members and its history have not changed — one update brings it back. If it continues, the timeout limit returns it to a Lab automatically — with notice in advance and a public log.',
    other:
      '{name} has had no activity for {count} weeks. Its stage, its members and its history have not changed — one update brings it back. If it continues, the timeout limit returns it to a Lab automatically — with notice in advance and a public log.',
  },
  'maal.resumeTitle': 'Where to pick it up',
  'maal.resumePostUpdate': 'Write an update',
  'maal.resumeCallMembers': 'Call the members in',
  'maal.dormantFooter':
    'Dormancy is a marker and an early warning. Further time out returns the stage to a Lab automatically — a clear rule, notice in advance, and a public log. The work stays where it is: when the conditions are met again, it returns to being a Venture.',
  'maal.ledgerErrorNotice':
    'The detailed ledger could not be loaded. The totals above are the last verified ones — nothing is missing from the ledger itself. Try again.',
  'maal.ledgerErrorFooter':
    'The ledger is append-only — a loading error never changes what was written.',
  'maal.offlineBar': 'No internet — the log is waiting.',
  'maal.queuedCount': { one: '{count} log is waiting', other: '{count} logs are waiting' },
  'maal.queuedNote':
    '“{label}” · it goes out when the internet comes back. The real time you entered is what is saved, not the time it sends.',
  // A parked log that never made it in. Silence here would be the queue losing
  // work on a LEDGER, so both endings say what happened and what to do: the
  // server answered no (nothing was appended), or it aged out unsent and the
  // member has to enter it again. Neither is a retry — replaying a refused log
  // would re-offer something the server already declined.
  'maal.queueRefused': {
    one: '{count} waiting log did not go in — the server declined it. Nothing was added to the ledger.',
    other:
      '{count} waiting logs did not go in — the server declined them. Nothing was added to the ledger.',
  },
  'maal.queueExpired': {
    one: '{count} waiting log sat too long and was never sent. Enter it again — nothing reached the ledger.',
    other:
      '{count} waiting logs sat too long and were never sent. Enter them again — nothing reached the ledger.',
  },

  // Maal — Space History labels for the venture events. Without these the
  // history falls back to the anonymous "Activity" line, and the single most
  // consequential thing that can happen to a venture — the timeout demotion —
  // would be the least legible row in its own history.
  'maal.eventPromotedVenture': 'Promoted to Venture',
  'maal.eventDemotedTimeout': 'Returned to Lab — timeout',
  'maal.eventGoalUpdated': 'Goal updated',
  'maal.eventVisibilityChanged': 'Ledger visibility changed',
  'maal.eventWorkstreamAdded': 'Workstream added',
  'maal.eventWorkstreamChanged': 'Workstream changed',
  'maal.eventWorkstreamRemoved': 'Workstream removed',
  'maal.eventTaskAdded': 'Task added',
  'maal.eventTaskChanged': 'Task changed',
  'maal.eventTaskMoved': 'Task moved',
  'maal.eventContributionReversed': 'Contribution corrected',
  'maal.eventWeightsChanged': 'Weights changed by vote',
  'maal.eventCapitalNeedDeclared': 'Capital need declared',

  // Maal — §27 plain-language errors. Each one says what happened, why, and
  // what to do next; none of them blames the member for a rule they could not
  // have read (the recusal pair in particular states the rule as it refuses).
  'error.ventureNotReady':
    'A Lab becomes a Venture once it has a written goal and at least one workstream with a named owner. Add those and try again.',
  'error.taskRecusal':
    'You cannot witness or approve your own task. Another member has to — that is what makes an approval mean something.',
  'error.attestationRecusal':
    'You cannot witness your own contribution. Ask a member or a lead to co-sign it.',
  'error.ledgerLocked':
    'This space is a Lab right now, so its ledger takes no new entries. Nothing was lost — everything recorded is still there, and it reopens if the space becomes a Venture again.',
  'error.contributionAlreadyReversed':
    'That entry has already been corrected. The ledger keeps both the original and the correction — a correction is not corrected again.',

  // Maal — notification copy for the demotion clock (ruling 2). Both are the
  // "ogeysiis hore" the index law promises: the warning arrives before the
  // change, and the change is announced when it happens.
  //
  // Neither line offers an appeal. `appeals` is scoped to mod_actions (§19) and
  // a system timeout is not a moderation action, so there is no form to send
  // anyone to — the remedy that actually exists is re-promotion, and PRD §16
  // now says so. Each line therefore names the thing the member can really do:
  // act before the deadline, or earn the stage back after it.
  'notif.ventureDemotionWarning':
    '{name} returns to Lab stage unless something happens — one contribution or update is enough. The change is logged publicly and nothing is lost',
  'notif.ventureDemoted':
    '{name} returned to Lab stage after the timeout. Its work, ledger, decisions and history are untouched — promote it again when the work restarts',
} as const satisfies Record<string, Message>;

/** Every valid message key, derived from the English dictionary. */
export type MessageKey = keyof typeof en;
