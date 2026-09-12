> **Repo copy of the PRD Relook, the canonical product direction.** Implementation still requires a bounded owner dispatch for each slice (§2, §24.0); this file is not blanket permission to build. On 12 Sep 2026, at the owner's request, it replaced the repo's v1.0 PRD. The repo copy of v1.0 is preserved as a historical reference at [`docs/archive/prd-v1.0-standalone.md`](docs/archive/prd-v1.0-standalone.md), which ends with a crosswalk recording what happened to each of its sections. The Notion v1.0 PRD page is retained, not archived or deleted, for implementation history, prior assumptions and lessons learned.
>
> - **The owner text is verbatim**, from the title to the end of §25, taken from the Notion export of 12 Sep 2026 (sha256 `e17310e0…`). Notion remains the owner's editing surface. On a re-export, replace that span and keep this note and Appendix A.
> - **Appendix A** (after §25) is a repo addendum. It holds the learnings carried from v1.0, filtered for this direction (CF-01 to CF-62), the owner's 12 Sep rulings on search and Ask states, and the decisions the owner is keeping open (A.0). Where Appendix A and the owner text differ, the owner text wins.
> - **Citations.** Cite this PRD by D-ID, section or CF item, e.g. `PRD D-08`, `PRD §17`, `PRD CF-27`. Code comments and docs written before 12 Sep 2026 that cite `PRD §N` without a D-ID (for example `PRD §21` on the API layer or `PRD §27` on errors) use **v1.0 numbering** and resolve to the archive, not to this file.
> - Agent-side execution records (audit, reconciliation, doctrine and plan docs in `docs/`) are evidence and history, not product authority (§25).

# PRD Relook — Xidig: Social & Collaboration Platform

<aside>
🧭

**Status: canonical product direction; implementation still requires bounded dispatch.** Use this latest owner-edited page, including the decision contract, as the active product authority for reconciling docs, Claude Code handoffs, UI copy and implementation plans. Older PRD/spec/tracker language remains historical context unless this page explicitly preserves it. Retain sound foundations and selectively refactor or replace conflicting systems; no automatic restart and no cosmetic-only patch plan. R-01 is explicitly approved. This status does not grant blanket implementation approval or validate provisional values and legal arrangements. §24 distinguishes TARGET, PARAMETER, GATED and DEFERRED. Claude may challenge a choice with evidence but must not substitute or activate a different policy.

Prepared September 7, 2026. Scope: Xidig only. Current baseline: [PRD — Xidig App v1.0 (Standalone)](https://app.notion.com/p/PRD-Xidig-App-v1-0-Standalone-8bbe64d6a1b8428d85aa77293cd06739?pvs=21).

</aside>

## 1. Product summary

**Working one-liner:** A place for Somalis to connect, share, and build together.

Xidig is a Somali-first social home and project-collaboration platform. People can belong, talk, share culture, organise groups, discover people and businesses, and work together without needing to become founders, investors, paid members, or public personalities.

The social experience and collaboration experience are equally legitimate destinations. Their connection creates value: a conversation can become a group, a group can start a project, and project progress can enrich the community. None of these transitions is mandatory.

The long-term ambition remains substantial: member ownership, trusted contribution records, diaspora-local collaboration, business and talent discovery, partner programmes, project assurance, ventures, appropriate funding pathways, and possible expansion into adjacent communities and markets. These are earned extensions of a useful platform, not prerequisites for ordinary participation.

**Core promise:** Come for people and belonging. Stay because organising life and work together is better here. Pursue bigger possibilities when you choose.

## 2. Decision authority and document use

### Approved now

**R-01 — No react-to-reveal counts in the current product scope.**

- Ordinary social reaction counts, wherever displayed, are available without first reacting. Adding, changing, or removing a reaction does not unlock or relock access to counts.
- Remove the interaction gate from current requirements, prompts, and acceptance tests. Do not replace it with a click-to-reveal requirement.
- Retain the idea only in the future-options section. No new experiment infrastructure or speculative implementation is required now.
- Formal governance ballots and independent project-review tallies are separate mechanisms. Their approved blind-submission or hidden-live-results protections are not removed by this decision.
- Documentation changes do not prove the production implementation has changed. Claude must verify the app and remove any active gate through the normal reviewed implementation process.

### Canonical direction and specified implementation baseline

The owner has accepted this Relook as the canonical product direction and requested enough detail that Claude does not choose a different product during audits, planning or implementation dispatches. §24 supplies the concrete baseline and the remaining stop-and-ask gates. Treat TARGET items as the product direction, while PARAMETER, GATED and DEFERRED items retain their stated limits. This is not an assertion that every proposed price, legal arrangement or operational promise is finally adopted. §24's specific rules control over earlier tentative wording; unresolved contradictions must be flagged rather than silently merged.

Compare against this current page, not an earlier generated draft or chat summary. Do not restore wording the owner removed. Omission is not approval of the opposite behaviour. Engineering implementation methods may be proposed, but changes to product behaviour, rights, parameters or scope need an explicit ruling.

### Activation rule

This owner-edited PRD is now the target product direction; existing code is evidence of current behaviour, and older specs/trackers explain history and dependencies. Identify conflicts rather than silently combining incompatible rules. Before implementation, review the evidence against §23 and §24, resolve the gates affecting the slice, approve that bounded implementation scope, and reconcile only the affected canonical specs and tracker items. Preserve both trackers and existing work history; do not bulk reset, delete or archive them. This document is the active product authority, but not a blanket replacement for specialised operational, legal, privacy or native-language specifications where §24 still marks a gate.

## 3. Product principles

1. **Belonging is an outcome.** Reading, socialising, and staying connected do not need to become work to be valuable.
2. **Collaboration must deliver practical utility.** Make responsibility, context, progress, and next steps clear before adding elaborate evidence workflows.
3. **Progressive structure.** Offer depth when needed; do not force every group into an enterprise or venture process.
4. **Quality over phase completion.** Complete, reliable journeys matter more than ticking a feature inventory. Simplicity is not permission for poor craft.
5. **Trust claims must be bounded.** Identity, skill, work completion, popularity, and financial readiness are different claims.
6. **Fair access and user agency.** No reputation-weighted binding votes, compulsory productivity, purchased credibility, or forced reactions to inspect counts.
7. **Private means private.** Discovery, public sharing, group membership, and join policy are separate controls.
8. **Full capability across devices and data modes.** Preserve meaning and actions while adapting presentation and resource use.
9. **Somali-first, not permanently hardcoded.** Strong community positioning with clean language, region, and taxonomy boundaries.
10. **Evidence before expansion.** Preserve affordable extension points; do not build every imaginable capability behind a flag.
11. **Partners accelerate; they do not define the platform.** Maintain independence from any government, institution, provider, or faction.

## 4. Audiences and successful journeys

Intent is optional, changeable, and non-exclusive. A member can be a student, friend, helper, and project lead at the same time.

| Audience / intent | First useful action | Continuing value | Success moment |
| --- | --- | --- | --- |
| Social explorer | Browse permitted posts or join an interest group | Conversation, culture, connections, events | A worthwhile interaction or a group they want to return to |
| Student / learner | Ask a question or find a beginner-friendly activity | Help, peers, learning opportunities | Understand something, receive useful help, or contribute voluntarily |
| Job seeker | Add relevant skills and availability | Discoverable work examples and introductions | A relevant contact, referral, or opportunity |
| Helper / expert | Answer an Ask or offer limited availability | Useful relationships and contextual credit | Help accepted without pressure to become permanently available |
| Project team / builder | Start a project or join an existing team | Tasks, decisions, resources, progress | A coordinated next step and a completed outcome |
| Business owner | Create or claim a listing | Discovery, contact and community participation | A useful inquiry or repeat connection |
| Diaspora supporter | Follow people or projects and share useful work | Connection to local activity and chosen causes | Support that the recipient finds useful; no assumed investment |
| Organisation / partner | Browse public proof or submit a scoped brief | Programme, recruitment, or collaboration support | A qualified conversation or a successful narrow pilot |

## 5. Scope and sequencing

### Complete core experience

- Account access, recovery, lightweight profiles and privacy controls.
- Ordinary social posting, comments, reactions, follows, saves and safe sharing.
- Structured Asks and polls where their extra mechanics are useful.
- Unified Spaces for social groups and project teams.
- Project tasks, responsibilities, linked resources and bounded attachments, updates, milestones and decisions; upload limits and security gates in D-02/D-04.
- 1:1 messaging and small group conversations, with requests/invitation consent, notifications, blocking and reporting; detailed safety and release gates in D-03.
- Discovery of people, Spaces, businesses and relevant events.
- Basic event creation, RSVP, changes/cancellation and reminders, with appropriate visibility.
- Moderation, support, appeals, consent and operational controls alongside each released feature.
- Complete reviewed EN/SO core journeys, responsive design and dignified data-saving behaviour.
- Public, permission-safe pages and a focused website with Library, Guide and Support.

### Sequencing and activation gates

Small group conversations and bounded project attachments are included in the specified core target, not left for Claude to omit as optional product choices. They can ship in staged slices only after their permission, safety and operational gates pass; their release date is not dictated by this document.

- Deeper independent attestations, advanced administration and partner reporting require a concrete workflow and bounded approval.
- Paid resource entitlements and public pricing remain gated by provider eligibility, economics and entitlement-transition review. D-02 supplies the exact provisional values to assess, not permission to start billing.

### Not required for the core release

Live investment, escrow, payroll, automatic equity conversion, tokenisation, a general gig marketplace, property brokerage, a course platform, a multi-tenant enterprise suite, complex graph visualisations, compulsory streaks, custom permission builders, a general-purpose external write API/MCP programme, or native apps on a predetermined version schedule.

Features already implemented are not automatically deleted because they appear outside this proposed core. Audit usage, safety, dependencies and maintenance cost; preserve, simplify, isolate, or retire each through a deliberate migration.

## 6. Information architecture

### Audit target navigation — D-01

- **Home:** one social home, with Following and Community views. Following stays reverse-chronological; Community uses transparent discovery/filtering and editorial highlights.
- **Spaces:** Groups and Projects, including My work and next actions.
- **Discover:** people, Groups, Projects, businesses and Events, with type filters and an optional map mode.
- **Messages:** requests, direct conversations and small group conversations.
- **Profile/settings:** through the avatar; notifications through a consistently accessible control.
- **Create:** a prominent contextual action, not a fifth primary destination.

Use four mobile primary destinations in that order. Consolidate Home/Plaza at the navigation level and relocate useful personal-dashboard content to Spaces/My work. Desktop may expose richer management/navigation without reducing mobile capability. Usability findings can support a proposed amendment, not a unilateral alternative.

Map is inside Discover. Capital/readiness is contextual rather than a universal destination. Events are browsable through Discover and their host pages. Preserve old permalinks and permission-safe redirects. Internal identifiers need not change with display labels. D-01 states the remaining initial-feed-default question and migration checks.

## 7. Accounts, identity and onboarding

### Requirements

- Permit lightweight entry: verified access method, display name/handle, essential agreements, and understandable privacy defaults. Do not require skills, employment intent, exact location or a completed professional profile to socialise.
- Retain functioning email/password, magic-link and phone-OTP paths unless testing establishes a better supported set. Co-equal backend support does not require equal prominence in every login screen.
- Benchmark deliverability, cost, accessibility, account linking and recovery across relevant local/diaspora devices and providers.
- Explain recovery for phone-only and email-only members. A password prompt is useful only if the resulting login and recovery path actually works for that account.
- Require reauthentication for sensitive account linking, recovery and ownership transfer. Do not merge accounts based on unverified matching identifiers.
- Support secure sessions, rate limiting, enumeration-resistant errors and stronger protection for privileged operators.
- Give users a clear language choice and remember it. Engineering source language does not dictate the best first-use language.
- Offer optional intent selection and contextual setup after first value. Do not force a multi-screen ceremony, three follows, or an introductory post.
- Make contact methods, discoverability and location precision separately controllable. Do not expose precise personal locations by default.

### Acceptance

A person can join for social use without professional fields; recover using an actually available method; change language and privacy settings; skip optional onboarding; and reach relevant content without duplicate routing questions.

## 8. Social feed, posting and reactions

### Posting

- **Post** is the default unstructured composer for text, photos, cultural moments, jokes and conversation.
- Offer Ask, Poll, Event and project-update structure when needed. Intro and Win can be helpful templates or optional labels, not mandatory categories for every thought.
- Preview the audience before publication. Edits, deletion and reporting have clear behaviour and permissions.
- Support accessible media descriptions, upload validation, compression, metadata stripping, and safe embed fallbacks. An unsupported embed must remain a usable link.
- Keep social expression lively while prohibiting harassment, scams, doxxing, incitement and other clearly defined harms. Do not equate ordinary disagreement with abuse.

### Feeds and discovery

Following remains reverse-chronological and permission-safe. Discovery starts with explainable filters, relevant categories, curated highlights and transparent sorts. Any later recommendation system needs a separately approved objective and safety evaluation; it must not silently optimise outrage or time spent.

### Reactions — approved removal

- Existing reaction options can remain; adding/removing a reaction communicates the member's response.
- Display available reaction counts without requiring a reaction. Do not show locked-count placeholders or a reveal reward.
- Removing the member's reaction updates the count but does not hide it.
- Count visibility must not grant access to private content or reveal a restricted participant list.
- Do not fabricate counts, use them as work-quality proof, or alter feed-ranking policy merely because counts are visible.
- Revisit the reaction vocabulary through cultural comprehension testing rather than treating the current taxonomy as immutable.

### Asks and polls

Asks retain a clear open/answered/closed lifecycle with helper credit and useful stale-item reminders. Support corrections to mistakes through an explicit safe path; an accidental tap should not permanently corrupt a record. Polls clearly distinguish casual opinion from formal binding governance. Their result-visibility rules are owned separately from social reaction counts.

### Acceptance

A member can post an ordinary social update without selecting a productivity type. Users with the same access can inspect displayed counts before reacting, after reacting, and after withdrawing a reaction. No reveal prompt or gate remains in the active social flow. Block/mute and content permissions remain effective in feeds, previews and counts.

## 9. Spaces and project collaboration

### One shared foundation, independent dimensions

A Space is a persistent home for people and activity. Do not model its entire identity as a mandatory rung in Club → Lab → Venture.

| Dimension | Proposed meaning |
| --- | --- |
| Purpose | Social community, project team, or another explicitly supported use |
| Enabled tools | Discussion, resources, tasks, milestones, events, decisions |
| Activity state | Active, paused, archived; projects can also be completed |
| Visibility | Private, members-only, public, with precise audience definitions |
| Discoverability | Listed/unlisted, constrained by visibility |
| Join policy | Open, request, invitation |
| Readiness assessment | Optional project-specific claim with evidence, review date, status and expiry |

Purpose and tool changes preserve membership and history. A social group is complete as a social group. A community can host or link to a project without converting all its members into a venture team.

### Collaboration essentials

- Minimal project brief: purpose, intended outcome, lead/contact, participants and next milestone. Rich charters are optional unless a specific review programme needs one.
- Tasks: title, description, status, assignee, optional due date, links/resources and discussion. Assignment acceptance, reassignment and completion responsibility must be clear.
- Project overview answers: what are we doing, who owns the next step, what is blocked, and what changed?
- Updates and decisions preserve relevant context and attribution. Team cadence is chosen, not globally forced.
- Resources support reliable links and bounded attachments as the target core. D-02/D-04 define provisional allowances, a 20 MB per-file cap, allowed categories and security gates. No unconditional 1GB-per-Space promise or full version-history UI is implied; release waits for approved access, processing and quota behaviour.
- Work records distinguish self-report from lead sign-off and independent attestation. Preserve correction/reversal history without implying payment or ownership.
- Use Owner, Admin, Member and Observer as the role baseline. Project lead/reviewer/assignee is a responsibility, not automatic administration authority. Separate platform moderation from Space administration. The exact action matrix is gated in D-04; no guessed permissive matrix or open-ended permission builder.
- Consent and destination permissions govern cross-posts and inter-Space collaboration. Linking Spaces must not merge their private audiences.

### Quiet, paused and completed work

A missed update can trigger a private check-in, with 28 days as the provisional default and owner-controlled cadence/pause. It must not transform a Space's purpose or imply wrongdoing. Readiness is separate, with a provisional 90-day review for time-sensitive claims under approved criteria. Overdue means needs review, not untrustworthy. Preserve historical milestones. D-05 defines audience, state, migration and readiness gates.

### Acceptance

A social group operates without charter, countdown or venture pressure. A project team can assign work, find resources, record a decision and complete an outcome. Purpose changes do not lose history. Private Space identity and content are not exposed through a compulsory public landing page. Review expiry does not erase past achievements.

## 10. Messaging, notifications and events

- 1:1 messaging uses request-to-chat for first contact, with accept/decline, block and report.
- Show sending, delivered-to-service and failed/retry states accurately. Do not label a message read without an implemented consent-aware read-receipt policy.
- Small group conversation is a core target separate from administering a Space: provisionally up to 20 participants, explicit invitation acceptance, history from joining by default, no silent additions and read receipts off by default. D-03 specifies the access/retry rules, deferred disappearing messages and remaining departure, rejoin and administration gates. Audit shared infrastructure without treating Spaces as a reason to omit chat.
- Messages must survive transient failures without duplicate sends. Recovery must recheck membership and authorisation.
- Notifications use readable unread counts, grouping, preferences, quiet controls, and useful deep links. Do not hide useful state in the name of calm design; do not manufacture urgency.
- Push/email delivery respects consent, relevance and privacy. Sensitive message content should not be exposed by default in public previews.
- Events support host, location or meeting link, timezone, visibility, RSVP, capacity where necessary, changes and cancellation. Private attendance lists stay private.
- Milestone celebrations and calendar rhythms are optional. Streaks, founding scarcity and awards do not grant governance or professional credibility.

## 11. Discovery, Directory and Map

- Discover people, businesses and Spaces through relevant type, interests, skills, availability, language and location filters.
- Declared skills are not verified skills. Paid membership does not masquerade as quality ranking.
- Test search against real Somali spelling/transliteration variants and ambiguity. Use curated aliases where appropriate; do not merge distinct people merely because names are similar.
- Existing Meilisearch can remain if it meets measured needs. Compare alternatives only against search quality, operations, cost and access-control requirements.
- Business location can use pin-drop and landmark text. Personal location should support coarse geography and remote/timezone matching without exact coordinates.
- Ownership claims, duplicates and listing disputes have explicit review and appeal paths. Unclaimed listings cannot look owner-verified.
- List-first map access remains usable without tile downloads. A map is an enhancement, not a gate to contact information.
- Public listing/profile sharing is permission-aware and opt-in where personal data is involved. Revalidate content in search results and invalidate stale indexes/caches after access changes.
- Aggregate intelligence requires sufficient real data, a documented method and suppression of small identifiable groups. Do not promote sample counts or readiness checklists as proven outcomes.

## 12. Trust, verification and reputation

### Risk-proportionate checks

Ordinary social participation must not automatically require a recorded face-and-ID call. Define evidence requirements by risk: account access, community participation, privileged moderation, business ownership, project evidence, and any future regulated action.

Each verification claim records what was checked, method, issuer/reviewer, date, scope, status and expiry/review conditions. Public wording distinguishes identity checked, business ownership checked, community vouched, skill evidenced, and task completion attested. None is a blanket guarantee of safety, competence or investment quality.

Before collecting sensitive verification material, approve necessity, legal basis, retention, access controls, incident response and an accessible alternative. Prefer retaining the outcome rather than raw evidence when justified. A fixed 24-month recording policy is not inherited without review.

### Community vouching and anti-gaming

Three vouches are not treated as conclusive uniqueness proof. Assess colluding circles, paid accounts, compromised verifiers, duplicate recovery paths, established-group exclusion and disparate access. Define audit, challenge and revocation procedures. Distinguish community recognition from privileges that require stronger checks.

### Contextual reputation

- Prefer attributed useful work, accepted help, relevant evidence and documented responsibilities over posting/reaction volume.
- Social popularity does not create work competence, money rights or binding vote weight.
- Consequential eligibility decisions have understandable reasons and an appeal route. Private abuse-detection details need not be exposed to attackers.
- Preserve historic work; separate its record from current availability or recency-sensitive signals.
- Correct fraudulent or mistaken credit through auditable reversals. Protect newcomers from permanent incumbent advantage.
- No automatic punitive decision based only on a score or volume of reports.

## 13. Safety, privacy and operations

Safety is part of each vertical slice, not a later phase after risky features launch.

- Publish enforceable community rules covering harassment, incitement, scams, doxxing, impersonation, exploitation and misleading financial claims. Provide context-sensitive enforcement rather than blanket suppression of social conversation.
- Ship report, block, mute, urgent escalation and an appeal to another authorised reviewer alongside each relevant feature.
- Define moderation coverage, escalation ownership and realistic response targets before making response-time promises.
- Routine Space admins do not receive an unrestricted shadowban tool. Any covert anti-abuse measure requires a narrowly defined purpose, authorisation, audit and review policy.
- Keep sensitive reports, verification records, private messages and precise locations out of public governance logs and analytics payloads.
- Define visibility, discoverability and join policy independently. Prohibit invalid combinations that would leak private identity or membership.
- Publish data export, deletion, retention and exception rules by category. Do not assume anonymising all content always satisfies deletion obligations.
- Append-only operational evidence can coexist with privacy obligations through controlled access, minimised payloads and a reviewed retention design. Immutability is not a licence to retain all personal data forever.
- Initial-release audit target is 18+, with proportionate reviewed age assurance and underage-report handling. A 16–17 pathway remains deferred pending dedicated safeguarding. Do not assume a checkbox settles obligations, collect everyone's ID by default, or automatically delete legacy accounts; follow D-09.
- Enforce permissions across DB/RLS, APIs, storage, realtime, search, notifications, previews, exports and caches.

## 14. Membership, sustainability and governance

### Commercial audit target — D-02

Free participation includes meaningful social use and enough group/project collaboration to complete a real outcome. Basic Space creation should not depend solely on payment; use proportionate abuse and resource limits instead.

Xidig Plus is patronage plus resource allowances and approved convenience—not purchased trust. D-02 sets the provisional audit package: 3 versus 10 active owned Spaces, 250 MB versus 2 GB resource allowance per Space, and USD 3/month or USD 24/year for Xidig Plus. Assess these exact values; do not silently revert to the historical USD 1/month, the old Supporter label, or invent another price/name. Economics, provider eligibility, naming comprehension and downgrade/overage policies remain activation gates.

Organisations may pay for programme administration, reporting, onboarding support and service levels. Do not sell individual private data or fund the model through undisclosed ranking advantages.

Validate provider acceptance for the actual entity, jurisdiction and service before promising card or mobile-money billing. Manual operations do not remove contractual, financial or data obligations.

### Member-ownership ambition

Preserve a path to genuine member ownership and one eligible verified member = one binding vote. Distinguish legal membership from a commercial subscription. Evaluate waivers or other fair membership access alongside the legal structure rather than letting billing alone define the electorate.

D-07 specifies the future governance audit model, including provisional 90-day tenure, a 25-eligible-member pilot minimum and voting classes with explicit planning parameters. Binding activation still requires approved legal membership, anti-Sybil checks, eligibility snapshots, minority protections, an affirmative-vote-floor decision, appeals and founding transition. Older T1–T5 or paid/activity-gate rules are historical inputs, not controlling defaults.

Keep independent submissions and hidden live tallies where needed. Ordinary reaction-count visibility does not change formal voting rules. Paid Xidig Plus status, work units and reputation never multiply a binding vote.

Publish platform-level decisions with privacy-safe summaries. Delegate routine operations appropriately; not every product change needs a referendum. Describe the platform as legally member-owned only when the applicable rights genuinely exist.

## 15. Project IP, ventures and future funding

### Before meaningful collaborative work

Provide reviewed project terms covering pre-existing IP, new contributions, permissions to reuse work, confidentiality, departures, attribution, disputes and any separate compensation arrangement. Participants explicitly accept relevant terms. A future platform vote is not a substitute for contributor consent or enforceable project agreements.

### No automatic financial conversion

Tasks, hours, work credits, reputation, endorsements, membership and expressions of interest do not automatically create equity, employment, wages, revenue share, securities or vote weight.

### Separate the platform from investment arrangements

- Ordinary use of Xidig creates no automatic platform claim on a project's equity.
- Incubation, funding or a genuinely platform-originated venture can involve separately negotiated, explicit terms reflecting actual contribution, risk and capital.
- Do not impose a universal 10% terminal fund floor or inherited high starting stake as the default condition of collaboration.
- Preserve the community fund ambition through fair, approved arrangements rather than assuming ownership of projects born in conversations.
- The current support action remains non-financial. The audit target display labels are English “Support” and provisional Somali “Taageer.” State that support is not due diligence, a guarantee, a vote, a rating, verification, work-quality proof, ranking input or capital interest. D-10 governs copy migration; audit-only permission does not authorise changing deployed labels.

### Capital activation gate

Core use remains non-transactional. Project-readiness information is educational and bounded; funding invitations or investment-interest capture require separate review of their actual content and distribution, even without money movement.

No compulsory fund-first funnel in the proposed model. If funding becomes available, present relevant options neutrally with clear conflicts and terms.

Before any activation: confirm entity and rights, jurisdiction-specific legal review, promotion rules, eligibility, necessary KYC/AML and sanctions controls, provider acceptance, contracts, risk disclosures, dispute/remedy arrangements, financial operations and member-governance approval. Geo-IP, profile country, self-attestation and disclaimers are technical/contextual inputs, not independent proof of compliance.

## 16. Brand, language and interaction design

### Preserve recognition

Retain Xidig, Somali Blue #0077cc, restrained Orange #FF8C00, the star/butterfly mark and Baale as working brand assets. A rebrand requires a demonstrated comprehension, recognition, legal or strategic problem—not just the possibility of future global use.

### Improve the system

- Separate brand accents from semantic status colours. Permit carefully controlled error/warning/success tokens; never use colour alone to communicate meaning.
- Give orange consistent roles. Ordinary primary action, earned recognition and warnings should not all rely on an indistinguishable orange treatment.
- Verify contrast in both light and dark themes. Premium quality comes from hierarchy, readability, interaction quality and appropriate density, not compulsory shadows or dark surfaces.
- Use the constellation as a motif. Prefer lists, chips and clear relationships when a graph would slow understanding.
- Test the logo at app-icon and small UI sizes. Avoid requiring the butterfly/star explanation to identify Xidig.
- Baale supports optional onboarding and meaningful celebration, never routine obstruction or constant ambient motion. No mascot on moderation, urgent safety, suspension or legal surfaces.
- Use one reusable component/token system for states, typography, spacing, surfaces and interaction patterns. Reuse approved assets rather than commissioning parallel variants without a clear need. Apply the locked visual direction in [Owner Amendment 01 — Visual Identity, Brand & Remaining Decisions (locked 9 Sep 2026)](https://app.notion.com/p/Owner-Amendment-01-Visual-Identity-Brand-Remaining-Decisions-locked-9-Sep-2026-a2a03b4245a34cf09947a79c71afff89?pvs=21) where it supersedes earlier UI/brand rules.
- Keep rich marketing concepts and visuals; validate their value and loading behaviour. Do not label synthetic scenes as real community evidence.

### Language

English remains the engineering source/fallback with stable language-neutral keys. Somali is a complete first-class locale, not decorative text. User language preference is independent of implementation language.

Use the English audit labels and locale-precedence rule in D-10, including Spaces/Groups/Projects, Support, Xidig Plus and Data Saver. Native-review the corresponding Somali navigation, directory, support, paid-tier, data-saving and trust labels; do not declare generated translations final. Owner clarification: until native review approves a Somali replacement, use **Data Saver** in both EN and SO UI. Labs/Warshad and Suuq are context to review, not permission to change underlying meaning. Preserve stable routes when display wording changes.

Acceptance: complete EN/SO essential journeys, no untranslated consent/safety/recovery strings, string expansion works, status is conveyed beyond colour, controls are keyboard/screen-reader accessible, and neither locale depends on text embedded in imagery.

## 17. Lite, performance and resilience

**Proposed doctrine:** same capabilities, content meaning and decision paths; presentation may adapt to the user's resource preferences. Data Saver remains a delivery mode, never a design ceiling or permission to ship an inferior product.

- Continue MediaSlot-style explicit media loading and static fallbacks. Compact placeholders are allowed when they improve use without concealing essential information or actions.
- Maps have complete list alternatives; heavy embeds do not load before the relevant consent/preference permits them.
- Respect reduced motion independently of network settings. Budget CPU, memory, JavaScript and battery as well as media bytes.
- Offer and remember user-controlled data preferences. Do not assume all users in a country need a reduced mode.
- Preserve local drafts, clear retry states and idempotent submissions where appropriate. Reconnect must revalidate permissions.
- Do not cache sensitive private data offline by default. Define offline storage, sign-out clearing and shared-device behaviour explicitly.
- Establish measurable route performance budgets against an agreed low-end Android/network test matrix before release. Record baseline and thresholds; do not call unmeasured promises acceptance criteria.
- Full mobile work capability remains required. Responsive cards, filter sheets and accessible wide-data alternatives can differ from desktop without losing functionality.

## 18. Public site, Library, Guide and Support

### Public front door

Show what people can do and browse before asking them to understand the ecosystem. Direct entry to useful public content, Join and Sign in must coexist with optional “Help me choose” routing.

Use Community · Projects · Partners · Resources as the website navigation groups, with Join/Sign in and Home through the brand. Preserve access to deeper pages through secondary navigation and contextual links. D-01 and D-13 specify app consolidation and website behaviour; usability tests may justify a requested amendment, not a silent different IA.

The Route Engine is reusable infrastructure, not a mandatory wizard on every page. Ask a question only when the answer changes the recommendation. Reuse already-provided context and allow skip, back and direct navigation. Do not require contact capture before delivering a useful result.

### Content systems

- **Library:** publishing, stories, updates, reports and research with truthful authorship, dates, methodology and relevant next steps.
- **Guide:** evergreen explanations, glossary, onboarding and product instructions.
- **Support:** issue resolution, contact routing, escalation and case confirmation.

Keep these distinct in ownership and templates, connected through shared search and related links. Safety reporting can bypass suggested articles. Support is never a marketing funnel that withholds human escalation.

### Partner and venture pages

Partners are one audience, not the centre of the platform. Specialised intake is appropriate when a complex brief needs it. Ventures and future-funding pages must clearly distinguish available capability from future ambition.

Public pages are indexable only when publication is permitted. Previews, OG cards and sitemaps must respect visibility. Use real proof or clearly labelled demonstrations; no fabricated metrics, partner logos, team histories or testimonials.

## 19. AI, integrations and partner strategy

- AI helps real people draft, translate, find context, summarise and organise. It must not simulate an active population.
- Separate demo/test data from organic activity and production claims. Any retained seed material is persistently labelled, excluded from organic traction and reputation, and subject to an approved retirement policy.
- AI participation is clearly identified. Publishing, consequential attestations and moderation decisions require appropriate human control.
- Private data sent to models follows approved consent, minimisation and provider rules. Retrieved content is untrusted and cannot authorise tool actions.
- Build internal domain operations and permission boundaries first. Expose external APIs, webhooks or MCP tools for defined real use cases, with scoped credentials, revocation, rate limits, audit and safe retries.
- Do not automatically build all write capabilities for hypothetical agents. Never give partner imports implicit permission to alter reputation, governance, payment status or public visibility.
- Prefer provider-neutral external references. Obtain consent before sharing member records or importing third-party data.
- Partner for specialist execution, compliance, payments and supply where it improves outcomes. Retain Xidig's core community and collaboration utility.
- Begin with narrow manual pilots and evaluate results before deep integration. Government is one partner class; no special access to individuals' private data by default.

## 20. Technical architecture and engineering discipline

### Working stack

Keep Next.js/React, Supabase/Postgres with RLS, Vercel and shared UI components as the working baseline. This PRD does not establish that they are uniquely optimal or authorise a rewrite. Verify the actual repository, deployment and operating costs before changing providers.

### Logical domain model — not a required physical schema

| Domain | Core responsibilities |
| --- | --- |
| Account/profile | Authentication identities, preferences, public profile, contacts, privacy |
| Community content | Posts, comments, reactions, follows, saves, audience and moderation state |
| Space | Purpose, tools, visibility, discovery, join policy, membership and roles |
| Project | Brief, milestones, tasks, updates, resources, decisions and activity state |
| Work/evidence | Attributed events, self-report/sign-off distinction, corrections and optional attestations |
| Communication | Conversations, participation, messages, requests, delivery and notification preferences |
| Discovery | Listings, categories, aliases, public projections, search and safe location context |
| Events | Hosts, timezones, audience, RSVPs, reminders and cancellations |
| Safety/trust | Reports, appeals, moderation actions, verification claims and restricted audit |
| Entitlements/governance | Separate resource capabilities, legal membership and proposal eligibility when approved |

### Build rules

- Implement a modular application with one source of business rules; avoid microservices or duplicate API logic without an operational reason.
- API-first means reusable, permission-enforced operations and stable external contracts. Internal server code need not call itself over HTTP.
- Review core entity boundaries and access policies early; evolve schema through tested migrations. Do not freeze the entire future schema before learning from working journeys.
- Use lookups/configuration for growing taxonomies and stable types for genuinely fixed states. Avoid both rigid display-string enums and universal configuration frameworks.
- Keep clean locale, region and future-market boundaries without building full multi-community tenancy now.
- Preserve cheap extension points, not speculative features. A flag controls release; it does not erase maintenance or justify collecting unnecessary data.
- Validate file/media storage, background-job retries, email delivery, search synchronisation, subscription changes and realtime access as operational systems—not just happy-path screens.
- Enforce schema constraints, authorisation, concurrency and idempotency. Client validation alone is insufficient.
- Maintain staging/production separation, secret management, backups and tested restore, monitoring, dependency maintenance and incident ownership.
- Native Expo apps remain an option triggered by measured browser limitations and user value; not an unconditional v1.2 promise.

## 21. Measurement and validation

Use separate social and collaboration scorecards. Do not require social users to generate work records to count as successful.

| Question | Proposed measure | Guardrail |
| --- | --- | --- |
| Do people find belonging? | Return cohorts, voluntary worthwhile-interaction feedback, repeat group participation | Reading and connection can be valuable without posting |
| Does collaboration work? | Time to first coordinated action, resolved blockers, completed outcomes, repeat teams | More tasks or ledger events are not automatically more value |
| Are Asks useful? | Helpful response and resolution, with contextual feedback | Accepted-answer farming and collusion monitored |
| Does discovery connect people? | Relevant contact actions and consented outcome feedback | No raw contact-click claims of jobs or revenue |
| Is the experience safe? | Severity-aware response/resolution, appeals, member confidence | Low report volume alone is not evidence of safety |
| Is it accessible locally? | Core task success, delivery/recovery, performance by tested device/locale | Minimise telemetry; do not infer identity from small segments |
| Is it sustainable? | Actual service cost, support/moderation effort, retention and paid conversion | Pricing is not declared validated before testing |

Use purpose-limited events, deduplicated server truth for important outcomes, consent-aware instrumentation and exclusion of seed/test activity. Avoid private message text, raw ID material, precise location and unnecessary personal data in analytics.

D-09/D-11/D-12 supply exact provisional operating, performance and pilot targets to evaluate. Measurement definitions, actual capacity and release commitments remain gated; no measured improvement is claimed. Do not silently invent different targets or treat an unmeasured target as a pass.

Validate the specified navigation, optional routing, free-project completion, ordinary posting, group chat, naming, recovery, privacy and Data Saver experience. Experiments need a hypothesis, audience, success/harm measures, owner and stop condition. They test the selected audit target; they do not delegate product choice or reintroduce react-to-reveal.

## 22. Delivery and acceptance gates

### Gate 0 — Baseline and adoption

Inspect the actual app, migrations, tests and agent handoffs. Classify each proposed change as already satisfied, missing, conflicting, or requiring migration. Resolve privacy, membership, IP, age policy and financial-posture blockers before affected use. Approve the target rather than treating this document as blanket deployment permission.

### Gate 1 — Safe social value

Account/recovery, privacy, ordinary posts, follows, reactions without reveal gating, comments, requests, moderation and language/data modes form one complete path. Validate on real target devices with real participants; do not populate success metrics with generated accounts.

### Gate 2 — Useful groups and projects

Social Spaces work without charters. Teams coordinate tasks, resources, updates and decisions. Verify join policies, role boundaries, private discovery, handover, paused/completed states and cross-Space sharing. Add events and group messaging only with their corresponding safety/visibility coverage.

### Gate 3 — Discovery and public front door

Permission-safe profiles/listings/Spaces, search, map alternatives, public sharing, optional route finder, and connected Library/Guide/Support. Private content must not leak through cached previews, indexes or email.

### Gate 4 — Operate and learn

Moderation coverage, recovery support, incident and restore drills, meaningful analytics, scoped community launch and sustainable resource limits. Do not let decorative completeness block a good core; do not use launch pressure to waive safety or quality failures.

### Gate 5 — Earn the extensions

Activate deeper work assurance, partner services, advanced paid features, native apps and eventually funding only when evidence and the required legal/operational conditions justify them.

### Cross-cutting release checks

- [ ]  Ordinary counts are visible without reacting; withdrawal never relocks counts.
- [ ]  Formal ballot/review confidentiality is unchanged by the reaction amendment.
- [ ]  Both social-only and project-only journeys are complete and understandable.
- [ ]  Authorisation negative tests cover direct API access, storage, realtime, search, exports, previews and notification payloads.
- [ ]  EN/SO, keyboard, screen reader, touch, reduced motion and data-saving paths pass review.
- [ ]  Failure/retry, duplicate action, stale membership and concurrent edit cases are handled.
- [ ]  No promised financial, ownership, partner or identity assurance exceeds actual capability and rights.
- [ ]  Each released risky feature has reporting, recovery/appeal where applicable, and an operator owner.
- [ ]  Migration preserves existing content, links and privacy; rollback is defined.
- [ ]  Known exceptions are explicit and approved, not hidden behind a Done status.

## 23. Decision changes and preserved options

This is an audit-baseline map, not blanket implementation approval. Detailed meanings and gates are in §24.

| Existing direction | Specified audit target | Authority / gate |
| --- | --- | --- |
| React before seeing counts | Counts without reacting; no reveal gate | R-01 approved; implementation/deployment separately dispatched |
| Social participation feeds venture progression | Social and collaboration are complete equal purposes | Accepted direction |
| Club → Lab → Venture universal identity | Independent purpose, tools, activity, audience and readiness | D-05 target; migration and assessment-policy gates |
| Paid Lab creation / deep participation | Free meaningful collaboration; paid resource/convenience value under Xidig Plus | D-02 target; provisional quotas/pricing, naming and billing gates |
| Paid-tier status defines electorate | Governance membership distinct from paid Xidig Plus subscription | D-07 target; legal and constitutional activation gates |
| Routine recorded ID calls / inherited retention | Risk-proportionate bounded claims and minimised data | D-06 target; privacy/evidence gates |
| Always-public Space profile | Private/unlisted default; deliberate publication | D-05 target; legacy access mapping gate |
| Build all metrics and gate off | Build justified capabilities; affordable extension points | D-15/D-16 target |
| Same layout boxes in Lite | Same meaning/capability with resource-aware presentation | D-11 target; measurable budgets gated |
| No third hue / prescribed premium surfaces | Restrained brand accents plus semantic accessible tokens | D-10 target; exact tokens reviewed |
| Old support-action / low-data / paid-tier English labels | Support / Xidig Plus / Data Saver | D-10 display-label and paid-tier naming targets; native copy and migration reviewed |
| Group DMs optional because Spaces exist | Small group chat in core target; 20-person planning cap | D-03; specific safety/policy gates |
| Link-only resources | Bounded attachments plus external links | D-04 target; scanning/quota/access gates |
| Wizard on most destination pages | Optional help alongside direct browsing/actions | D-13 target |
| Universal fund stake / fund-first | No automatic stake; separate negotiated arrangements | D-08 target; all capital activation gated |
| Full future schema / fixed phase completion | Critical boundaries, reviewed vertical slices and migrations | D-16 target |
| Native app tied to version | Evidence-triggered future option | Deferred; no scheduled commitment |
| Unresolved launch age | 18+ initial-release target | D-09; assurance/safeguarding/legacy handling gated |

### Possible later option: react-to-reveal counts

Keep this only as an uncommitted experiment idea. Reconsider only if user research identifies a specific anchoring problem and testing shows benefit without forced or meaningless reactions. Compare with other approaches rather than assuming react-to-reveal wins. Define surface, consent/experiment treatment, accessibility, manipulation risks, success measures and rollback before implementation. It is not enabled, not required to be built behind a flag, and not a launch acceptance criterion.

### Other future ideals remain available

Member-owned governance; community-supported ventures and a fair fund model; deeper evidence/attestation; local stewards; talent and programme services; native apps; live sessions and native video; portable contribution records; additional communities/languages by adjacency. Every activation needs its own evidence, scope, privacy, operations and approval gate.

## 24. Detailed decision contract — fixed audit baseline

**Purpose:** keep the build aligned to a specified product, not ask Claude Code to choose the product. The requirements below are now the concrete baseline for audits, planning and bounded implementation dispatches. This does not represent every proposed parameter as validated, enacted policy or permission to implement. R-01 remains an explicitly approved product amendment. TARGET choices are the product direction; PARAMETER, GATED and DEFERRED choices retain the limits stated here until the owner approves a bounded implementation dispatch.

### 24.0 Authority, statuses and non-substitution rule

| Status | Meaning | What Claude must do |
| --- | --- | --- |
| TARGET | The specified product behaviour to assess | Compare current build with this target. Do not substitute a preferred alternative. |
| PARAMETER | Exact provisional value used for planning | Evaluate this value and report costs/risks. Do not silently change it or publish it as a promise. |
| GATED | Requires an identified owner, legal, privacy, operational or native-language decision | Report the dependency. Do not select an answer, activate the feature or infer approval. |
| DEFERRED | Not part of the current target implementation | Identify existing dependencies if relevant. Do not build speculative infrastructure or remove existing user data. |
- This section resolves the earlier open-choice language for the audit. Earlier phrases such as “test whether,” “conditional addition” or “proposed” do not give Claude permission to reselect the baseline. If a genuine contradiction remains, identify both passages and request a ruling.
- Latest explicit owner instructions override this baseline. Existing code demonstrates what exists; it does not override the target. Old specs and tracker rows provide history, not permission to reinstate superseded choices.
- Claude may recommend a better alternative with evidence, trade-offs, migration implications and an exact owner question. Keep that recommendation separate from the target and do not act on it.
- Omission is not authorisation. Do not invent a price, permission, retention period, eligibility formula, ranking objective, notification promise or translation to fill a gap. Use the blocked-decision procedure in §24.18.
- Engineering discretion covers the proposed implementation method, not user-visible rights or product policy. Logical entities here do not mandate physical tables, file paths or a new framework. Verify the repository before naming likely implementation locations.
- This contract is **not** a blanket implementation dispatch. No application, schema, deployment, production-data or tracker mutation is authorised unless a bounded owner dispatch explicitly approves the affected slice. Audits and planning may use this page as the canonical direction.

### D-01 — Navigation and the first useful journey

**TARGET**

- Four mobile primary destinations, in order: **Home · Spaces · Discover · Messages**.
- Home contains **Following** and **Community**. Following is reverse-chronological subscribed content. Community is permission-safe broader community content with transparent filters/sorts and clearly labelled editorial highlights; no opaque engagement optimiser is implied.
- Consolidate Home/Plaza at the navigation level. Preserve useful personal dashboard content in **Spaces → My work**; do not discard it merely to remove a tab.
- Spaces includes joined Groups and Projects, appropriate filters, and next-action work views. Discover includes people, Groups, Projects, businesses and Events. Messages includes requests, direct conversations and small group conversations.
- Profile/settings is accessed through the avatar. Notifications has a consistently accessible control with readable unread state. Create is a prominent contextual action, not a fifth mandatory destination.
- Map is a Discover mode with a list alternative. Capital/readiness is contextual to relevant projects, not a global onboarding destination.
- Public browsing and direct entry remain available where content is public. No compulsory route wizard, professional profile completion, three follows, Intro post or paid plan selection before social value.
- Existing deep links, bookmarks and notification destinations must remain valid or receive permission-safe redirects. A navigation label change does not require changing persistent identifiers.

**Must not choose:** five or more primary destinations by default; two competing social homes; a universal capital tab; a compulsory intent funnel; an algorithmic Community feed justified solely by visible reaction counts.

**Audit acceptance:** map every current top-level destination to the target; trace at least one social-only and one project-only journey. Report migration dependencies. Home's initial subview/fallback for a member following nobody needs a specific recommendation and owner approval before implementation; do not invent compulsory follows or a silent personalised feed.

### D-02 — Free participation, Xidig Plus and resource limits

**TARGET**

- Free users can complete a real project: tasks, milestones, decisions, resources, history, basic events, messaging, reporting, basic privacy and own-data export are included.
- Joining a Space is not subscription-gated. Safety, invitation and capacity controls still apply equally and proportionately to paid and free accounts.
- Xidig Plus means patronage plus higher resource allowances and approved convenience, not bought verification, boosted quality ranking, extra binding votes or exclusive basic project completion. “Supporter” is a superseded paid-tier label and should not remain in current user-facing paid-tier copy except as historical migration context.
- Organisations begin with separately quoted, scoped programme pilots. No generic enterprise suite or standard price is implied.

**PARAMETERS — evaluate exactly these starting values**

| Resource / offer | Free | Xidig Plus |
| --- | --- | --- |
| Active owned Spaces | 3 | 10 |
| Resource-upload allowance per owned Space | 250 MB | 2 GB |
| Subscription-based limit on joining Spaces | None | None |
| Core collaboration, privacy and safety | Included | Same core |
| Starting Xidig Plus price | Not applicable | USD 3/month or USD 24/year |

For this audit, use decimal storage units: 1 MB = 1,000,000 bytes; 1 GB = 1,000,000,000 bytes. Ownership, not membership in someone else's Space, consumes the owned-Space allowance. Do not advertise “unlimited” usage merely because there is no subscription-based joining limit.

Archive is not a storage loophole: retained files still consume storage. Legitimate community needs can receive a documented owner-reviewed extension; this is not a self-serve bypass. No automatic deletion, surprise visibility change or loss of access to existing work on downgrade or overage. Costs must include stored versions, processing, delivery/egress, operations and support—not just nominal disk price.

**GATED:** billing/provider eligibility; sustainable prices and allowances; exact paused/completed/archived quota accounting; aggregate anti-stockpiling limits; treatment of ownership transfer, cancellation, failed renewal and overage; quotas for chat media and social media outside Space resources; sponsored/local-currency offers. Claude must return a concrete proposed transition policy, not code one. Do not sell a plan until advertised entitlements and transition behaviour are approved and implemented. Existing paying users require contract-aware migration, not retroactive application of these proposals.

**Audit acceptance:** demonstrate one complete free project path; identify every existing entitlement check; price the provisional package under stated usage assumptions; enumerate downgrade/transfer/storage dependencies without inventing validated economics.

### D-03 — Small group conversations

**TARGET:** small group chat belongs in the core product target, distinct from creating an administered Space. Release follows safe messaging foundations; core-target status does not waive those gates.

**PARAMETER:** 20 participants, including the creator, per small group conversation. This is a planning cap, not a claim about technical maximum capacity.

- Invitations require acceptance. Pending invitees cannot read content or receive message previews. Capacity checks must handle simultaneous acceptances without exceeding the cap.
- Default history begins when participation is accepted; new members do not receive earlier messages, attachments, search results or quoted previews that bypass that boundary. Sharing older material is a new explicit sharing action, not retroactive permission.
- Leaving stops future delivery and live participation. Removal revokes live service access, not just the composer. Do not claim that previously downloaded material or screenshots can be remotely erased. Exact voluntary-leaver access to already-seen service history and rejoin history remains a GATED policy; do not infer it from UI behaviour.
- Blocking prevents new direct contact and invitations from the blocked account. An existing shared group does not falsely promise total separation: explain the situation and provide mute, report and leave controls. No automatic public announcement of a private block.
- Read receipts are optional and off by default. Delivered-to-service is not “read.” Sender-visible pending, failed and retry states must reflect server acknowledgement.
- Retried sends must not duplicate messages. Membership, history boundaries and blocks are rechecked at API, realtime, notification and attachment access points.
- Conversation administrators have authority only within that conversation. Space administration does not imply permission to inspect direct messages. Platform access for safety requires an approved limited process, not general browsing privileges.

**DEFERRED:** disappearing messages; large broadcast communities masquerading as group DMs; forced conversion of a chat into a Space.

**GATED:** creator departure/handover, who can invite/remove whom, reinvitation and rejoin history, group-chat attachment allowance, and final consent semantics for any implemented read receipts. Audit existing mechanics and propose the minimal safe policy; do not activate under-specified rights.

**Audit acceptance:** cover pending invite, acceptance, concurrent capacity, late join, leave, removal, block, reconnect, attachment download and notification-preview cases. Do not claim encryption properties not established by the implementation.

### D-04 — Project resources, work records and roles

**TARGET:** bounded project attachments and external links are both core capabilities. Link-only is not the end-state target. Upload release depends on safe processing and access control.

**PARAMETER:** 20 MB maximum per uploaded resource file, subject to D-02 Space storage allowance.

- Accepted categories: PDFs, supported images and common non-macro office documents. No executables, macro-enabled formats or archive uploads initially. Native video/live processing is separate and deferred.
- File extensions alone do not establish safety. Validate supported content, quarantine pending checks, and do not serve a failed/unscanned file as a normal resource. Non-macro office formats that use archive containers need safe inspection; the ban on user archive uploads is not a reason to reject all office formats blindly.
- Exact MIME/format allowlist, scanner/provider and safe preview strategy need a security-reviewed implementation proposal. Do not silently add unsupported active content or expensive document conversion.
- Access follows the resource's authorised audience across previews, downloads, storage URLs and caches. Explain any revocation limits from cached/downloaded copies. Replacement must retain clear actor/time attribution and avoid broken references or unaccounted retained storage.
- Full file-version-history UI is deferred. The target does not require building an external document editor.
- Task completion can be self-reported. Lead confirmation is an additional explicitly labelled record. Independent attestation is a separate claim, not automatically granted by clicking Complete. Work hours do not automatically become wages, equity or vote weight.

**Role baseline:** **Owner · Admin · Member · Observer**. Owner handles ultimate ownership/handover; Admin handles delegated Space operations; Member participates in permitted content/work; Observer is read-only within granted access. Project lead, reviewer and assignee are responsibility relationships, not automatic admin privileges. Platform moderators remain a separate authority.

**GATED before changing permissions:** exact action-by-role matrix, ownership handover/deletion, who can publish publicly, member removal, resource export and audit-log access. Claude should propose the matrix from this baseline, identify privilege escalation, and obtain approval. Do not ship a permissive guessed matrix or open-ended custom role builder.

**Audit acceptance:** unauthorised direct file access fails; unsafe/pending uploads do not render normally; quotas handle concurrent uploads/replacement; self-report is distinguishable from confirmation; Observer cannot mutate via direct API; assignment does not grant administration.

### D-05 — Spaces: purpose, audience, activity and readiness

**TARGET**

- Two starting templates: **Group** for discussion/resources/events; **Project** for collaboration including tasks/milestones/decisions. Templates are configurations, not superior/inferior ranks. Enabling tools preserves identity, membership and history.
- Purpose, enabled tools, activity, discoverability, join policy and readiness are independent. No automatic Club → Lab → Venture graduation or demotion of the Space itself.
- New Spaces default to **private and unlisted**. A clearly explained creation option may deliberately choose wider discovery/publication.

| Discovery/publication mode | Existence discoverable by | Content access |
| --- | --- | --- |
| Private/unlisted | Authorised invitees and Space members, with invite preview limited to what is necessary | Authorised Space members only |
| Community-listed | Signed-in Xidig members | Space members, except specific deliberately shared items |
| Public | Anyone can see the approved public landing material | Only deliberately published material is public; other content keeps its own restricted audience |

“Members” must always specify **Space members** or **signed-in Xidig members**. A public landing page must not silently publish tasks, discussions, member lists, attendance or files. Public discovery is not permission to join; joining is not permission to administer.

- Join modes remain open/request/invite, constrained by visibility. Private means no unauthenticated self-join through a guessable URL. Shareable invite links, expiry and whether the private/open combination is supported need an explicit approved rule; do not make every theoretical combination valid.
- Cross-posting requires permission to share to the destination and an audience preview. Linked Spaces do not merge their audiences.
- Activity states: active, paused, archived; Projects additionally completed. No missed-update penalty changes purpose, erases milestones or silently widens access.
- **PARAMETER:** after 28 days of inactivity, a private owner check-in, not a public warning badge. Owner can choose cadence or pause reminders. Define meaningful activity explicitly in the implementation proposal; background jobs and fabricated activity do not count.
- Readiness claims state evidence, criteria, assessor, assessment date and review conditions. **PARAMETER:** a 90-day review default for time-sensitive assessments, shorter only under approved assessment criteria. Overdue means “needs review,” not “untrustworthy.” No automatic funding eligibility follows.

**GATED:** exact edit/restore rights of paused, completed and archived states; cadence event definition; readiness rubric/reviewer authority; all ambiguous legacy audience mappings. No destructive migration or public-to-private/private-to-public assumption merely from an old mode label.

**Audit acceptance:** check Space existence as well as content for leakage through search, map, count totals, OG cards, sitemaps, notifications and storage. Supply record-level migration categories without exposing private records in the report.

### D-06 — Account access, verification and reputation

**TARGET**

- Keep working email/password, magic-link and phone-OTP capabilities as the audit baseline. Do not silently drop an access method, require email for a phone-only account, or merge unverified identifiers. Login prominence and recovery improvements require an evidence-based proposal.
- Ordinary participation uses verified account access and proportionate abuse controls, not compulsory public legal names or identity-document collection.
- Specific trust claims: **Identity checked · Business ownership checked · Community vouched · Skill evidenced · Work completion confirmed**. Each identifies scope/method, date, responsible issuer and status/review conditions as appropriate. Avoid a blanket badge implying safety, competence or financial suitability.
- Community vouches are contextual evidence, not conclusive uniqueness. Three vouches do not automatically unlock governance, moderation or financial privileges. Address reciprocal rings, conflicted reviewers, paid vouches, revocation and newcomer exclusion.
- Privileged operators need strong authentication, least privilege, training, logged sensitive access and second-review arrangements for consequential contested decisions. Do not grant platform-wide access merely from being a Space owner.
- No routine recorded face/ID calls. Prefer retaining a justified restricted verification outcome over raw evidence.
- **PARAMETER for privacy review, not permission to collect:** proposed raw-evidence cap of 30 days after review if evidence is genuinely necessary. Pre-review retention, abandoned cases, legal exceptions and backup deletion must be decided by the approved retention policy. Do not interpret this cap as indefinite retention while review never completes.

**Reputation boundary:** do not restore the owner's deleted blanket ban on all summary scores. Contextual summaries are the first-release target. A new universal score, formula, public leaderboard or consequential threshold is not implied or authorised. Propose any such mechanism separately with inputs, meaning, gaming risks, consequences, explanation and appeal. Popularity is not competence; no score multiplies votes or creates money rights. Preserve historic contribution evidence while allowing auditable correction; confidential fraud signals are not public accusations.

**GATED:** exact verification evidence and accessible alternatives; provider/legal basis; retention by data category; approved governance personhood method; production reputation formulas/eligibility cutoffs. Claude cannot choose a KYC provider or a trust formula simply because the old system has one.

**Audit acceptance:** a social-only member can use the product without ID; claims remain bounded; raw sensitive evidence is not public or in analytics; denial/revocation paths and recovery are auditable; all unverified implementation claims are labelled as such.

### D-07 — Membership, founding governance and future ballots

**TARGET:** distinguish account status, paid Xidig Plus entitlements and governance membership. Payment, posting volume, work units and reputation do not purchase binding influence. One eligible verified member has one binding vote when a valid governance system is activated.

Founding operations use named operator accountability, advisory consultation, privacy-safe decision records and a route toward real member control. Do not portray advisory consultation as enacted legal ownership.

**GATED legal direction:** evaluate a member-controlled/cooperative platform structure with any future investment vehicle legally distinct. This is a brief for qualified advice, not a selected entity, jurisdiction, tax treatment or incorporation instruction.

**PARAMETERS for a future pilot; none activates binding voting**

- Explicit opt-in membership; approved personhood/duplicate-account checks; 90-day tenure; membership terms; no valid suspension; periodic register reconfirmation. No compulsory productivity or Xidig Plus purchase.
- Minimum 25 eligible members before the binding pilot is considered for activation.
- Snapshot the eligible register when the proposal opens. No tactical removal of members near a vote; contested removals require independent scrutiny.

| Ballot class | Quorum | Approval threshold | Voting window |
| --- | --- | --- | --- |
| General opinion/product feedback | None; advisory only | Report distribution, not binding law | 7 days |
| Appointment/recall, single yes/no | At least 20% of eligible register and at least 5 participants | More than half of valid non-abstaining votes | 14 days |
| Material rules | At least 25% and at least 10 participants | At least two-thirds of valid non-abstaining votes | 14 days |
| Constitution/ownership | At least 30% and at least 15 participants | At least 75% of valid non-abstaining votes, plus confirmation | 21 days plus an unapproved cooling/confirmation process |

For audit modelling only: percentage quorum rounds up; both the percentage and absolute minimum must be met; valid abstentions count toward participation but not the approval denominator; invalid/duplicate ballots do not count; no valid yes/no votes cannot pass. Failed quorum or failed threshold means no binding change. Hide live choice tallies. Do not infer that public turnout or participant identities should be exposed.

**Important unresolved anti-capture gate:** these quorum and abstention rules alone can permit too few affirmative voters to decide if many abstain. An affirmative-vote floor/minority-protection rule must be separately proposed and approved before activation. Do not implement the table as a complete constitution. Also unresolved: tenure start event, register reconfirmation, conflict exclusions, multi-candidate ranking/ties, cooling duration and confirmation electorate, secret-ballot auditability, emergency veto scope/expiry/review, legal reserved matters and founding transition. Claude must not fill these with arbitrary defaults.

**Audit acceptance:** identify old payment/activity/reputation gates, snapshot and ballot logic, tally exposure and migration implications. Keep current ballot protections intact during the audit. Report feasibility of the proposed future design without claiming legal legitimacy or creating a live election.

### D-08 — IP, project participation and capital

**TARGET**

- Members retain pre-existing IP. Ordinary platform use creates no automatic assignment to Xidig and no default Xidig equity claim.
- New collaboration uses expressly accepted project participation terms appropriate to the project. Public posting is not automatically an open-source licence. The platform receives only necessary service permissions under reviewed terms.
- Explain attribution, permitted reuse, confidentiality, departures, disputes and separately agreed paid work before substantial contributions accrue. A platform vote does not replace individual consent or enforceable agreements.
- No automatic conversion of tasks, hours, reputation, Support/Taageer, membership or expressions of interest into wages, shares, ownership, investment eligibility or extra votes.
- Incubation/funding/venture-studio equity, if any, is separately negotiated for actual contribution and risk. No universal starting stake or terminal fund floor in ordinary collaboration.
- Current public actions: follow project, offer help, contact team and non-financial Support/Taageer. No investment solicitation, pledges, money movement or “Invest” CTA activated by geo-checks. No compulsory fund-first route.

**GATED:** actual entity and rights, legal agreements, public financial communications, providers, jurisdictional obligations and all capital activation. Qualified review is required for the affected activity; it does not justify stopping all unrelated social-product work. Claude may inventory legacy investment/IP behaviour and propose isolation/migration, not execute it during this audit.

### D-09 — Age, safety, privacy and operating coverage

**TARGET:** initial release is for adults **18+**; do not market it to children. A 16–17 pathway is deferred until separately designed safeguarding and approval. Preserve the possibility of younger learners later without pretending adult policies suffice now.

**Deletion-retention ruling:** after final account deletion, remove or suppress the member's user-generated content bodies/media and public identity from normal product surfaces, while retaining restricted platform-security and trust metadata for up to **1 year**. This metadata may include account identifiers, deletion timestamp, auth-provider identifiers including phone where supported erasure is not yet available, email hash/pseudonym or prior auth identifiers where needed, device/session/security indicators, moderation/report/appeal records, verification/vouch/anti-Sybil references, audit references, payment/entitlement metadata where legally required, and content-existence metadata such as type, timestamps and target Space/event/listing. It must not include full user-authored body/media unless separately justified for a restricted dispute, safety or legal hold.

Retained metadata is not public, not searchable by ordinary users, not used for ranking or marketing, and not shared with partners except where legally required or explicitly approved. After 1 year, purge or further anonymise unless a documented legal hold, statutory duty, unresolved safety case or active dispute requires longer retention. This ruling supersedes earlier retained-content assumptions wherever they preserved full deleted-member authored content as normal tombstone history; Claude must map each content class and propose safe migrations before destructive changes.

- Age policy does not mean mandatory ID for all users, nor does a checkbox establish compliance. Age assurance, reporting and any legacy underage accounts need a reviewed handling process. No automatic mass deletion or public disclosure of suspected age.
- Report, block, mute, urgent escalation and an appropriate appeal accompany released risky features. Ordinary Space admins do not gain unrestricted shadowbanning, sensitive-report or DM access.
- Reports, ID evidence, private messages, precise locations and private membership are not public governance or analytics payloads.
- Retention/export/deletion rules must be approved per data class. “Append-only” does not mean indefinite retention of all personal information. Do not invent a single global retention period.

**PARAMETERS — internal planning targets, not advertised guarantees:** urgent threats trigger immediate operator alert; ordinary reports receive first human review within 24 hours; appeals within 72 hours. These are initial-review targets, not guaranteed resolution. Automation acknowledgement is not human review. Staffing hours and emergency escalation must be explicit; Xidig is not an emergency service.

**GATED:** actual operator roster, coverage/timezone, response commitments, safeguarding and age assurance, retention schedule and legal/privacy processes. If coverage is inadequate, report the release limitation; do not quietly relax the target or claim round-the-clock service.

### D-10 — Brand, labels and language

**TARGET**

- Keep Xidig, the star/butterfly identity, Somali Blue #0077cc, restrained Orange #FF8C00 and Baale as working assets. Typography now follows [Owner Amendment 01 — Visual Identity, Brand & Remaining Decisions (locked 9 Sep 2026)](https://app.notion.com/p/Owner-Amendment-01-Visual-Identity-Brand-Remaining-Decisions-locked-9-Sep-2026-a2a03b4245a34cf09947a79c71afff89?pvs=21): Bricolage Grotesque for display roles and the system UI stack for body/UI, with the Data Saver font-loading fallback described there.
- Blue leads ordinary primary actions; orange is distinctive emphasis/celebration, not proof of trust. Allow separate semantic error/warning/success tokens, always with labels/icons as appropriate. No blanket two-hue restriction overriding accessibility.
- Follow system light/dark preference with explicit override. Reuse the component/token system; no compulsory shadows, dark premium theme or decorative graphs.
- Baale appears only in selected helpful/onboarding/celebration moments, never constant idle obstruction or sensitive safety/moderation/legal surfaces. Constellations are a motif, not a mandatory information representation.
- English labels: **Spaces** is the container, **Groups** and **Projects** are understandable uses. Labs can describe a programme/template, not all collaboration. **Support** replaces ambiguous English “Co-sign” and the interim “Show support” target as the primary display label; the active/removal states are **Supporting** and **Remove support**. The provisional Somali action label is **Taageer**. The paid tier is **Xidig Plus** in English. **Data Saver** is the target English setting label. Do not use “Lite” as active public UI copy.
- Support/Taageer is non-financial encouragement, not due diligence, a guarantee, a vote, a rating, verification, work-quality proof, ranking input or capital interest. It does not unlock counts or change governance rights.
- Xidig Plus is paid patronage plus resource/convenience allowances only; it does not buy trust, verification, ranking, governance votes, capital access or professional credibility. Native Somali naming for the paid tier remains gated; do not reuse Taageer in a way that confuses the paid tier with the Support action. The provisional Somali Poll/type-chip label is **Xulasho**; keep formal vote/governance vocabulary distinct.
- Locale order: explicit saved user preference; otherwise a supported device/browser language; otherwise English fallback. Make EN/SO switching accessible at entry and settings. Do not infer language from ethnicity or location. English engineering source keys do not make Somali an incomplete secondary experience.

**GATED:** native-reviewed Somali navigation, data-saving and trust labels; precise semantic colour tokens after contrast review; any typography replacement, logo redesign or extra reaction taxonomy. Retain existing approved Somali wording provisionally rather than generating translations and declaring them final. Display-label migration preserves routes, analytics identity and stored references where feasible.

**Audit acceptance:** inspect language coverage, label collisions, text embedded in images, expansion, contrast, keyboard/screen-reader/touch states and reduced motion. Report accessibility failures; do not solve them by stripping the core experience or rebranding without approval.

### D-11 — Data Saver, performance and resilience

**TARGET:** equivalent capability, content meaning and decisions across full/Data Saver and mobile/desktop; presentation may adapt. Compact placeholders and list-first views are allowed. Preserve essential context and actions; no “lite users cannot collaborate” behaviour.

- In Data Saver, heavy maps/media/embeds wait for the relevant explicit load action. Static fallback must be meaningful. Reduced motion is independent of network preferences.
- Drafts survive transient connection failures where appropriate; retries are idempotent; pending/failed/success is accurate. Do not persist sensitive private content offline by default. Any offline persistence needs a reviewed scope, shared-device/sign-out clearing and permission-recheck design.
- **PARAMETERS:** LCP ≤2.5 seconds, INP ≤200 ms and CLS ≤0.1 as initial experience goals; 99.5% monthly availability as an internal reliability objective, not a contractual SLA.
- Audit critical routes on an explicit low-end Android/network matrix as well as representative desktop. Distinguish lab diagnostics from field experience; do not use an invented INP result from a test that did not measure interactions. Report field p75 where sufficient real measurements exist, otherwise mark unavailable.
- Backups, tested restore, secret management, environment separation, monitoring and named incident ownership are required operational work, not optional polish.

**GATED:** actual representative device/network matrix, route-specific byte/CPU/memory budgets, availability measurement boundary, recovery time and acceptable data-loss objectives. Claude reports measured baseline and proposed budgets; owner approves before they become release/service promises. No invented performance pass or recovery guarantee.

### D-12 — Measurement and bounded experiments

**TARGET:** separate social and collaboration outcomes; ordinary reading and belonging count as real value. Exclude demo/seed/test traffic; minimise telemetry; never collect private content merely to improve the dashboard.

**PARAMETERS — pilot learning hypotheses, not external benchmarks:**

- 80% unassisted success on agreed core usability tasks.
- 25% week-four return among activated social pilot members.
- 50% of activated project teams complete an agreed meaningful milestone within four weeks.

Before collection, define activation, meaningful return/milestone, cohort dates, observation window, exclusions and denominator. Report raw counts, small-sample limitations and recruitment bias alongside percentages. Missing event history is “not measured,” not zero. These metric definitions need an owner-approved measurement brief; Claude must not optimise the denominator to manufacture a pass.

Experiments validate a specified target, not delegate strategy: test navigation comprehension, free-project completion, login/recovery, labels, social posting, privacy, group chat and low-data task completion. Each has a hypothesis, audience, harm/success measures, owner and stop condition. A failure may justify a proposed amendment, never a silent switch to an alternative.

**DEFERRED:** react-to-reveal experiment and its infrastructure. No A/B test that reintroduces it without an explicit later ruling. No new compulsory streaks or new universal reputation algorithm to improve retention numbers.

### D-13 — Public site and content systems

**TARGET:** primary website groups **Community · Projects · Partners · Resources**, plus clear Join/Sign in. Home is reachable via the brand. Retain useful deeper pages, legal links and permission-safe direct URLs; consolidated navigation is not deletion of the wider vision.

- Resources provides clear access to Library, Guide and Support. Shared discovery/search is compatible with separate publishing, evergreen documentation and issue-resolution ownership/templates.
- “Help me choose” is optional alongside direct browsing. Do not require contact capture to receive the route result or repeat answers already provided. Ask only questions that change the outcome.
- Social and collaboration journeys get equal quality. Partner Confidence remains a specialised lane, not the whole site. Venture/partner claims reflect actual availability.
- Support and urgent safety escalation cannot be withheld behind a wizard or required article-reading sequence.
- Public indexing, OG cards and sitemaps follow explicit publication permissions. Examples/synthetic visuals do not become fabricated partners, metrics or testimonials.

**Audit acceptance:** map existing pages into navigation groups, preserve deep links, identify private preview leaks, and show direct and assisted journeys. Do not build a wizard for every page merely because a reusable shell exists.

### D-14 — Social mechanics and recognition

**TARGET**

- Ordinary Post is the default composer. Ask/Poll/Event/update structure and Intro/Win templates are optional, not mandatory productivity categories.
- R-01: available social counts are readable before reacting, after reacting and after removing a reaction. No locked placeholder, reveal reward or click-to-reveal replacement. Respect content access. Formal ballot/review result confidentiality is separate and unchanged.
- Retain the current reaction vocabulary initially with understandable labels; report comprehension/misuse issues before proposing changes. Visible popularity is not automatic feed rank or evidence of work quality.
- Ask closure mistakes have an attributed correction/reopen route; prevent duplicate helper credit and preserve reversal history instead of making an accidental tap permanent. Exact authority to reverse another member's credit requires a reviewed permission rule, not broad silent admin power.
- No new compulsory daily streak. Existing optional personal progress/history is assessed on its merits, not automatically removed.
- Founding badges are truthful historical recognition, not governance/ranking privileges or manufactured scarcity. Community awards begin with transparent manual criteria, not new election infrastructure.

**Audit acceptance:** explicitly test the three count states, no social-to-governance gate crossover, ordinary posting without templates, and corrective Ask state transitions. Record existing dependencies rather than replacing working mechanics with guesses.

### D-15 — AI, partners and platform extensions

**TARGET:** prioritise useful AI drafting, summaries, translation assistance and product help with permission boundaries and clear identification. No simulated organic population. Keep demo material distinct from real activity, traction and reputation. AI must not independently make consequential attestations or treat retrieved instructions as authority for tool use.

Start partner reporting/services with named narrow pilots and consent-aware manual delivery. No special government/institution access to private individual records. External APIs/webhooks/MCP are for specific approved use cases with scoped access, revocation and audit; no blanket write capability for hypothetical future agents.

**DEFERRED:** native video/live, a fixed-version native-app launch, multi-community tenancy/global repositioning, general gig/course/property platforms, capital transactions and speculative integration programmes. Preserve inexpensive extension points and the future ideals, not entire unneeded systems behind flags. Existing shipped capabilities require dependency/usage review before retirement.

**GATED:** specific AI/provider data policies and new external write permissions. Do not equate an integration's technical availability with approval to share member data.

### D-16 — Build method and the two trackers

**TARGET:** retain sound foundations and selectively refactor/replace conflicting systems. Keep Next.js/React, Supabase/Postgres/RLS, Vercel, shared UI and existing Meilisearch as the working baseline until actual evidence supports a bounded replacement proposal. No full restart by default and no cosmetic-only patch plan.

- Audit by complete journeys and domain/permission boundaries, not tracker completion percentages. A Done row is history, not proof of current correctness; To do is not proof that code is absent.
- Logical entities may map onto existing tables/services. No forced one-table-per-concept rewrite, microservice split, self-HTTP requirement or upfront whole-future schema freeze.
- Recommendations cover authorisation, transactions/concurrency, storage, realtime, search sync, recovery, privacy, dependencies and rollback—not only visible components.
- Keep [🎯 UI Polish & Assets — Task Tracker](https://app.notion.com/p/daad962978054457a7aef0968420b267?pvs=21) and [🛠️ Xidig App v1.0 — Build Tracker](https://app.notion.com/p/2fcc5ce577d74c3f832a5f7f5513a80d?pvs=21). Read useful linked sources; do not bulk reset, rewrite, archive or create duplicates before audit review.
- After owner approval of a slice, update only the owning principles/spec amendments and genuinely untracked work. Agent-side DECISIONS/HANDOFF remains the execution record.
- Do not broaden Build Zone/workspace permissions to obtain a source. If the PRD or a private linked document is inaccessible, report that and request an authorised copy rather than auditing against a guessed summary.

### 24.17 Required audit output

One evidence-linked report, not a new sprawling tracking system:

1. **Baseline and coverage:** latest PRD read, repository revision inspected, environments available, tests run/not run and unavailable sources. No secrets or personal records copied into the report.
2. **Requirement matrix:** D-01–D-16 plus R-01, with sub-requirements where needed. Columns: target behaviour; current behaviour; file/symbol/test evidence; aligned/partial/conflicting/missing/unverified; KEEP/REFACTOR/REPLACE/RETIRE/INVESTIGATE recommendation; dependency/migration risk. Separate recommendation from implementation.
3. **Cross-cutting risk review:** access/privacy, security, abuse/fairness, data loss, recovery, billing/legal activation and cost. Urgent confirmed issues are reported promptly; audit is not permission to deploy a fix.
4. **Gated decisions:** one compact list using §24.18. Do not silently resolve these by importing old policies or choosing the easiest implementation.
5. **Migration map:** which existing concepts/URLs/data/permissions can remain; which need controlled change; ambiguous legacy records; reversibility and rollback constraints.
6. **First bounded implementation slice:** recommended scope, prerequisites, exact acceptance checks, likely areas to inspect, test plan and rollback. Ask for owner dispatch before implementation. If a better strategy exists, place it in an alternatives section with evidence and trade-offs.
7. **Documentation reconciliation:** affected canonical pages/tracker items and suggested targeted updates after approval. No edits to those sources during audit.

Do not inflate confidence from file names, test counts or a green build. Distinguish observed runtime behaviour, static-code inference, historical documentation and facts not established.

### 24.18 Stop-and-ask protocol

For each unresolved decision that materially affects permissions, user behaviour, costs, privacy, eligibility, legal rights, scope or migration:

- State the relevant D-ID and the exact missing/conflicting rule.
- State why this blocks the affected slice and what can still be audited independently.
- Give the smallest actionable options, the recommended option with evidence, and trade-offs.
- State the safe interim position: no new activation or policy-changing mutation; do not make unsupported claims that existing behaviour is safe.
- Ask one exact owner/reviewer question. Mark **BLOCKED — decision required** until answered.

No reply means no approval. Do not use a timeout, default library setting, tool-generated answer, obsolete spec or “best practice” as an implicit owner ruling. This is not a ban on critique: Claude should identify a better approach, but must not adopt it on the owner's behalf.

## 25. Implementation handoff and source reconciliation

### Guideline for Claude Code / Design

**Default dispatch: align to this canonical direction; implementation only by bounded owner dispatch.** For audit work, inspect and run safe checks in an isolated local/test environment. Do not change application code, schemas, permissions, production data, deployments, design assets or Notion tracker rows unless the current owner message explicitly authorises that implementation slice. Audit reports and short agent-side HANDOFF/DECISIONS notes are permitted; do not overwrite existing history. Report confirmed urgent security findings promptly without using the audit as permission to deploy fixes.

Read §24 before auditing. Inspect the repository and current handoffs before selecting files or implementation locations. Treat paths or components referenced in source docs as leads to verify, not exhaustive knowledge of the codebase. Improve the proposed engineering plan where appropriate; do not reselect product targets, silently change provisional values or invent answers to gated decisions. Use §24.17 for the report and §24.18 for stop-and-ask questions.

For R-01, locate any reaction-dependent count masking in render logic, API projections, feature settings, copy and tests. Remove the active interaction gate while retaining valid counts, reaction toggling, permissions and unrelated blind-ballot rules. Record the ruling, actual changes and verification evidence in agent-side DECISIONS/HANDOFF. Do not claim production removal until deployed and checked.

For the broader Relook, return the evidence-linked requirement matrix, gaps, gated questions, migration map and bounded first-slice recommendation defined in §24.17. Preserve working features and existing user records. Do not conduct a wholesale rewrite, silently implement an alternative product or delete history simply to resemble this target. Keep suggested improvements in a separate alternatives section until owner approval.

### Canonical ownership after approval

Amend the baseline PRD and owning UI, naming, brand and policy specs when changes are accepted. Mark superseded rules explicitly. Keep one active authority per behaviour. Notion records owner-level principles and amendments; operational implementation notes remain agent-side. No duplicate task/decision rows for every finding.

### Reference documents

- [PRD — Xidig App v1.0 (Standalone)](https://app.notion.com/p/PRD-Xidig-App-v1-0-Standalone-8bbe64d6a1b8428d85aa77293cd06739?pvs=21)
- [Xidig v1.0 — UI Spec & Canonical Screens](https://app.notion.com/p/Xidig-v1-0-UI-Spec-Canonical-Screens-885fa5570d19450e8d46306a39aa14a4?pvs=21)
- [Xidig v1.0 — Bilingual UI Copy & Naming System (EN · SO)](https://app.notion.com/p/Xidig-v1-0-Bilingual-UI-Copy-Naming-System-EN-SO-51e5657857fc407793c46d332e52ad54?pvs=21)
- [Xidig Brand Guide](https://app.notion.com/p/Xidig-Brand-Guide-4b6bc4ea07404a96aa81aad60d30e9b8?pvs=21)
- [J-Foundation · Claude Design handoff — whole-site redesign system](https://app.notion.com/p/J-Foundation-Claude-Design-handoff-whole-site-redesign-system-70fb55f5b983404ba7c4b16071ed5d9a?pvs=21)
- [Xidig — Defensibility, IP & Enterprise Value Thesis](https://app.notion.com/p/Xidig-Defensibility-IP-Enterprise-Value-Thesis-c9658e6f53aa4533999638696a80a216?pvs=21)
- [Xidig — Member Returns Forecast & Venture Fund Dilution Model](https://app.notion.com/p/Xidig-Member-Returns-Forecast-Venture-Fund-Dilution-Model-51d6e0f1a3b14ab2a89f1d01bbcdaba4?pvs=21)
- [Partnership strategy — Karti, Sirahan, and partner rails](https://app.notion.com/p/Partnership-strategy-Karti-Sirahan-and-partner-rails-f296b133320f4020b02b102aeb2f2f91?pvs=21)
- [Decision — Binding-vote eligibility formula](https://app.notion.com/p/Decision-Binding-vote-eligibility-formula-e651807f7a17475e93ae8099ea17ddea?pvs=21)
- [Decision — Governance track parameters](https://app.notion.com/p/Decision-Governance-track-parameters-2fb543f73a9a402da3a673101c02cc15?pvs=21)
- [Define Space settings UI (mode label swap, disappearing messages, privacy, member view)](https://app.notion.com/p/Define-Space-settings-UI-mode-label-swap-disappearing-messages-privacy-member-view-f21b263b4fab43cd8d2beb91e10ae3bd?pvs=21)
- [Decision: Maal demotion — document auto-timeout; member-vote path deferred](https://app.notion.com/p/Decision-Maal-demotion-document-auto-timeout-member-vote-path-deferred-9e2c8e3b0d684e7e8ae6608e3573342a?pvs=21)
- [Decision: Metrics capability is always built — gated OFF when it clashes with current strategy, never omitted](https://app.notion.com/p/Decision-Metrics-capability-is-always-built-gated-OFF-when-it-clashes-with-current-strategy-neve-70cf87719c6949d0a5fe2e3a0add3ad0?pvs=21)

[Owner Amendment 01 — Visual Identity, Brand & Remaining Decisions (locked 9 Sep 2026)](https://app.notion.com/p/Owner-Amendment-01-Visual-Identity-Brand-Remaining-Decisions-locked-9-Sep-2026-a2a03b4245a34cf09947a79c71afff89?pvs=21)

---

## Appendix A — Learnings carried forward from PRD v1.0 (repo addendum, 12 Sep 2026)

This appendix was added in the repo at the owner's request when the repo copy of the v1.0 PRD moved to `docs/archive/`. v1.0 held two months of build decisions and lessons that the page above does not repeat. This appendix keeps the ones that fit this page's direction and drops the rest. The archive's crosswalk records every v1.0 section, including everything deliberately *not* carried.

**How to read it**

- The owner text above wins. A CF item never overrides, widens or narrows a TARGET, never sets a PARAMETER, and never answers a GATED question. Where one touches a gate, it is an input to the owner's decision (§24.18).
- Tags: **[lesson]** explains why something should be done a certain way. **[in code]** describes current behaviour, read statically at commit `f1305c2` and re-checked against the integration tip `940c51c` (not runtime-verified; production may differ). **[gate input]** is earlier thinking relevant to an open gate.
- **Open (O-n)** marks shipped behaviour that falls short of, or conflicts with, this page. The owner is keeping each one as an open decision (A.0). Current behaviour stays until a bounded dispatch changes it (§24.0).
- Sources cite v1.0 section numbers, as preserved in `docs/archive/prd-v1.0-standalone.md`, e.g. (v1.0 §18).

### A.0 Owner rulings and open decisions (12 Sep 2026)

**Ruled**

**F-1 · Search: Postgres is the current working baseline.** The code searches on Postgres, using `ilike` matching with pg_trgm indexes plus the name-folding column in CF-28. Meilisearch is set up but unused: it appears only in `docker-compose.yml`, a root `search:up` script and unused env vars, with no client package and no call site. The "existing Meilisearch" in §11 and D-16 means that available-but-unused setup, not the current engine. Meilisearch is a future candidate, or a reactivation option, only if evidence supports it under §11's criteria.

**F-2 · Ask lifecycle: Open → In progress → Fulfilled is the active flow.** The owner-approved Codsi model (9 Aug 2026) is the active implementation and UI lifecycle (CF-11). §8's "open/answered/closed" is generic lifecycle wording, not a request to rename the shipped flow. "Answered" and "Closed" do not replace the existing labels unless a later owner decision explicitly changes the UI vocabulary. Other sessions will take the states further.

**Open decisions**

The owner is keeping these open. Each entry records current behaviour as evidence; nothing changes without a bounded dispatch (§24.0).

- **O-1 · Listing reviews and ratings** (§11; formerly CF-04). v1.0 excluded them, and that exclusion is not carried. Should listings offer reviews or ratings, and if so, with what safeguards?
- **O-2 · Password nudge for phone-only members** (§7, D-06; CF-07). The nudge shows to every account without a password, but password sign-in accepts email only. What should phone-only members see?
- **O-3 · Correcting a mistaken fulfilment** (D-14; CF-11). Fulfilled is final, so a mistaken fulfilment has no attributed correction or reversal route. This follows from F-2.
- **O-4 · The `/out` fix — resolved 12 Sep 2026** (§8; CF-14). Deployed to production through `main` (hotfix `5e9774f`) and merged into the integration line (`940c51c`); both carry identical fix code. Kept here so the ID stays stable.
- **O-5 · Weekly digest** (§10, §19; CF-25). It includes seeded items, emails members unless they opt out, and pins an AI-authored post without human review. What should it include, how should email consent work, and who reviews the post?
- **O-6 · Data Saver prompt by country** (§17, D-11; CF-48). The prompt triggers on a list of countries as well as on connection speed. Should the country trigger stay, change or go?

### A.1 Principles (§3)

- **CF-01 · Teach in context** [lesson] (v1.0 §5 "Helpful everywhere", §20). Empty states say what a surface is for and offer the next useful step, and tips are contextual and dismissible. This is §7's "contextual setup after first value" in practice. It must never become a gate, a compulsory tour or routine obstruction (§16, Baale).

### A.2 Scope (§5)

- **CF-02 · Shipped outside this page's core** [in code] (v1.0 §11 Phases 4–8, §16, §17, §20, §21). The list includes:
  - the Maal venture workspace and its append-only contribution ledger (`work_events`)
  - the Venture Candidate review pipeline
  - reputation scores and milestone badges
  - Community Awards and mentor-in-residence
  - "Looking for" matching and skills-gap alerts
  - the external REST API and MCP server
  - AI seeding and the weekly digest
  - the `page_blocks` layout schema (no editor)

  Under §5, each one is audited for use, safety, dependencies and cost, then preserved, simplified, isolated or retired through a deliberate migration. None is deleted for being absent from this page, and none becomes a target just because it exists.
- **CF-03 · Suuq is discovery, not commerce** [lesson] (v1.0 §12). Suuq is the Directory and Map of people and businesses. Listing service rows are display-only, with no cart, checkout or order flow. This matches §5's exclusion of a general marketplace.
- **CF-04 · Listing reviews and ratings — withdrawn** (v1.0 §12, 6 Jul). v1.0's exclusion of listing reviews is not carried: on 12 Sep the owner found it didn't make sense for this direction. Whether to offer reviews is open (O-1).

### A.3 Information architecture (§6)

- **CF-05 · Everything is linkable; previews are disclosures** [lesson] (v1.0 §13). Every entity has a stable permalink, which D-01 now protects. v1.0 also specified rich preview chips for internal links pasted into posts, comments and DMs, but they were never built. Internal links render as plain links in a post's link field, and DMs don't process links at all. If chips are built, a chip may show only what the viewer can already open. It is a disclosure surface (§13, §18), not a way around access.

### A.4 Accounts, identity and onboarding (§7)

- **CF-06 · Sign-in methods** [in code] (v1.0 §12, §26, §27). Email + password, magic link and phone SMS-OTP are co-equal methods on one canonical account, which holds at least one verified email or phone. Passwords live only in Supabase-managed auth. Expiries:
  - magic link: 10 min, enforced in the app
  - SMS OTP: 10 min, a Supabase dashboard setting documented in `docs/runbook.md`
  - password reset: 60 min

  The password sign-in route accepts email only.
- **CF-07 · A password nudge must match a login that works** [lesson] (v1.0 §20, filtered by §7). v1.0 nudged magic-link and phone-OTP members to set a password, as a sign-in that does not depend on message delivery. §7 keeps that aim only where the password actually works for the account. **Open (O-2):** the onboarding checklist and Settings show the nudge whenever the account has no password (`has_password()`). Password sign-in accepts email only, so a phone-only member is nudged toward a password they cannot sign in with.
- **CF-08 · WhatsApp as a code channel** [gate input] (v1.0 §12, §26). v1.0 deferred WhatsApp OTP to v1.1, behind an OTP provider interface that works for any channel. Diaspora and Somalia-side members live on WhatsApp. It belongs in §7's deliverability and cost benchmark; SMS should not be assumed to be the only phone channel.
- **CF-09 · Launch scoping without scarcity** [in code] (v1.0 §12, §20). Invite codes, a waitlist and tracked referrals exist, and they fit Gate 4's "scoped community launch". v1.0's Founding Member countdown ("spots remaining", urgency, a press hook) does not carry. Under D-14 the badge is truthful history, not manufactured scarcity.
- **CF-10 · Settings already separate what §7 asks to separate** [in code] (v1.0 §9, §22). Settings cover account, privacy and safety, notifications, appearance, language and data.
  - "Who can DM me": everyone, verified or no one. The default is everyone.
  - Location granularity: exact, city, region or hidden. The default is city, so a precise personal location is never the default.
  - Also present: blocked and muted lists, per-type notification preferences with quiet hours, dark mode, text size, reduced motion, and data export.

### A.5 Posting, feeds and reactions (§8)

- **CF-11 · The Ask lifecycle is Codsi** [in code] (v1.0 §15, 9 Aug 2026).
  - **Open → In progress:** the asker accepts a private offer, and the helper is named publicly.
  - **In progress → Fulfilled:** final; the named helper earns helper credit.
  - Offers arrive privately, with no public offer counts. Only the asker moves the lifecycle.
  - Reopen walks an in-progress Ask back to Open and clears the helper.
  - A stale Ask gets one in-app nudge after 7 days.

  **Open (O-3):** Fulfilled is final, so a mistaken fulfilment has no attributed correction or reversal route (D-14). The states and their labels stand (F-2).
- **CF-12 · Everyday social tools** [in code] (v1.0 §9, §12 Phase 4.5, §13). §5's "ordinary social posting … saves and safe sharing" rests on:
  - saves
  - post drafts
  - edits with stored revisions
  - mutes
  - @mentions that notify
  - global search
  - the device share sheet

  Blocks and mutes must hold in feeds, previews, counts and notifications (§8 acceptance).
- **CF-13 · One media pipeline** [in code] (v1.0 §15, §24). Post images, avatars, covers, listing photos and Space images all share one upload path:
  - the format is sniffed from the bytes
  - the image is re-encoded server-side to WebP plus a thumbnail, which drops embedded metadata
  - a blurhash is stored
  - an automated scan runs before storage, and flagged images are refused
  - post images are capped at 5 MB

  Alt text is required for listing photos. v1.0 wanted it on every upload, which serves §8's accessible media descriptions. Quotas for post and chat media outside Space resources stay GATED under D-02.
- **CF-14 · Embeds before native video** [in code] (v1.0 §12, §15, §24 Option A). Links from YouTube, Vimeo, TikTok, X and Instagram (matched on exact host) play in-app, and in Data Saver they wait for an explicit load (D-11). Other domains were meant to pass through a warning interstitial and remain a usable link, as §8 requires. **Resolved (O-4):** the interstitial route `/out` was written in July but never committed, because a bare `out/` rule in `.gitignore` also matched `apps/web/src/app/out/`, so post links to unknown domains 404'd. On 12 Sep 2026 the rule was anchored and the page shipped: deployed via `main` and merged into integration. As a [gate input] for D-15's deferred native video, v1.0 also priced two later paths: short clips on a free-tier CDN, or full uploads on Cloudflare Stream at about USD 5 per 1,000 stored minutes.
- **CF-15 · Current reactions** [in code] (v1.0 §20). 🔥 Fire · 💪 Strong · 🤲 Mashallah · 💡 Idea · 👀 Watching, with no generic like. This is the "current reaction vocabulary" D-14 retains initially. R-01 governs whether counts are visible.

### A.6 Spaces and project collaboration (§9)

- **CF-16 · One entity, many modes** [in code] (v1.0 §16). A Space is already one entity with a mode flag (`space_mode`: club, lab, venture), which is §9's "one shared foundation". Switching mode never deletes members, history or activity. D-05's Group and Project templates can map onto it as display and configuration, without changing internal identifiers (D-01). How legacy modes map onto audiences and templates stays GATED (D-05).
- **CF-17 · What survives of the 28-day clock** [lesson] (v1.0 §16, §26). v1.0's 28-day idle threshold survives only as D-05's private owner check-in. Three things do not carry: the public Dormant badge, the 70-day warning, and the 84-day Maal → Warshad timeout demotion (D-05; Owner Amendment 01 rules out automatic transitions triggered by inactivity). v1.0 defined activity as a Space update, artifact, decision, Space-scoped post, logged contribution or new task, never a background job. That definition is a [gate input] for D-05's "define meaningful activity".
- **CF-18 · Role mapping is not assumed** [gate input] (v1.0 §16). v1.0 Space roles were Lead, Core, Member and Observer, with contributor specialisations Operator, Researcher and Advisor. Mapping them onto D-04's Owner, Admin, Member and Observer is GATED. Do not assume Lead = Owner or Core = Admin; a lead is a responsibility (D-04). The specialisations are descriptors, not permissions.
- **CF-19 · Fair review** [gate input] (v1.0 §12, §17). These v1.0 practices are inputs to D-05's readiness-rubric and reviewer-authority gate:
  - recusal: a project's own members cannot review it
  - a reviewers-only visibility setting per item
  - written 1–5 rubric anchors for Team, Traction and Feasibility

  Independent-review protections stay intact (§2).
- **CF-20 · Linked Spaces keep separate audiences** [lesson] (v1.0 §16). v1.0 let Spaces link formally and cross-post updates. Under D-05 a cross-post needs permission to share into the destination and an audience preview, and a link never merges audiences. That means v1.0's "co-membership visibility" must be re-checked against private membership before reuse. "Co-own a Candidate" belongs to the capital context (D-08).
- **CF-21 · Starter templates, never a charter gate** [in code] (v1.0 §12, §16). Playbooks are per-purpose starters (services, e-commerce, import/export, agri-food…) that the lead edits. They fit D-05 only as optional starting content inside the Group and Project templates, never as a mandatory charter or quality gate (§9: rich charters are optional).
- **CF-22 · The Space timeline** [in code] (v1.0 §16). Each Space keeps an auditable event log (`lab_events`: joins, exits, mode promotions), alongside its decision log and updates. That history is §9's "preserved context and attribution". Content authored by a deleted member follows D-09's deletion-retention ruling there, as everywhere else. The one timeout-demotion event type left over from v1.0 belongs to a rule that is now retired (CF-17).

### A.7 Messaging, notifications and events (§10)

- **CF-23 · Realtime, and private per-user state** [in code] (v1.0 §11 Phase 3; refined Sep 2026). DMs arrive through Supabase Realtime Postgres changes, with no polling. The Sep 2026 read-state fix taught one lesson: Realtime authorises on row visibility, not column grants. Per-user state that must stay private, such as read markers, therefore lives in its own table, left out of the Realtime publication (`dm_read_states`). That shape extends to D-03's group participants, where read receipts are off by default.
- **CF-24 · Notification defaults** [in code] (v1.0 §22, §26). Every notification appears in-app.
  - Push goes to replies, mentions, new DMs and DM requests, and quiet hours hold it back.
  - Email goes to DM requests and the weekly digest. The candidate-status email belongs to the contained capital context.

  v1.0 also asked for related notifications to be bundled, which is §10's "grouping". Any change to these defaults falls under §10.
- **CF-25 · The digest is a surface** [in code] (v1.0 §21, §28). For low-bandwidth members who rarely open the app, v1.0 argued the weekly digest can *be* the product. Today, a Monday cron pins an AI-authored Plaza post, and sends an email once an email key is configured. **Open (O-5):**
  - Seeded Wins, Asks, Spaces and listings are not filtered out; only events are (§19).
  - The email is on by default, so members must opt out rather than opt in (§10 consent).
  - The pinned post publishes without human review (§19: publishing requires human control).
- **CF-26 · Voice is native** [in code] (v1.0 §25). WhatsApp voice-note habits make voice culturally natural. DM voice notes exist, with a private bucket and a same-origin microphone permission. Voice intros on profiles remain a future idea: about 30 s of Opus, roughly 100 KB, behind a Play control in Data Saver.

### A.8 Discovery, Directory and Map (§11)

- **CF-27 · Pin-drop first; people stay coarse** [lesson] (v1.0 §12, §18). Geocoding APIs fail on Somali addressing, so a manual pin-drop is the primary business-location input, not a fallback; address or landmark text is optional. Personal location stays coarse: free-text city and region, with proximity and timezone matching, and no chapter or city-grouping taxonomy.
- **CF-28 · Name variants are the search test** [in code] (v1.0 §18). A custom folding function maps Maxamed, Mohamed and Mohammed to one key. It covers people (display name and handle) and business names only; posts and Spaces use plain `ilike`, and there is no alias table yet. Widen it only after testing against §11's standard, and never merge people because their names are similar. Postgres search is the current working baseline (F-1). If Meilisearch is ever reactivated, it must pass this same test.
- **CF-29 · How taxonomies grow** [lesson] (v1.0 §18, §26; the lookup-table pattern of 18 Jul).
  - Shared-coordinate lists (lanes, listing categories) are seeded database lookups, extended through suggest-to-admin.
  - Personal descriptors (skills, tags) are seeded and member-creatable.
  - Closed logic sets stay fixed.

  The v1.0 starter lists (15 seed tags, 15 listing categories) are in the archive's §26. The database is the source of truth.
- **CF-30 · Listings built for a WhatsApp diaspora** [in code] (v1.0 §12, §18). WhatsApp is a first-class contact button: a `wa.me` link whose label deliberately doesn't name the channel. Listings also have:
  - opening hours, with an "Open now" check on the viewer's clock
  - a price range ($–$$$$)
  - display-only service rows
  - a photo gallery
  - duplicate detection that offers "claim it instead", backed by a claim flow

  The owner controls which contact methods show (§7).
- **CF-31 · Aggregate intelligence only on real data** [lesson] (v1.0 §18, §27, §28). Four v1.0 ideas carry only under §11's rule: the "Somali business intelligence layer", the planned launch stat ("37 fintech builders in Mogadishu"), the export-readiness score, and the annual "State of Somali Business" report. The rule requires sufficient real data, a documented method and small-group suppression, and no readiness checklist sold as an outcome. v1.0 copy claiming scored listings "get 3× more contact clicks" is withdrawn as unsupported.

### A.9 Trust, verification and reputation (§12)

- **CF-32 · Somalia and KYC** [gate input] (v1.0 §14). Standard KYC providers do not cover Somalia reliably, which is why v1.0 chose live admin calls. That fact belongs in D-06's GATED provider and legal-basis decision. v1.0's recorded face-and-ID calls with 24-month retention do not carry.
- **CF-33 · Platform roles, verifiers and separate claims** [in code] (v1.0 §14, §26).
  - **Roles and grants:** platform roles are member, mod and admin. Verifier is a separate grant (`verifier_grants`, `is_verifier()`), and admins hold it automatically; advisor is a separate grant too. None of these is a Space role.
  - **Operators:** v1.0's scale path used trained, trusted verifiers, with admin spot-checks of their decisions. That matches D-06's expectations for privileged operators.
  - **Claims:** v1.0 never used one conflated badge. Its Identity Verified, Community Verified, Verified Business and skill endorsements map to D-06's Identity checked, Community vouched, Business ownership checked and Skill evidenced. Display labels are subject to native review (D-10).
  - **Vouching:** community vouching still takes 3 vouches. What that proves is bounded by §12 and D-06.
- **CF-34 · Anti-gaming lessons** [gate input] (v1.0 §12, §14). v1.0's reputation formulas used three safeguards:
  - no points for interacting with your own content
  - daily caps (30 points)
  - 90-day time decay, which stops incumbents keeping a permanent advantage (§12)

  These are inputs if D-06 ever approves a formula. The existing contribution and helper scores are not a first-release target; D-06 targets contextual summaries.
- **CF-35 · Three records never convert** [lesson] (v1.0 §14, ruling 5, 6 Aug 2026).
  - Reputation is social standing.
  - A contribution or ledger unit is a work record.
  - A binding vote is one eligible verified member, one vote.

  None converts into another, and none weights a vote: the same line D-07 and D-08 draw. v1.0's framing of Maal ledger units as economic claims, under a member-voted weight scheme, does not carry (D-08). Under §5 the ledger data is existing work history. Isolate or migrate it by proposal. Never delete it or silently reinterpret it.
- **CF-36 · Identity protection** [lesson] (v1.0 §19). Impersonation is prohibited, verified owners can reclaim squatted handles, and notable figures are protected.

### A.10 Safety, privacy and operations (§13)

- **CF-37 · Immutable audit log** [in code] (v1.0 §19). Every mod and admin action writes an append-only audit row. That is consistent with §13 as long as payloads stay minimal and retention follows D-09.
- **CF-38 · Anti-spam defaults** [in code] (v1.0 §19, §26). Free accounts get 5 posts and 10 comments a day, 5 DM requests a day and 2 listings a week. Limits are enforced server-side, with edge rate limiting through Upstash. The paid tier's higher posting allowance (25 posts, 50 comments) is a D-02 entitlement question, not a trust signal. A stricter limit for brand-new accounts is defined in code but not used.
- **CF-39 · Automated screening assists; people decide** [in code] (v1.0 §15, §24).
  - Images are scanned before storage, and flagged images are refused.
  - Text in posts, comments and events is scanned after publishing. Flagged items are hidden, uncertain items stay live, and both go to the human review queue.
  - Providers: OpenAI omni-moderation, Claude Haiku, or a stub. A failed scan lets the content through.

  This is consistent with §12 only while any consequence for an account needs a person.
- **CF-40 · Deletion mechanics** [in code] (v1.0 §19, §26). Members can deactivate, delete with a 30-day grace period, and export their data. What deletion *does* is now D-09's ruling: authored bodies and media are removed or suppressed, and restricted metadata is kept for up to a year. v1.0's "anonymised, not removed" no longer describes the target. Plans: `docs/retention-doctrine.md`, `docs/retention-implementation-plan.md`.
- **CF-41 · Inputs only people can supply** [gate input] (v1.0 §12, §26, updated). None of these can be generated and declared final (§16, §24.18):
  - native-reviewed Somali strings (one native review)
  - final brand assets
  - the community rules and content policy
  - the ToS, Privacy Policy and consent text, with legal review before data collection
  - review of seed content
  - legal review of any capital or ownership copy

### A.11 Membership, sustainability and governance (§14)

- **CF-42 · Billing rails** [gate input] (v1.0 §12, §25). Because Stripe does not support Somalia, v1.0 proposed two rails: a merchant of record (Paddle or Lemon Squeezy) for diaspora cards, and EVC Plus or Zaad for Somalia-side payments through manual operations. v1.0 was inconsistent here (its §25 also said "Stripe where supported"). Treat this as a hypothesis for D-02's provider-eligibility gate, not a decision.
- **CF-43 · Governance log** [in code] (v1.0 §19). Platform-level decisions are published to a Governance Log that members can read. It is the mechanism for §14's "privacy-safe summaries". v1.0's claim that it "operationalises member ownership" does not carry: §14 allows "member-owned" only when the rights exist.

### A.12 Brand, language and interaction design (§16)

- **CF-44 · Plain-language errors** [in code] (v1.0 §26, §27). Every error says what happened, why, and what to do next, links to the fix where one exists, and shows no raw codes. The catalogue is `apps/web/src/lib/errors.ts`; strings live in `packages/i18n`. v1.0's "errors are also conversion moments" does not carry. That means no upgrade prompts (D-02; `docs/xidig-plus-doctrine.md`), no member-facing response-time promises (D-09), and no region or investment messaging (D-08).
- **CF-45 · i18n guardrails** [in code] (v1.0 §22, §25.5).
  - Keys are stable and language-neutral, enforced by three build gates: a lint rule, a coverage floor and a vocabulary lock.
  - Database enum values stay English; the display layer maps them to vocabulary.
  - Relative time is owned by the dictionaries, never `Intl.RelativeTimeFormat`, which silently fell back to English and broke Somali hydration.
  - A third locale is additive: a compile-time `Record<Locale, …>` and `name_<locale>` label columns.

  The 12 Sep naming direction (D-10's labels, plus a vocabulary posture of provisional, meaning-review and superseded terms) is applied on `claude/naming-direction-12sep`, which is pending review. Its `docs/i18n.md` changes land when that branch merges.

### A.13 Data Saver, performance and resilience (§17)

- **CF-46 · Delivery constraint, not scope constraint** [lesson] (v1.0 §12, Phase 4.5 root cause; owner direction 11 Jul). v1.0 first read low bandwidth as "don't build media-heavy features", then had to reverse it. Data Saver defers bytes and never removes features: that is the root of §17 and D-11. The rich experience is the default and Data Saver is opt-in. The mode is platform-neutral state plus tokens, so it can carry over to a native client.
- **CF-47 · MediaSlot** [in code] (v1.0 §22). Every image, embed and map renders through one MediaSlot.
  - **Full mode:** the asset itself.
  - **Data Saver:** a near-zero-byte placeholder (the stored blurhash, or initials), labelled with the alt text and estimated size, with a Show / Muuji control. A "Show all on this page" bar appears when two or more items are hidden.
  - **Preferences:** images, embeds, maps, animations and small avatars can be set individually, or through three bundles (Text only, Essentials, Everything).
  - **Settings:** a weekly data-saved counter.

  New media features should route through MediaSlot rather than be descoped.
- **CF-48 · Offer by connection, never by country** [lesson] (v1.0 §22, filtered by §17). v1.0 auto-offered Lite on a detected 2G/3G connection *or* "in a low-bandwidth region". The connection-based offer can stay, as a remembered choice the user controls. The region trigger does not carry: §17 says not to assume everyone in a country needs a reduced mode. **Open (O-6):** the prompt still ORs the connection check with a country list (`so, et, ke, dj, er, ss, sd, ye`, read from the edge IP header) on every request, although a code comment calls the country check a fallback.
- **CF-49 · No private offline cache** [lesson] (v1.0 §25, filtered by §17). v1.0 considered caching the last feed and DMs for offline reading. DMs and other private data are not cached offline by default. Any feed cache needs the reviewed scope, sign-out clearing and permission re-check that §17 requires.
- **CF-50 · PWA realities** [lesson] (v1.0 §22). The app is an installable PWA. Web push works fully on Android but is limited on iOS (16.4+, installed apps only). Low-end Android browsers are the baseline for D-11's device matrix.

### A.14 Public site, Library, Guide and Support (§18)

- **CF-51 · Sharing is the growth loop — for published content** [in code] (v1.0 §25, §28).
  - **Why:** much of the diaspora lives on WhatsApp, so shared links are the main organic loop.
  - **What exists:** OG images for profiles, listings, Spaces, candidates and the site root.
  - **How sharing works:** copy-link plus the device share sheet, which reaches WhatsApp without a `wa.me` share link. That replaced v1.0's "Share to WhatsApp" button by ruling (11 Jul; `docs/front-door-standard.md` §5.2).
  - **Scope:** under §18, all of this applies only to deliberately published content. v1.0's "This week in Xidig" card is a future digest or Library idea under the same rule.
  - **Positioning:** the differentiator v1.0 named still stands: structured, searchable, persistent collaboration, where group threads scroll away. Public copy names no competitors.
- **CF-52 · Public by publication, not by default** [lesson] (v1.0 §16, §28). v1.0 used public Labs, profiles and listings as an acquisition engine. That loop survives only for deliberately published material. D-05 makes private and unlisted the default, and §11 makes personal sharing opt-in. Published pages are server-rendered for search engines, and OG cards and sitemaps follow publication (§18).

### A.15 AI, integrations and partners (§19)

- **CF-53 · Seed hygiene** [in code] (v1.0 §11 Phase 8, §21). This is the machinery behind §19's labelling and exclusion rule:
  - Content rows carry a `source` of member, seed or ai.
  - Seed runs are idempotent and recorded in `seed_runs`.
  - Seeded and AI content earns no reputation: seed code paths never award it, and the database blocks AI accounts from earning helper score.

  v1.0's cold-start strategy does not carry: seeding an active-looking community and having AI accounts answer Asks. The platform does not simulate a population, and publishing needs human control (§19, D-15). For where seed content still reaches the digest, see CF-25.
- **CF-54 · Keys and scopes** [in code] (v1.0 §21). External API keys are stored as hashes only, and they are scoped, rate-limited, audited and revocable. Since Sep 2026, members can mint only read keys. Write scopes publish as the platform, so they are admin-only and used for operations. This matches D-15's "specific approved use cases with scoped access, revocation and audit". v1.0's open read/write MCP for external agents does not carry.

### A.16 Technical architecture and engineering discipline (§20)

- **CF-55 · Future-ready architecture, Somali-first surface** [lesson] (v1.0 §25.5; rules from the Sep 2026 extensibility audit). The sync rule: *surface positioning stays Somali-first, the architecture stays extensible, and no global launch features ship unless separately approved.*
  - **Hardcode at the surface only.** Copy, brand and seeded data are rightly Somali-first: Somali people and businesses, the diaspora, EN/SO at launch, Somali-economy seed tags, lanes and categories.
  - **Not in the architecture.** Schema, RLS, API logic, search and matching, i18n plumbing and URL structure must not assume any of these is permanent: one community, one audience, two locales, one tag vocabulary, one geography, one verification type, one partner type.
  - **Working rules.**
    - Lookup or config tables for growing lists (tiers, lanes, skills, categories, badges); enums only for closed state machines.
    - Search and matching join on normalised IDs, slugs or tokens, never on display labels.
    - Access goes through roles, capabilities or lookup joins (e.g. `has_entitlement()`, `has_capability()`), never a literal tier slug, country or locale in a policy or route branch.
    - Display text and logic inputs are separate fields (free-text `location_country` vs the derived `location_country_code`).
    - A third locale must be additive (CF-45).
  - **Audit classification.** Every hardcoding finding is one of: (1) correct surface copy; (2) an acceptable current constant, documented; (3) risky architecture hardcoding, fixed minimally; (4) scope creep, rejected.
  - **Do not build these yet; they wait for a real flow:**
    - a communities or markets table, or `community_id` columns
    - locale-prefixed URLs or hreflang
    - translation-table engines
    - a country gazetteer or geocoder
    - a config-driven verification-type registry
    - partner or programme abstractions
    - UI for hypothetical non-Somali audiences
  - **No worldwide repositioning.** Future-ready seams are an architecture posture only. They do not reposition the product as generic or worldwide in copy, SEO or strategy.
- **CF-56 · A platform-neutral operation layer** [lesson] (v1.0 §22, filtered by §20). v1.0 went "API-first" so a React Native app could reuse the backend in v1.2. Keep the goal, but drop the schedule and the self-HTTP reading. Permission-enforced operations stay platform-neutral so a future native client could reuse them, and internal server code calls them directly (§20).
- **CF-57 · Negative tests for every table** [lesson] (v1.0 §11 fixed footer). Every new table ships with RLS policies, plus negative tests proving that user A cannot read user B's private or gated rows. This is the floor under §22's broader authorisation checks (API, storage, realtime, search, exports, previews, notification payloads).
- **CF-58 · Migrations are cheap when honest** [lesson] (v1.0 §12 governance note, engineering half). Additive, backward-compatible columns are cheap at any stage. A justified breaking change is fine with a real migration and updated dependents, matching D-16's "no upfront whole-future schema freeze". The note's product half ("wins override stale PRD text") does not carry: product changes need an explicit owner ruling (§2, §24.0).
- **CF-59 · The stack actually in use** [in code] (v1.0 §24, per §20's instruction to verify the repository).
  - **Platform:** Supabase (Postgres + RLS, auth, storage, realtime) and Next.js on Vercel, with Vercel cron for scheduling and Vercel Web Analytics at the essential tier.
  - **Services:** Sentry for errors and sharp for images. PostHog, Upstash and Resend are called over REST, and blurhash is in-house.
  - **Maps:** Leaflet on OpenStreetMap tiles, not the MapLibre v1.0 recommended; MapTiler is only an optional key.
  - **Not used:** v1.0's suggested job runners (Inngest, Trigger.dev) and Postmark.

  Search runs on Postgres, the current working baseline; Meilisearch is set up but unused (F-1).
- **CF-60 · Environments and recovery** [gate input] (v1.0 §24). v1.0 specified dev, staging and prod environments, nightly backups and point-in-time recovery. Restore drills, RTO/RPO and the device matrix remain D-11 GATED. Do not treat "backups exist" as "restore is tested".

### A.17 Measurement and validation (§21)

- **CF-61 · Analytics consent and payloads** [in code] (v1.0 §23; `docs/consent-capture.md`). Product analytics (PostHog) capture nothing without an active analytics consent record. Anonymous events are dropped, a failed consent lookup counts as no consent, and payloads carry no PII. Vercel Web Analytics is separate: it runs at the essential tier and switches off only on an explicit decline.
- **CF-62 · Not measured is not zero** [lesson] (v1.0 §4, §23; Phase 7 finding, 8 Jul). Some v1.0 taxonomy events cannot fire at all in the shipped flows (e.g. `signup_completed`, `invite_accepted`, `lab_revived`). That is D-12's "missing event history is 'not measured,' not zero". Reuse the taxonomy (`apps/web/src/lib/analytics/events.ts`) only where an event serves a §21 scorecard. v1.0's volume metrics are not success measures here: weekly Wins and Asks, Labs created, WAU/MAU. Nor are its capital-interest events.
