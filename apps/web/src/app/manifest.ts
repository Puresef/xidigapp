import type { MetadataRoute } from 'next';

/**
 * PWA manifest (§22 installable PWA). Icons are intentionally omitted until the
 * final brand assets land (§26 — placeholder star assets pending the Brand
 * Guide); the app is still installable and push still works without them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xidig',
    short_name: 'Xidig',
    description: 'Where Somali builders connect, build, and fund — end to end.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#111111',
  };
}
