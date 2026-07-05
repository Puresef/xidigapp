import { describe, expect, it } from 'vitest';

import { magicLinkEmail, passwordResetEmail, signupConfirmEmail } from './templates';

/**
 * Deliverability invariants: link emails carry the numeric fallback code and
 * state their expiry (§27 expired-link copy must never surprise anyone).
 */
describe('auth email templates', () => {
  it('magic-link email carries the link, the 10-minute expiry, and the fallback code', () => {
    const email = magicLinkEmail('m@example.com', 'https://xidig.net/auth/confirm?x=1', '123456');
    expect(email.text).toContain('https://xidig.net/auth/confirm?x=1');
    expect(email.text).toContain('10 minutes');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('https://xidig.net/auth/confirm?x=1');
  });

  it('signup email carries the fallback code too', () => {
    const email = signupConfirmEmail('m@example.com', 'https://x/confirm', '654321');
    expect(email.text).toContain('654321');
    expect(email.text).toContain('10 minutes');
  });

  it('omits the code section when no code is provided', () => {
    const email = magicLinkEmail('m@example.com', 'https://x/confirm');
    expect(email.text).not.toContain('Enter this code');
  });

  it('reset email names its 60-minute window and never a code', () => {
    const email = passwordResetEmail('m@example.com', 'https://x/confirm');
    expect(email.text).toContain('60 minutes');
    expect(email.text).not.toContain('Enter this code');
  });
});
