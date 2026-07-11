import type { Metadata } from 'next';
import Link from 'next/link';

import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

/**
 * /membership — canonical pricing page (docs/front-door-plan.md §3). Locked
 * copy decisions: "around $1/month" until billing rails are live and the
 * price is legally/commercially confirmed; the billing-not-live note is
 * mandatory, not decorative.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return frontMetadata({
    title: t('marketing.memberTitle'),
    description: t('marketing.memberIntro'),
    path: '/membership',
  });
}

export default async function MembershipPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <section className="xidig-front__hero">
        <h1>{t('marketing.memberTitle')}</h1>
        <p>{t('marketing.memberIntro')}</p>
      </section>
      <div className="xidig-front__grid">
        <div className="xidig-front-card">
          <h3>{t('marketing.memberFreeTitle')}</h3>
          <p>{t('marketing.memberFreeBody')}</p>
        </div>
        <div className="xidig-front-card xidig-front-card--accent">
          <h3>{t('marketing.memberSupporterTitle')}</h3>
          <p>{t('marketing.memberSupporterBody')}</p>
        </div>
      </div>
      <section className="xidig-front__section xidig-front__prose xidig-front__section--center xidig-front__section--woven">
        <p className="xidig-banner xidig-banner--notice">{t('marketing.memberBillingNote')}</p>
        <div className="xidig-front__cta-row">
          <Link href="/waitlist?from=membership" className="xidig-button xidig-button--primary">
            {t('marketing.requestAccess')}
          </Link>
        </div>
      </section>
    </main>
  );
}
