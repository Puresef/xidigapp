import { describe, expect, it } from 'vitest';

import { RESERVED_EVENT_SLUGS } from '@/lib/events/slug';

import {
  CANDIDATE_COPY,
  DM_THREADS,
  EVENTS,
  HITL_REVIEWS,
  LAB_ARTIFACTS,
  LAB_DECISIONS,
  LAB_UPDATES,
  LISTINGS,
  MODERATION_CASES,
  THREADS,
} from './content';
import {
  DM_THREADS_2,
  HITL_REVIEWS_2,
  LAB_ARTIFACTS_2,
  LAB_DECISIONS_2,
  LAB_UPDATES_2,
  MODERATION_CASES_2,
  THREADS_2,
  WAVE1_IMAGE_BACKFILL,
} from './content-wave2';
import { buildFollowEdges, ENDORSEMENTS, LAB_FOLLOWS, TAG_FOLLOWS, VOUCHES } from './graph';
import { PERSONAS_BY_HANDLE, TEST_AI_HELPERS, TEST_PERSONAS, testEmail } from './personas';
import { CANDIDATE_META, SEED_COLLABORATION, SEED_SPACES, SEED_SPACES_WAVE2 } from './spaces';

/**
 * Structural guards for the test-community dataset. These make the design
 * rules mechanical: every referenced handle/slug/tag must exist, moderation
 * cases must point at real content, and the login convention must hold.
 * Expanding the dataset without honoring the rules fails CI.
 */

const HANDLES = new Set([
  ...TEST_PERSONAS.map((p) => p.handle),
  ...TEST_AI_HELPERS.map((h) => h.handle),
  'xidig_ai',
]);
const SPACE_SLUGS = new Set(SEED_SPACES.map((s) => s.slug));
const THREAD_KEYS = new Set(THREADS.map((t) => t.key));
const REACTION_TYPES = new Set(['fire', 'strong', 'mashallah', 'idea', 'watching']);
const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const TAG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

describe('personas', () => {
  it('has exactly 60 personas + 2 extra AI helpers, unique handles/emails', () => {
    expect(TEST_PERSONAS).toHaveLength(60);
    expect(TEST_AI_HELPERS).toHaveLength(2);
    expect(HANDLES.size).toBe(63);
    const emails = new Set([...TEST_PERSONAS, ...TEST_AI_HELPERS].map((p) => testEmail(p.handle)));
    expect(emails.size).toBe(62);
    for (const email of emails) expect(email.endsWith('@example.com')).toBe(true);
  });

  it('handles satisfy the profiles.handle CHECK', () => {
    for (const h of HANDLES) expect(h, h).toMatch(HANDLE_RE);
  });

  it('skills/lanes are lowercase (DB triggers normalise, but data should match)', () => {
    for (const p of TEST_PERSONAS) {
      for (const s of p.skills) expect(s, `${p.handle}:${s}`).toBe(s.toLowerCase());
      for (const l of p.lanes) expect(l, `${p.handle}:${l}`).toBe(l.toLowerCase());
    }
  });

  it('covers the required diversity axes', () => {
    const by = <K extends string>(f: (p: (typeof TEST_PERSONAS)[number]) => K) =>
      new Set(TEST_PERSONAS.map(f));
    expect(by((p) => p.ageBand).size).toBeGreaterThanOrEqual(6);
    expect(by((p) => p.locationCountry ?? '??').size).toBeGreaterThanOrEqual(12);
    expect(by((p) => p.completeness).size).toBe(4);
    expect(TEST_PERSONAS.filter((p) => p.membershipTier === 'supporter').length).toBeGreaterThanOrEqual(10);
    expect(TEST_PERSONAS.filter((p) => p.lowBandwidth).length).toBeGreaterThanOrEqual(6);
    expect(TEST_PERSONAS.filter((p) => p.preferredLanguage === 'so').length).toBeGreaterThanOrEqual(15);
    expect(TEST_PERSONAS.filter((p) => p.role === 'mod').length).toBe(2);
    expect(TEST_PERSONAS.filter((p) => p.role === 'admin').length).toBe(1);
    expect(TEST_PERSONAS.filter((p) => p.isVerifier).length).toBeGreaterThanOrEqual(1);
    expect(TEST_PERSONAS.filter((p) => p.accountStatus === 'suspended')).toHaveLength(1);
    expect(TEST_PERSONAS.filter((p) => p.accountStatus === 'deactivated')).toHaveLength(1);
    for (const risk of ['normal', 'heated', 'spammy', 'needs_review'] as const) {
      expect(TEST_PERSONAS.some((p) => p.moderationRisk === risk), risk).toBe(true);
    }
  });
});

describe('threads', () => {
  it('unique keys, known authors, valid tags and reactions', () => {
    expect(THREAD_KEYS.size).toBe(THREADS.length);
    for (const t of THREADS) {
      expect(HANDLES.has(t.authorHandle), `${t.key} author`).toBe(true);
      for (const tag of t.tags) expect(tag, `${t.key} tag ${tag}`).toMatch(TAG_RE);
      for (const r of t.reactions) {
        expect(HANDLES.has(r.handle), `${t.key} reaction ${r.handle}`).toBe(true);
        expect(REACTION_TYPES.has(r.type), `${t.key} reaction type`).toBe(true);
      }
      const seen = new Set<string>();
      for (const r of t.reactions) {
        const k = `${r.handle}:${r.type}`;
        expect(seen.has(k), `${t.key} duplicate reaction ${k}`).toBe(false);
        seen.add(k);
      }
      for (const c of t.comments) {
        expect(HANDLES.has(c.authorHandle), `${t.key} comment author ${c.authorHandle}`).toBe(true);
        expect(c.body.length, `${t.key} comment length`).toBeGreaterThan(5);
        for (const r of c.reactions ?? []) {
          expect(HANDLES.has(r.handle), `${t.key} comment reaction`).toBe(true);
          expect(r.handle, `${t.key} comment self-reaction`).not.toBe(c.authorHandle);
        }
      }
    }
  });

  it('asks have at most one credited answer; polls are well-formed', () => {
    for (const t of THREADS) {
      const credited = t.comments.filter((c) => c.credited).length;
      if (t.type === 'ask') expect(credited, t.key).toBeLessThanOrEqual(1);
      else expect(credited, t.key).toBe(0);
      if (t.type === 'poll') {
        expect(t.poll, t.key).toBeDefined();
        expect(t.poll!.options.length).toBeGreaterThanOrEqual(2);
        expect(t.poll!.options.length).toBeLessThanOrEqual(6);
        const voters = new Set<string>();
        for (const v of t.poll!.votes) {
          expect(v.option, `${t.key} vote option`).toBeLessThan(t.poll!.options.length);
          expect(HANDLES.has(v.handle), `${t.key} voter`).toBe(true);
          expect(voters.has(v.handle), `${t.key} duplicate voter ${v.handle}`).toBe(false);
          voters.add(v.handle);
        }
      } else {
        expect(t.poll, t.key).toBeUndefined();
      }
    }
  });

  it('AI accounts author labelled content only (never impersonate members)', () => {
    for (const t of THREADS) {
      if (t.authorHandle.endsWith('_ai')) expect(t.source ?? 'ai', t.key).toBe('ai');
    }
  });
});

describe('spaces + lab content', () => {
  it('space slugs unique; leads are members with role lead; labs have charters', () => {
    expect(SPACE_SLUGS.size).toBe(SEED_SPACES.length);
    for (const s of SEED_SPACES) {
      expect(HANDLES.has(s.leadHandle), s.slug).toBe(true);
      const lead = s.members.find((m) => m.handle === s.leadHandle);
      expect(lead?.role, `${s.slug} lead membership`).toBe('lead');
      expect(s.members.filter((m) => m.role === 'lead')).toHaveLength(1);
      if (s.spaceMode === 'lab') expect(s.charter, `${s.slug} charter`).toBeDefined();
      for (const m of s.members) expect(HANDLES.has(m.handle), `${s.slug}:${m.handle}`).toBe(true);
    }
    expect(SPACE_SLUGS.has(SEED_COLLABORATION.labASlug)).toBe(true);
    expect(SPACE_SLUGS.has(SEED_COLLABORATION.labBSlug)).toBe(true);
  });

  it('lab content references known spaces and member authors', () => {
    for (const u of LAB_UPDATES) {
      expect(SPACE_SLUGS.has(u.labSlug), u.title).toBe(true);
      expect(HANDLES.has(u.authorHandle), u.title).toBe(true);
      if (u.authorHandle.endsWith('_ai')) expect(u.source, u.title).toBe('ai');
    }
    for (const a of LAB_ARTIFACTS) {
      expect(SPACE_SLUGS.has(a.labSlug), a.title).toBe(true);
      expect(a.url.startsWith('https://example.com/'), `${a.title} demo-url only`).toBe(true);
    }
    for (const d of LAB_DECISIONS) expect(SPACE_SLUGS.has(d.labSlug), d.title).toBe(true);
  });

  it('candidate reviewers are mods who are NOT members of the candidate lab (recusal)', () => {
    const lab = SEED_SPACES.find((s) => s.slug === CANDIDATE_META.xawilaad.labSlug)!;
    const memberHandles = new Set(lab.members.map((m) => m.handle));
    for (const r of CANDIDATE_META.xawilaad.reviews) {
      const persona = PERSONAS_BY_HANDLE.get(r.reviewerHandle)!;
      expect(['mod', 'admin'].includes(persona.role), r.reviewerHandle).toBe(true);
      expect(memberHandles.has(r.reviewerHandle), `${r.reviewerHandle} recusal`).toBe(false);
    }
    for (const v of CANDIDATE_META.xawilaad.votes) {
      expect(PERSONAS_BY_HANDLE.get(v.handle)?.membershipTier, `${v.handle} vote needs supporter`).toBe(
        'supporter',
      );
    }
    expect(CANDIDATE_COPY.xawilaad.ask.length).toBeGreaterThan(50);
    expect(CANDIDATE_COPY.hooyo.ask.length).toBeGreaterThan(50);
  });
});

describe('DMs + moderation', () => {
  it('one thread per pair, no self-DMs, chronological-ish messages', () => {
    const pairs = new Set<string>();
    for (const d of DM_THREADS) {
      expect(d.aHandle).not.toBe(d.bHandle);
      const pair = [d.aHandle, d.bHandle].sort().join('|');
      expect(pairs.has(pair), `duplicate DM pair ${pair}`).toBe(false);
      pairs.add(pair);
      expect(d.messages.length).toBeGreaterThan(0);
      for (const m of d.messages) {
        expect([d.aHandle, d.bHandle].includes(m.from), `${d.key} sender`).toBe(true);
      }
      expect(d.unreadCountForRecipient).toBeLessThanOrEqual(d.messages.length);
    }
  });

  it('moderation cases point at real content and follow the recusal rule', () => {
    for (const c of MODERATION_CASES) {
      expect(HANDLES.has(c.reporterHandle), c.key).toBe(true);
      const target = c.target;
      if (target.kind === 'message') {
        const dm = DM_THREADS.find((d) => d.key === target.dmKey);
        expect(dm, `${c.key} dm`).toBeDefined();
        expect(dm!.messages[target.messageIndex], `${c.key} message index`).toBeDefined();
        // §13: only participants may report a DM message.
        const sender = dm!.messages[target.messageIndex]!.from;
        expect([dm!.aHandle, dm!.bHandle].includes(c.reporterHandle), `${c.key} participant`).toBe(true);
        expect(sender).not.toBe(c.reporterHandle);
      } else if (target.kind === 'lab') {
        expect(target.labSlug.length, `${c.key} lab slug`).toBeGreaterThan(0);
      } else {
        expect(THREAD_KEYS.has(target.threadKey), `${c.key} thread`).toBe(true);
        if (target.kind === 'comment') {
          const thread = THREADS.find((t) => t.key === target.threadKey)!;
          expect(thread.comments[target.commentIndex], `${c.key} comment index`).toBeDefined();
        }
      }
      if (c.appeal) {
        const actor = c.actions?.[c.actions.length - 1]?.actorHandle;
        expect(c.appeal.reviewedByHandle, `${c.key} appeal recusal`).not.toBe(actor);
      }
      for (const a of c.actions ?? []) {
        expect(['mod', 'admin'].includes(PERSONAS_BY_HANDLE.get(a.actorHandle)?.role ?? ''), a.actorHandle).toBe(true);
      }
    }
    for (const h of HITL_REVIEWS) expect(THREAD_KEYS.has(h.threadKey), h.threadKey).toBe(true);
  });
});

describe('wave 2 (living-app density)', () => {
  const SCENES = new Set([
    'fields', 'river', 'waves', 'skyline', 'market', 'board', 'code', 'pitch', 'port',
    'workshop', 'road', 'shelves', 'stage', 'courtyard', 'circleMeet', 'library', 'clinic', 'abstract',
  ]);
  const ALL_KEYS = new Set([...THREADS, ...THREADS_2].map((t) => t.key));
  const ALL_SLUGS = new Set([...SEED_SPACES, ...SEED_SPACES_WAVE2].map((s) => s.slug));

  it('thread keys and DM pairs stay unique across BOTH waves', () => {
    expect(ALL_KEYS.size).toBe(THREADS.length + THREADS_2.length);
    const pairs = new Set<string>();
    for (const d of [...DM_THREADS, ...DM_THREADS_2]) {
      const pair = [d.aHandle, d.bHandle].sort().join('|');
      expect(pairs.has(pair), `duplicate DM pair ${pair}`).toBe(false);
      pairs.add(pair);
    }
  });

  it('wave-2 threads: known authors/scenes, valid structure, AI labelled', () => {
    for (const t of THREADS_2) {
      expect(HANDLES.has(t.authorHandle), `${t.key} author`).toBe(true);
      if (t.image) expect(SCENES.has(t.image.scene), `${t.key} scene`).toBe(true);
      if (t.authorHandle.endsWith('_ai') || t.authorHandle === 'xidig_ai') {
        expect(t.source, `${t.key} AI source`).toBe('ai');
      }
      for (const c of t.comments) {
        expect(HANDLES.has(c.authorHandle), `${t.key} comment author`).toBe(true);
      }
      for (const r of t.reactions) expect(HANDLES.has(r.handle), `${t.key} reaction`).toBe(true);
    }
    // Density target: the two waves together land in the 80–150 post range
    // (skipped while content-wave2.ts is still the placeholder).
    if (THREADS_2.length > 0) {
      expect(THREADS.length + THREADS_2.length).toBeGreaterThanOrEqual(80);
      expect(THREADS.length + THREADS_2.length).toBeLessThanOrEqual(150);
    }
  });

  it('wave-2 spaces: unique slugs, leads valid, lifecycle states present', () => {
    expect(ALL_SLUGS.size).toBe(SEED_SPACES.length + SEED_SPACES_WAVE2.length);
    expect(SEED_SPACES.length + SEED_SPACES_WAVE2.length).toBeGreaterThanOrEqual(8);
    for (const s of SEED_SPACES_WAVE2) {
      expect(HANDLES.has(s.leadHandle), s.slug).toBe(true);
      if (s.spaceMode === 'lab') expect(s.charter, `${s.slug} charter`).toBeDefined();
      for (const m of s.members) expect(HANDLES.has(m.handle), `${s.slug}:${m.handle}`).toBe(true);
    }
    expect(SEED_SPACES_WAVE2.some((s) => s.dormantSinceDaysAgo !== undefined), 'abandoned space').toBe(true);
    expect(SEED_SPACES_WAVE2.some((s) => s.stage === 'launched'), 'successful space').toBe(true);
    const statuses = SEED_SPACES_WAVE2.flatMap((s) => s.members.map((m) => m.status ?? 'active'));
    expect(statuses.includes('requested'), 'join-request member').toBe(true);
    expect(statuses.includes('invited'), 'invited member').toBe(true);
  });

  it('wave-2 lab content and fixtures reference real spaces/threads', () => {
    for (const u of LAB_UPDATES_2) {
      expect(ALL_SLUGS.has(u.labSlug), u.title).toBe(true);
      if (u.authorHandle.endsWith('_ai')) expect(u.source, u.title).toBe('ai');
    }
    for (const a of LAB_ARTIFACTS_2) expect(ALL_SLUGS.has(a.labSlug), a.title).toBe(true);
    for (const d of LAB_DECISIONS_2) expect(ALL_SLUGS.has(d.labSlug), d.title).toBe(true);
    for (const c of MODERATION_CASES_2) {
      expect(c.details.startsWith('[test-fixture]'), `${c.key} fixture marker`).toBe(true);
      const target = c.target;
      if (target.kind === 'lab') expect(ALL_SLUGS.has(target.labSlug), c.key).toBe(true);
      else if (target.kind !== 'message') expect(ALL_KEYS.has(target.threadKey), c.key).toBe(true);
    }
    for (const h of HITL_REVIEWS_2) expect(ALL_KEYS.has(h.threadKey), h.threadKey).toBe(true);
    for (const [key, image] of Object.entries(WAVE1_IMAGE_BACKFILL)) {
      const thread = THREADS.find((t) => t.key === key);
      expect(thread, `backfill ${key}`).toBeDefined();
      expect(thread!.title, `backfill ${key} needs a title (lookup key)`).toBeTruthy();
      expect(SCENES.has(image.scene), `backfill ${key} scene`).toBe(true);
    }
  });
});

describe('listings, events, graph', () => {
  it('listings: owners exist; provenance is a badge, never a text label (§21)', () => {
    for (const l of LISTINGS) {
      if (l.ownerHandle) expect(HANDLES.has(l.ownerHandle), l.key).toBe(true);
      // The seeder derives source ('seed' when unowned) — ContentSourceBadge
      // renders the chip from it, so names/descriptions stay label-free.
      expect(l.businessName, `${l.key} name must not carry a text label`).not.toMatch(/\(demo\)/i);
      expect(l.shortDescription, `${l.key} description must not lead with a demo label`).not.toMatch(
        /^Demo listing[.:]/,
      );
    }
    expect(LISTINGS.filter((l) => l.ownerHandle === null)).toHaveLength(1);
  });

  it('events: hosts satisfy creation rights (mod or lab lead); RSVPs valid', () => {
    for (const e of EVENTS) {
      const host = PERSONAS_BY_HANDLE.get(e.hostHandle)!;
      const isLabLead = SEED_SPACES.some((s) => s.leadHandle === e.hostHandle);
      expect(host.role === 'mod' || host.role === 'admin' || isLabLead, `${e.key} host rights`).toBe(true);
      const seen = new Set<string>();
      for (const r of e.rsvps) {
        expect(HANDLES.has(r.handle), `${e.key} rsvp`).toBe(true);
        expect(seen.has(r.handle), `${e.key} duplicate rsvp`).toBe(false);
        seen.add(r.handle);
      }
      if (e.capacity) expect(e.rsvps.filter((r) => r.status === 'going').length).toBeLessThanOrEqual(e.capacity);
    }
  });

  it('graph references known handles/slugs and respects constraints', () => {
    for (const [follower, target] of buildFollowEdges()) {
      expect(HANDLES.has(follower), follower).toBe(true);
      expect(HANDLES.has(target), target).toBe(true);
      expect(follower).not.toBe(target);
    }
    for (const handles of Object.values(TAG_FOLLOWS)) {
      for (const h of handles) expect(HANDLES.has(h), h).toBe(true);
    }
    for (const slug of Object.keys(LAB_FOLLOWS)) expect(SPACE_SLUGS.has(slug), slug).toBe(true);
    for (const [endorser, endorsee, skill] of ENDORSEMENTS) {
      expect(endorser).not.toBe(endorsee);
      expect(PERSONAS_BY_HANDLE.get(endorsee)?.skills.includes(skill), `${endorsee}:${skill}`).toBe(true);
    }
    for (const [vouchee, vouchers] of Object.entries(VOUCHES)) {
      expect(vouchers.includes(vouchee), `${vouchee} self-vouch`).toBe(false);
      expect(new Set(vouchers).size).toBe(vouchers.length);
      const persona = PERSONAS_BY_HANDLE.get(vouchee)!;
      if (persona.verification === 'community_verified') {
        expect(vouchers.length, `${vouchee} needs 3 vouches`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('reserved event slugs', () => {
  it('no seeded event key collides with a next.config 301-shadowed slug', () => {
    // The seeder inserts events with hardcoded keys as slugs, bypassing
    // allocateEventSlug's RESERVED_EVENT_SLUGS guard — a reserved key here
    // would mint an event whose URL permanently 308s to /waitlist.
    for (const event of EVENTS) {
      expect(RESERVED_EVENT_SLUGS.has(event.key), event.key).toBe(false);
    }
  });
});
