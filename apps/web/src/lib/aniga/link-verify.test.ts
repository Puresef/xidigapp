import { describe, expect, it } from 'vitest';

import { refuseLinkFetch } from './link-verify';

/**
 * The SSRF gate. This is the one place where a member hands the server a URL
 * and the server dials it, so the deny-list is a security boundary rather than
 * input hygiene: every entry below is somewhere a Vercel/Supabase function can
 * reach and a member must not.
 */

function refusal(url: string): string | null {
  return refuseLinkFetch(new URL(url));
}

describe('refuseLinkFetch — destinations the server must not dial', () => {
  it('allows an ordinary public page over either scheme', () => {
    expect(refusal('https://hodan.dev/about')).toBeNull();
    expect(refusal('http://hodan.dev')).toBeNull();
    expect(refusal('https://hodan.dev:443/x')).toBeNull();
  });

  it('refuses non-web schemes', () => {
    expect(refusal('file:///etc/passwd')).toBe('scheme');
    expect(refusal('ftp://example.com/x')).toBe('scheme');
  });

  it('refuses embedded credentials — the proxy must not authenticate as anyone', () => {
    expect(refusal('https://admin:secret@example.com')).toBe('credentials');
  });

  it('refuses non-default ports, which would make this a port scanner', () => {
    expect(refusal('http://example.com:22')).toBe('port');
    expect(refusal('https://example.com:8080')).toBe('port');
  });

  it('refuses loopback and RFC1918 space', () => {
    expect(refusal('http://127.0.0.1/')).toBe('private_host');
    expect(refusal('http://10.1.2.3/')).toBe('private_host');
    expect(refusal('http://172.16.0.9/')).toBe('private_host');
    expect(refusal('http://192.168.1.1/')).toBe('private_host');
    expect(refusal('http://0.0.0.0/')).toBe('private_host');
  });

  it('refuses the cloud metadata endpoint by address and by name', () => {
    expect(refusal('http://169.254.169.254/latest/meta-data/')).toBe('private_host');
    expect(refusal('http://metadata.google.internal/')).toBe('private_host');
  });

  it('lets 172.32 through — the private block stops at 172.31', () => {
    expect(refusal('http://172.32.0.1/')).toBeNull();
  });

  it('refuses IPv6 loopback, unique-local, link-local and v4-mapped private space', () => {
    expect(refusal('http://[::1]/')).toBe('private_host');
    expect(refusal('http://[fd00::1]/')).toBe('private_host');
    expect(refusal('http://[fe80::1]/')).toBe('private_host');
    // WHATWG re-serializes the dotted form into hex groups, so both spellings
    // have to be refused — the second is the one the guard actually sees.
    expect(refusal('http://[::ffff:169.254.169.254]/')).toBe('private_host');
    expect(refusal('http://[::ffff:a9fe:a9fe]/')).toBe('private_host');
    expect(refusal('http://[::ffff:7f00:1]/')).toBe('private_host');
  });

  it('allows a v4-mapped PUBLIC address — the rule is the range, not the notation', () => {
    expect(refusal('http://[::ffff:0808:0808]/')).toBeNull();
  });

  it('refuses intranet names: localhost, .local, .internal, and anything dotless', () => {
    expect(refusal('http://localhost/')).toBe('private_host');
    expect(refusal('http://api.localhost/')).toBe('private_host');
    expect(refusal('http://printer.local/')).toBe('private_host');
    expect(refusal('http://vault.internal/')).toBe('private_host');
    expect(refusal('http://db/')).toBe('private_host');
  });
});
