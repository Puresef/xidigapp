'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { ApiRequestError, apiDelete, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { eventDateParts } from '@/lib/events/datetime';
import { MENTOR_SLOT_TIMEZONE } from '@/lib/mentor/constants';
import type { MentorSlot } from '@/lib/mentor/current';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * The interactive half of frame 9c's mentor card (mentor-residence-card.tsx
 * is the self-fetching server shell around it). Mentor slots carry no
 * per-residency timezone column (unlike `events`), so every label here
 * renders the slot's instant in UTC (MENTOR_SLOT_TIMEZONE, shared with the
 * booking route — lib/mentor/constants.ts), so the two never disagree. Per
 * Ruling 7 (12 Aug), that fixed zone must read as explicit to the member
 * rather than a bare time, so every rendering routes through
 * `mentor.slotTimeUtc` for its UTC marker.
 *
 * `slots` already carries the viewer's own state as `'yours'`
 * (getMentorSlots resolves it server-side via the service role — the
 * booker's identity column never reaches this client at all): a booked
 * member sees their booking + Cancel, everyone else sees the CTA that opens
 * the slot-picker sheet.
 */

function slotWhen(t: ReturnType<typeof useT>, slot: MentorSlot): string {
  const parts = eventDateParts(t, slot.startsAt, null, MENTOR_SLOT_TIMEZONE);
  return t('mentor.slotTimeUtc', { time: `${parts.weekday} ${parts.time}` });
}

export function MentorBookingIsland({ slots }: { slots: MentorSlot[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const yours = slots.find((slot) => slot.state === 'yours') ?? null;
  const openSlots = slots.filter((slot) => slot.state === 'open');

  function fail(cause: unknown) {
    setError(
      cause instanceof ApiRequestError ? cause.plain : { code: 'server_error', message: '' },
    );
  }

  async function book(slotId: string) {
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/mentor/slots/${slotId}/book`);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }

  async function unbook() {
    if (!yours) return;
    setPending(true);
    setError(null);
    try {
      await apiDelete(`/api/mentor/slots/${yours.id}/book`);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }

  if (yours) {
    return (
      <div>
        {error ? <PlainErrorBanner error={error} /> : null}
        <p className="xidig-card__meta">{t('mentor.yourBooking', { when: slotWhen(t, yours) })}</p>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={() => void unbook()}
        >
          {t('mentor.unbook')}
        </button>
      </div>
    );
  }

  return (
    <>
      {error ? <PlainErrorBanner error={error} /> : null}
      <button
        type="button"
        className="xidig-button xidig-button--primary xidig-mentor-book-cta"
        onClick={() => setOpen(true)}
      >
        {t('mentor.bookCta')}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('mentor.slotsTitle')}
        presentation="sheet"
      >
        {openSlots.length === 0 ? (
          <p className="xidig-card__meta">{t('mentor.noSlots')}</p>
        ) : (
          <ul className="xidig-mentor-slots">
            {openSlots.map((slot) => (
              <li key={slot.id}>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  disabled={pending}
                  onClick={() => void book(slot.id)}
                >
                  {slotWhen(t, slot)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
