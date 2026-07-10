import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { countFoundingSpotsLeft } from '@/lib/front/organic';
import { getFeaturedUpcomingPublicEvent, type EventListItem } from '@/lib/events/views';
import { getLocale, getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { formatEventStart } from '@/components/events/event-list';

import { FrontMotion } from './front-motion';
import { StarAssembly, StarPath } from './star-path';
import { Starfield } from './starfield';
import { Vignette, type VignetteKind, type VignetteLabels } from './vignettes';

/**
 * Signed-out landing (docs/front-door-plan.md §4; social-app-first reframe of
 * 9 Jul; motion v2 of 10 Jul). Positioning: the Somali social app first —
 * casual visitors come for the feed/people/businesses/DMs, then funnel into
 * Labs → Capital → governance. Every block describes a LIVE feature; the
 * honesty rules hold: no fake metrics, no mock posts with invented names —
 * the vignettes are schematic, nameless scenes built from real product
 * vocabulary. The one number shown is the Founding Member counter — real,
 * is_ai-excluded, and silently absent on failure.
 *
 * Motion v2: the six social blocks are PATH STATIONS along the guiding
 * star-path (see star-path.tsx) — a constellation drawn on scroll that ends
 * where the five-pointed star assembles above the final CTA ("Come home").
 * All motion is double-gated; Lite/reduced-motion visitors get the complete
 * static final frame.
 */

const SOCIAL_BLOCKS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  vignette: VignetteKind;
}> = [
  { titleKey: 'marketing.blockPlazaTitle', bodyKey: 'marketing.blockPlazaBody', vignette: 'feed' },
  {
    titleKey: 'marketing.blockProfilesTitle',
    bodyKey: 'marketing.blockProfilesBody',
    vignette: 'profile',
  },
  { titleKey: 'marketing.blockSuuqTitle', bodyKey: 'marketing.blockSuuqBody', vignette: 'suuq' },
  { titleKey: 'marketing.blockDmTitle', bodyKey: 'marketing.blockDmBody', vignette: 'dm' },
  { titleKey: 'marketing.blockLabsTitle', bodyKey: 'marketing.blockLabsBody', vignette: 'labs' },
  {
    titleKey: 'marketing.blockCapitalTitle',
    bodyKey: 'marketing.blockCapitalBody',
    vignette: 'capital',
  },
];

const TRUST_BLOCKS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  vignette: VignetteKind;
}> = [
  { titleKey: 'marketing.blockLiteTitle', bodyKey: 'marketing.blockLiteBody', vignette: 'lite' },
  { titleKey: 'marketing.blockOwnedTitle', bodyKey: 'marketing.blockOwnedBody', vignette: 'owned' },
];

/** Decorative vignette labels — existing product vocabulary + marketing.vig*. */
export function buildVignetteLabels(t: (key: MessageKey) => string): VignetteLabels {
  return {
    ask: t('plaza.typeAsk'),
    skills: [t('marketing.vigSkillOne'), t('marketing.vigSkillTwo'), t('marketing.vigSkillThree')],
    suuqQuery: t('marketing.vigSuuqQuery'),
    accept: t('action.accept'),
    club: t('term.club'),
    lab: t('term.lab'),
    rooms: [t('lab.tabUpdates'), t('lab.tabDecisions'), t('lab.tabMembers')],
    garab: t('term.garab'),
    show: t('lite.show'),
    off: t('settings.toggleOff'),
    bait: t('marketing.vigBaitLabel'),
  };
}

export async function FrontHome() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const vigLabels = buildVignetteLabels(t);

  let foundingSpotsLeft: number | null = null;
  try {
    // Shared organic-proof counter (lib/front/organic): excludes is_ai, and
    // internally degrades to null on a failed count — never an error.
    foundingSpotsLeft = await countFoundingSpotsLeft(getSupabaseAdmin());
  } catch {
    // Resilience rule: a missing service config degrades to no counter.
  }

  // "Next up" event card (extras item 8): renders ONLY when at least one
  // upcoming published PUBLIC organic event exists — admin-featured first,
  // else the soonest. Zero events → the block is absent entirely (no empty
  // rooms); a failed lookup degrades the same way. Ships dark until a real
  // event exists — that is the design.
  let nextEvent: EventListItem | null = null;
  try {
    nextEvent = await getFeaturedUpcomingPublicEvent();
  } catch {
    nextEvent = null;
  }

  return (
    <main className="xidig-front">
      <FrontMotion />
      <section className="xidig-front__hero xidig-front__hero--home">
        <Starfield />
        <div className="xidig-front__hero-inner">
          <h1>{t('marketing.heroTitle')}</h1>
          <p>{t('marketing.heroSub')}</p>
          <div className="xidig-front__cta-row">
            <Link href="/waitlist?from=home" className="xidig-button xidig-button--primary">
              {t('marketing.requestAccess')}
            </Link>
            <Link href="/product" className="xidig-button xidig-button--secondary">
              {t('marketing.seeProduct')}
            </Link>
          </div>
          {foundingSpotsLeft !== null && foundingSpotsLeft > 0 ? (
            <p className="xidig-banner xidig-banner--notice">
              {t('waitlist.foundingCounter', { count: foundingSpotsLeft })}
            </p>
          ) : null}
        </div>
      </section>

      {nextEvent ? (
        <section
          className="xidig-front__section"
          aria-label={t('marketing.eventNextTitle')}
          data-reveal
        >
          <div className="xidig-front-card">
            <h3>{t('marketing.eventNextTitle')}</h3>
            <p>
              <strong>{nextEvent.title}</strong>
              <br />
              {formatEventStart(nextEvent, locale)}
            </p>
            <Link href={`/events/${nextEvent.slug}`}>{t('marketing.eventNextCta')} →</Link>
          </div>
        </section>
      ) : null}

      <section className="xidig-front__section xidig-front__prose" data-reveal>
        <h2>{t('marketing.groupsTitle')}</h2>
        <p>{t('marketing.groupsBody')}</p>
      </section>

      {/* The journey: the guiding star-path layer runs behind everything from
          the first station to the final CTA, where the star assembles. */}
      <div className="xf-journey">
        <StarPath />

        <section
          className="xidig-front__section xf-stations"
          aria-label={t('marketing.productTitle')}
        >
          {SOCIAL_BLOCKS.map((block) => (
            <div key={block.bodyKey} className="xf-station" data-reveal>
              <div className="xf-station__text">
                <h3>
                  <span className="xf-station__spark" aria-hidden="true" />
                  {t(block.titleKey)}
                </h3>
                <p>{t(block.bodyKey)}</p>
              </div>
              <Vignette kind={block.vignette} labels={vigLabels} />
            </div>
          ))}
        </section>

        <section className="xidig-front__section" data-reveal>
          <div className="xidig-front__grid">
            {TRUST_BLOCKS.map((block) => (
              <div key={block.bodyKey} className="xidig-front-card xidig-front-card--vig">
                <Vignette kind={block.vignette} labels={vigLabels} compact />
                <h3>{t(block.titleKey)}</h3>
                <p>{t(block.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="xidig-front__section xidig-front__prose xidig-front__section--woven"
          data-reveal
        >
          <h2>{t('marketing.honestyTitle')}</h2>
          <p>{t('marketing.honestyBody')}</p>
          <p>{t('marketing.groupsKeep')}</p>
        </section>

        <section className="xidig-front__section" data-reveal>
          <div className="xidig-front__grid">
            <div className="xidig-front-card">
              <h3>{t('marketing.navReports')}</h3>
              <p>{t('marketing.reportsTeaserBody')}</p>
              <Link href="/reports">{t('marketing.reportsAll')} →</Link>
            </div>
            <div className="xidig-front-card">
              <h3>{t('marketing.navMembership')}</h3>
              <p>{t('marketing.membershipTeaserBody')}</p>
              <Link href="/membership">{t('marketing.navMembership')} →</Link>
            </div>
          </div>
        </section>

        <section
          className="xidig-front__section xidig-front__prose xidig-front__section--center xidig-front__section--woven xf-home-final"
          data-reveal
        >
          <StarAssembly />
          <h2>{t('marketing.finalCta')}</h2>
          <div className="xidig-front__cta-row">
            <Link href="/waitlist?from=home-footer" className="xidig-button xidig-button--primary">
              {t('marketing.requestAccess')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
