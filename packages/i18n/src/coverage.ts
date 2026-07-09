import { en, type MessageKey } from './dictionaries/en';
import { so } from './dictionaries/so';

/**
 * Somali translation coverage, tracked so it can climb to 100% post-launch
 * (PRD §22 + naming system). Run `pnpm i18n:coverage` for a report.
 */

/**
 * Trust-defining surfaces that MUST be fully translated before launch:
 * navigation, onboarding, errors, empty states, and core actions.
 * coverage.test.ts fails the build if any of these slip below 100%.
 */
export const LAUNCH_FLOOR_NAMESPACES = [
  'app',
  'nav',
  'term',
  'action',
  'language',
  'state',
  'error',
  'onboarding',
  'auth',
  'waitlist',
  'settings',
  'a11y',
  // Footer links out to the marketing site's legal + about pages — a trust
  // surface, so Somali ships complete.
  'footer',
  // Member-facing trust surfaces (Phase 1 UI): profiles, Suuq directory/map,
  // Following feed. Somali must ship complete here too.
  'profile',
  'suuq',
  'feed',
  // Share text (WhatsApp/link share of a Space or Venture candidate) is
  // member- and public-facing copy — ships fully translated.
  'share',
  // Phase 2: the Plaza (Madal) is the core community surface — teaching empty
  // states, Ask lifecycle, reactions, §27 copy all live here.
  'plaza',
  // Phase 3: Fariimo (DMs) + notifications + push — member-facing trust
  // surfaces; §27 DM copy and notification bundling live here.
  'messages',
  'notif',
  'push',
  // Phase 4: Labs / Spaces (Warshad/Koox) — core nav surface; §27 Labs errors,
  // teaching empty states, charter + settings copy. SO drafts ship now; native
  // review is tracked as Alpha Hardening Debt.
  'lab',
  // Phase 4.5 experience expansion — all member-facing trust surfaces:
  //   lite   = deferred-media placeholders ("Show / Muuji") — bandwidth is the
  //            product's core promise, so this ships fully translated.
  //   saved  = bookmarks; social = mutes/mentions/post options; search =
  //            grouped discovery. SO drafts ship now; native review is tracked
  //            as Alpha Hardening Debt.
  'lite',
  'saved',
  'social',
  'search',
  // Phase 5: Capital / Maal — a trust surface (compliance-critical region gate,
  // §27 error/notice copy, investment intent). Ships fully translated; native
  // review is tracked as Alpha Hardening Debt.
  'capital',
  // `notice.*` — informational success-path copy the API returns (region gate,
  // etc.); a trust surface alongside `error.*`.
  'notice',
  // Phase 7 member-facing surfaces:
  //   matching = "looking-for" Labs; awards = Community Awards voting;
  //   mentor = Mentor-in-Residence featured slot; reputation = scores/badges.
  // Growth + recognition surfaces — Somali ships complete; native review is
  // tracked as Alpha Hardening Debt.
  'matching',
  'awards',
  'mentor',
  'reputation',
] as const;

export interface NamespaceCoverage {
  namespace: string;
  total: number;
  translated: number;
  missing: MessageKey[];
}

export interface CoverageReport {
  totalKeys: number;
  translatedKeys: number;
  /** 0–100, one decimal place. */
  percent: number;
  missingKeys: MessageKey[];
  namespaces: NamespaceCoverage[];
}

export function namespaceOf(key: MessageKey): string {
  return key.split('.')[0] ?? key;
}

export function getCoverageReport(): CoverageReport {
  const allKeys = Object.keys(en) as MessageKey[];
  const missingKeys = allKeys.filter((key) => !(key in so));

  const namespaces = new Map<string, NamespaceCoverage>();
  for (const key of allKeys) {
    const namespace = namespaceOf(key);
    const entry = namespaces.get(namespace) ?? {
      namespace,
      total: 0,
      translated: 0,
      missing: [],
    };
    entry.total += 1;
    if (key in so) {
      entry.translated += 1;
    } else {
      entry.missing.push(key);
    }
    namespaces.set(namespace, entry);
  }

  const totalKeys = allKeys.length;
  const translatedKeys = totalKeys - missingKeys.length;
  return {
    totalKeys,
    translatedKeys,
    percent: totalKeys === 0 ? 100 : Math.round((translatedKeys / totalKeys) * 1000) / 10,
    missingKeys,
    namespaces: [...namespaces.values()].sort((a, b) => a.namespace.localeCompare(b.namespace)),
  };
}

/** Human-readable coverage table for CI logs and `pnpm i18n:coverage`. */
export function formatCoverageReport(report: CoverageReport): string {
  const lines = [
    `Somali coverage: ${report.translatedKeys}/${report.totalKeys} keys (${report.percent}%)`,
    '',
  ];
  for (const ns of report.namespaces) {
    const floor = (LAUNCH_FLOOR_NAMESPACES as readonly string[]).includes(ns.namespace);
    const status = ns.translated === ns.total ? 'ok' : `missing ${ns.total - ns.translated}`;
    lines.push(
      `  ${ns.namespace.padEnd(12)} ${String(ns.translated).padStart(3)}/${String(ns.total).padEnd(3)} ${status}${floor ? '  [launch floor]' : ''}`,
    );
  }
  if (report.missingKeys.length > 0) {
    lines.push('', 'Missing keys:');
    for (const key of report.missingKeys) lines.push(`  - ${key}`);
  }
  return lines.join('\n');
}
