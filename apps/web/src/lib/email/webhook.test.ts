import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SUPPRESSING_EVENTS, verifySvixSignature } from './webhook';

const SECRET_BYTES = Buffer.from('super-secret-signing-key-000000', 'utf8');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function sign(id: string, timestamp: string, body: string, key: Buffer = SECRET_BYTES): string {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`, 'utf8').digest('base64');
}

const NOW = 1_800_000_000_000; // fixed clock for determinism
const ts = String(Math.floor(NOW / 1000));
const BODY = JSON.stringify({ type: 'email.bounced', data: { to: ['x@example.com'] } });

describe('verifySvixSignature', () => {
  it('accepts a correctly signed payload', () => {
    const signature = `v1,${sign('msg_1', ts, BODY)}`;
    expect(
      verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature }, BODY, NOW),
    ).toBe(true);
  });

  it('accepts when the valid signature is one of several (key rotation)', () => {
    const signature = `v1,${sign('msg_1', ts, BODY, Buffer.from('old-key'))} v1,${sign('msg_1', ts, BODY)}`;
    expect(
      verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature }, BODY, NOW),
    ).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const signature = `v1,${sign('msg_1', ts, BODY, Buffer.from('attacker-key'))}`;
    expect(
      verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature }, BODY, NOW),
    ).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = `v1,${sign('msg_1', ts, BODY)}`;
    const tampered = BODY.replace('x@example.com', 'y@example.com');
    expect(
      verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature }, tampered, NOW),
    ).toBe(false);
  });

  it('rejects stale timestamps (replay protection, ±5 min)', () => {
    const staleTs = String(Math.floor(NOW / 1000) - 600);
    const signature = `v1,${sign('msg_1', staleTs, BODY)}`;
    expect(
      verifySvixSignature(SECRET, { id: 'msg_1', timestamp: staleTs, signature }, BODY, NOW),
    ).toBe(false);
  });

  it('rejects missing headers or empty secret', () => {
    const signature = `v1,${sign('msg_1', ts, BODY)}`;
    expect(verifySvixSignature('', { id: 'msg_1', timestamp: ts, signature }, BODY, NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: null, timestamp: ts, signature }, BODY, NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: 'msg_1', timestamp: null, signature }, BODY, NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: null }, BODY, NOW)).toBe(false);
  });
});

describe('SUPPRESSING_EVENTS', () => {
  it('maps exactly bounces and complaints', () => {
    expect(SUPPRESSING_EVENTS['email.bounced']).toBe('bounced');
    expect(SUPPRESSING_EVENTS['email.complained']).toBe('complained');
    expect(SUPPRESSING_EVENTS['email.delivered']).toBeUndefined();
  });
});
