'use client';

import { useState, type ChangeEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { FilePickerButton } from '../file-picker-button';

/**
 * Event cover picker (Task 3). Upload-first, same two-step shape as
 * ProfileMediaEditor/CandidateEditor: POST /api/media with kind='event_cover'
 * (transcode, blurhash, thumb, sync AI pre-scan), then hand the media id up
 * to the form via `onUploaded`. Unlike those editors the event may not exist
 * yet (this runs inside the CREATE form too), so there is no PATCH here —
 * the parent form carries `coverMediaId` in its own state and includes it in
 * the create/update payload. `onUploaded(null)` on remove clears it.
 */

export interface UploadedEventCover {
  id: string;
  url: string;
  thumbUrl: string | null;
  alt: string | null;
}

interface MediaEnvelope {
  data?: {
    media: { id: string; url: string; thumbUrl?: string | null; alt?: string | null };
  };
  error?: PlainError;
}

export function EventCoverPicker({
  title,
  onUploaded,
}: {
  /** Event title, used as the upload's alt text (docs/lite-mode.md contract). */
  title: string;
  onUploaded: (media: UploadedEventCover | null) => void;
}) {
  const t = useT();
  const [cover, setCover] = useState<UploadedEventCover | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'event_cover');
      const trimmedTitle = title.trim();
      formData.append('alt', trimmedTitle ? t('events.coverAlt', { title: trimmedTitle }) : '');

      const res = await fetch('/api/media', { method: 'POST', body: formData });
      let body: MediaEnvelope = {};
      try {
        body = (await res.json()) as MediaEnvelope;
      } catch {
        body = {};
      }
      if (!res.ok || body.error || !body.data) {
        setError(body.error ?? { code: 'server_error', message: '' });
        return;
      }

      const { media } = body.data;
      const uploaded: UploadedEventCover = {
        id: media.id,
        url: media.url,
        thumbUrl: media.thumbUrl ?? null,
        alt: media.alt ?? null,
      };
      setCover(uploaded);
      onUploaded(uploaded);
    } catch {
      setError({ code: 'server_error', message: '' });
    } finally {
      setUploading(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void upload(file);
  }

  function remove() {
    setCover(null);
    setError(null);
    onUploaded(null);
  }

  return (
    <div className="xidig-field">
      <p className="xidig-field__label" id="event-cover-label">
        {t('events.formCover')}
      </p>
      {error ? <PlainErrorBanner error={error} /> : null}
      {cover ? (
        <img
          src={cover.thumbUrl ?? cover.url}
          alt={cover.alt ?? t('events.formCover')}
          className="xidig-media-editor__cover"
          loading="lazy"
        />
      ) : null}
      <div className="xidig-media-editor__row">
        <FilePickerButton
          id="event-cover-file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          disabled={uploading}
          labelKey="action.chooseImage"
          labelledBy="event-cover-label"
          onChange={onFile}
        />
        {uploading ? <p className="xidig-field__hint">{t('profile.uploading')}</p> : null}
        {cover ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={uploading}
            onClick={remove}
          >
            {t('action.remove')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
