import { z } from 'zod';

import { pageSizeSchema } from '@/lib/pagination';

/**
 * Strict validation for the external REST + MCP write/read surface (PRD §21).
 * Every external input is validated here BEFORE any privileged write. `source`
 * is constrained to the two non-member flags so external callers can never mint
 * content that claims to be an organic member post.
 */

const seedSource = z.enum(['seed', 'ai']).default('seed');

/** Optional client idempotency key — a retry with the same key is a no-op. */
const idempotencyKey = z.string().trim().min(1).max(200).optional();

export const externalListingsQuerySchema = z.object({
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().optional(),
  limit: pageSizeSchema,
});

export const externalPostCreateSchema = z.object({
  type: z.enum(['intro', 'ask', 'win', 'update']),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000),
  linkUrl: z.string().trim().url().max(2000).optional(),
  /** Existing tag names to attach (unknown names are ignored, never created). */
  tags: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  source: seedSource,
  idempotencyKey,
});

export type ExternalPostCreateInput = z.infer<typeof externalPostCreateSchema>;

export const externalListingCreateSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  /** listing_categories.slug */
  category: z.string().trim().min(1).max(80),
  shortDescription: z.string().trim().min(1).max(1000).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  landmark: z.string().trim().min(1).max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  source: seedSource,
  idempotencyKey,
});

export type ExternalListingCreateInput = z.infer<typeof externalListingCreateSchema>;

export const externalListingPatchSchema = z
  .object({
    shortDescription: z.string().trim().min(1).max(1000).nullable().optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    country: z.string().trim().min(1).max(120).nullable().optional(),
    landmark: z.string().trim().min(1).max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'nothing to update' });

export type ExternalListingPatchInput = z.infer<typeof externalListingPatchSchema>;

/** Lab TEMPLATE (playbook) — the §21 "Lab templates" seed target. */
export const externalPlaybookCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/, 'lowercase slug, dashes allowed'),
  name: z.string().trim().min(1).max(120),
  ventureType: z.string().trim().min(1).max(80),
  template: z.record(z.string(), z.unknown()).optional(),
  source: seedSource,
});

export type ExternalPlaybookCreateInput = z.infer<typeof externalPlaybookCreateSchema>;

export const externalPlaybookPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    ventureType: z.string().trim().min(1).max(80).optional(),
    template: z.record(z.string(), z.unknown()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'nothing to update' });

export type ExternalPlaybookPatchInput = z.infer<typeof externalPlaybookPatchSchema>;
