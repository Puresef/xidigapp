'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useLocale, useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import {
  EMBED_EST_DEFAULT_BYTES,
  formatBytes,
  IMAGE_EST_FALLBACK_BYTES,
  MAP_EST_BYTES,
} from '@/lib/lite/estimates';
import type { LitePrefs } from '@/lib/lite/prefs';
import { recordSaved } from '@/lib/lite/savings';
import { decode } from '@/lib/media/blurhash';

import { useLiteMedia } from './lite-media-provider';

/**
 * MediaSlot — the Lite mode keystone (§22, Phase 4.5). Lite is a delivery
 * constraint, not a scope constraint: when a category (images / embeds /
 * maps) is deferred in the viewer's LitePrefs, the slot renders a ~0-byte
 * placeholder — blurhash wash (≤32px canvas scaled by CSS) or neutral box,
 * the alt label, the estimated size, and a "Show / Muuji" button that loads
 * that ONE asset on demand. Nothing is ever removed, only deferred.
 *
 * - Reveals are remembered per browser session (sessionStorage keyed by src).
 * - Deferred slots count toward the weekly savings meter exactly once per
 *   src per session (lib/lite/savings.ts).
 * - Under a LiteMediaProvider, slots also join the page-level "Show all".
 * - Images are connection-aware even when NOT deferred: on saveData/2g/3g
 *   the thumb renders first with an explicit tap-to-full.
 */

export type MediaSlotKind = 'image' | 'embed' | 'map';

const REVEAL_PREFIX = 'xidig_lite_rev:';
const COUNTED_PREFIX = 'xidig_lite_cnt:';

function sessionFlag(prefix: string, src: string): boolean {
  try {
    return window.sessionStorage.getItem(prefix + src) === '1';
  } catch {
    return false;
  }
}

/** Returns false when the flag could not be persisted (storage disabled). */
function setSessionFlag(prefix: string, src: string): boolean {
  try {
    window.sessionStorage.setItem(prefix + src, '1');
    return true;
  } catch {
    return false;
  }
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return (
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g' ||
    connection.effectiveType === '3g'
  );
}

function defaultEstBytes(kind: MediaSlotKind): number {
  if (kind === 'map') return MAP_EST_BYTES;
  if (kind === 'embed') return EMBED_EST_DEFAULT_BYTES;
  return IMAGE_EST_FALLBACK_BYTES;
}

/** ≤32px blurhash canvas; CSS scales it to fill the slot. */
function BlurhashCanvas({ hash, aspect }: { hash: string; aspect: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const canvasWidth = 32;
  const canvasHeight = Math.min(32, Math.max(4, Math.round(32 / (aspect || 1))));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      const pixels = decode(hash, canvasWidth, canvasHeight);
      const context = canvas.getContext('2d');
      if (!context) return;
      const imageData = context.createImageData(canvasWidth, canvasHeight);
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
    } catch {
      // Invalid hash → the neutral box underneath stays visible.
    }
  }, [hash, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={ref}
      width={canvasWidth}
      height={canvasHeight}
      className="xidig-media-slot__canvas"
      aria-hidden="true"
    />
  );
}

export function MediaSlot({
  kind,
  src,
  thumbSrc,
  blurhash,
  alt,
  estBytes,
  width,
  height,
  prefs,
  className,
  children,
}: {
  kind: MediaSlotKind;
  /** Canonical asset identity: the URL to load (also the session-memory key). */
  src: string;
  thumbSrc?: string | undefined;
  blurhash?: string | null | undefined;
  alt: string;
  estBytes?: number | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
  prefs: LitePrefs;
  className?: string | undefined;
  /** The real asset for embed/map slots (image slots render their own img). */
  children?: ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  const lite = useLiteMedia();
  const slotId = useId();

  const categoryEnabled =
    kind === 'image' ? prefs.images : kind === 'embed' ? prefs.embeds : prefs.maps;

  const [revealed, setRevealed] = useState(false);
  const [fullRequested, setFullRequested] = useState(false);
  // null until mounted → server and first client render agree (thumb-first).
  const [connection, setConnection] = useState<'slow' | 'fast' | null>(null);

  const shown =
    categoryEnabled || revealed || (lite?.showAll ?? false) || (lite?.revealed.has(src) ?? false);

  // Session memory + savings meter. Runs once per src: a slot revealed
  // earlier this session opens immediately; a slot that stays deferred is
  // counted toward the meter exactly once (the sessionStorage marker is the
  // dedupe — no marker, no count, so broken storage never double-counts).
  const est = estBytes ?? defaultEstBytes(kind);
  useEffect(() => {
    if (sessionFlag(REVEAL_PREFIX, src)) {
      setRevealed(true);
      return;
    }
    if (categoryEnabled) return;
    if (!sessionFlag(COUNTED_PREFIX, src) && setSessionFlag(COUNTED_PREFIX, src)) {
      recordSaved(est);
    }
    // est is deliberately not a dependency — remounting with a refined
    // estimate must not re-count the slot.
  }, [src, categoryEnabled]);

  useEffect(() => {
    setConnection(isSlowConnection() ? 'slow' : 'fast');
  }, []);

  // Page-level "N hidden — Show all" registration (provider optional).
  const registerHidden = lite?.registerHidden;
  const unregisterHidden = lite?.unregisterHidden;
  useEffect(() => {
    if (!registerHidden || !unregisterHidden || shown) return;
    registerHidden(slotId);
    return () => unregisterHidden(slotId);
  }, [registerHidden, unregisterHidden, shown, slotId]);

  function reveal() {
    setRevealed(true);
    setSessionFlag(REVEAL_PREFIX, src);
    lite?.reveal(src);
    trackClient('media_revealed', { kind });
  }

  const aspect =
    width && height && width > 0 && height > 0
      ? width / height
      : kind === 'embed'
        ? 16 / 9
        : kind === 'map'
          ? 3 / 2
          : 4 / 3;
  const frameClass = ['xidig-media-slot', `xidig-media-slot--${kind}`, className]
    .filter(Boolean)
    .join(' ');

  if (!shown) {
    return (
      <div className={frameClass} style={{ aspectRatio: String(aspect) }}>
        {blurhash ? <BlurhashCanvas hash={blurhash} aspect={aspect} /> : null}
        <div className="xidig-media-slot__overlay">
          <span className="xidig-media-slot__label">{alt}</span>
          <span className="xidig-media-slot__size">
            {t('lite.estSize', { size: formatBytes(est, locale) })}
          </span>
          <button
            type="button"
            className="xidig-button xidig-button--secondary xidig-media-slot__show"
            aria-label={t('lite.showAria', { label: alt })}
            onClick={reveal}
          >
            {t('lite.show')}
          </button>
        </div>
      </div>
    );
  }

  if (kind !== 'image') {
    return <div className={frameClass}>{children}</div>;
  }

  // Image slot renders its own <img>. Connection-aware pick: until the
  // connection is known (and on slow ones after that) the thumb loads first
  // — an explicit tap upgrades to the full asset. No thumb → straight to src.
  const hasSeparateThumb = typeof thumbSrc === 'string' && thumbSrc !== '' && thumbSrc !== src;
  const wantFull = !hasSeparateThumb || fullRequested || connection === 'fast';
  const img = (
    <img
      src={wantFull ? src : (thumbSrc as string)}
      alt={alt}
      loading="lazy"
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
    />
  );

  if (wantFull) {
    return <div className={frameClass}>{img}</div>;
  }
  return (
    <div className={frameClass}>
      <button
        type="button"
        className="xidig-media-slot__thumb-btn"
        aria-label={t('lite.loadFull')}
        title={t('lite.loadFull')}
        onClick={() => setFullRequested(true)}
      >
        {img}
      </button>
    </div>
  );
}
