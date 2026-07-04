import { describe, expect, it, vi } from 'vitest';

import { translateWith, type MessageKey } from './translate';
import type { Message } from './messages';

type TestDictionary = Partial<Record<MessageKey, Message>>;

describe('repro: prototype-chain placeholder lookup', () => {
  it('shows what {toString} with empty params actually renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = { 'x.k': 'Call {toString} now' } as unknown as TestDictionary;
    const out = translateWith('en', {}, fallback, 'x.k' as MessageKey, {});
    console.error('OUTPUT:', JSON.stringify(out));
    console.error('WARN CALLS:', warn.mock.calls.length);
    warn.mockRestore();
    expect(out).toBe('Call {toString} now'); // the documented leave-intact behavior
  });

  it('constructor / valueOf / hasOwnProperty variants', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = {
      'x.c': 'A {constructor} B',
      'x.v': 'A {valueOf} B',
      'x.h': 'A {hasOwnProperty} B',
    } as unknown as TestDictionary;
    for (const k of ['x.c', 'x.v', 'x.h']) {
      const out = translateWith('en', {}, fallback, k as MessageKey, {});
      console.error(`OUTPUT ${k}:`, JSON.stringify(out));
    }
    warn.mockRestore();
  });

  it('undefined params (params omitted entirely) is fine', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fallback = { 'x.k': 'Call {toString} now' } as unknown as TestDictionary;
    const out = translateWith('en', {}, fallback, 'x.k' as MessageKey);
    console.error('OUTPUT (no params):', JSON.stringify(out));
    warn.mockRestore();
    expect(out).toBe('Call {toString} now');
  });
});
