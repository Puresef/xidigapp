import { getT } from '@/lib/locale';

import { OPEN_TO_KEYS } from './open-to';

/**
 * "Open to" chips on the profile card (Phase 4.5 §4). Server component —
 * chips are plain identity data (public visibility class, like lanes).
 * Renders nothing when the member picked none.
 */
export async function OpenToChips({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return null;
  const t = await getT();

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('profile.openToTitle')}</h2>
      <ul className="xidig-chip-row">
        {slugs.map((slug) => {
          const key = OPEN_TO_KEYS[slug];
          return (
            <li key={slug} className="xidig-tag xidig-tag--ok">
              {key ? t(key) : slug}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
