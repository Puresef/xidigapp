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
