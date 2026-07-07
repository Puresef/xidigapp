'use client';

import { MediaSlot } from '@/components/media/media-slot';
import type { ListingPhotoView } from '@/lib/listing-view';
import type { LitePrefs } from '@/lib/lite/prefs';

/**
 * Listing photo gallery (§18, Phase 4.5): first photo renders as the hero
 * (full asset — MediaSlot still picks thumb-first on slow connections), the
 * rest as a thumbnail strip. Every slot carries blurhash + alt, so in Lite
 * mode the gallery is a set of ~0-byte placeholders with per-photo "Show"
 * taps (§22 — deferred, never removed).
 */
export function ListingPhotoGallery({
  photos,
  prefs,
}: {
  photos: ListingPhotoView[];
  prefs: LitePrefs;
}) {
  if (photos.length === 0) return null;
  const [hero, ...rest] = photos as [ListingPhotoView, ...ListingPhotoView[]];

  return (
    <div className="xidig-listing-gallery">
      <MediaSlot
        kind="image"
        src={hero.url}
        thumbSrc={hero.thumbUrl}
        blurhash={hero.blurhash}
        alt={hero.alt}
        width={hero.width}
        height={hero.height}
        prefs={prefs}
        className="xidig-listing-gallery__hero"
      />
      {rest.length > 0 ? (
        <div className="xidig-listing-gallery__thumbs">
          {rest.map((photo) => (
            <MediaSlot
              key={photo.url}
              kind="image"
              src={photo.thumbUrl}
              thumbSrc={photo.thumbUrl}
              blurhash={photo.blurhash}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              prefs={prefs}
              className="xidig-listing-gallery__thumb"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
