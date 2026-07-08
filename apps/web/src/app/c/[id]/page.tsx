import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { CandidateComments } from '@/components/capital/candidate-comments';
import { DecisionControls } from '@/components/capital/decision-controls';
import { InterestBar } from '@/components/capital/interest-bar';
import { ReviewForm } from '@/components/capital/review-form';
import { RubricDisplay } from '@/components/capital/rubric-display';
import { StatusBadge } from '@/components/capital/status-badge';
import { Timeline } from '@/components/capital/timeline';
import { VotePanel } from '@/components/capital/vote-panel';
import { Banner } from '@/components/banner';
import { ReportControl } from '@/components/report-control';
import { ShareActions } from '@/components/share-actions';
import { Avatar } from '@/components/media/avatar';
import { MediaSlot } from '@/components/media/media-slot';
import { getAuthContext } from '@/lib/auth/guards';
import { voteWindow } from '@/lib/capital/tally';
import {
  getCandidateView,
  getPublicCandidateView,
  type CandidateView,
  type PublicCandidateView,
} from '@/lib/capital/views';
import { getLitePrefs } from '@/lib/lite/server';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import { isSupporter } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Candidate permalink (§17). Signed-in members get the full view (RLS scopes
 * readability — reviewers-only / draft they lack access to is a plain 404).
 * Signed-out visitors get the narrow build-in-public projection when the
 * candidate is public/timeline_public — that projection NEVER carries invest
 * language. Reviewer console (rubric form + decision controls) shows for a
 * mod/admin who is NOT a member of the candidate's Lab (recusal §17). Invest is
 * region-gated inside InterestBar → MaalgeliCta.
 */

const idSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return {};
  const admin = getSupabaseAdmin();
  const view = await getPublicCandidateView(admin, id);
  if (!view) return {};
  return { title: `${view.name} — Xidig`, description: view.oneLiner ?? undefined };
}

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const ctx = await getAuthContext();
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');

  const t = await getT();
  const prefs = await getLitePrefs();
  const admin = getSupabaseAdmin();

  // Anonymous / blocked → public build-in-public projection (no invest ever).
  if (!ctx || blocked) {
    const publicView = await getPublicCandidateView(admin, id);
    if (!publicView) notFound();
    return <PublicCandidate view={publicView} prefs={prefs} signInHref={`/signin?next=/c/${id}`} />;
  }

  const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
  if (!view) notFound();

  const { candidate } = view;

  // Reviewer eligibility (v1.0 reviewer set = mod/admin, recused if a Lab member).
  const isModOrAdmin = ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
  let isLabMember = false;
  if (isModOrAdmin) {
    const labIds = [candidate.lab_id, candidate.co_lab_id].filter(
      (v): v is string => typeof v === 'string',
    );
    const { data: mem } = await admin
      .from('lab_members')
      .select('lab_id')
      .eq('user_id', ctx.appUser.id)
      .in('lab_id', labIds)
      .eq('status', 'active')
      .limit(1);
    isLabMember = (mem?.length ?? 0) > 0;
  }
  const canReview = isModOrAdmin && !isLabMember && candidate.status !== 'draft';
  const isConflicted = isModOrAdmin && isLabMember;

  // Governance vote: Supporter capability + window open (submitted / in_review).
  const supporter = await isSupporter(ctx);
  const windowOpen =
    candidate.vote_opens_at !== null &&
    ['submitted', 'in_review'].includes(candidate.status) &&
    voteWindow(candidate.vote_opens_at).isOpen();
  const showVotePanel = supporter && windowOpen;

  const isEditor =
    candidate.created_by_user_id === ctx.appUser.id || ctx.appUser.role === 'admin';

  return (
    <main className="xidig-section">
      <CandidateHeader view={view} prefs={prefs} />

      <ShareActions path={`/c/${id}`} text={t('share.candidateText', { name: candidate.name })} />

      {!isEditor ? (
        <ReportControl targetType="candidate" targetId={id} targetName={candidate.name} />
      ) : null}

      {isEditor && ['draft', 'submitted'].includes(candidate.status) ? (
        <p className="xidig-profile__actions">
          <Link className="xidig-button xidig-button--secondary" href={`/c/${id}/edit`}>
            {t('action.edit')}
          </Link>
        </p>
      ) : null}

      {candidate.status_reason ? (
        <Banner kind="notice">{candidate.status_reason}</Banner>
      ) : null}

      <Pitch view={view} />

      <RubricDisplay rubric={view.rubric} reviews={view.reviews} />

      {showVotePanel ? (
        <VotePanel
          candidateId={id}
          initialTally={view.voteTally}
          initialVote={view.viewer.vote}
        />
      ) : null}

      {/* Reviewer console */}
      {isConflicted ? (
        <Banner kind="notice">{t('capital.reviewerConflictNotice')}</Banner>
      ) : null}
      {canReview ? (
        <>
          <ReviewForm
            candidateId={id}
            initial={
              view.reviews.find((r) => r.reviewer_user_id === ctx.appUser.id) ?? null
            }
          />
          <DecisionControls candidateId={id} />
        </>
      ) : null}

      <InterestBar
        candidateId={id}
        initialCounts={view.interestCounts}
        initialInterests={view.viewer.interests}
      />

      <Timeline milestones={view.timeline} />

      <CandidateComments candidateId={id} viewerId={ctx.appUser.id} />
    </main>
  );
}

// --- shared header ----------------------------------------------------------

function CandidateHeader({ view, prefs }: { view: CandidateView; prefs: LitePrefs }) {
  const { candidate, lab, media } = view;
  return (
    <>
      {media.coverUrl ? (
        <MediaSlot
          kind="image"
          src={media.coverUrl}
          thumbSrc={media.coverThumbUrl ?? undefined}
          blurhash={media.coverBlurhash}
          alt={candidate.name}
          prefs={prefs}
          className="xidig-capital-cover"
          width={1600}
          height={600}
        />
      ) : null}
      <div className="xidig-card__header xidig-space-header">
        <Avatar
          name={candidate.name}
          handle={candidate.id}
          src={media.logoThumbUrl}
          blurhash={media.logoBlurhash}
          size={56}
          prefs={prefs}
        />
        <h1 className="xidig-auth__title">{candidate.name}</h1>
        <StatusBadge status={candidate.status} />
      </div>
      {candidate.one_liner ? <p className="xidig-card__body">{candidate.one_liner}</p> : null}
      {lab ? (
        <p className="xidig-card__meta">
          <Link href={`/labs/${lab.slug}`}>{lab.name}</Link>
        </p>
      ) : null}
    </>
  );
}

async function Pitch({ view }: { view: CandidateView }) {
  const t = await getT();
  const { candidate } = view;
  const sections: { key: string; label: string; value: string | null }[] = [
    { key: 'problem', label: t('capital.fieldProblem'), value: candidate.problem },
    { key: 'solution', label: t('capital.fieldSolution'), value: candidate.solution },
    { key: 'traction', label: t('capital.fieldTraction'), value: candidate.traction },
    { key: 'team', label: t('capital.fieldTeam'), value: candidate.team },
    { key: 'ask', label: t('capital.fieldAsk'), value: candidate.ask },
  ];
  return (
    <section className="xidig-section xidig-capital-pitch">
      {sections
        .filter((s) => s.value && s.value.trim() !== '')
        .map((s) => (
          <div key={s.key}>
            <h2 className="xidig-section__title">{s.label}</h2>
            <p className="xidig-card__body">{s.value}</p>
          </div>
        ))}
    </section>
  );
}

// --- public build-in-public projection (anonymous) --------------------------

async function PublicCandidate({
  view,
  prefs,
  signInHref,
}: {
  view: PublicCandidateView;
  prefs: LitePrefs;
  signInHref: string;
}) {
  const t = await getT();
  const resolvedMedia = view.media;

  return (
    <main className="xidig-section">
      {resolvedMedia.coverUrl ? (
        <MediaSlot
          kind="image"
          src={resolvedMedia.coverUrl}
          thumbSrc={resolvedMedia.coverThumbUrl ?? undefined}
          blurhash={resolvedMedia.coverBlurhash}
          alt={view.name}
          prefs={prefs}
          className="xidig-capital-cover"
          width={1600}
          height={600}
        />
      ) : null}
      <div className="xidig-card__header xidig-space-header">
        <Avatar
          name={view.name}
          handle={view.id}
          src={resolvedMedia.logoThumbUrl}
          blurhash={resolvedMedia.logoBlurhash}
          size={56}
          prefs={prefs}
        />
        <h1 className="xidig-auth__title">{view.name}</h1>
        <StatusBadge status={view.status} />
      </div>
      {view.oneLiner ? <p className="xidig-card__body">{view.oneLiner}</p> : null}
      {view.lab ? (
        <p className="xidig-card__meta">
          <Link href={`/labs/${view.lab.slug}`}>{view.lab.name}</Link>
        </p>
      ) : null}

      <section className="xidig-section xidig-capital-pitch">
        {view.problem ? (
          <div>
            <h2 className="xidig-section__title">{t('capital.fieldProblem')}</h2>
            <p className="xidig-card__body">{view.problem}</p>
          </div>
        ) : null}
        {view.solution ? (
          <div>
            <h2 className="xidig-section__title">{t('capital.fieldSolution')}</h2>
            <p className="xidig-card__body">{view.solution}</p>
          </div>
        ) : null}
        {view.traction ? (
          <div>
            <h2 className="xidig-section__title">{t('capital.fieldTraction')}</h2>
            <p className="xidig-card__body">{view.traction}</p>
          </div>
        ) : null}
        {view.team ? (
          <div>
            <h2 className="xidig-section__title">{t('capital.fieldTeam')}</h2>
            <p className="xidig-card__body">{view.team}</p>
          </div>
        ) : null}
      </section>

      <Timeline milestones={view.timeline} />

      <ShareActions path={`/c/${view.id}`} text={t('share.candidateText', { name: view.name })} />

      <p className="xidig-card__meta">
        <Link href={signInHref}>{t('capital.signInToEngage')} →</Link>
      </p>
    </main>
  );
}
