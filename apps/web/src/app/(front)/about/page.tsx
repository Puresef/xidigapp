import type { Metadata } from 'next';
import Link from 'next/link';

import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

/**
 * /about — story and mission (docs/front-door-plan.md §3). Severable by
 * design: the fund/Maalgeli section is deliberately ABSENT until legal
 * sign-off (locked decision) — Capital is explained only as a candidate
 * pipeline with intent capture. Also owns the roles-not-careers message
 * (/careers 301s here: community roles are appointed from within, there is
 * no hiring page).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return frontMetadata({
    // aboutTitle already names the brand ("About Xidig") — skip the suffix.
    title: t('marketing.aboutTitle'),
    description: t('marketing.aboutStory1'),
    path: '/about',
    brandInTitle: true,
  });
}

export default async function AboutPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.aboutTitle')}</h1>
          <p>{t('marketing.aboutStory1')}</p>
        </section>
        <p>{t('marketing.aboutStory2')}</p>
        <p>{t('marketing.aboutStory3')}</p>

        <h2>{t('marketing.aboutCapitalTitle')}</h2>
        <p>{t('marketing.aboutCapitalBody')}</p>
        <p className="xidig-banner xidig-banner--notice">{t('capital.securitiesDisclaimer')}</p>

        <h2>{t('marketing.aboutRolesTitle')}</h2>
        <p>{t('marketing.aboutRolesBody')}</p>

        <p>
          {t('marketing.aboutContactBody')} <Link href="/contact">{t('marketing.contactTitle')} →</Link>
        </p>

        <div className="xidig-front__cta-row">
          <Link href="/waitlist?from=about" className="xidig-button xidig-button--primary">
            {t('marketing.requestAccess')}
          </Link>
        </div>
      </div>
    </main>
  );
}
