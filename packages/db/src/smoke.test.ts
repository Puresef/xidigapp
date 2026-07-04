import { describe, expect, it } from 'vitest';

import { createBrowserClient, createServerClient } from './index';

describe('@xidig/db', () => {
  it('exposes both client factories', () => {
    expect(typeof createServerClient).toBe('function');
    expect(typeof createBrowserClient).toBe('function');
  });

  it('builds a server client without performing network I/O', () => {
    const client = createServerClient('https://example.supabase.co', 'secret-key');
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });

  it('builds a browser client without performing network I/O', () => {
    const client = createBrowserClient('https://example.supabase.co', 'publishable-key');
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
  });
});
