'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { createTargetFor } from '@/lib/nav/create-target';
import { COMPOSE_EVENT } from '@/lib/plaza/constants';

/**
 * Abuur — the contextual header create action (18 Jul nav review): acts on the
 * section you're in (see lib/nav/create-target.ts). Link targets render as
 * real links so middle-click/new-tab work; compose contexts render a button
 * that opens the Plaza composer (in place on /plaza, via ?compose=1 elsewhere).
 * The label stays the stable "Create"; the contextual action rides on title.
 */
export function CreateButton() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const target = createTargetFor(pathname);

  // The visible label stays a stable "Create"; the contextual action is
  // appended visually hidden so keyboard/SR users get it without hover.
  const label = (
    <>
      {t('action.abuur')}
      <span className="xidig-visually-hidden"> — {t(target.labelKey)}</span>
    </>
  );

  if (target.kind === 'link') {
    return (
      <Link
        href={target.href}
        className="xidig-button xidig-button--primary"
        title={t(target.labelKey)}
      >
        {label}
      </Link>
    );
  }

  const onPlaza = pathname === '/plaza' || pathname.startsWith('/plaza/');
  return (
    <button
      type="button"
      className="xidig-button xidig-button--primary"
      title={t(target.labelKey)}
      onClick={() => {
        if (onPlaza) window.dispatchEvent(new CustomEvent(COMPOSE_EVENT, { detail: {} }));
        else router.push('/plaza?compose=1');
      }}
    >
      {label}
    </button>
  );
}
