import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { env } from '@/env';
import { ReportMarkdown } from '@/components/front/report-markdown';
import { getReport } from '@/lib/front/reports';
import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

/**
 * /reports/[slug] (docs/front-door-plan.md §3/§7). Slugs are FROZEN — they
 * port 1:1 from the old site. Locked framing: "community-compiled + cited" —
 * no personal byline, and the disclaimer banner is the standing softener for
 * any figure in the body (a per-claim editorial pass is Phase B work).
 */

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const report = getReport(slug);
  if (!report) return {};
  return frontMetadata({
    title: report.title,
    description: report.preview,
    path: `/reports/${slug}`,
    // Article OG (standard §2 F34): reports are dated documents — previews
    // and crawlers get the publish date, not a generic website card.
    article: { publishedTime: report.date },
  });
}

export default async function ReportPage({ params }: Params) {
  const { slug } = await params;
  const report = getReport(slug);
  if (!report) notFound();

  const t = await getT();

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title,
    description: report.preview,
    // The report data carries a single date — publish and last-modified are
    // the same fact until an editorial pass gives reports a revision history.
    datePublished: report.date,
    dateModified: report.date,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${env.APP_URL.replace(/\/+$/, '')}/reports/${slug}`,
    },
    author: { '@type': 'Organization', name: 'Xidig Community' },
  };
  const faqJsonLd =
    report.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: report.faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }
      : null;

  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
        {faqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
          />
        ) : null}

        <p>
          <Link href="/reports">← {t('marketing.reportsAll')}</Link>
        </p>
        <h1>{report.title}</h1>
        <p className="xidig-report-meta">
          {`${t('marketing.reportsCompiledLabel')} · ${report.category} · ${report.readTime} · ${report.date}`}
        </p>
        <p className="xidig-banner xidig-banner--notice">{t('marketing.reportsDisclaimer')}</p>

        <ReportMarkdown content={report.fullContent} />

        {report.faqs.length > 0 ? (
          <section className="xidig-front__section">
            <h2>{t('marketing.reportsFaqTitle')}</h2>
            {report.faqs.map((faq) => (
              <details key={faq.question} className="xidig-report-faq">
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
