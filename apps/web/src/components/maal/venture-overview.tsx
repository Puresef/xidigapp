import Link from 'next/link';

import { formatNumber, formatRelativeTime, type Locale } from '@xidig/i18n';

import { Avatar } from '@/components/media/avatar';
import { ROLE_KEYS } from '@/lib/labs/labels';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import type { VentureOverview as VentureOverviewModel, WorkstreamView } from '@/lib/maal/views';

import { MaalApplicationActions } from './application-actions';
import { MaalSeatRequest } from './seat-request';
import { MaalVisibilityToggles } from './visibility-toggles';

/**
 * The venture overview tab — frames 7b (member/lead) and 7e (non-member).
 *
 * ONE component for both, because they are not two pages: 7e is this page seen
 * by someone RLS has not let into the workspace. What changes is not the layout
 * but what exists — a stranger gets the charter, the goal, the open seats, the
 * roster and the sentence that tells them exactly where the wall is; a member
 * additionally gets the workstream table, the decision log and (as a lead) the
 * applications and the member-set visibility switches.
 *
 * Three honesty rules this file renders rather than styles:
 *
 *  1. **A decision shows a tally only after it closed.** `DecisionView.tally` is
 *     null for every open decision by construction (lib/maal/views.ts), and this
 *     component renders the tally line only when it is non-null. A running count
 *     on a live vote is the Phase-5 poll lesson: it changes how people vote.
 *  2. **An unowned workstream is an OPEN SEAT, not a blank cell.** "Boos furan"
 *     with a dashed disc is a state a venture is advertising, and 7e turns the
 *     same row into the thing a stranger can apply to.
 *  3. **The visibility switches are the members' own** — the footer says so, in
 *     the members' words: "Xubnaha ayaa doortay. Xidig ma dooranayo."
 *
 * ZERO orange anywhere on this surface: the stage tint is accent-soft and there
 * is no earned guul-star on the overview to justify the one exemption (badge
 * canon 10a covers the board and the ledger).
 */
export async function VentureOverview({
  overview,
  slug,
  labId,
  locale,
  prefs,
}: {
  overview: VentureOverviewModel;
  slug: string;
  labId: string;
  locale: Locale;
  prefs: LitePrefs;
}) {
  const t = await getT();
  const { viewer } = overview;

  // The workstream each member owns — the frames' role subtitle tail
  // ("Hoggaamiye · Sharci"). Read off the workstream table rather than
  // lab_members.specialization, whose three enum values (operator/researcher/
  // advisor) are a different taxonomy with no dictionary entries and would say
  // less than the box the member actually runs.
  const ownedWorkstream = new Map<string, string>();
  for (const stream of overview.workstreams) {
    if (stream.owner) ownedWorkstream.set(stream.owner.user_id, stream.name);
  }

  const charter = <VentureCharter overview={overview} locale={locale} />;

  // ── 7e: the non-member view. Work, files and the ledger are not disabled
  // here — they are ABSENT, and the last card says so out loud.
  if (!viewer.isMember && !viewer.isMod) {
    const seats = overview.workstreams.filter(
      (stream) => !stream.owner || stream.openTaskCount > 0,
    );
    return (
      <section className="xidig-section xidig-venture">
        {charter}
        <p className="xidig-venture__join-note">{t('maal.joinNote')}</p>

        {seats.length > 0 ? (
          <section className="xidig-card xidig-venture__card">
            <h2 className="xidig-venture__card-title">
              {t('maal.openSeatsTitle', { count: seats.length })}
            </h2>
            <ul className="xidig-venture__seats">
              {seats.map((seat) => (
                <li key={seat.id} className="xidig-venture__seat">
                  <span className="xidig-venture__seat-lines">
                    <span className="xidig-venture__seat-name">{seat.name}</span>
                    <span className="xidig-venture__seat-sub">
                      {seat.owner
                        ? t('maal.seatLedNeedsHelp', { name: seat.owner.display_name })
                        : t('maal.seatWaitingUnowned', { count: seat.openTaskCount })}
                    </span>
                  </span>
                  <MaalSeatRequest labId={labId} workstreamId={seat.id} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <MembersCard overview={overview} slug={slug} prefs={prefs} owned={ownedWorkstream} />

        <section className="xidig-card xidig-venture__card">
          <h2 className="xidig-venture__card-title">{t('maal.publicSeesTitle')}</h2>
          <p className="xidig-venture__card-body">{t('maal.publicSeesBody')}</p>
        </section>
      </section>
    );
  }

  // ── 7b: the member/lead workspace.
  return (
    <section className="xidig-section xidig-venture">
      <div className="xidig-venture__grid">
        <div className="xidig-venture__main">
          {charter}

          <section className="xidig-card xidig-venture__card">
            <div className="xidig-venture__card-head">
              <h2 className="xidig-venture__card-title">{t('maal.workstreamsTitle')}</h2>
              <span className="xidig-venture__card-note">{t('maal.workstreamsNote')}</span>
            </div>
            <div className="xidig-ws-table">
              <div className="xidig-ws-table__head" aria-hidden="true">
                <span>{t('maal.colWorkstream')}</span>
                <span>{t('maal.colOwner')}</span>
                <span>{t('maal.colTasks')}</span>
                <span>{t('maal.colStatus')}</span>
              </div>
              <ul className="xidig-ws-table__rows">
                {overview.workstreams.map((stream) => (
                  <WorkstreamRow key={stream.id} stream={stream} locale={locale} prefs={prefs} />
                ))}
              </ul>
            </div>
          </section>

          <section className="xidig-card xidig-venture__card">
            <div className="xidig-venture__card-head">
              <h2 className="xidig-venture__card-title">{t('maal.decisionsTitle')}</h2>
              <Link className="xidig-venture__card-link" href={`/labs/${slug}?tab=decisions`}>
                {t('maal.decisionsAll')}
              </Link>
            </div>
            <ul className="xidig-venture__decisions">
              {overview.decisions.map((decision) => (
                <li key={decision.id} className="xidig-venture__decision">
                  {decision.author ? (
                    <Avatar
                      name={decision.author.display_name}
                      handle={decision.author.handle}
                      src={decision.author.avatar_thumb_url}
                      blurhash={decision.author.avatar_blurhash}
                      size={26}
                      prefs={prefs}
                    />
                  ) : null}
                  <span className="xidig-venture__decision-lines">
                    <span className="xidig-venture__decision-body">
                      <strong>{decision.title}</strong>
                      {decision.decision ? ` — ${decision.decision}` : ''}
                    </span>
                    <span className="xidig-venture__decision-meta">
                      {[
                        decision.author?.display_name,
                        formatRelativeTime(new Date(decision.decidedAt), locale),
                        // Post-close only. An open decision has no tally to
                        // show, and must never be given a running one.
                        decision.tally
                          ? decision.tally.rejected > 0
                            ? t('maal.decisionTally', {
                                count: decision.tally.agreed,
                                rejected: decision.tally.rejected,
                              })
                            : t('maal.decisionTallyUnanimous', { count: decision.tally.agreed })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="xidig-venture__rail">
          <MembersCard overview={overview} slug={slug} prefs={prefs} owned={ownedWorkstream} />

          {viewer.canManage && overview.applications.length > 0 ? (
            <section className="xidig-card xidig-venture__card">
              <h2 className="xidig-venture__card-title">
                {t('maal.applicationsTitle', { count: overview.applications.length })}
              </h2>
              <ul className="xidig-venture__applications">
                {overview.applications.map((application) => (
                  <li key={application.userId} className="xidig-venture__application">
                    {application.applicant ? (
                      <Avatar
                        name={application.applicant.display_name}
                        handle={application.applicant.handle}
                        src={application.applicant.avatar_thumb_url}
                        blurhash={application.applicant.avatar_blurhash}
                        size={28}
                        prefs={prefs}
                      />
                    ) : null}
                    <span className="xidig-venture__application-lines">
                      <span className="xidig-venture__member-name">
                        {application.applicant?.display_name ?? ''}
                      </span>
                      <span className="xidig-venture__member-role">
                        {[
                          application.skill,
                          application.requestedWorkstream
                            ? t('maal.applicationRequested', {
                                workstream: application.requestedWorkstream.name,
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <MaalApplicationActions labId={labId} userId={application.userId} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {viewer.canManage ? (
            <MaalVisibilityToggles
              labId={labId}
              settingsHref={`/labs/${slug}/settings`}
              publicPage={overview.visibility.publicPage}
              ledgerOpenToMembers={overview.visibility.ledgerOpenToMembers}
              hoursLeadsOnly={overview.visibility.hoursLeadsOnly}
            />
          ) : null}

          {/* The dormant-capital rail card. Dashed, quiet, and a door — the
              structure is real and the reason it cannot move money is on the
              other side of the link, not hidden behind a "coming soon". */}
          <section className="xidig-card xidig-venture__card xidig-venture__card--dashed">
            <h2 className="xidig-venture__card-title">
              <LockGlyph />
              {t('maal.capitalDormantTitle')}
            </h2>
            <p className="xidig-venture__card-body">{t('maal.capitalDormantBody')}</p>
            <Link className="xidig-venture__card-link" href={`/labs/${slug}?tab=capital`}>
              {t('maal.capitalDormantLink')}
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}

// --- charter + goal meter (shared by 7b and 7e) ------------------------------

async function VentureCharter({
  overview,
  locale,
}: {
  overview: VentureOverviewModel;
  locale: Locale;
}) {
  const t = await getT();
  const { charter, goal, lab } = overview;
  const lead = overview.members.find((entry) => entry.user?.user_id === lab.lead_user_id);

  return (
    <section className="xidig-card xidig-venture__card">
      <div className="xidig-venture__card-head">
        <h2 className="xidig-venture__card-title">{t('maal.charterTitle')}</h2>
        <span className="xidig-venture__card-note">
          {t('maal.charterUpdated', {
            time: formatRelativeTime(new Date(charter.updatedAt), locale),
            name: lead?.user?.display_name ?? '',
          })}
        </span>
      </div>

      {goal.statement ? <p className="xidig-card__body">{goal.statement}</p> : null}
      {charter.problem ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldProblem')}</strong>
          {`: ${charter.problem}`}
        </p>
      ) : null}
      {charter.hypothesis ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldHypothesis')}</strong>
          {`: ${charter.hypothesis}`}
        </p>
      ) : null}
      {charter.success ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldSuccess')}</strong>
          {`: ${charter.success}`}
        </p>
      ) : null}

      {goal.target !== null && goal.target > 0 ? (
        <div className="xidig-goal">
          <p className="xidig-goal__line">
            <span className="num xidig-goal__done">{formatNumber(goal.progress, locale)}</span>
            <span className="xidig-goal__target">
              {`/ ${formatNumber(goal.target, locale)} ${goal.unit ?? ''}`}
            </span>
          </p>
          <div
            className="xidig-goal__track"
            role="progressbar"
            aria-valuenow={goal.progress}
            aria-valuemin={0}
            aria-valuemax={goal.target}
            aria-label={t('maal.goalAria', {
              done: formatNumber(goal.progress, locale),
              target: formatNumber(goal.target, locale),
              unit: goal.unit ?? '',
            })}
          >
            <span
              className="xidig-goal__fill"
              style={{ width: `${Math.round((goal.ratio ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

// --- workstream row ----------------------------------------------------------

async function WorkstreamRow({
  stream,
  locale,
  prefs,
}: {
  stream: WorkstreamView;
  locale: Locale;
  prefs: LitePrefs;
}) {
  const t = await getT();
  const done = Math.max(0, stream.taskCount - stream.openTaskCount);
  return (
    <li className="xidig-ws-row">
      <span className="xidig-ws-row__name">{stream.name}</span>
      <span className="xidig-ws-row__owner">
        {stream.owner ? (
          <>
            <Avatar
              name={stream.owner.display_name}
              handle={stream.owner.handle}
              src={stream.owner.avatar_thumb_url}
              blurhash={stream.owner.avatar_blurhash}
              size={24}
              prefs={prefs}
            />
            <span className="xidig-ws-row__owner-name">{stream.owner.display_name}</span>
          </>
        ) : (
          <>
            {/* An open seat is a state, not a missing owner — the dashed disc
                is the frame's way of saying the chair is there and empty. */}
            <span className="xidig-ws-row__seat-disc" aria-hidden="true" />
            <span className="xidig-ws-row__owner-name">{t('maal.openSeat')}</span>
          </>
        )}
      </span>
      <span className="num xidig-ws-row__tasks">
        {`${formatNumber(done, locale)} / ${formatNumber(stream.taskCount, locale)}`}
      </span>
      <span className="xidig-ws-row__status">
        <span className="xidig-tag">
          {t(stream.status === 'active' ? 'maal.workstreamActive' : 'maal.workstreamWaiting')}
        </span>
      </span>
    </li>
  );
}

// --- members rail ------------------------------------------------------------

async function MembersCard({
  overview,
  slug,
  prefs,
  owned,
}: {
  overview: VentureOverviewModel;
  slug: string;
  prefs: LitePrefs;
  /** user_id → the workstream they own, for the "Hoggaamiye · Sharci" tail. */
  owned: Map<string, string>;
}) {
  const t = await getT();
  return (
    <section className="xidig-card xidig-venture__card">
      <h2 className="xidig-venture__card-title">
        {t('maal.membersWithCount', { count: overview.memberCount })}
      </h2>
      <ul className="xidig-venture__members">
        {overview.members.map((entry) => {
          const workstream = owned.get(entry.user?.user_id ?? '');
          const role = t(ROLE_KEYS[entry.role]);
          return (
            <li key={entry.user?.user_id ?? entry.joinedAt} className="xidig-venture__member">
              {entry.user ? (
                <Avatar
                  name={entry.user.display_name}
                  handle={entry.user.handle}
                  src={entry.user.avatar_thumb_url}
                  blurhash={entry.user.avatar_blurhash}
                  size={28}
                  prefs={prefs}
                />
              ) : null}
              <span className="xidig-venture__member-lines">
                <span className="xidig-venture__member-name">{entry.user?.display_name ?? ''}</span>
                <span className="xidig-venture__member-role">
                  {workstream ? `${role} · ${workstream}` : role}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Link className="xidig-venture__card-link" href={`/labs/${slug}?tab=members`}>
        {t('maal.allMembers')}
      </Link>
    </section>
  );
}

/** Padlock — the dormant-capital marker. Decorative; the title carries meaning. */
function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}

export { LockGlyph };
