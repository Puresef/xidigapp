import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { QueuedReplies } from './queued-replies';
import { ThreadEmpty } from './thread-empty';
import { ThreadError } from './thread-error';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { initialLocale: 'en', children: element }),
  );
}

describe('ThreadEmpty (s2 — a fact, not a plea)', () => {
  it('states how long the ask has been open and points at the composer', () => {
    const html = render(createElement(ThreadEmpty, { openedAt: '2026-07-30T00:00:00Z' }));
    expect(html).toContain('No replies yet');
    expect(html).toContain('write the first reply');
    expect(html).toContain('xidig-codsi-thread-empty');
  });
});

describe('ThreadError (s3 — partial failure kept honest)', () => {
  it('says the ask survives, only the replies are missing, with one retry', () => {
    const html = render(createElement(ThreadError, { onRetry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('You can still read the ask');
    expect(html).toContain('Try again');
  });
});

describe('QueuedReplies (s4 — work is never lost, nothing pretends to be sent)', () => {
  it('renders each queued reply with the waiting chip, the queue promise, and a delete', () => {
    const html = render(
      createElement(QueuedReplies, {
        items: [{ body: 'Aniga xisaabiyahayga ayaan weydiin karaa', queuedAt: 1770000000000 }],
        onRemove: () => {},
      }),
    );
    expect(html).toContain('Waiting');
    expect(html).toContain('Aniga xisaabiyahayga');
    expect(html).toContain('It will send when the internet comes back.');
    expect(html).toContain('Delete');
  });

  it('renders nothing with an empty queue', () => {
    expect(render(createElement(QueuedReplies, { items: [], onRemove: () => {} }))).toBe('');
  });
});
