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
  'term.garab': 'Co-sign',
  'term.maalgeli': 'Invest',

  // Seeded / AI content labels (§21) — shown on cards for non-member content.
  'content.seededLabel': 'Seeded',
  'content.aiLabel': 'AI-assisted',
  'content.aiAccount': 'AI assistant',
  'content.seededTooltip': 'Platform-provided starter content, not a member post.',
  'content.aiTooltip': 'Created with Xidig AI. Labelled so you can tell it apart from member content.',
  'content.aiAccountTooltip': 'A clearly-labelled AI assistant account, not a human member.',

  // Admin — seed content review (§21)
  'admin.seedTitle': 'Seeded content',
  'admin.seedSubtitle': 'AI-assisted and seeded content — labelled, auditable, and never shown as member content.',
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
  'action.garab': 'Co-sign',
  'action.garabCount': { one: '{count} co-sign', other: '{count} co-signs' },
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
  'state.emptyFeed': 'Be the first to post — the Plaza is open.',
  'state.comingSoon': 'Coming soon',
  'state.comingSoonBody':
    'This part of Xidig opens in a later phase. The Suuq is live now — find builders and businesses.',
  'state.endOfList': 'That’s everything.',

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
  'error.imageModerationBlocked':
    'That image didn’t pass our content check, so it wasn’t uploaded. Try a different image — or contact support if you think this is a mistake.',
  'error.askAlreadyAnswered':
    'This Ask has been marked as answered. You can still comment if you have something to add.',
  'error.askNotOpen':
    'This Ask has been closed. Comments stay open if you have something to add.',
  'error.askCreditInvalid':
    'That comment can’t be credited — pick an answer from someone else on this Ask.',
  'error.pollClosed':
    'This poll has closed, so votes can’t be added or changed. The results are final.',
  'error.pollOptionsInvalid': 'Polls need {min} to {max} options. Adjust your options and try again.',
  'error.mediaNotReady': 'One of your images didn’t upload cleanly. Remove it and upload it again.',
  'error.playbookInvalid': 'That playbook is no longer available. Pick another, or start from a blank charter.',
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
  'error.notSupporter': 'Creating a Lab requires a Supporter membership.',
  'error.charterIncomplete':
    'Your Lab charter needs a few more fields before it can go live. Complete them here.',
  'error.labSlugTaken': 'That Lab address is already taken. Try a different one.',
  'error.labJoinClosed': 'This Lab is invite-only. Ask the lead for an invite to join.',
  'error.labAlreadyMember': 'You’re already a member of this Lab.',
  'error.labCollabInvalid': 'That collaboration link isn’t available anymore.',
  'error.pinnedFull':
    'You can feature up to 3 Labs on your profile. Unpin one to add another.',

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
    "You've already appealed this decision. There's one appeal per action, and a senior moderator will respond within 72 hours.",
  'error.appealNotEligible': "There's nothing to appeal here, or this action isn't yours to appeal.",
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

  // Informational notice (non-error): non-Somalia invest attempt falls back to
  // the informational view. Returned via apiNotice, never thrown.
  'notice.capitalRegionGated':
    "Investment features are available to Somalia-region members. You're seeing the informational view.",

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
  'onboarding.done': 'You’re all set',

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

  // Mentor-in-Residence (PRD §20)
  'mentor.featuredTitle': 'Mentor in Residence',
  'mentor.focusLabel': 'Focus:',
  'mentor.asksAnswered': {
    one: 'Answered {count} Ask this week',
    other: 'Answered {count} Asks this week',
  },
  'mentor.periodTaken': 'A mentor is already appointed for that period. Pick a different period.',

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
  'home.communityProof': 'Builders back each other here:',

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
  'settings.bandwidthBody': 'Turns off images and map tiles so pages load faster and cost less data.',
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
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
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
  'settings.deletionPending':
    'Your account is scheduled for deletion. {days} days left to cancel.',
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
    'If you think a decision was wrong, tell us what happened. A different moderator than the one who made the decision will review your appeal within 72 hours.',
  'settings.appealEmpty':
    'You have no moderation decisions to appeal right now.',
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
  'admin.claimsIntro': 'Members claiming ownership of unclaimed listings. Approving transfers the listing.',
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
    'Reports members filed, oldest first. Claim one to review, then decide. The 48-hour SLA badge turns red when a report is overdue.',
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
  'admin.reportSlaBreached': 'SLA overdue',
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
    'Members appealing a moderation action. You cannot review an appeal of your own action — those are hidden. The 72-hour SLA badge turns red when an appeal is overdue.',
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
    'Identity and business verification requests, oldest first. The 7-day SLA badge turns red when a request is overdue. Opening a recording is logged.',
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
  'a11y.moveUp': 'Move up',
  'a11y.moveDown': 'Move down',

  // Following feed on Home (§13 — Phase 1 feed = new listings from people you follow)
  'feed.title': 'Following',
  'feed.empty':
    'Nothing here yet — follow people and Spaces, and their posts, updates, and new listings will show up here.',
  'feed.emptyHint':
    'Follow people and Spaces to see their posts, updates, and new listings here.',
  'feed.newListingFrom': 'New listing from {name}',
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
  'profile.skillsHint': 'Separate skills with commas — like design, flutter, logistics.',
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
  'suuq.duplicatesBody': 'A listing for {name} already exists. Is this your business? Claim it here.',
  'suuq.claimListing': 'Claim this listing',
  'suuq.createAnyway': 'Mine is different — create it anyway',
  'suuq.claimEvidenceLabel': 'How do we know it’s yours? (optional)',
  'suuq.claimSubmitted':
    'Claim submitted — a moderator will review it and transfer the listing to you if approved.',
  'suuq.unclaimed': 'Unclaimed',
  'suuq.mapLowBandwidth': 'Map tiles are off in low-bandwidth mode — here’s the list instead.',
  'suuq.searchArea': 'Search this area',
  'suuq.listedBy': 'Listed by {name}',
  'suuq.contactHeading': 'Contact',
  'suuq.verifiedBusiness': 'Verified Business',
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

  // Plaza / Madal (§15, §20, §27) — feed, composer, asks, polls, reactions
  'plaza.filterAll': 'All',
  'plaza.pinnedHeading': 'This week’s highlights',
  'plaza.typeIntro': 'Intro',
  'plaza.typeAsk': 'Ask',
  'plaza.typeWin': 'Win',
  'plaza.typeUpdate': 'Update',
  'plaza.typePoll': 'Poll',
  'plaza.typeIntroHint': 'Introduce yourself to the community.',
  'plaza.typeAskHint': 'Ask for help — credit the answer that lands.',
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
  // Composer
  'plaza.composerTitle': 'Share with the Plaza',
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
  'plaza.askAnswered': 'Answered',
  'plaza.askClosed': 'Closed',
  'plaza.pollClosed': 'Poll closed',
  'plaza.pollClosesIn': 'Closes {when}',
  'plaza.commentsCount': { one: '{count} comment', other: '{count} comments' },
  'plaza.reactionFire': 'Fire',
  'plaza.reactionStrong': 'Strong',
  'plaza.reactionMashallah': 'Mashallah',
  'plaza.reactionIdea': 'Idea',
  'plaza.reactionWatching': 'Watching',
  'plaza.edited': 'Edited',
  'plaza.pinned': 'Highlight',
  'plaza.hiddenOwn':
    'Only you can see this post right now — it’s waiting for a quick moderation check.',
  'plaza.removedOwn': 'This post was removed. If you think that’s wrong, contact support.',
  'plaza.lowBandwidthMedia': 'Images and embeds are off in low-bandwidth mode.',
  // Detail page — comments, Ask lifecycle, polls
  'plaza.commentsHeading': 'Comments',
  'plaza.commentLabel': 'Add a comment',
  'plaza.creditAnswer': 'Mark as the answer',
  'plaza.creditedBadge': 'Credited answer',
  'plaza.closeAsk': 'Close this Ask',
  'plaza.askStaleTitle': 'Still looking for help?',
  'plaza.askStaleBody':
    'Your Ask has been open for {days} days. Credit an answer if you got one, or close it if it’s sorted.',
  'plaza.helperCredited': 'Answer credited — the helper earned Helper score.',
  'plaza.askClosedNotice': 'Ask closed.',
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
  'plaza.imageAltHint':
    'A short description helps screen readers and members on slow connections.',
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
  'messages.tabChats': 'Chats',
  'messages.tabRequests': 'Requests',
  'messages.empty': 'No conversations yet. Open a builder’s profile and tap Message to start one.',
  'messages.emptyRequests': 'No message requests right now.',
  'messages.requestsHeading': 'Message requests',
  'messages.you': 'You',
  'messages.new': 'New',
  'messages.unreadCount': { one: '{count} unread', other: '{count} unread' },
  'messages.noPreview': 'No messages yet.',
  'messages.requestExplainer':
    '{name} wants to message you. Accept to start chatting, or decline — they won’t be told.',
  'messages.accepted': 'Request accepted — you can chat now.',
  'messages.declinedByYou': 'Request declined.',
  'messages.pendingSentTitle': 'Request sent',
  'messages.pendingSentBody':
    'Waiting for {name} to accept. You’ll be able to keep chatting once they do.',
  'messages.declinedNotice': 'This request wasn’t accepted.',
  'messages.blockedNotice': 'You can’t message this member.',
  'messages.composerPlaceholder': 'Write a message…',
  'messages.requestComposerPlaceholder': 'Say hello and introduce yourself…',
  'messages.loadOlder': 'Load older messages',
  'messages.historyStart': 'This is the start of your conversation.',
  'messages.messageRemoved': 'This message was removed.',
  'messages.sendFailed': 'Message didn’t send. Check your connection and try again.',
  'messages.reconnecting': 'Reconnecting…',
  'messages.offline': 'You’re offline — messages will send when you’re back online.',
  // §27 DMs block (success notices)
  'messages.requestSent': 'Your message request has been sent. They’ll see it when they next open Xidig.',
  'messages.reportSubmitted':
    'Thanks for the report. We review all reports within 48 hours and will update you on the outcome.',
  // Phase 6 (§27 Moderation + §19 account lifecycle) success notices
  'messages.appealSubmitted':
    "Your appeal has been sent to a senior moderator. We'll respond within 72 hours.",
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
  'notif.empty':
    'You’re all caught up. Replies, mentions, and new messages will show up here.',
  'notif.markAllRead': 'Mark all read',
  'notif.allRead': 'All caught up.',
  // Bundled summary lines — {name} is the most recent actor, {count} the extras
  'notif.reply': '{name} replied to your post',
  'notif.replyBundle': '{name} and {count} others replied to your post',
  'notif.mention': '{name} mentioned you',
  'notif.mentionBundle': '{name} and {count} others mentioned you',
  'notif.newDm': { one: '{name} sent you a message', other: '{name} sent you {count} messages' },
  'notif.dmRequest': '{name} wants to message you',
  'notif.dmAccepted': '{name} accepted your message request',
  'notif.askCredited': 'Your answer was credited — you earned Helper score',
  'notif.askStale': 'Your Ask has been open a while — credit an answer or close it',
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
  'notif.generic': 'New activity on Xidig',

  // Push opt-in (§22 PWA push)
  'push.title': 'Push notifications',
  'push.body': 'Get a heads-up on new messages and mentions, even when Xidig is closed.',
  'push.enabled': 'Push notifications are on for this device.',
  'push.enable': 'Turn on push',
  'push.disable': 'Turn off push',
  'push.unsupported': 'This browser doesn’t support push notifications.',
  'push.denied': 'Push is blocked in your browser settings. Allow notifications for Xidig to turn it on.',
  'push.unavailable': 'Push isn’t configured on the server yet — in-app notifications still work.',

  // Labs / Spaces (§16, §20). Chrome (Warshad/Koox) reuses term.lab / term.club.
  'lab.listTitle': 'Labs',
  'lab.listSubtitle': 'Spaces where Somali builders form Clubs and Labs to build together.',
  'lab.filterAll': 'All',
  'lab.filterClubs': 'Clubs',
  'lab.filterLabs': 'Labs',
  'lab.filterMine': 'My Spaces',
  'lab.emptyList':
    'No Spaces yet. Start a Club to gather people around an idea, or open a Lab to build a venture.',
  'lab.createCta': 'Start a Space',
  'lab.createTitle': 'Start a Space',
  'lab.createModeQuestion': 'What are you starting?',
  'lab.modeClub': 'Club',
  'lab.modeClubHint': 'Casual — gather people around a topic. Free to start.',
  'lab.modeLab': 'Lab',
  'lab.modeLabHint': 'Serious — a charter-backed venture track. Needs a Supporter membership.',
  'lab.createSupporterNote': 'Creating a Lab requires a Supporter membership.',
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
  'lab.emptyArtifacts': 'No artifacts yet. Share a link to a doc, prototype, or demo. (Links only for now.)',
  'lab.emptyDecisions':
    'No decisions logged yet. Recording key calls keeps everyone aligned and builds your track record.',
  'lab.emptyMembers': 'Just the lead so far. Invite collaborators or open the Space so people can join.',
  'lab.emptyHistory': 'The Space timeline starts here.',
  'lab.emptySkills': 'Not looking for anyone right now.',
  'lab.noticeJoinRequested':
    'Your request to join has been sent. The Lab lead will review it — you’ll get a notification when they respond.',
  'lab.dormantBanner':
    'This Lab has been quiet for 4 weeks and is marked Dormant. Are you still working on this? Revive it with a quick update.',
  'lab.ipBanner':
    'Reminder: until the member vote settles ownership rules, anything you publish here stays yours. Publish artifacts thoughtfully.',
  'lab.skillGapBannerLead':
    'You’ve been looking for {skill} for over a week. Want to widen the net or refresh the ask?',
  'lab.crossPostedFrom': 'Cross-posted from {name}',
  'lab.candidateHandoffNote':
    'This puts the Lab forward as a Venture Candidate — a hand-off marker. Investment tools come later.',
  'lab.sprintCountdown': { one: '{count} day left in this sprint', other: '{count} days left in this sprint' },
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
  'lab.eventPromoted': 'Promoted to Lab',
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
    'One box for the whole community: find people by any spelling (Maxamed or Mohamed), businesses by name or what they do, Spaces to join, and Madal posts.',
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

  // Capital / Maal (§6/§17/§27). New launch-floor namespace — a trust surface.
  // Canonical terms Maalgeli (Invest) / Garab (Co-sign) are NOT redefined here;
  // reuse term.maalgeli / term.garab / action.garab*.
  // Index + entry
  'capital.indexTitle': 'Capital',
  'capital.indexSubtitle': 'Ventures the community is building and backing.',
  'capital.labsEntryLink': 'Explore Capital',
  'capital.filterAll': 'All',
  'capital.fromLab': 'From',
  'capital.emptyTitle': 'No Candidates yet',
  'capital.emptyBody':
    'A Candidate is a venture a Lab has put forward for backing. When Labs submit theirs, they show up here.',
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
  'capital.submitHint':
    'Submitting opens a 7-day Supporter vote and sends it to reviewers.',
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
  // Supporter governance vote
  'capital.voteHeading': 'Supporter vote',
  'capital.voteSignalNote':
    "A non-binding community signal — it guides, it doesn't decide.",
  'capital.voteApprove': 'Approve',
  'capital.voteReject': 'Reject',
  'capital.voteRetract': 'Retract vote',
  'capital.voteTally': '{approve} approve · {reject} reject · {total} total',
  // Interests bar (Garab / help / Maalgeli)
  'capital.interestHeading': 'Back this venture',
  'capital.signInToEngage': 'Sign in to back this venture',
  'capital.cosignCount': { one: '{count} co-sign', other: '{count} co-signs' },
  'capital.cosignDone': 'Co-signed',
  'capital.canHelp': 'I can help',
  'capital.canHelpDone': 'Offered to help',
  'capital.maalgeliHint': 'Opens the Xidig Venture Fund.',
  'capital.regionGatedNotice':
    "Investment features are available to Somalia-region members. You're seeing the informational view.",
  'capital.exploreFundInfo': 'You can still explore the Xidig Venture Fund.',
  // Region attestation modal
  'capital.attestTitle': 'Confirm your region',
  'capital.attestBody':
    'Investment intent is available to members based in Somalia. Please confirm before continuing.',
  'capital.attestCheckbox': 'I confirm I am based in Somalia.',
  'capital.attestConfirm': 'Confirm',
  // Venture fund modal (fund-first funnel)
  'capital.fundTitle': 'Xidig Venture Fund',
  'capital.fundIntro':
    'Register your interest in the fund. This is the primary way to back ventures on Xidig.',
  'capital.fundMessageLabel': "Anything you'd like the fund to know (optional)",
  'capital.fundExpressCta': 'Register fund interest',
  'capital.fundInterestRecorded':
    'Your fund interest is recorded. The team will be in touch.',
  'capital.fundSecondaryToggle': 'Also flag interest in this specific Candidate',
  'capital.candidateInterestLabel': 'Note for this Candidate (optional)',
  'capital.candidateInterestCta': 'Flag interest in this Candidate',
  'capital.candidateInterestRecorded':
    'Noted — your interest in this Candidate is recorded.',
  'capital.securitiesDisclaimer':
    'Nothing here is an offer of securities; v1.0 is intent capture only.',
  // Venture timeline
  'capital.timelineHeading': 'Venture timeline',
  'capital.timelineCreated': 'Created',
  'capital.timelineSubmitted': 'Submitted for backing',
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
    'Post wins, ask for help, find people and businesses, follow Labs, message members, and back what the community is building — in one bilingual, low-data app.',
  'marketing.seeProduct': 'Explore what’s inside',
  'marketing.groupsTitle': 'Everything your groups are missing',
  'marketing.groupsBody':
    'WhatsApp is great for quick messages — Xidig gives the community memory. Profiles, search, public posts, business listings, project spaces, and DMs that don’t disappear into the scroll.',
  'marketing.groupsKeep':
    'Keep WhatsApp for family chats. Xidig is the Somali community you can search, follow, build with, and come back to.',
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
  'marketing.blockCapitalTitle': 'Back what’s being built',
  'marketing.blockCapitalBody':
    'Co-sign promising ventures, offer help, and follow build-in-public timelines. Investment-intent features are region-gated and intent-only — no live financial flows.',
  'marketing.blockLiteTitle': 'Built for our internet',
  'marketing.blockLiteBody':
    'Somali and English from day one. Lite mode for slow connections — images, maps, and embeds load only when you tap.',
  'marketing.blockOwnedTitle': 'Community-owned, not algorithm-owned',
  'marketing.blockOwnedBody':
    'Transparent moderation, visible rules, member governance — and no engagement-bait ranking. What you follow is what you see.',
  'marketing.finalCta': 'Come home to the Somali social app.',
  'marketing.honestyTitle': 'Real by default',
  'marketing.honestyBody':
    'No invented members, no fake numbers, no staged screenshots. What Xidig shows is real member activity — and any number on this page is a real one.',
  'marketing.reportsTeaserBody':
    'Community-compiled research on the Somali economy and diaspora — cited, honest, and free to read.',
  'marketing.membershipTeaserBody':
    'Free to join. Supporter membership — around $1/month — unlocks Lab creation and governance votes.',

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
  'marketing.productTrustTitle': 'Trust & verification',
  'marketing.productTrustBody':
    'Identity, community, and business verification badges; human moderation with appeals; and a low-bandwidth Lite mode that respects every connection.',
  'marketing.productBetaNote': 'Xidig is in private beta. Request access and we’ll save your founding spot.',

  // /labs and /capital signed-out teasers (replaced by live public
  // directories in Phase B — until then these explain, never fake)
  'marketing.labsTeaserTitle': 'Labs — build in public',
  'marketing.labsTeaserBody':
    'A Lab is a small team building openly: a charter, weekly updates, milestones, and an honest dormant flag when life happens. Strong Labs can put a venture candidate before the community.',
  'marketing.labsTeaserNote':
    'Every public Lab already has a shareable page. The full Lab directory opens here soon.',
  'marketing.capitalTeaserTitle': 'Capital — community-backed ventures',
  'marketing.capitalTeaserBody':
    'Venture candidates rise from Labs, get reviewed in the open, and face a member vote. Today Xidig captures intent only — there are no live financial flows.',

  // /about
  'marketing.aboutTitle': 'About Xidig',
  'marketing.aboutStory1':
    'Xidig means star. We are building the place where the Somali nation’s builders — at home and across the diaspora — find each other and build together.',
  'marketing.aboutStory2':
    'Talent is everywhere in our community; trust and discovery are not. Xidig is member-owned infrastructure for both: a public square, build-in-public workshops, a business directory, and a community that backs its own.',
  'marketing.aboutStory3':
    'We build in public, we don’t fake numbers, and we design for a 2G connection in Mogadishu first.',
  'marketing.aboutCapitalTitle': 'How Capital works',
  'marketing.aboutCapitalBody':
    'Ventures start as Labs, become candidates, and are reviewed and voted on by members in the open. Today this is a pipeline and intent capture — not a fund, and not an offer of investment.',
  'marketing.aboutRolesTitle': 'Roles, not careers',
  'marketing.aboutRolesBody':
    'Xidig has no hiring page. Community roles — moderators, verifiers, mentors — are earned and appointed from within the membership.',
  'marketing.aboutContactBody': 'Questions, press, or partnerships: reach us through the contact page.',

  // /membership
  'marketing.memberTitle': 'Membership',
  'marketing.memberIntro': 'One community, two levels. Pricing is confirmed with members — not imposed on them.',
  'marketing.memberFreeTitle': 'Member — free',
  'marketing.memberFreeBody':
    'A profile and business listing, the Plaza, the directory, messages, and joining Clubs. Free stays free.',
  'marketing.memberSupporterTitle': 'Supporter — around $1/month',
  'marketing.memberSupporterBody':
    'Everything in free, plus creating Labs, putting candidates forward, and voting in community governance.',
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
    'Last updated 10 July 2026. We may update this policy; members are notified before any material change takes effect.',
  'marketing.termsUpdatedNotice':
    'Last updated 10 July 2026. We may update these terms; members are notified before any material change takes effect.',
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
    'Joining and core membership are free, and free stays free. Supporter membership — which unlocks creating Labs, putting candidates forward, and voting in community governance — will cost around $1 per month once billing goes live. Billing is not active yet; the confirmed price is announced to members before anyone is charged, and nothing is billed without your agreement.',
  'marketing.termsCapitalTitle': 'Capital',
  'marketing.termsCapitalBody':
    'Capital features record interest and intent only. Nothing here is an offer of securities; v1.0 is intent capture only. Nothing on Xidig is investment advice or a solicitation to invest, and there are no live financial flows. Full terms for any financial feature will ship before that feature goes live.',
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
  'events.statusCancelled': 'This event was cancelled.',
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
  'events.rsvpGoing': 'Going',
  'events.rsvpInterested': 'Interested',
  'events.rsvpRemove': 'Remove RSVP',
  'events.showPubliclyLabel': 'Show me as attending to other members',
  'events.attendeesTitle': 'Attendees',
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

  // Events — §27 plain-language errors
  'error.eventFull': 'This event is full. You can still mark yourself as interested.',
  'error.eventNotOpen': 'RSVPs are closed for this event.',
  'error.eventCategoryInvalid': 'Pick a valid event category.',
  'error.eventCreationNotAllowed':
    'Event hosting is open to Lab organizers, verified businesses and moderators for now.',

  // Events — notification copy
  'notif.eventRsvp': '{name} RSVPed to your event',
  'notif.eventRsvpBundle': '{count} people RSVPed to your event',
  'notif.eventCancelled': 'An event you RSVPed to was cancelled',
  'notif.eventReminder': 'An event you RSVPed to starts within 24 hours',

  // Front door — homepage "next up" featured event card (renders only when a
  // real upcoming public event exists; zero events = block absent)
  'marketing.nextEventTitle': 'Next up',
  'marketing.nextEventCta': 'See the event',
} as const satisfies Record<string, Message>;

/** Every valid message key, derived from the English dictionary. */
export type MessageKey = keyof typeof en;
