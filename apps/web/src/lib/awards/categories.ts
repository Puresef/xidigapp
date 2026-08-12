import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';

/**
 * Community-Award category → display key (§20). One map, shared by the server
 * publish flow (post-body fallback text) and the client award card (frame 9c
 * title) — kept in its own module so the 'use client' card never drags server
 * deps (Sentry/next-server via lib/api) into the bundle.
 */
export const AWARD_CATEGORY_KEYS: Record<Enums<'award_category'>, MessageKey> = {
  best_lab: 'awards.categoryBestLab',
  best_win: 'awards.categoryBestWin',
  most_helpful: 'awards.categoryMostHelpful',
  rising_builder: 'awards.categoryRisingBuilder',
};
