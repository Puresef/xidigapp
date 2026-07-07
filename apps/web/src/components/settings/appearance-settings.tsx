'use client';

import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { apiPatch } from '@/lib/api-client';
import {
  MOTION_COOKIE,
  MOTION_OPTIONS,
  serializeAppearanceCookie,
  TEXT_SIZE_OPTIONS,
  TEXTSIZE_COOKIE,
  THEME_COOKIE,
  THEME_OPTIONS,
  type MotionOption,
  type TextSizeOption,
  type ThemeOption,
} from '@/lib/settings/appearance';

/**
 * Appearance (Phase 4.5): theme, text size, reduced motion. Every change
 * applies INSTANTLY — cookie (rendering source of truth, works signed-out)
 * + the live html data attribute — and mirrors best-effort into
 * user_settings.preferences.appearance for cross-device continuity.
 */

const THEME_LABELS: Record<ThemeOption, MessageKey> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

const TEXT_SIZE_LABELS: Record<TextSizeOption, MessageKey> = {
  s: 'settings.textSizeS',
  m: 'settings.textSizeM',
  l: 'settings.textSizeL',
  xl: 'settings.textSizeXl',
};

const MOTION_LABELS: Record<MotionOption, MessageKey> = {
  system: 'settings.motionSystem',
  off: 'settings.motionOff',
};

function resolveTheme(theme: ThemeOption): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export interface AppearanceSnapshot {
  theme: ThemeOption;
  textSize: TextSizeOption;
  motion: MotionOption;
}

export function AppearanceSettings({ snapshot }: { snapshot: AppearanceSnapshot }) {
  const t = useT();

  const [theme, setTheme] = useState<ThemeOption>(snapshot.theme);
  const [textSize, setTextSize] = useState<TextSizeOption>(snapshot.textSize);
  const [motion, setMotion] = useState<MotionOption>(snapshot.motion);

  function mirror(next: AppearanceSnapshot) {
    // Best-effort — the cookie already took effect; a failed write only
    // loses cross-device continuity.
    void apiPatch('/api/me/settings', {
      preferences: {
        appearance: {
          theme: next.theme,
          textSize: next.textSize,
          reducedMotion: next.motion === 'off',
        },
      },
    }).catch(() => undefined);
  }

  function applyTheme(next: ThemeOption) {
    setTheme(next);
    document.cookie = serializeAppearanceCookie(THEME_COOKIE, next);
    document.documentElement.setAttribute('data-theme', resolveTheme(next));
    mirror({ theme: next, textSize, motion });
  }

  function applyTextSize(next: TextSizeOption) {
    setTextSize(next);
    document.cookie = serializeAppearanceCookie(TEXTSIZE_COOKIE, next);
    document.documentElement.setAttribute('data-textsize', next);
    mirror({ theme, textSize: next, motion });
  }

  function applyMotion(next: MotionOption) {
    setMotion(next);
    document.cookie = serializeAppearanceCookie(MOTION_COOKIE, next);
    if (next === 'off') document.documentElement.setAttribute('data-motion', 'off');
    else document.documentElement.removeAttribute('data-motion');
    mirror({ theme, textSize, motion: next });
  }

  return (
    <div className="xidig-form">
      <fieldset className="xidig-section">
        <legend className="xidig-section__title">{t('settings.themeTitle')}</legend>
        <div className="xidig-option-row" role="radiogroup" aria-label={t('settings.themeTitle')}>
          {THEME_OPTIONS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="appearance-theme"
                value={option}
                checked={theme === option}
                onChange={() => applyTheme(option)}
              />
              <span>{t(THEME_LABELS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="xidig-section">
        <legend className="xidig-section__title">{t('settings.textSizeTitle')}</legend>
        <div className="xidig-option-row" role="radiogroup" aria-label={t('settings.textSizeTitle')}>
          {TEXT_SIZE_OPTIONS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="appearance-textsize"
                value={option}
                checked={textSize === option}
                onChange={() => applyTextSize(option)}
              />
              <span>{t(TEXT_SIZE_LABELS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="xidig-section">
        <legend className="xidig-section__title">{t('settings.motionTitle')}</legend>
        <p className="xidig-field__hint">{t('settings.motionHint')}</p>
        <div className="xidig-option-row" role="radiogroup" aria-label={t('settings.motionTitle')}>
          {MOTION_OPTIONS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="appearance-motion"
                value={option}
                checked={motion === option}
                onChange={() => applyMotion(option)}
              />
              <span>{t(MOTION_LABELS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="xidig-field__hint">{t('settings.appearanceApplied')}</p>
    </div>
  );
}
