import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import type { ProfilePinItem } from '@/lib/profile-view';
import { getT } from '@/lib/locale';

/**
 * Pinned items on a profile (Phase 4.5 §4): up to 3 posts / Spaces /
 * listings, already hydrated through the VIEWER's RLS (lib/profile-view.ts) —
 * anything the viewer can't read was dropped before this renders. Compact
 * cards linking to the canonical permalinks (§13 everything is linkable).
 */

const TYPE_KEYS: Record<ProfilePinItem['entityType'], MessageKey> = {
  post: 'profile.pinTypePost' as MessageKey,
  lab: 'profile.pinTypeLab' as MessageKey,
  listing: 'profile.pinTypeListing' as MessageKey,
};

function pinHref(item: ProfilePinItem): string {
  if (item.entityType === 'post') return `/p/${item.entityId}`;
  if (item.entityType === 'lab') return `/labs/${item.slug}`;
  return `/l/${item.entityId}`;
}

function pinTitle(item: ProfilePinItem): string {
  if (item.entityType === 'post') return item.title?.trim() || item.body;
  if (item.entityType === 'lab') return item.name;
  return item.businessName;
}

function pinMeta(item: ProfilePinItem): string | null {
  if (item.entityType === 'post') return item.title ? item.body : null;
  if (item.entityType === 'lab') return item.shortDescription;
  return item.city;
}

export async function PinsSection({ items }: { items: ProfilePinItem[] }) {
  if (items.length === 0) return null;
  const t = await getT();

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('profile.pinsTitle')}</h2>
      <ul className="xidig-card-grid">
        {items.map((item) => {
          const meta = pinMeta(item);
          return (
            <li key={`${item.entityType}:${item.entityId}`} className="xidig-card xidig-pin-card">
              <p className="xidig-card__meta">
                <span className="xidig-tag">{t(TYPE_KEYS[item.entityType])}</span>
              </p>
              <h3 className="xidig-card__title">
                <Link href={pinHref(item)}>{pinTitle(item)}</Link>
              </h3>
              {meta ? <p className="xidig-card__body xidig-pin-card__excerpt">{meta}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
