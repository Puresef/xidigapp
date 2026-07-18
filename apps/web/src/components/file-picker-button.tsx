'use client';

import { useRef, type ChangeEvent } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * The native file control can't be themed, so every upload surface fronts a
 * visually-hidden input with a real button (house pattern — see
 * profile-media-editor). The disabled state reaches BOTH controls: a disabled
 * input keeps any associated label inert, so nothing can reopen the OS dialog
 * past a cap. The input is named via aria-labelledby (never a forwarding
 * <label htmlFor>, which would activate the hidden control while enabled).
 */
export function FilePickerButton({
  id,
  accept,
  multiple = false,
  disabled = false,
  labelKey,
  labelledBy,
  onChange,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Trigger button text. */
  labelKey: MessageKey;
  /** Id of the visible field label naming the input for AT. */
  labelledBy: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="xidig-visually-hidden"
        aria-labelledby={labelledBy}
        // The visible button is the one keyboard stop; an invisible focusable
        // input would strand keyboard users on nothing.
        tabIndex={-1}
        disabled={disabled}
        onChange={onChange}
      />
      <p className="xidig-profile__actions">
        {/* Name chains button text + field label ("Choose image Logo") so two
            pickers in one form stay distinguishable to AT. */}
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          aria-labelledby={`${id}-trigger-label ${labelledBy}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <span id={`${id}-trigger-label`}>{t(labelKey)}</span>
        </button>
      </p>
    </>
  );
}
