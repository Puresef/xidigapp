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
  'action.editProfile': 'Edit profile',
  'action.shareWhatsApp': 'Share on WhatsApp',
  'action.copyLink': 'Copy link',
  'action.linkCopied': 'Link copied.',
  'action.viewOnMap': 'View on map',

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

  // --- Profile & directory (§27) ---
  'error.handleTaken': 'That handle is taken. Try a different one.',
  'error.handleInvalid':
    'Handles use 3–30 lowercase letters, numbers, or underscores — like maxamed_a.',
  'error.profileIncomplete': 'Finish setting up your profile first — it only takes 2 minutes.',
  'error.duplicateListing':
    'A listing with this name already exists nearby. Is this your business? Claim it instead.',
  'error.listingLimit':
    'You’ve added 2 listings this week — that’s the limit for now. You can add more next week.',

  // Onboarding — first-session checklist (PRD §20)
  'onboarding.completeProfile': 'Complete your profile',
  'onboarding.pickLanes': 'Pick your lanes',
  'onboarding.followThree': 'Follow 3 builders',
  'onboarding.firstPost': 'Write your first post',
  'onboarding.setPassword': 'Add a backup password',
  'onboarding.title': 'Welcome to Xidig — let’s get you set up',

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
  'auth.termsAccept': 'I agree to the Terms of Service and Privacy Policy.',
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

  // Accessibility labels (screen-reader only)
  'a11y.mainNav': 'Main navigation',
  'a11y.map': 'Map',
  'a11y.removeRow': 'Remove row',

  // Following feed on Home (§13 — Phase 1 feed = new listings from people you follow)
  'feed.title': 'Following',
  'feed.empty':
    'Nothing here yet — follow builders in the Suuq and their new listings will show up here.',
  'feed.newListingFrom': 'New listing from {name}',

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
  'suuq.anyOption': 'Any',
  'suuq.noResults': 'No results. Try a shorter spelling or fewer filters.',
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
} as const satisfies Record<string, Message>;

/** Every valid message key, derived from the English dictionary. */
export type MessageKey = keyof typeof en;
