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
