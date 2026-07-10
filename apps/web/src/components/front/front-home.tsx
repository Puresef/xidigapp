import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { countFoundingSpotsLeft } from '@/lib/front/organic';
import { getFeaturedUpcomingPublicEvent, type EventListItem } from '@/lib/events/views';
import { getLocale, getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { formatEventStart } from '@/components/events/event-list';

import { Starfield } from './starfield';

/**
 * Signed-out landing (docs/front-door-plan.md §4; social-app-first reframe of
 * 9 Jul). Positioning: the Somali social app first — casual visitors come for
 * the feed/people/businesses/DMs, then funnel into Labs → Capital →
 * governance. Every block describes a LIVE feature; the honesty rules hold:
 * no fake metrics, no mock posts with invented names (illustrative UI panels
 * wait for Phase B, built from real consented content). The one number shown
 * is the Founding Member counter — real, is_ai-excluded, and silently absent
 * on failure.
 */

const SOCIAL_BLOCKS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.blockPlazaTitle', bodyKey: 'marketing.blockPlazaBody' },
  { titleKey: 'marketing.blockProfilesTitle', bodyKey: 'marketing.blockProfilesBody' },
  { titleKey: 'marketing.blockSuuqTitle', bodyKey: 'marketing.blockSuuqBody' },
  { titleKey: 'marketing.blockDmTitle', bodyKey: 'marketing.blockDmBody' },
  { titleKey: 'marketing.blockLabsTitle', bodyKey: 'marketing.blockLabsBody' },
  { titleKey: 'marketing.blockCapitalTitle', bodyKey: 'marketing.blockCapitalBody' },
];

const TRUST_BLOCKS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.blockLiteTitle', bodyKey: 'marketing.blockLiteBody' },
  { titleKey: 'marketing.blockOwnedTitle', bodyKey: 'marketing.blockOwnedBody' },
];

export async function FrontHome() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);

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
        <section className="xidig-front__section" aria-label={t('marketing.eventNextTitle')}>
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

      <section className="xidig-front__section xidig-front__prose">
        <h2>{t('marketing.groupsTitle')}</h2>
        <p>{t('marketing.groupsBody')}</p>
      </section>

      <section className="xidig-front__section" aria-label={t('marketing.productTitle')}>
        <div className="xidig-front__grid xidig-front__grid--numbered">
          {SOCIAL_BLOCKS.map((block) => (
            <div key={block.bodyKey} className="xidig-front-card">
              <h3>{t(block.titleKey)}</h3>
              <p>{t(block.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="xidig-front__section">
        <div className="xidig-front__grid">
          {TRUST_BLOCKS.map((block) => (
            <div key={block.bodyKey} className="xidig-front-card">
              <h3>{t(block.titleKey)}</h3>
              <p>{t(block.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="xidig-front__section xidig-front__prose xidig-front__section--woven">
        <h2>{t('marketing.honestyTitle')}</h2>
        <p>{t('marketing.honestyBody')}</p>
        <p>{t('marketing.groupsKeep')}</p>
      </section>

      <section className="xidig-front__section">
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

      <section className="xidig-front__section xidig-front__prose xidig-front__section--center xidig-front__section--woven">
        <h2>{t('marketing.finalCta')}</h2>
        <div className="xidig-front__cta-row">
          <Link href="/waitlist?from=home-footer" className="xidig-button xidig-button--primary">
            {t('marketing.requestAccess')}
          </Link>
        </div>
      </section>
    </main>
  );
}
