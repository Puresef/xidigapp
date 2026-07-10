import reportsJson from '@/data/reports.json';

/**
 * The 14 reports ported from the old xidig.net (docs/front-door-plan.md §3/§7).
 * Slugs are FROZEN — they hold whatever search equity the old site earned and
 * must never be renamed. Content is community-compiled data, not UI copy, so
 * it is exempt from the i18n key rule (like member content); all chrome around
 * it uses marketing.* keys. Locked framing: "community-compiled + cited" — the
 * old "Xidig Research" byline is not rendered, and every page carries the
 * marketing.reportsDisclaimer softening note.
 *
 * Phase A is text-first: cover/inline images and PDF downloads are deferred
 * to Phase B's asset diet (AVIF re-encode), so `coverImage`/`pdfUrl` are
 * carried in the data but not yet rendered ('#' marks web-only reports).
 */

export interface ReportFaq {
  question: string;
  answer: string;
}

export interface Report {
  id: number;
  slug: string;
  category: string;
  title: string;
  preview: string;
  fullContent: string;
  readTime: string;
  date: string;
  author: string;
  tags: string[];
  coverImage: string;
  pdfUrl: string;
  faqs: ReportFaq[];
}

const REPORTS = reportsJson as Report[];

export function getAllReports(): Report[] {
  return REPORTS;
}

export function getReport(slug: string): Report | undefined {
  return REPORTS.find((report) => report.slug === slug);
}

export function reportSlugs(): string[] {
  return REPORTS.map((report) => report.slug);
}
