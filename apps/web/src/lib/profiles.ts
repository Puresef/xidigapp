import { z } from 'zod';

/**
 * Profile shapes shared by the profile write route and (later) directory
 * search. The handle rule mirrors the DB CHECK
 * (`^[a-z0-9_]{3,30}$`, profiles_handle_format) so a bad handle is a friendly
 * §27 message, not a raw constraint error.
 */

export const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;

export const handleSchema = z.string().trim().toLowerCase().regex(HANDLE_REGEX);

const linkSchema = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.string().url().max(2048),
});

/**
 * Contact options a member chooses to surface (§13 — DM/email/WhatsApp/
 * socials). Kept as a small string/boolean map; the member controls
 * visibility, so it is intentionally free-form but scalar-only.
 */
const contactOptionsSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(200), z.boolean()]),
);

export const profileInputSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  handle: handleSchema,
  bio: z.string().trim().max(500).nullish(),
  location_city: z.string().trim().max(120).nullish(),
  location_country: z.string().trim().max(120).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  timezone: z.string().trim().max(60).nullish(),
  skills: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  lanes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  links: z.array(linkSchema).max(10).default([]),
  contact_options: contactOptionsSchema.default({}),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

/**
 * Onboarding "complete profile" definition (§20 first-session checklist):
 * a display name, a handle, and at least one lane picked. Drives the
 * `profile_completed` activation event (§23) and the incomplete-profile gate.
 */
export function isProfileComplete(input: {
  display_name?: string | null;
  handle?: string | null;
  lanes?: string[] | null;
}): boolean {
  return (
    Boolean(input.display_name?.trim()) &&
    Boolean(input.handle?.trim()) &&
    (input.lanes?.length ?? 0) > 0
  );
}
