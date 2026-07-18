'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { resolveError, type PlainError } from '@/lib/errors';
import { LISTING_MAX_PHOTOS } from '@/lib/listings';
import { IMAGE_MAX_BYTES, IMAGE_MAX_MB } from '@/lib/plaza/constants';
import { FilePickerButton } from '../file-picker-button';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Listing photo picker (§18, Phase 4.5): up to 5 photos, alt text REQUIRED
 * before upload (POST /api/media 400s without it — the description is what
 * Lite placeholders and screen readers get, §22). Same staging flow as the
 * Plaza image-picker (object-URL preview → alt → attach), plus up/down
 * reordering of the attached list — array order is gallery order, and the
 * FIRST photo is the cover the directory card and OG image use. The listing
 * itself only learns about the set on save (PUT /api/listings/[id]/photos).
 */

export interface PickedPhoto {
  mediaId: string;
  url: string;
  thumbUrl: string | null;
  alt: string;
  blurhash: string | null;
  scanStatus: string;
}

interface MediaEnvelope {
  data?: {
    media: {
      id: string;
      url: string;
      thumbUrl?: string | null;
      blurhash?: string | null;
      scanStatus: string;
    };
  };
  error?: PlainError;
}

interface StagedPhoto {
  key: string;
  file: File;
  previewUrl: string;
  alt: string;
  uploading: boolean;
}

export function ListingPhotosPicker({
  value,
  onChange,
}: {
  value: PickedPhoto[];
  onChange: (list: PickedPhoto[]) => void;
}) {
  const t = useT();
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [error, setError] = useState<PlainError | null>(null);

  // Object URLs live until the picker unmounts (see plaza/image-picker.tsx).
  const urlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const totalCount = value.length + staged.length;

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setError(null);
    const additions: StagedPhoto[] = [];
    let room = LISTING_MAX_PHOTOS - totalCount;
    for (const file of files) {
      if (room <= 0) break;
      if (file.size > IMAGE_MAX_BYTES) {
        setError(resolveError('image_too_large', t));
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      urlsRef.current.add(previewUrl);
      additions.push({
        key: `${file.name}:${file.size}:${Date.now()}:${Math.random()}`,
        file,
        previewUrl,
        alt: '',
        uploading: false,
      });
      room -= 1;
    }
    if (additions.length > 0) setStaged((current) => [...current, ...additions]);
  }

  function setAlt(key: string, alt: string) {
    setStaged((current) => current.map((row) => (row.key === key ? { ...row, alt } : row)));
  }

  function removeStaged(key: string) {
    setStaged((current) => current.filter((row) => row.key !== key));
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  async function attach(item: StagedPhoto) {
    const alt = item.alt.trim();
    if (!alt || item.uploading) return;

    setError(null);
    setStaged((current) =>
      current.map((row) => (row.key === item.key ? { ...row, uploading: true } : row)),
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('kind', 'listing_photo');
    formData.append('alt', alt);

    let body: MediaEnvelope = {};
    try {
      const res = await fetch('/api/media', { method: 'POST', body: formData });
      try {
        body = (await res.json()) as MediaEnvelope;
      } catch {
        body = {};
      }
      if (!res.ok || body.error || !body.data) {
        setError(body.error ?? { code: 'server_error', message: '' });
        setStaged((current) =>
          current.map((row) => (row.key === item.key ? { ...row, uploading: false } : row)),
        );
        return;
      }
    } catch {
      setError({ code: 'server_error', message: '' });
      setStaged((current) =>
        current.map((row) => (row.key === item.key ? { ...row, uploading: false } : row)),
      );
      return;
    }

    const { media } = body.data;
    removeStaged(item.key);
    onChange([
      ...value,
      {
        mediaId: media.id,
        url: media.url,
        thumbUrl: media.thumbUrl ?? null,
        alt,
        blurhash: media.blurhash ?? null,
        scanStatus: media.scanStatus,
      },
    ]);
  }

  return (
    <fieldset className="xidig-field">
      <legend className="xidig-field__label" id="listing-photos-label">
        {t('suuq.photosLabel')}
      </legend>
      <p className="xidig-field__hint">
        {t('suuq.photosHint', { max: LISTING_MAX_PHOTOS, maxMb: IMAGE_MAX_MB })}
      </p>
      {error ? <PlainErrorBanner error={error} /> : null}
      <FilePickerButton
        id="listing-photos"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        disabled={totalCount >= LISTING_MAX_PHOTOS}
        labelKey="plaza.imageChoose"
        labelledBy="listing-photos-label"
        onChange={onFiles}
      />

      {staged.length > 0 ? (
        <div className="xidig-media-row">
          {staged.map((item) => (
            <div key={item.key} className="xidig-media-thumb">
              <img src={item.previewUrl} alt={item.alt || item.file.name} />
              <label className="xidig-field__label" htmlFor={`listing-photo-alt-${item.key}`}>
                {t('suuq.photoAltLabel')}
              </label>
              <input
                id={`listing-photo-alt-${item.key}`}
                className="xidig-field__input"
                maxLength={300}
                value={item.alt}
                onChange={(e) => setAlt(item.key, e.target.value)}
              />
              <p className="xidig-field__hint">{t('suuq.photoAltHint')}</p>
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={!item.alt.trim() || item.uploading}
                onClick={() => void attach(item)}
              >
                {item.uploading ? t('suuq.photoUploading') : t('suuq.photoAttach')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                aria-label={t('a11y.removeRow')}
                onClick={() => removeStaged(item.key)}
              >
                {t('action.remove')}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="xidig-media-row">
          {value.map((photo, index) => (
            <div key={photo.mediaId} className="xidig-media-thumb">
              <img src={photo.thumbUrl ?? photo.url} alt={photo.alt} />
              {index === 0 ? <span className="xidig-tag">{t('suuq.photoCover')}</span> : null}
              <div className="xidig-chip-row">
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  aria-label={t('a11y.moveUp')}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  aria-label={t('a11y.moveDown')}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  aria-label={t('a11y.removeRow')}
                  onClick={() => onChange(value.filter((row) => row.mediaId !== photo.mediaId))}
                >
                  {t('action.remove')}
                </button>
              </div>
              {photo.scanStatus === 'uncertain' ? (
                <p className="xidig-field__hint">{t('suuq.photoQueued')}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
