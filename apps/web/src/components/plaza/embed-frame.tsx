import type { EmbedProvider } from '@/lib/embeds';

/**
 * §15 embed-first video: whitelisted provider iframe (YouTube / Vimeo /
 * TikTok / X / Instagram). The sandbox keeps third-party player scripts
 * contained; lazy loading keeps the feed cheap until the player scrolls in.
 * Presentational only — renders in server and client components alike.
 */
export function EmbedFrame({ provider, embedUrl }: { provider: EmbedProvider; embedUrl: string }) {
  return (
    <div className="xidig-embed">
      <iframe
        src={embedUrl}
        title={provider}
        loading="lazy"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
