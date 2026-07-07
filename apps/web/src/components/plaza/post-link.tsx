import { interstitialHref } from '@/lib/embeds';

/**
 * Unknown-domain link in a post (§15): rendered as the plain URL, routed
 * through the /out warning interstitial — the interstitial carries the
 * "you're leaving Xidig" copy, so this stays a bare anchor. `host` is part
 * of the LinkKind contract; the interstitial page displays it, not us.
 */
export function PostLink({ url }: { url: string; host: string }) {
  return (
    <a href={interstitialHref(url)} rel="nofollow noopener">
      {url}
    </a>
  );
}
