import { createTranslator } from '@xidig/i18n';
import { describe, expect, it } from 'vitest';

import { resolveCreationRight, containerOf, type CreationFacts } from './authz';
import { RSVP_COUNT_FLOOR } from './constants';
import { eventToIcs, googleCalendarUrl, icsEscape, icsUtc } from './ics';
import { eventCreateSchema, eventUpdateSchema, isValidTimezone, rsvpSchema } from './schemas';
import { RESERVED_EVENT_SLUGS, allocateEventSlug, slugifyEventTitle } from './slug';
import {
  EVENT_MEMBER_COLUMNS,
  EVENT_PUBLIC_COLUMNS,
  eventCoverView,
  foldCardCounts,
  foldEventReveal,
  foldPublicRsvpCounts,
  foldRsvpCounts,
  isEnded,
  resolveAttendedCount,
  resolveVenueFacts,
  sliceAttendeeSamples,
  splitTabs,
} from './views';

/**
 * Events + RSVP pure-logic suite (extras item 8): the creation-authorization
 * matrix, the locked privacy folds (count floor, address/link reveal), the
 * projection column lists, the hand-rolled ICS output and the zod
 * cross-field rules. RLS itself is covered in packages/db/src/events.test.ts.
 */

// --- creation authorization matrix (locked, alpha-conservative) ---------------

describe('resolveCreationRight', () => {
  const cases: Array<[CreationFacts, boolean, string]> = [
    // mods/admins: any container, including none (community events).
    [{ role: 'admin', container: 'none' }, true, 'admin community event'],
    [{ role: 'mod', container: 'none' }, true, 'mod community event'],
    [{ role: 'admin', container: 'candidate' }, true, 'admin candidate event'],
    [{ role: 'mod', container: 'lab', labRole: null }, true, 'mod for any lab'],
    // Lab/Club organizers (lead/core, active) for THEIR Space.
    [{ role: 'member', container: 'lab', labRole: 'lead' }, true, 'lab lead'],
    [{ role: 'member', container: 'lab', labRole: 'core' }, true, 'lab core'],
    [{ role: 'member', container: 'lab', labRole: 'member' }, false, 'plain lab member'],
    [{ role: 'member', container: 'lab', labRole: 'observer' }, false, 'lab observer'],
    [{ role: 'member', container: 'lab', labRole: null }, false, 'non-member of the lab'],
    // Verified businesses for THEIR listing.
    [
      { role: 'member', container: 'listing', ownsListing: true, listingVerified: true },
      true,
      'verified listing owner',
    ],
    [
      { role: 'member', container: 'listing', ownsListing: true, listingVerified: false },
      false,
      'unverified listing owner',
    ],
    [
      { role: 'member', container: 'listing', ownsListing: false, listingVerified: true },
      false,
      "someone else's verified listing",
    ],
    // Plain members without a container: later, not at alpha (locked).
    [{ role: 'member', container: 'none' }, false, 'plain member, no container'],
    // Candidate-container events are mod/admin-only for now.
    [{ role: 'member', container: 'candidate' }, false, 'member candidate event'],
  ];

  it.each(cases)('%#: %j -> %s (%s)', (facts, allowed) => {
    expect(resolveCreationRight(facts)).toBe(allowed);
  });
});

describe('containerOf', () => {
  it('maps the first present id to its container kind, else none', () => {
    expect(containerOf({ labId: 'a' })).toEqual({ kind: 'lab', labId: 'a' });
    expect(containerOf({ listingId: 'b' })).toEqual({ kind: 'listing', listingId: 'b' });
    expect(containerOf({ candidateId: 'c' })).toEqual({ kind: 'candidate', candidateId: 'c' });
    expect(containerOf({})).toEqual({ kind: 'none' });
  });
});

// --- locked privacy folds -------------------------------------------------------

describe('foldRsvpCounts (member surfaces: exact, Task 4)', () => {
  it('passes exact counts through for members — the floor is retired on signed-in surfaces', () => {
    expect(foldRsvpCounts(2, 3, false)).toEqual({ going: 2, interested: 3 });
    expect(foldRsvpCounts(RSVP_COUNT_FLOOR - 1, 0, false)).toEqual({
      going: RSVP_COUNT_FLOOR - 1,
      interested: 0,
    });
  });

  it('the host sees exact numbers too (it is their attendee list)', () => {
    expect(foldRsvpCounts(1, 2, true)).toEqual({ going: 1, interested: 2 });
    expect(foldRsvpCounts(0, 0, true)).toEqual({ going: 0, interested: 0 });
  });
});

describe('foldPublicRsvpCounts (N>=5 floor, signed-out projection ONLY)', () => {
  it('suppresses sub-floor counts on the login-free surface', () => {
    expect(foldPublicRsvpCounts(RSVP_COUNT_FLOOR - 1, 0)).toEqual({
      going: null,
      interested: null,
    });
    expect(foldPublicRsvpCounts(RSVP_COUNT_FLOOR, RSVP_COUNT_FLOOR + 2)).toEqual({
      going: RSVP_COUNT_FLOOR,
      interested: RSVP_COUNT_FLOOR + 2,
    });
    // Each count is floored independently.
    expect(foldPublicRsvpCounts(12, 3)).toEqual({ going: 12, interested: null });
  });
});

describe('foldEventReveal (address toggle + attendee-only link)', () => {
  const row = {
    venue_address: '12 Secret Street',
    address_visibility: 'attendees',
    online_url: 'https://meet.example.com/xyz',
  };

  it("address_visibility='attendees': only host and confirmed 'going' see the address", () => {
    expect(foldEventReveal(row, { isHost: false, isGoing: false })).toEqual({
      venueAddress: null,
      onlineUrl: null,
    });
    expect(foldEventReveal(row, { isHost: false, isGoing: true })).toEqual({
      venueAddress: '12 Secret Street',
      onlineUrl: 'https://meet.example.com/xyz',
    });
    expect(foldEventReveal(row, { isHost: true, isGoing: false })).toEqual({
      venueAddress: '12 Secret Street',
      onlineUrl: 'https://meet.example.com/xyz',
    });
  });

  it("address_visibility='everyone' reveals the address but NEVER the online link", () => {
    const open = { ...row, address_visibility: 'everyone' };
    expect(foldEventReveal(open, { isHost: false, isGoing: false })).toEqual({
      venueAddress: '12 Secret Street',
      onlineUrl: null, // link stays attendees-only regardless of the toggle
    });
  });

  it('null fields stay null for everyone', () => {
    expect(
      foldEventReveal(
        { venue_address: null, address_visibility: 'everyone', online_url: null },
        { isHost: true, isGoing: true },
      ),
    ).toEqual({ venueAddress: null, onlineUrl: null });
  });
});

describe('resolveVenueFacts (Task 6 review fix 1: the Goobta row must not drop a revealed value)', () => {
  const t = createTranslator('en');

  it('named venue + revealed address: name is the primary value, address the secondary line', () => {
    expect(
      resolveVenueFacts(
        { venue_name: 'Xarunta Hargeisa', mode: 'in_person' },
        { venueAddress: '12 Secret Street' },
        t,
      ),
    ).toEqual({ primary: 'Xarunta Hargeisa', secondary: '12 Secret Street', secondaryIsNote: false });
  });

  it('named venue, address NOT revealed to this viewer: the attendees-only note, not a blank', () => {
    expect(
      resolveVenueFacts(
        { venue_name: 'Xarunta Hargeisa', mode: 'in_person' },
        { venueAddress: null },
        t,
      ),
    ).toEqual({
      primary: 'Xarunta Hargeisa',
      secondary: 'The exact address is shared with confirmed attendees.',
      secondaryIsNote: true,
    });
  });

  // The bug this fix closes: an in-person event can have venue_name = null
  // while the reveal still carries an address (attendee/host viewer, or
  // address_visibility = 'everyone') — the row must still render, with the
  // address AS the value, not vanish because there's no name to gate on.
  it('in-person, venue_name null, address REVEALED: the row survives — address is the value', () => {
    expect(
      resolveVenueFacts({ venue_name: null, mode: 'in_person' }, { venueAddress: '9 Market Rd' }, t),
    ).toEqual({ primary: '9 Market Rd', secondary: null, secondaryIsNote: false });
  });

  it('in-person, venue_name null, address NOT revealed: nothing to show — the row is omitted', () => {
    expect(
      resolveVenueFacts({ venue_name: null, mode: 'in_person' }, { venueAddress: null }, t),
    ).toEqual({ primary: null, secondary: null, secondaryIsNote: false });
  });

  it("online event with no venue_name: primary falls back to the 'Online' label", () => {
    expect(
      resolveVenueFacts({ venue_name: null, mode: 'online' }, { venueAddress: null }, t),
    ).toEqual({ primary: 'Online', secondary: null, secondaryIsNote: false });
  });
});

describe('projection column lists (the login-free surface leaks nothing)', () => {
  it('the public projection never carries venue_address / online_url / moderation_status', () => {
    for (const column of ['venue_address', 'online_url', 'moderation_status']) {
      expect(EVENT_PUBLIC_COLUMNS).not.toContain(column);
    }
  });

  it('even the member projection excludes the two reveal-gated columns (column grant twin)', () => {
    for (const column of ['venue_address', 'online_url']) {
      expect(EVENT_MEMBER_COLUMNS).not.toContain(column);
    }
  });
});

// --- ICS output -------------------------------------------------------------------

describe('eventToIcs', () => {
  const input = {
    slug: 'demo-day-hargeisa',
    title: 'Demo day; Hargeisa, 2026',
    description: 'Line one\nLine two',
    startsAt: '2026-08-01T18:30:00+03:00',
    endsAt: null,
    location: 'Hargeisa Hub',
    url: 'https://xidig.net/events/demo-day-hargeisa',
  };

  it('emits a CRLF VCALENDAR with UTC times and a stable UID', () => {
    const ics = eventToIcs(input);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:event-demo-day-hargeisa@xidig');
    // 18:30+03:00 == 15:30Z; no ends_at -> a 1-hour block.
    expect(ics).toContain('DTSTART:20260801T153000Z');
    expect(ics).toContain('DTEND:20260801T163000Z');
    expect(ics).toContain('URL:https://xidig.net/events/demo-day-hargeisa');
  });

  it('escapes RFC 5545 TEXT characters in summary/description/location', () => {
    const ics = eventToIcs(input);
    expect(ics).toContain('SUMMARY:Demo day\\; Hargeisa\\, 2026');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(icsEscape('a\\b')).toBe('a\\\\b');
  });

  it('omits LOCATION when the caller folded it away', () => {
    const ics = eventToIcs({ ...input, location: null });
    expect(ics).not.toContain('LOCATION:');
  });

  it('icsUtc renders the compact UTC form', () => {
    expect(icsUtc('2026-08-01T15:30:00Z')).toBe('20260801T153000Z');
  });
});

describe('googleCalendarUrl', () => {
  it('prefills the template with UTC dates and the permalink', () => {
    const url = googleCalendarUrl({
      slug: 's',
      title: 'Tea & talk',
      description: '',
      startsAt: '2026-08-01T15:30:00Z',
      endsAt: '2026-08-01T17:00:00Z',
      location: null,
      url: 'https://xidig.net/events/s',
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('calendar.google.com');
    expect(parsed.searchParams.get('dates')).toBe('20260801T153000Z/20260801T170000Z');
    expect(parsed.searchParams.get('details')).toBe('https://xidig.net/events/s');
    expect(parsed.searchParams.get('location')).toBeNull();
  });
});

// --- slug + schemas ---------------------------------------------------------------

describe('slugifyEventTitle', () => {
  it('lowercases, strips diacritics/punctuation, collapses to hyphens', () => {
    expect(slugifyEventTitle('Demo Day — Hargeisa 2026!')).toBe('demo-day-hargeisa-2026');
    expect(slugifyEventTitle('Café & Casho')).toBe('cafe-casho');
  });
  it('falls back to "event" when nothing survives', () => {
    expect(slugifyEventTitle('!!!')).toBe('event');
  });
});

describe('allocateEventSlug reserved slugs', () => {
  /** Fake admin whose events table is empty — every candidate is DB-free. */
  function emptyEventsAdmin() {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return { from: () => query } as unknown as Parameters<typeof allocateEventSlug>[0];
  }

  it('never mints a slug shadowed by a next.config 301 — the suffix wins instead', async () => {
    // "Mogadishu Launch Party" folds to the OLD site's fabricated marketing
    // slug, which permanently 308s to /waitlist before routing: the bare slug
    // would make the event page, its share links and its .ics unreachable.
    const slug = await allocateEventSlug(emptyEventsAdmin(), 'Mogadishu Launch Party');
    expect(slug).toBe('mogadishu-launch-party-2');
    expect(RESERVED_EVENT_SLUGS.has('mogadishu-launch-party')).toBe(true);
  });

  it('unreserved titles still mint the bare slug', async () => {
    expect(await allocateEventSlug(emptyEventsAdmin(), 'Casho & Chat Hargeisa')).toBe(
      'casho-chat-hargeisa',
    );
  });
});

describe('event schemas (cross-field rules)', () => {
  const base = {
    title: 'Tea & talk',
    category: 'community',
    startsAt: '2026-08-01T18:30:00+03:00',
    timezone: 'Africa/Mogadishu',
    mode: 'online' as const,
  };

  it('accepts a minimal valid body with locked defaults', () => {
    const parsed = eventCreateSchema.parse(base);
    expect(parsed.visibility).toBe('members');
    expect(parsed.addressVisibility).toBe('attendees'); // locked default
    expect(parsed.status).toBe('published');
  });

  it('rejects more than one container', () => {
    expect(() =>
      eventCreateSchema.parse({
        ...base,
        labId: '4c8e3f1a-0000-4000-8000-000000000001',
        listingId: '4c8e3f1a-0000-4000-8000-000000000002',
      }),
    ).toThrow(/at most one container/);
  });

  it('rejects space_only without a Lab and end-before-start', () => {
    expect(() => eventCreateSchema.parse({ ...base, visibility: 'space_only' })).toThrow(
      /space_only needs a Lab/,
    );
    expect(() =>
      eventCreateSchema.parse({ ...base, endsAt: '2026-08-01T18:00:00+03:00' }),
    ).toThrow(/ends before it starts/);
  });

  it('validates the IANA timezone via the runtime tz database', () => {
    expect(isValidTimezone('Africa/Mogadishu')).toBe(true);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(() => eventCreateSchema.parse({ ...base, timezone: 'Not/AZone' })).toThrow(
      /unknown timezone/,
    );
  });

  it('update schema rejects an empty patch; rsvp defaults show_publicly ON (Task 4 flip)', () => {
    expect(() => eventUpdateSchema.parse({})).toThrow(/empty update/);
    expect(eventUpdateSchema.parse({ title: 'New title' }).title).toBe('New title');
    // The named wall is the default; opting OUT stays one tap away.
    expect(rsvpSchema.parse({ status: 'going' }).showPublicly).toBe(true);
    expect(rsvpSchema.parse({ status: 'going', showPublicly: false }).showPublicly).toBe(false);
  });

  // --- Task 3: event_cover attach + agenda ---------------------------------

  it('accepts a coverMediaId uuid and an agenda with 1 row', () => {
    const parsed = eventCreateSchema.parse({
      ...base,
      coverMediaId: '4c8e3f1a-0000-4000-8000-000000000003',
      agenda: [{ time: '14:00', label: 'Is-barasho iyo shaah' }],
    });
    expect(parsed.coverMediaId).toBe('4c8e3f1a-0000-4000-8000-000000000003');
    expect(parsed.agenda).toEqual([{ time: '14:00', label: 'Is-barasho iyo shaah' }]);
  });

  it('rejects a non-uuid coverMediaId', () => {
    expect(() => eventCreateSchema.parse({ ...base, coverMediaId: 'not-a-uuid' })).toThrow();
  });

  it('rejects more than 12 agenda rows', () => {
    const agenda = Array.from({ length: 13 }, (_, i) => ({ time: `${i}:00`, label: `Item ${i}` }));
    expect(() => eventCreateSchema.parse({ ...base, agenda })).toThrow();
  });

  it('update schema accepts coverMediaId: null (clears the cover) and an agenda patch', () => {
    expect(eventUpdateSchema.parse({ coverMediaId: null }).coverMediaId).toBeNull();
    expect(
      eventUpdateSchema.parse({ agenda: [{ time: '10:00', label: 'Opening' }] }).agenda,
    ).toEqual([{ time: '10:00', label: 'Opening' }]);
  });
});

// --- Task 4: card-loader pure helpers -----------------------------------------

describe('eventCoverView (publicMediaUrl + derivedThumbPath)', () => {
  it('derives the CDN pair from cover_path and passes the blurhash through', () => {
    const view = eventCoverView({ cover_path: 'u1/abc.webp', cover_blurhash: 'LKO2?U%2' });
    expect(view.coverUrl).toContain('/storage/v1/object/public/post-media/u1/abc.webp');
    expect(view.coverThumbUrl).toContain('/storage/v1/object/public/post-media/u1/abc_thumb.webp');
    expect(view.coverBlurhash).toBe('LKO2?U%2');
  });

  it('a coverless event maps to an all-null view', () => {
    expect(eventCoverView({ cover_path: null, cover_blurhash: null })).toEqual({
      coverUrl: null,
      coverThumbUrl: null,
      coverBlurhash: null,
    });
  });
});

describe('isEnded / splitTabs (frame 9a ordering)', () => {
  const NOW = new Date('2026-08-10T12:00:00Z');
  const ev = (slug: string, startsAt: string, endsAt: string | null = null) => ({
    slug,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  it('isEnded uses ends_at when present, else starts_at', () => {
    expect(isEnded(ev('past', '2026-08-01T10:00:00Z'), NOW)).toBe(true);
    expect(isEnded(ev('future', '2026-08-20T10:00:00Z'), NOW)).toBe(false);
    // Started but still running (ends_at in the future) is NOT ended.
    expect(isEnded(ev('running', '2026-08-10T09:00:00Z', '2026-08-10T18:00:00Z'), NOW)).toBe(
      false,
    );
    expect(isEnded(ev('done', '2026-08-09T09:00:00Z', '2026-08-09T18:00:00Z'), NOW)).toBe(true);
  });

  it('splits into upcoming (ascending) then past (descending)', () => {
    const rows = [
      ev('past-old', '2026-08-01T10:00:00Z'),
      ev('future-late', '2026-08-30T10:00:00Z'),
      ev('past-recent', '2026-08-08T10:00:00Z'),
      ev('future-soon', '2026-08-12T10:00:00Z'),
    ];
    const { upcoming, past } = splitTabs(rows, NOW);
    expect(upcoming.map((r) => r.slug)).toEqual(['future-soon', 'future-late']);
    expect(past.map((r) => r.slug)).toEqual(['past-recent', 'past-old']);
  });
});

describe('foldCardCounts / sliceAttendeeSamples / resolveAttendedCount', () => {
  it('folds one batched rsvp read into per-event going + checked-in counts', () => {
    const counts = foldCardCounts([
      { event_id: 'e1', status: 'going', checked_in_at: null },
      { event_id: 'e1', status: 'going', checked_in_at: '2026-08-01T10:05:00Z' },
      { event_id: 'e1', status: 'interested', checked_in_at: null },
      { event_id: 'e2', status: 'going', checked_in_at: null },
    ]);
    expect(counts.get('e1')).toEqual({ going: 2, checkedIn: 1 });
    expect(counts.get('e2')).toEqual({ going: 1, checkedIn: 0 });
    expect(counts.get('missing')).toBeUndefined();
  });

  it('slices the first N sample user ids per event, preserving arrival order', () => {
    const samples = sliceAttendeeSamples(
      [
        { event_id: 'e1', user_id: 'u1' },
        { event_id: 'e2', user_id: 'u9' },
        { event_id: 'e1', user_id: 'u2' },
        { event_id: 'e1', user_id: 'u3' },
        { event_id: 'e1', user_id: 'u4' },
      ],
      3,
    );
    expect(samples.get('e1')).toEqual(['u1', 'u2', 'u3']);
    expect(samples.get('e2')).toEqual(['u9']);
  });

  it('attendedCount: past events report checked-in count, else fall back to going; upcoming is null', () => {
    expect(resolveAttendedCount(true, 4, 9)).toBe(4);
    expect(resolveAttendedCount(true, 0, 9)).toBe(9); // host never used the door list
    expect(resolveAttendedCount(false, 4, 9)).toBeNull();
  });
});
