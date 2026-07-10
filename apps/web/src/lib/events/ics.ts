/**
 * Hand-rolled iCalendar output + Google Calendar link (extras item 8 — no
 * calendar dependency). Pure string building, unit-tested.
 *
 * Privacy: callers pass the ALREADY-FOLDED location/URL (lib/events/views.ts
 * reveal rules) — this module never sees more than the requester may.
 */

export interface IcsEventInput {
  /** Stable UID seed (the event slug). */
  slug: string;
  title: string;
  description: string;
  /** ISO timestamps (UTC or offset — normalised to UTC here). */
  startsAt: string;
  endsAt: string | null;
  /** Rendered location line (venue name / folded address), if any. */
  location: string | null;
  /** Absolute permalink to the event page. */
  url: string;
}

/** 20260710T183000Z — the ICS UTC timestamp form. */
export function icsUtc(iso: string): string {
  const date = new Date(iso);
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000; // no ends_at → 1 hour block

export function eventToIcs(input: IcsEventInput): string {
  const dtStart = icsUtc(input.startsAt);
  const dtEnd = icsUtc(
    input.endsAt ?? new Date(Date.parse(input.startsAt) + DEFAULT_DURATION_MS).toISOString(),
  );

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Xidig//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${input.slug}@xidig`,
    `DTSTAMP:${icsUtc(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${icsEscape(input.description)}`);
  if (input.location) lines.push(`LOCATION:${icsEscape(input.location)}`);
  lines.push(`URL:${input.url}`, 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** Prefilled Google Calendar "add event" link (same folded inputs). */
export function googleCalendarUrl(input: IcsEventInput): string {
  const dtStart = icsUtc(input.startsAt);
  const dtEnd = icsUtc(
    input.endsAt ?? new Date(Date.parse(input.startsAt) + DEFAULT_DURATION_MS).toISOString(),
  );
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${dtStart}/${dtEnd}`,
    details: input.description ? `${input.description}\n\n${input.url}` : input.url,
  });
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
