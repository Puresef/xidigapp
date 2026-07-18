import { describe, expect, it } from 'vitest';

import { createBrowserClient } from './index';
// createServerClient is intentionally only on the '/server' subpath, not the
// root barrel (Seq 49.5 service-role containment — see src/index.ts).
import { createServerClient } from './server';

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
