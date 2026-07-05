import { cookies } from 'next/headers';

import { LOW_BANDWIDTH_COOKIE, parseLowBandwidthCookieValue } from './bandwidth';

/**
 * Server-side read of the low-bandwidth preference (§22). Separate module so
 * client components can import lib/bandwidth.ts without pulling in
 * next/headers. Reading cookies() opts the page into dynamic rendering —
 * every page that branches on this is already force-dynamic.
 */
export async function getLowBandwidth(): Promise<boolean> {
  const store = await cookies();
  return parseLowBandwidthCookieValue(store.get(LOW_BANDWIDTH_COOKIE)?.value);
}
