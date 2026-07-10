import type { Metadata } from 'next';
import Link from 'next/link';

import { env } from '@/env';
import { ContactForm } from '@/components/front/contact-form';
import { getT } from '@/lib/locale';
import { frontDoorRobots } from '@/lib/seo';

/**
 * /contact (docs/front-door-plan.md §3). The form renders only when an inbox
 * is configured (CONTACT_INBOX); otherwise the page states that honestly and
 * offers the waitlist — no dead submit buttons, no silent black hole.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const robots = frontDoorRobots();
  return {
    title: t('marketing.contactTitle'),
    alternates: { canonical: '/contact' },
    ...(robots ? { robots } : {}),
  };
}

export default async function ContactPage() {
  const t = await getT();
  const formAvailable = Boolean(env.CONTACT_INBOX);
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.contactTitle')}</h1>
          <p>{t('marketing.contactIntro')}</p>
        </section>
        {formAvailable ? (
          <ContactForm />
        ) : (
          <>
            <p className="xidig-banner xidig-banner--notice">{t('marketing.contactUnavailable')}</p>
            <div className="xidig-front__cta-row">
              <Link href="/waitlist?from=contact" className="xidig-button xidig-button--primary">
                {t('action.joinWaitlist')}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
