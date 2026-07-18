import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ButtonTabs } from './button-tabs';

/**
 * ButtonTabs contract (APG tabs pattern for button-driven switchers): roving
 * tabindex (selected tab is the only tab stop), stable per-tab ids off idBase,
 * and aria-controls wiring when a panel id is given. Arrow-key behavior is a
 * client interaction; the roving tabindex it depends on is what static markup
 * can pin.
 */

function render(extra: { panelId?: string } = {}): string {
  return renderToStaticMarkup(
    createElement(ButtonTabs<'a' | 'b'>, {
      label: 'Switcher',
      idBase: 'demo',
      value: 'b',
      onChange: () => {},
      tabs: [
        { value: 'a', label: 'First' },
        { value: 'b', label: 'Second' },
      ],
      ...extra,
    }),
  );
}

describe('ButtonTabs', () => {
  it('renders a labelled tablist with one selected tab and roving tabindex', () => {
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Switcher"');
    expect(html.match(/role="tab"/g)?.length).toBe(2);
    expect(html).toMatch(/id="demo-tab-a"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="demo-tab-b"[^>]*tabindex="0"/);
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
  });

  it('wires aria-controls to the panel when panelId is given', () => {
    expect(render({ panelId: 'demo-panel' }).match(/aria-controls="demo-panel"/g)?.length).toBe(2);
    expect(render()).not.toContain('aria-controls');
  });
});
