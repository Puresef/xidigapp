import { describe, expect, it } from 'vitest';

import { resolveCreationRight, containerOf, type CreationFacts } from './authz';
import { RSVP_COUNT_FLOOR } from './constants';
import { eventToIcs, googleCalendarUrl, icsEscape, icsUtc } from './ics';
import { eventCreateSchema, eventUpdateSchema, isValidTimezone, rsvpSchema } from './schemas';
import { slugifyEventTitle } from './slug';
import {
  EVENT_MEMBER_COLUMNS,
  EVENT_PUBLIC_COLUMNS,
  foldEventReveal,
  foldRsvpCounts,
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

describe('foldRsvpCounts (N>=5 floor)', () => {
  it('suppresses sub-floor counts for non-hosts', () => {
    expect(foldRsvpCounts(RSVP_COUNT_FLOOR - 1, 0, false)).toEqual({
      going: null,
      interested: null,
    });
    expect(foldRsvpCounts(RSVP_COUNT_FLOOR, RSVP_COUNT_FLOOR + 2, false)).toEqual({
      going: RSVP_COUNT_FLOOR,
      interested: RSVP_COUNT_FLOOR + 2,
    });
    // Each count is floored independently.
    expect(foldRsvpCounts(12, 3, false)).toEqual({ going: 12, interested: null });
  });

  it('the host always sees exact numbers (it is their attendee list)', () => {
    expect(foldRsvpCounts(1, 2, true)).toEqual({ going: 1, interested: 2 });
    expect(foldRsvpCounts(0, 0, true)).toEqual({ going: 0, interested: 0 });
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

  it('update schema rejects an empty patch; rsvp defaults show_publicly OFF', () => {
    expect(() => eventUpdateSchema.parse({})).toThrow(/empty update/);
    expect(eventUpdateSchema.parse({ title: 'New title' }).title).toBe('New title');
    expect(rsvpSchema.parse({ status: 'going' }).showPublicly).toBe(false); // locked default
  });
});
