import { z } from 'zod';

import {
  EVENT_CAPACITY_MAX,
  EVENT_DESCRIPTION_MAX,
  EVENT_TIMEZONE_MAX,
  EVENT_TITLE_MAX,
  EVENT_URL_MAX,
  EVENT_VENUE_ADDRESS_MAX,
  EVENT_VENUE_NAME_MAX,
} from './constants';

/**
 * Zod bodies for the /api/events surface (API conventions,
 * docs/api-conventions.md). Cross-field rules the DB also enforces (one
 * container, space_only needs a Lab, ends after start) are validated here
 * first so members get a 400 with plain copy instead of a 500. Rules needing
 * the stored row (e.g. space_only on PATCH) live in the route.
 */

/** IANA zone check via the runtime's own tz database — no list to maintain. */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(EVENT_TIMEZONE_MAX)
  .refine(isValidTimezone, 'unknown timezone');

const titleSchema = z.string().trim().min(1).max(EVENT_TITLE_MAX);
const descriptionSchema = z.string().trim().max(EVENT_DESCRIPTION_MAX);
const modeSchema = z.enum(['online', 'in_person', 'hybrid']);
const visibilitySchema = z.enum(['public', 'members', 'space_only']);
const addressVisibilitySchema = z.enum(['everyone', 'attendees']);
const venueNameSchema = z.string().trim().min(1).max(EVENT_VENUE_NAME_MAX);
const venueAddressSchema = z.string().trim().min(1).max(EVENT_VENUE_ADDRESS_MAX);
const onlineUrlSchema = z.string().trim().url().max(EVENT_URL_MAX);
const capacitySchema = z.number().int().positive().max(EVENT_CAPACITY_MAX);

export const eventCreateSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.default(''),
    category: z.string().trim().min(1).max(50),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    timezone: timezoneSchema,
    mode: modeSchema,
    venueName: venueNameSchema.nullish(),
    venueAddress: venueAddressSchema.nullish(),
    addressVisibility: addressVisibilitySchema.default('attendees'),
    onlineUrl: onlineUrlSchema.nullish(),
    labId: z.string().uuid().nullish(),
    listingId: z.string().uuid().nullish(),
    candidateId: z.string().uuid().nullish(),
    visibility: visibilitySchema.default('members'),
    capacity: capacitySchema.nullish(),
    status: z.enum(['draft', 'published']).default('published'),
  })
  .refine(
    (v) => [v.labId, v.listingId, v.candidateId].filter((x) => x != null).length <= 1,
    'at most one container',
  )
  .refine((v) => v.visibility !== 'space_only' || v.labId != null, 'space_only needs a Lab')
  .refine(
    (v) => v.endsAt == null || Date.parse(v.endsAt) > Date.parse(v.startsAt),
    'ends before it starts',
  );
export type EventCreateInput = z.infer<typeof eventCreateSchema>;

/**
 * PATCH body: everything editable except the container (an event never moves
 * between Spaces/listings — cancel and recreate) and `source`. `status` only
 * moves draft → published here; cancel is the DELETE handler. startsAt/endsAt
 * ordering against the STORED row is checked in the route.
 */
export const eventUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    category: z.string().trim().min(1).max(50).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    timezone: timezoneSchema.optional(),
    mode: modeSchema.optional(),
    venueName: venueNameSchema.nullish(),
    venueAddress: venueAddressSchema.nullish(),
    addressVisibility: addressVisibilitySchema.optional(),
    onlineUrl: onlineUrlSchema.nullish(),
    visibility: visibilitySchema.optional(),
    capacity: capacitySchema.nullish(),
    status: z.enum(['published']).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'empty update');
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const rsvpSchema = z.object({
  status: z.enum(['going', 'interested']),
  showPublicly: z.boolean().default(false),
});
export type RsvpInput = z.infer<typeof rsvpSchema>;
