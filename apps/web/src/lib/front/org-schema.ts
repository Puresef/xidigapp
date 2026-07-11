import { env } from '@/env';

/**
 * Organization JSON-LD for the front-door landing page (docs/front-door-plan.md
 * §7 — the old site's one durable schema asset). Only the factual parts port:
 * the `areaServed` list of Somali cities + diaspora hubs is real geography and
 * carries over 1:1; the old site's slogan, `sameAs` social handles, and
 * "Xidig Network" alternate names were part of its fabricated-proof problem
 * and are deliberately NOT ported (old-site copy is not canon).
 *
 * City names are schema.org data for search engines, not UI copy — exempt
 * from the i18n key rule (same exemption as the reports content). The
 * description is the locked app tagline, passed in by the caller so it
 * resolves through the normal i18n path.
 */

const SOMALIA_CITIES = [
  'Mogadishu',
  'Hargeisa',
  'Kismayo',
  'Garowe',
  'Bosaso',
  'Baidoa',
  'Galkayo',
  'Berbera',
  'Burao',
  'Beledweyne',
] as const;

const DIASPORA_HUBS: ReadonlyArray<readonly [city: string, country: string]> = [
  ['Minneapolis', 'US'],
  ['Columbus', 'US'],
  ['Seattle', 'US'],
  ['San Diego', 'US'],
  ['Washington', 'US'],
  ['Toronto', 'CA'],
  ['Ottawa', 'CA'],
  ['Edmonton', 'CA'],
  ['London', 'GB'],
  ['Birmingham', 'GB'],
  ['Leicester', 'GB'],
  ['Stockholm', 'SE'],
  ['Gothenburg', 'SE'],
  ['Oslo', 'NO'],
  ['Copenhagen', 'DK'],
  ['Amsterdam', 'NL'],
  ['Helsinki', 'FI'],
  ['Melbourne', 'AU'],
  ['Dubai', 'AE'],
  ['Jeddah', 'SA'],
  ['Riyadh', 'SA'],
  ['Nairobi', 'KE'],
  ['Addis Ababa', 'ET'],
  ['Djibouti City', 'DJ'],
] as const;

export function organizationJsonLd(opts: { description: string }) {
  const appUrl = env.APP_URL.replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${appUrl}/#organization`,
    name: 'Xidig',
    url: appUrl,
    logo: `${appUrl}/apple-icon.png`,
    description: opts.description,
    // No contactPoint: the old site's info@xidig.net is not a verified live
    // inbox and the app's contact surface is the /contact form. Add one only
    // when a real monitored address exists.
    areaServed: [
      ...SOMALIA_CITIES.map((name) => ({
        '@type': 'City',
        name,
        addressCountry: 'SO',
      })),
      ...DIASPORA_HUBS.map(([name, addressCountry]) => ({
        '@type': 'City',
        name,
        addressCountry,
      })),
    ],
  };
}
