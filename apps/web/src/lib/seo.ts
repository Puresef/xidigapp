import type { Metadata } from 'next';

import { createTranslator, type Locale } from '@xidig/i18n';

import { env } from '@/env';
import { getLocale } from '@/lib/locale';

/**
 * Env-gated indexing (docs/front-door-plan.md §3). While this deployment
 * serves app.xidig.net, the front door must stay OUT of search indexes so the
 * old marketing site remains the sole indexed owner of its URLs (no cross-host
 * duplicate-content window). Indexing flips on automatically when APP_URL
 * becomes the apex at cutover step 3 — no code change involved.
 */
export function isApexDeployment(): boolean {
  // Boot-trap guard: under SKIP_ENV_VALIDATION (envless CI/worktree build)
  // `env` falls back to raw process.env, where APP_URL can be undefined —
  // treat that as not-apex so robots/sitemap prerender their conservative
  // non-apex shape instead of crashing the build on `.replace`.
  const appUrl: string | undefined = env.APP_URL;
  return (appUrl ?? '').replace(/\/+$/, '') === 'https://xidig.net';
}

/**
 * Per-page `robots` metadata for public front-door routes: undefined (default
 * indexable) at the apex, explicit noindex everywhere else. Public front-door
 * routes get this via `frontMetadata()` below (which spreads it so apex pages
 * inherit rather than override) — call it directly only for a public route
 * that can't use the composer.
 */
export function frontDoorRobots(): { index: false; follow: false } | undefined {
  return isApexDeployment() ? undefined : { index: false, follow: false };
}

/**
 * og:locale forms for the two app locales. Somali-first: the front door
 * negotiates SO by default (docs/front-door-plan.md §6), and the share card
 * declares whichever locale actually rendered, with the sibling as alternate.
 */
export const OG_LOCALES: Record<Locale, string> = { so: 'so_SO', en: 'en_US' };

interface FrontMetadataInput {
  /** Page title WITHOUT the brand suffix — the root title.template adds it. */
  title: string;
  description: string;
  /** Root-relative canonical path, e.g. '/product' or '/reports/<slug>'. */
  path: string;
  /**
   * Set when the title string already carries the brand (e.g. waitlist.title
   * "Join the Xidig waitlist"): the html title bypasses the template and
   * og:title ships as-is, so "Xidig" never appears twice.
   */
  brandInTitle?: boolean;
  /** Reports: og:type=article with publish/modified times (ISO dates). */
  article?: { publishedTime: string; modifiedTime?: string };
}

/**
 * Shared metadata composer for the public front-door routes (front-door
 * standard §2 F32): title + description + canonical, mirrored into openGraph.
 * og:title is written EXPLICITLY suffixed — Next applies title.template to
 * <title> only, never to og:title — so a WhatsApp/preview card carries the
 * page's real title instead of the root default "Xidig".
 */
export async function frontMetadata(input: FrontMetadataInput): Promise<Metadata> {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const brand = t('app.name');
  const robots = frontDoorRobots();
  return {
    title: input.brandInTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: input.brandInTitle ? input.title : `${input.title} — ${brand}`,
      description: input.description,
      url: input.path,
      siteName: brand,
      locale: OG_LOCALES[locale],
      alternateLocale: [OG_LOCALES[locale === 'so' ? 'en' : 'so']],
      ...(input.article
        ? {
            type: 'article' as const,
            publishedTime: input.article.publishedTime,
            modifiedTime: input.article.modifiedTime ?? input.article.publishedTime,
          }
        : { type: 'website' as const }),
    },
    ...(robots ? { robots } : {}),
  };
}
