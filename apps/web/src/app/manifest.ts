import type { MetadataRoute } from 'next';

/**
 * PWA manifest (§22 installable PWA). Icons point at the placeholder Xidig
 * star/X mark (served via the app/ file convention — icon.svg + apple-icon.png);
 * swap these when the final brand assets land (§26 — Brand Guide).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xidig',
    short_name: 'Xidig',
    description: 'Where Somali builders connect, build, and fund — end to end.',
    start_url: '/',
    display: 'standalone',
    // "One sky" palette (18 Jul): dawn canvas + the mark's blue.
    background_color: '#f2f5fa',
    theme_color: '#2e78b0',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  };
}
