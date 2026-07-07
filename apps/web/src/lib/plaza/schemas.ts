import { z } from 'zod';

import {
  COMMENT_BODY_MAX,
  LINK_URL_MAX,
  POLL_DEFAULT_DAYS,
  POLL_MAX_DAYS,
  POLL_MIN_DAYS,
  POLL_OPTION_LABEL_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POST_BODY_MAX,
  POST_MAX_IMAGES,
  POST_TITLE_MAX,
  TAGS_PER_POST_MAX,
} from '@/lib/plaza/constants';

/**
 * Plaza input validation (§15 post types, Seq 14 poll mechanics).
 *
 * The five post types share the common fields; polls carry their options and
 * duration; Asks start life 'open'. Everything else about a post's lifecycle
 * (ask transitions, poll close, moderation status) is server-driven — no
 * client ever sends a status column.
 */

const httpUrl = z
  .string()
  .trim()
  .max(LINK_URL_MAX)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be an http(s) URL' },
  );

/** Matches the DB CHECK `tags_name_format` (lowercase, digits, dashes, 2–50). */
export const TAG_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

export const tagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(TAG_NAME_REGEX, 'lowercase letters, numbers and dashes, 2–50 chars');

const commonPostFields = {
  title: z.string().trim().min(1).max(POST_TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(POST_BODY_MAX),
  linkUrl: httpUrl.optional(),
  /** media_uploads ids from POST /api/media, attached at create time. */
  imageIds: z.array(z.string().uuid()).max(POST_MAX_IMAGES).optional(),
  tagIds: z.array(z.string().uuid()).max(TAGS_PER_POST_MAX).optional(),
};

export const postCreateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('intro'), ...commonPostFields }),
  z.object({ type: z.literal('ask'), ...commonPostFields }),
  z.object({ type: z.literal('win'), ...commonPostFields }),
  z.object({ type: z.literal('update'), ...commonPostFields }),
  z.object({
    type: z.literal('poll'),
    ...commonPostFields,
    options: z
      .array(z.string().trim().min(1).max(POLL_OPTION_LABEL_MAX))
      .min(POLL_OPTIONS_MIN)
      .max(POLL_OPTIONS_MAX),
    closesInDays: z
      .number()
      .int()
      .min(POLL_MIN_DAYS)
      .max(POLL_MAX_DAYS)
      .default(POLL_DEFAULT_DAYS),
  }),
]);

export type PostCreateInput = z.infer<typeof postCreateSchema>;

/** Author edits: content only — never type, images, poll shape, or status. */
export const postUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(POST_TITLE_MAX).nullable().optional(),
    body: z.string().trim().min(1).max(POST_BODY_MAX).optional(),
    linkUrl: httpUrl.nullable().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.body !== undefined || value.linkUrl !== undefined,
    { message: 'nothing to update' },
  );

export type PostUpdateInput = z.infer<typeof postUpdateSchema>;

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1).max(COMMENT_BODY_MAX),
});

export const commentUpdateSchema = commentCreateSchema;

export const askActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('credit'), commentId: z.string().uuid() }),
  z.object({ action: z.literal('close') }),
]);

export type AskActionInput = z.infer<typeof askActionSchema>;

export const voteSchema = z.object({ optionId: z.string().uuid() });

export const tagCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** §15 feed filters: chronological + post-type filter. */
export const feedQuerySchema = z.object({
  type: z.enum(['intro', 'ask', 'win', 'update', 'poll']).optional(),
  cursor: z.string().optional(),
});

export const moderationDecisionSchema = z.object({
  decision: z.enum(['approved', 'removed', 'dismissed']),
  note: z.string().trim().max(1000).optional(),
});
