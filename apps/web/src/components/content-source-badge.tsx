'use client';

import { useT } from '@xidig/i18n/react';

import type { Enums } from '@xidig/db';

/**
 * Seeded / AI-content label (§21). Renders a small chip on any card whose
 * content did NOT come from a member: `seed` → "Seeded", `ai` → "AI-assisted".
 * Member content renders nothing. The chip makes seeded/AI content visually
 * distinguishable everywhere it appears, so it can never masquerade as organic.
 */
export function ContentSourceBadge({
  source,
  className,
}: {
  source: Enums<'content_source'> | string;
  className?: string;
}) {
  const t = useT();
  if (source === 'member' || !source) return null;

  // 'system' = the platform's own voice (award results, Task 8) — a NEUTRAL
  // chip, deliberately not the seeded-violet: system records are not seeded/AI
  // content and must not read as such.
  if (source === 'system') {
    return (
      <span
        className={`xidig-tag${className ? ` ${className}` : ''}`}
        title={t('content.systemTooltip')}
      >
        {t('content.systemLabel')}
      </span>
    );
  }

  const isAi = source === 'ai';
  return (
    <span
      className={`xidig-tag xidig-tag--seeded${className ? ` ${className}` : ''}`}
      title={isAi ? t('content.aiTooltip') : t('content.seededTooltip')}
    >
      {isAi ? t('content.aiLabel') : t('content.seededLabel')}
    </span>
  );
}
