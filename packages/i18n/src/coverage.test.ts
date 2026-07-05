import { describe, expect, it } from 'vitest';

import { en, type MessageKey } from './dictionaries/en';
import { so } from './dictionaries/so';
import {
  formatCoverageReport,
  getCoverageReport,
  LAUNCH_FLOOR_NAMESPACES,
  namespaceOf,
} from './coverage';
import { isPluralMessage, type Message } from './messages';

function placeholdersOf(message: Message): Set<string> {
  const text = isPluralMessage(message) ? `${message.one} ${message.other}` : message;
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ''));
}

const enEntries = Object.entries(en) as Array<[MessageKey, Message]>;
const soEntries = Object.entries(so) as Array<[MessageKey, Message]>;

describe('dictionary invariants', () => {
  it('every key follows the namespace.camelCase convention', () => {
    for (const [key] of enEntries) {
      expect(key, `bad key name: ${key}`).toMatch(/^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*$/);
    }
  });

  it('Somali has no orphan keys missing from the English dictionary of record', () => {
    for (const [key] of soEntries) {
      expect(key in en, `orphan Somali key: ${key}`).toBe(true);
    }
  });

  it('translated messages keep the same placeholders as English', () => {
    for (const [key, soMessage] of soEntries) {
      const enMessage = en[key];
      expect(placeholdersOf(soMessage), `placeholder mismatch on ${key}`).toEqual(
        placeholdersOf(enMessage),
      );
    }
  });

  it('plural messages stay plural across locales', () => {
    for (const [key, soMessage] of soEntries) {
      expect(isPluralMessage(soMessage), `plural shape mismatch on ${key}`).toBe(
        isPluralMessage(en[key]),
      );
    }
  });

  it('no message is left empty', () => {
    for (const [key, message] of [...enEntries, ...soEntries]) {
      const texts = isPluralMessage(message) ? [message.one, message.other] : [message];
      for (const text of texts) {
        expect(text.trim().length, `empty message: ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Somali coverage', () => {
  const report = getCoverageReport();

  it('launch-floor namespaces (trust surfaces) are 100% translated', () => {
    for (const ns of report.namespaces) {
      if ((LAUNCH_FLOOR_NAMESPACES as readonly string[]).includes(ns.namespace)) {
        expect(
          ns.missing,
          `launch-floor namespace "${ns.namespace}" has untranslated keys`,
        ).toEqual([]);
      }
    }
  });

  it('every namespace is either on the launch floor or explicitly tracked', () => {
    // A new namespace must be added to LAUNCH_FLOOR_NAMESPACES or consciously
    // left off it — this test makes that a deliberate decision, not an accident.
    const known = new Set<string>(LAUNCH_FLOOR_NAMESPACES);
    // admin.* is internal mod/admin tooling — off the launch floor (not a
    // member trust surface); Somali still tracked to 100% post-launch.
    const trackedOffFloor = new Set(['home', 'admin']);
    for (const ns of report.namespaces) {
      expect(
        known.has(ns.namespace) || trackedOffFloor.has(ns.namespace),
        `namespace "${ns.namespace}" is not classified — add it to LAUNCH_FLOOR_NAMESPACES (trust surface) or trackedOffFloor (this test)`,
      ).toBe(true);
    }
  });

  it('reports coverage so it can climb to 100% post-launch', () => {
    // Informational: printed by `pnpm i18n:coverage`. Never fails the build
    // for off-floor gaps — English fallback keeps the UI whole.
    console.log(`\n${formatCoverageReport(report)}\n`);
    expect(report.percent).toBeGreaterThan(0);
  });

  it('computes namespaces from key prefixes', () => {
    expect(namespaceOf('nav.home' as MessageKey)).toBe('nav');
  });
});
