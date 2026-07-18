'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Avatar + cover editor (Phase 4.5 §4, /settings/profile). Two-step attach:
 * POST /api/media (kind=avatar|cover — transcode, blurhash, thumb, sync AI
 * pre-scan) then PATCH /api/me/profile with the media id; the server
 * re-validates ownership/kind/scan and denormalizes the storage paths onto
 * profiles via the service role. Remove = PATCH null. Each change applies
 * immediately (no draft state — media identity should never be lost to an
 * unsaved form).
 */

interface MediaEnvelope {
  data?: {
    media: { id: string; url: string; thumbUrl: string | null; blurhash: string | null };
  };
  error?: PlainError;
}

export interface ProfileMediaSnapshot {
  displayName: string;
  handle: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
  coverUrl: string | null;
}

export function ProfileMediaEditor({ snapshot }: { snapshot: ProfileMediaSnapshot }) {
  const t = useT();
  const router = useRouter();

  const [avatarUrl, setAvatarUrl] = useState(snapshot.avatarThumbUrl);
  const [avatarBlurhash, setAvatarBlurhash] = useState(snapshot.avatarBlurhash);
  const [coverUrl, setCoverUrl] = useState(snapshot.coverUrl);
  const [busy, setBusy] = useState<'avatar' | 'cover' | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  async function upload(kind: 'avatar' | 'cover', file: File) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);

      let body: MediaEnvelope = {};
      const res = await fetch('/api/media', { method: 'POST', body: formData });
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
      await apiPatch(
        '/api/me/profile',
        kind === 'avatar' ? { avatarMediaId: media.id } : { coverMediaId: media.id },
      );

      if (kind === 'avatar') {
        setAvatarUrl(media.thumbUrl ?? media.url);
        setAvatarBlurhash(media.blurhash);
        setNotice(t('profile.avatarUpdated'));
      } else {
        setCoverUrl(media.url);
        setNotice(t('profile.coverUpdated'));
      }
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: 'avatar' | 'cover') {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(
        '/api/me/profile',
        kind === 'avatar' ? { avatarMediaId: null } : { coverMediaId: null },
      );
      if (kind === 'avatar') {
        setAvatarUrl(null);
        setAvatarBlurhash(null);
      } else {
        setCoverUrl(null);
      }
      setNotice(t('profile.mediaRemoved'));
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setBusy(null);
    }
  }

  function onPick(kind: 'avatar' | 'cover', files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(kind, file);
    // Reset so re-picking the same file fires change again.
    if (kind === 'avatar' && avatarInput.current) avatarInput.current.value = '';
    if (kind === 'cover' && coverInput.current) coverInput.current.value = '';
  }

  return (
    <section className="xidig-section" aria-label={t('profile.mediaSection')}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <div className="xidig-field">
        <p className="xidig-field__label" id="profile-avatar-label">
          {t('profile.avatarLabel')}
        </p>
        <div className="xidig-media-editor__row">
          <Avatar
            name={snapshot.displayName}
            handle={snapshot.handle}
            src={avatarUrl}
            blurhash={avatarBlurhash}
            size={64}
          />
          <input
            ref={avatarInput}
            id="profile-avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="xidig-visually-hidden"
            tabIndex={-1}
            aria-labelledby="profile-avatar-label"
            onChange={(e) => onPick('avatar', e.target.files)}
          />
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={busy !== null}
            onClick={() => avatarInput.current?.click()}
          >
            {busy === 'avatar' ? t('profile.uploading') : t('profile.avatarUpload')}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy !== null}
              onClick={() => void remove('avatar')}
            >
              {t('action.remove')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="xidig-field">
        <p className="xidig-field__label" id="profile-cover-label">
          {t('profile.coverLabel')}
        </p>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={t('profile.coverLabel')}
            className="xidig-media-editor__cover"
            loading="lazy"
          />
        ) : null}
        <div className="xidig-media-editor__row">
          <input
            ref={coverInput}
            id="profile-cover-file"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="xidig-visually-hidden"
            tabIndex={-1}
            aria-labelledby="profile-cover-label"
            onChange={(e) => onPick('cover', e.target.files)}
          />
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={busy !== null}
            onClick={() => coverInput.current?.click()}
          >
            {busy === 'cover' ? t('profile.uploading') : t('profile.coverUpload')}
          </button>
          {coverUrl ? (
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy !== null}
              onClick={() => void remove('cover')}
            >
              {t('action.remove')}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
