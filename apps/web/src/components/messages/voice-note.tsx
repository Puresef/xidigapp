'use client';

import { useEffect, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { VOICE_MAX_SECONDS } from '@/lib/dm/constants';

/**
 * Fariimo voice notes (6b): the playback bubble and the composer recorder.
 *
 * Playback is byte-frugal by construction — the <audio> element gets its src
 * (the participant-checked signed-URL route) only on the FIRST play tap, so
 * a thread full of voice notes costs zero audio bytes until someone listens
 * (Lite needs no special case). The waveform is decorative; duration is the
 * honest figure, shown always.
 *
 * Recording is self-recorded ONLY (F2 §4): MediaRecorder from
 * getUserMedia — there is no file picker, so provenance is the device mic.
 * Stop → the clip parks on the composer for review (duration chip +
 * discard); nothing uploads until the member presses Dir.
 */

export function formatVoiceDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '–:––';
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.round(seconds % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
}

const WAVEFORM_BARS = 'M3 7v6M8 4v12M13 8v4M18 2v16M23 6v8M28 9v2M33 3v14M38 7v6M43 5v10M48 8v4M53 4v12M58 9v2';

export function VoiceNoteBubble({
  conversationId,
  uploadId,
  durationSeconds,
}: {
  conversationId: string;
  uploadId: string;
  durationSeconds: number | null;
}) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function toggle() {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      // Bytes flow only from here — the signed-URL route checks participation.
      audio.src = `/api/conversations/${conversationId}/voice/${uploadId}`;
      audio.preload = 'auto';
      audio.onended = () => setPlaying(false);
      audio.onpause = () => setPlaying(false);
      audio.onplay = () => setPlaying(true);
      audioRef.current = audio;
      setArmed(true);
    }
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }

  return (
    <span
      role="group"
      aria-label={t('messages.voiceNoteWithDuration', {
        duration: formatVoiceDuration(durationSeconds),
      })}
      className="xidig-dm-voice"
      data-armed={armed || undefined}
    >
      <button
        type="button"
        className="xidig-dm-voice__play"
        aria-label={playing ? t('messages.voicePause') : t('messages.voicePlay')}
        onClick={toggle}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l10-6.5Z" />
          </svg>
        )}
      </button>
      <svg
        viewBox="0 0 64 20"
        width="88"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className="xidig-dm-voice__wave"
      >
        <path d={WAVEFORM_BARS} />
      </svg>
      <span className="xidig-dm-voice__duration">{formatVoiceDuration(durationSeconds)}</span>
    </span>
  );
}

export interface RecordedClip {
  blob: Blob;
  durationSeconds: number;
}

/**
 * The composer mic. idle → recording (live ticker, auto-stop at the cap) →
 * clip parked on the composer (chip + discard, rendered by the parent).
 * Mic denied / unsupported → a quiet inline note, never a broken button.
 */
export function VoiceRecorderButton({
  disabled,
  onClip,
}: {
  disabled: boolean;
  onClip: (clip: RecordedClip) => void;
}) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setUnavailable(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size > 0) {
          onClip({ blob, durationSeconds: Math.min(elapsed, VOICE_MAX_SECONDS) });
        }
        setRecording(false);
        setSeconds(0);
        if (tickerRef.current) clearInterval(tickerRef.current);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      setSeconds(0);
      tickerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        // Auto-stop at the cap — the server enforces it anyway; stopping
        // client-side keeps the clip sendable instead of rejected.
        if (elapsed >= VOICE_MAX_SECONDS) recorderRef.current?.stop();
      }, 500);
    } catch {
      setUnavailable(true);
    }
  }

  if (unavailable) {
    return (
      <span className="xidig-dm-voice__unavailable xidig-card__meta">
        {t('messages.voiceUnavailable')}
      </span>
    );
  }

  if (recording) {
    return (
      <button
        type="button"
        className="xidig-icon-button xidig-dm-voice__recbtn xidig-dm-voice__recbtn--live"
        aria-label={t('messages.voiceStop')}
        title={t('messages.voiceRecording', { duration: formatVoiceDuration(seconds) })}
        onClick={() => recorderRef.current?.stop()}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
        </svg>
        <span className="xidig-dm-voice__ticker" aria-hidden="true">
          {formatVoiceDuration(seconds)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="xidig-icon-button xidig-dm-voice__recbtn"
      aria-label={t('messages.voiceRecord')}
      disabled={disabled}
      onClick={() => void start()}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4a2.6 2.6 0 0 1 2.6 2.6v5a2.6 2.6 0 1 1-5.2 0v-5A2.6 2.6 0 0 1 12 4Z" />
        <path d="M6.8 11.4a5.2 5.2 0 0 0 10.4 0M12 16.6V20" />
      </svg>
    </button>
  );
}
