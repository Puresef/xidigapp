'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { resolveError, type PlainError } from '@/lib/errors';
import { IMAGE_MAX_BYTES, IMAGE_MAX_MB, POST_MAX_IMAGES } from '@/lib/plaza/constants';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Composer image upload (§15/§26; Phase 4.5 alt text): up to POST_MAX_IMAGES
 * per post, 5MB cap pre-checked client-side (the server enforces it again).
 * Picking a file STAGES it locally (object-URL preview) with an alt text
 * field — the description is required to attach, because it is what Lite
 * placeholders and screen readers get instead of the pixels (§22). Attaching
 * uploads to POST /api/media as multipart FormData (`kind=post` + `alt`) —
 * apiPost is JSON-only, so this talks to the envelope with a raw fetch.
 * Uploads that come back scan_status 'uncertain' stay attached but show the
 * human-review note.
 */

export interface UploadedImage {
  id: string;
  url: string;
  thumbUrl?: string | null;
  alt: string;
  scanStatus: string;
}

interface MediaEnvelope {
  data?: {
    media: { id: string; url: string; thumbUrl?: string | null; scanStatus: string };
  };
  error?: PlainError;
}

interface StagedImage {
  key: string;
  file: File;
  previewUrl: string;
  alt: string;
  uploading: boolean;
}

export function ImagePicker({
  value,
  onChange,
}: {
  value: UploadedImage[];
  onChange: (list: UploadedImage[]) => void;
}) {
  const t = useT();
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [error, setError] = useState<PlainError | null>(null);

  // Object URLs live until the picker unmounts (revoking on every staged-list
  // change would kill previews still on screen).
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
    // Reset immediately so re-picking the same file fires onChange again.
    event.target.value = '';
    if (files.length === 0) return;

    setError(null);
    const additions: StagedImage[] = [];
    let room = POST_MAX_IMAGES - totalCount;
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

  async function attach(item: StagedImage) {
    const alt = item.alt.trim();
    if (!alt || item.uploading) return;

    setError(null);
    setStaged((current) =>
      current.map((row) => (row.key === item.key ? { ...row, uploading: true } : row)),
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('kind', 'post');
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
        id: media.id,
        url: media.url,
        thumbUrl: media.thumbUrl ?? null,
        alt,
        scanStatus: media.scanStatus,
      },
    ]);
  }

  return (
    <div className="xidig-field">
      <label className="xidig-field__label" htmlFor="composer-images">
        {t('plaza.imagesLabel')}
      </label>
      <p className="xidig-field__hint">
        {t('plaza.imagesHint', { max: POST_MAX_IMAGES, maxMb: IMAGE_MAX_MB })}
      </p>
      {error ? <PlainErrorBanner error={error} /> : null}
      <input
        id="composer-images"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="xidig-field__input"
        aria-label={t('plaza.imagesLabel')}
        disabled={totalCount >= POST_MAX_IMAGES}
        onChange={onFiles}
      />

      {staged.length > 0 ? (
        <div className="xidig-media-row">
          {staged.map((item) => (
            <div key={item.key} className="xidig-media-thumb">
              <img src={item.previewUrl} alt={item.alt || item.file.name} />
              <label className="xidig-field__label" htmlFor={`image-alt-${item.key}`}>
                {t('plaza.imageAltLabel')}
              </label>
              <input
                id={`image-alt-${item.key}`}
                className="xidig-field__input"
                maxLength={300}
                value={item.alt}
                onChange={(e) => setAlt(item.key, e.target.value)}
              />
              <p className="xidig-field__hint">{t('plaza.imageAltHint')}</p>
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={!item.alt.trim() || item.uploading}
                onClick={() => void attach(item)}
              >
                {item.uploading ? t('plaza.imageUploading') : t('plaza.imageAttach')}
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
          {value.map((image) => (
            <div key={image.id} className="xidig-media-thumb">
              <img src={image.thumbUrl ?? image.url} alt={image.alt} />
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                aria-label={t('a11y.removeRow')}
                onClick={() => onChange(value.filter((row) => row.id !== image.id))}
              >
                {t('action.remove')}
              </button>
              {image.scanStatus === 'uncertain' ? (
                <p className="xidig-field__hint">{t('plaza.imageQueued')}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
