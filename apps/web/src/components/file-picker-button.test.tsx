import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { FilePickerButton } from './file-picker-button';

/**
 * File-picker contract (house pattern): the native input is visually hidden
 * and named via aria-labelledby; a real button is the visible trigger; the
 * disabled state reaches BOTH controls so a label click can never reopen the
 * OS dialog past a cap.
 */

function render(disabled: boolean): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(FilePickerButton, {
        id: 'photos',
        accept: 'image/png',
        multiple: true,
        disabled,
        labelKey: 'plaza.imageChoose',
        labelledBy: 'photos-label',
        onChange: () => {},
      }),
    }),
  );
}

describe('FilePickerButton', () => {
  it('hides the native input, names it, and shows a labelled trigger button', () => {
    const html = render(false);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*class="xidig-visually-hidden"/);
    expect(html).toContain('aria-labelledby="photos-label"');
    expect(html).toContain('Add images');
    expect(html).not.toContain('disabled');
  });

  it('disables both the input and the trigger', () => {
    expect(render(true).match(/disabled=""/g)?.length).toBe(2);
  });
});
