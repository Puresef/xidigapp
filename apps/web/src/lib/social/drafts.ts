import { z } from 'zod';

import {
  LINK_URL_MAX,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  TAGS_PER_POST_MAX,
} from '@/lib/plaza/constants';

/**
 * Post drafts (Phase 4.5 §1f). A draft is a loose snapshot of the composer —
 * deliberately laxer than postCreateSchema (no min lengths, no URL parsing):
 * work-in-progress must never fail to SAVE. Publishing still goes through the
 * strict POST /api/posts validation. Cap: 10 per member, enforced by the API.
 */

export const DRAFT_LIMIT = 10;

export const DRAFT_COLUMNS = 'id, user_id, lab_id, payload, created_at, updated_at';

export const draftPayloadSchema = z
  .object({
    type: z.enum(['intro', 'ask', 'win', 'update', 'poll']),
    title: z.string().trim().max(POST_TITLE_MAX).optional(),
    body: z.string().trim().max(POST_BODY_MAX).optional(),
    linkUrl: z.string().trim().max(LINK_URL_MAX).optional(),
    tagIds: z.array(z.string().uuid()).max(TAGS_PER_POST_MAX).optional(),
    labId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.title?.length) || Boolean(value.body?.length), {
    message: 'a draft needs a title or a body',
  });

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

export const draftBodySchema = z.object({ payload: draftPayloadSchema });

export interface DraftRow {
  id: string;
  user_id: string;
  lab_id: string | null;
  payload: DraftPayload;
  created_at: string;
  updated_at: string;
}
