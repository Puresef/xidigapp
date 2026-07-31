import { permanentRedirect } from 'next/navigation';

/**
 * /suuq/map → /suuq?tab=map (Task 12: the map is a directory tab now, so it
 * composes with the shared filter bar). Route-level redirect rather than a
 * next.config entry: the config redirect list is the OLD marketing site's 301
 * map (301-map-shadows-new-routes gotcha) — app-route moves stay out of it so
 * the two namespaces can never shadow each other. The old route took no query
 * params, so none are forwarded.
 */
export default function SuuqMapRedirect(): never {
  permanentRedirect('/suuq?tab=map');
}
