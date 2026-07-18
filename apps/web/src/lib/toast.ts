import type { MessageKey } from '@xidig/i18n';

/**
 * Raise a transient confirmation toast from anywhere (rendered by the
 * chrome-mounted Toaster). Keys, not strings — the i18n rule holds at the
 * call site's type level.
 */

export const TOAST_EVENT = 'xidig:toast';

export interface ToastDetail {
  messageKey: MessageKey;
}

export function toast(messageKey: MessageKey): void {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { messageKey } }));
}
