import { describe, expect, it } from 'vitest';

import { apexHostRedirect } from './apex-redirect';

describe('apexHostRedirect', () => {
  const base = { isApex: true, host: 'app.xidig.net', pathname: '/', search: '' };

  it('is a no-op before the apex flip (isApex false)', () => {
    expect(apexHostRedirect({ ...base, isApex: false })).toBeNull();
    // ...even for a would-be-redirected host + path
    expect(
      apexHostRedirect({ isApex: false, host: 'app.xidig.net', pathname: '/labs', search: '' }),
    ).toBeNull();
  });

  it('redirects the app subdomain to the apex, preserving path + query', () => {
    expect(apexHostRedirect({ ...base, pathname: '/labs/foo', search: '?x=1&y=2' })).toBe(
      'https://xidig.net/labs/foo?x=1&y=2',
    );
    expect(apexHostRedirect({ ...base, pathname: '/', search: '' })).toBe('https://xidig.net/');
    // a real auth-confirm email link must survive with its token
    expect(
      apexHostRedirect({ ...base, pathname: '/auth/confirm', search: '?token_hash=abc&type=magiclink' }),
    ).toBe('https://xidig.net/auth/confirm?token_hash=abc&type=magiclink');
  });

  it('redirects www to the apex', () => {
    expect(apexHostRedirect({ ...base, host: 'www.xidig.net', pathname: '/product', search: '' })).toBe(
      'https://xidig.net/product',
    );
  });

  it('does NOT redirect the bare apex host (loop guard)', () => {
    expect(apexHostRedirect({ ...base, host: 'xidig.net', pathname: '/labs', search: '' })).toBeNull();
  });

  it('ignores unknown hosts and missing host header', () => {
    expect(apexHostRedirect({ ...base, host: 'evil.example.com', pathname: '/', search: '' })).toBeNull();
    expect(apexHostRedirect({ ...base, host: null, pathname: '/', search: '' })).toBeNull();
    expect(apexHostRedirect({ ...base, host: undefined, pathname: '/', search: '' })).toBeNull();
  });

  it('normalises host case and strips the port', () => {
    expect(apexHostRedirect({ ...base, host: 'App.Xidig.Net:443', pathname: '/x', search: '' })).toBe(
      'https://xidig.net/x',
    );
  });

  it('excludes /api/* so server-to-server callers are not 308ed', () => {
    expect(apexHostRedirect({ ...base, pathname: '/api/cron/plaza', search: '' })).toBeNull();
    expect(apexHostRedirect({ ...base, pathname: '/api/webhooks/email', search: '' })).toBeNull();
    expect(apexHostRedirect({ ...base, pathname: '/api', search: '' })).toBeNull();
    // but a page path that merely starts with "api" (not the /api/ segment) still redirects
    expect(apexHostRedirect({ ...base, pathname: '/apiary', search: '' })).toBe('https://xidig.net/apiary');
  });
});
