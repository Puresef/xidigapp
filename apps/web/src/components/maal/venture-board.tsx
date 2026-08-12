import Link from 'next/link';

import { formatNumber, type Locale, type MessageKey } from '@xidig/i18n';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { Avatar } from '@/components/media/avatar';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import { BOARD_COLUMNS, type BoardColumn } from '@/lib/maal/constants';
import type { TaskView, VentureBoard as VentureBoardModel } from '@/lib/maal/views';

import { MaalContributionLogger } from './contribution-logger';
import { MaalTaskActions } from './task-actions';
import { MaalTaskCreate } from './task-create';

/**
 * The work board — frame 7c. Four columns, one filter row, and the week meter.
 *
 * The thing this surface has to get right is not the drag-and-drop; it is the
 * sentence underneath it. **Hours are SELF-LOGGED.** Nothing here observes
 * anyone: there is no timer, no idle detector, no "time on task" derived from
 * anything the app watched. A member states what they did, and the meter says
 * "Toddobaadkan waxaad diiwaangelisay {n} saac" — you logged — not "you worked".
 * That is why the logger is a button the member presses rather than something
 * the board does for them, and why the meter counts only the VIEWER's own
 * hours (`viewerHoursThisWeek`) and never another member's.
 *
 * The second rule is recusal, and it is rendered as an ABSENCE: on a task you
 * are assigned to, the Marag-fur and Ansixi controls are not shown at all. The
 * API refuses them too (`transitionTask` answers `task_recusal` 403 and the DB
 * has a CHECK behind that), so the hidden control is the courtesy and the
 * server is the rule — never the other way round.
 *
 * The one orange on this page is the guul star on an attested card. That is an
 * earned milestone mark and is legal under badge canon 10a; everything else on
 * a Maal surface is accent or neutral.
 */

const COLUMN_KEYS: Record<BoardColumn, MessageKey> = {
  planned: 'maal.boardPlanned',
  inProgress: 'maal.boardInProgress',
  attestation: 'maal.boardAttestation',
  done: 'maal.boardDone',
};

export async function VentureBoard({
  board,
  slug,
  labId,
  locale,
  prefs,
}: {
  board: VentureBoardModel;
  slug: string;
  labId: string;
  locale: Locale;
  prefs: LitePrefs;
}) {
  const t = await getT();
  const { viewer } = board;

  return (
    <section className="xidig-section xidig-board">
      <div className="xidig-board__actions">
        {viewer.canContribute ? (
          <MaalContributionLogger
            labId={labId}
            tasks={board.columns.inProgress
              .concat(board.columns.attestation, board.columns.planned)
              .map((task) => ({ id: task.id, title: task.title }))}
          />
        ) : null}
        {viewer.canContribute ? (
          <MaalTaskCreate
            labId={labId}
            workstreams={board.workstreams.map((stream) => ({
              id: stream.id,
              name: stream.name,
            }))}
          />
        ) : null}
      </div>

      <div className="xidig-board__filters">
        <div className="xidig-board__chips">
          <Link
            className="xidig-tag"
            href={`/labs/${slug}?tab=work`}
            aria-current={board.workstreamId === null ? 'page' : undefined}
          >
            {t('maal.filterAllWorkstreams')}
          </Link>
          {board.workstreams.map((stream) => (
            <Link
              key={stream.id}
              className="xidig-tag"
              href={`/labs/${slug}?tab=work&ws=${stream.id}`}
              aria-current={board.workstreamId === stream.id ? 'page' : undefined}
            >
              {stream.name}
            </Link>
          ))}
        </div>
        {/* "You logged", never "you worked" — and only ever your own hours. */}
        <p className="xidig-board__week">
          {t('maal.weekLogged', {
            count: formatNumber(board.viewerHoursThisWeek, locale, {
              maximumFractionDigits: 1,
            }),
          })}
        </p>
      </div>

      <div className="xidig-board__columns">
        {BOARD_COLUMNS.map((column) => (
          <section key={column} className="xidig-board__column">
            <h3 className="xidig-board__column-head">
              <span>{t(COLUMN_KEYS[column])}</span>
              <span className="num xidig-board__count">
                {formatNumber(board.counts[column], locale)}
              </span>
            </h3>
            <ul className="xidig-board__cards">
              {board.columns[column].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  labId={labId}
                  locale={locale}
                  prefs={prefs}
                  viewerId={viewer.userId}
                  isLead={viewer.isLead}
                  canContribute={viewer.canContribute}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

async function TaskCard({
  task,
  labId,
  locale,
  prefs,
  viewerId,
  isLead,
  canContribute,
}: {
  task: TaskView;
  labId: string;
  locale: Locale;
  prefs: LitePrefs;
  viewerId: string;
  isLead: boolean;
  canContribute: boolean;
}) {
  const t = await getT();
  const isOwn = task.assignee?.user_id === viewerId;

  return (
    <li
      className={`xidig-task${task.status === 'claimed' ? ' xidig-task--live' : ''}${
        task.status === 'verified' ? ' xidig-task--done' : ''
      }`}
    >
      <span className="xidig-task__title">
        {/* The one sanctioned orange on a Maal surface: an EARNED milestone
            star on a witnessed card (badge canon 10a). */}
        {task.attested ? (
          <span className="xidig-task__star">
            <XidigIcon name="guul" variant="filled" size={14} label={t('maal.attestedAria')} />
          </span>
        ) : null}
        {task.title}
      </span>

      <span className="xidig-task__meta">
        {task.workstream ? <span className="xidig-tag">{task.workstream.name}</span> : null}
        {task.hours > 0 ? (
          <span className="num xidig-task__hours">
            {t('maal.hoursShort', {
              count: formatNumber(task.hours, locale, { maximumFractionDigits: 1 }),
            })}
          </span>
        ) : null}
        <span className="xidig-task__spacer" />
        {task.assignee ? (
          <Avatar
            name={task.assignee.display_name}
            handle={task.assignee.handle}
            src={task.assignee.avatar_thumb_url}
            blurhash={task.assignee.avatar_blurhash}
            size={22}
            prefs={prefs}
          />
        ) : (
          <span
            className="xidig-task__unassigned"
            role="img"
            aria-label={t('maal.unassignedAria')}
          />
        )}
      </span>

      {canContribute ? (
        <MaalTaskActions
          labId={labId}
          taskId={task.id}
          status={task.status}
          isOwn={isOwn}
          isLead={isLead}
        />
      ) : null}
    </li>
  );
}
