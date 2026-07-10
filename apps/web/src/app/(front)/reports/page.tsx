import type { Metadata } from 'next';
import Link from 'next/link';

import { getAllReports } from '@/lib/front/reports';
import { getT } from '@/lib/locale';
import { frontDoorRobots } from '@/lib/seo';

/**
 * /reports index (docs/front-door-plan.md §3/§7) — the ported SEO/authority
 * pillar. Report records are community-compiled data, not UI copy; all chrome
 * is marketing.* keys.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const robots = frontDoorRobots();
  return {
    title: t('marketing.reportsTitle'),
    alternates: { canonical: '/reports' },
    ...(robots ? { robots } : {}),
  };
}

export default async function ReportsIndexPage() {
  const t = await getT();
  const reports = getAllReports();
  return (
    <main className="xidig-front">
      <section className="xidig-front__hero">
        <h1>{t('marketing.reportsTitle')}</h1>
        <p>{t('marketing.reportsIntro')}</p>
      </section>
      <div className="xidig-front__grid">
        {reports.map((report) => (
          <div key={report.slug} className="xidig-front-card">
            <h3>
              <Link href={`/reports/${report.slug}`}>{report.title}</Link>
            </h3>
            <p>{report.preview}</p>
            <p className="xidig-report-meta">
              {`${report.category} · ${report.readTime} · ${report.date}`}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
