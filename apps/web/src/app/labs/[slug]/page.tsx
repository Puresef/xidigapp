import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getLocale } from '@/lib/locale';

import { UpcomingEventsSection } from '@/components/events/upcoming-events-section';
import { ContentComposer } from '@/components/labs/content-composer';
import { MembershipActions } from '@/components/labs/membership-actions';
import { VentureBoard } from '@/components/maal/venture-board';
import { VentureCapital } from '@/components/maal/venture-capital';
import { VentureDormantNotice } from '@/components/maal/dormant-notice';
import { VentureLedger } from '@/components/maal/venture-ledger';
import { VentureOverview } from '@/components/maal/venture-overview';
import {
  SPACE_TAB_KEYS,
  VENTURE_TAB_KEYS,
  resolveTab,
  spaceTabs,
  type SpaceTab,
} from '@/components/maal/venture-tabs';
import { ShareActions } from '@/components/share-actions';
import { Avatar } from '@/components/media/avatar';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { MediaSlot } from '@/components/media/media-slot';
import { getAuthContext } from '@/lib/auth/guards';
import { isActiveAccount, isActiveAdmin } from '@/lib/auth/privilege';
import { spaceControls } from '@/lib/labs/standing-controls';
import { getPublicLabView, hydrateOneLab } from '@/lib/labs-api';
import {
  ARTIFACT_COLUMNS,
  DECISION_COLUMNS,
  EVENT_COLUMNS,
  UPDATE_COLUMNS,
  attachAuthors,
  type ArtifactRow,
  type DecisionRow,
  type EventRow,
  type LabMediaView,
  type LabView,
  type UpdateRow,
} from '@/lib/labs/views';
import { CHROME_KEYS, STAGE_KEYS, eventKey } from '@/lib/labs/labels';
import { LAB_SLUG_REGEX } from '@/lib/labs/schemas';
import { boardQuerySchema, ledgerQuerySchema } from '@/lib/maal/schemas';
import {
  getVentureBoard,
  getVentureCapital,
  getVentureLedger,
  getVentureOverview,
  getVentureViewer,
  loadVentureBySlugForViewer,
} from '@/lib/maal/views';
import { getLitePrefs } from '@/lib/lite/server';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import { listPublicSpaceUpdates } from '@/lib/labs/public-updates';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';

/**
 * The Space cover, as delivered by the media pipeline (a 1600px wide JPEG at
 * the current quality settings). A real number rather than MediaSlot's generic
 * 250 KB fallback: the Lite placeholder promises the member a size before they
 * spend it, and an estimate that is not the actual asset class is a promise
 * about somebody else's image.
 */
const SPACE_COVER_EST_BYTES = 190_000;

/** Whole weeks of silence, for the m3 dormancy sentence. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!LAB_SLUG_REGEX.test(slug)) return {};
  const view = await getPublicLabView(slug);
  if (!view) return {};
  return {
    // Brand suffix comes from the root title.template.
    title: view.lab.name,
    description: view.lab.short_description ?? view.lab.problem_statement ?? undefined,
  };
}

export default async function LabDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!LAB_SLUG_REGEX.test(slug)) notFound();

  const ctx = await getAuthContext();
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');

  // Anonymous / blocked → public build-in-public projection (service role,
  // narrow columns). Only public Spaces resolve; everything else is a 404.
  if (!ctx || blocked) {
    return <PublicLabView slug={slug} />;
  }

  // One load for every Space: VENTURE_COLUMNS is LAB_COLUMNS plus the venture
  // columns, all of which live on `labs` for every space_mode. A Koox and a
  // Warshad simply carry nulls there — a second query keyed on the mode would
  // buy nothing and add a way for the two reads to disagree.
  const lab = await loadVentureBySlugForViewer(ctx, slug);
  const admin = getSupabaseAdmin();
  const view = await hydrateOneLab(admin, ctx.appUser.id, lab);

  const sp = await searchParams;
  const t = await getT();
  const locale = await getLocale();
  const litePrefs = await getLitePrefs();

  const isVenture = lab.space_mode === 'venture';
  // Resolved once and threaded down: the tab row and every venture surface must
  // agree about who this viewer is (7e's "absent, not disabled" only holds if
  // one answer drives both).
  const ventureViewer = isVenture ? await getVentureViewer(ctx, lab, admin) : null;
  const tabs = spaceTabs({
    isVenture,
    isMember: Boolean(ventureViewer?.isMember || ventureViewer?.isMod),
    canReadLedger: ventureViewer?.canReadLedger ?? true,
  });
  // resolveTab falls back to 'overview' for anything not in this viewer's own
  // list, so a hand-typed ?tab=ledger on a leads-only ledger lands on the
  // overview rather than walking into getVentureLedger's 403.
  const tab: SpaceTab = resolveTab(sp.tab, tabs);
  const tabKeys = isVenture ? VENTURE_TAB_KEYS : SPACE_TAB_KEYS;

  const isContributor = ['lead', 'core', 'member'].includes(view.viewerRelation);
  // What this viewer is OFFERED, from mode + role + account standing: a lead
  // in the deletion grace keeps an ordinary Space's settings, but a Venture's
  // settings and decision log are refused to them, so neither is offered.
  const controls = spaceControls({
    spaceMode: lab.space_mode,
    isLead: view.viewerRelation === 'lead',
    isContributor,
    activeAdmin: isActiveAdmin(ctx.appUser),
    accountActive: isActiveAccount(ctx.appUser),
  });
  const isManager = controls.showSettingsLink;

  const { data: pin } = await admin
    .from('profile_pinned_labs')
    .select('lab_id')
    .eq('user_id', ctx.appUser.id)
    .eq('lab_id', lab.id)
    .maybeSingle();

  return (
    <main className="xidig-section">
      <BackLink href={isVenture ? '/capital' : '/labs'} labelKey={isVenture ? 'maal.backToIndex' : 'nav.labs'} />
      <LiteMediaProvider>
        <LiteShowAll />
        <SpaceArtHeader
          name={lab.name}
          slug={lab.slug}
          media={view.media}
          chrome={t(CHROME_KEYS[view.kind])}
          coverAlt={t('lab.coverAlt', { name: lab.name })}
          prefs={litePrefs}
        />
        <p className="xidig-card__meta">
          {t(STAGE_KEYS[lab.stage])} · {t('lab.memberCount', { count: view.memberCount })}
          {view.sprintDaysLeft !== null
            ? ` · ${
                view.sprintDaysLeft < 0
                  ? t('lab.sprintEnded')
                  : t('lab.sprintCountdown', { count: view.sprintDaysLeft })
              }`
            : ''}
        </p>

        {/* m3: a dormant venture gets the designed early-warning block —
            encouragement first, the timeout rule last, with the appeal
            attached. Everything else keeps the existing one-line banner. */}
        {view.isDormant && isVenture ? (
          <VentureDormantNotice
            name={lab.name}
            weeks={Math.max(
              1,
              Math.floor((Date.now() - Date.parse(lab.dormant_since ?? lab.last_activity_at)) / WEEK_MS),
            )}
            slug={slug}
            canContribute={Boolean(ventureViewer?.canContribute)}
          />
        ) : view.isDormant ? (
          <p className="xidig-card__body">{t('lab.dormantBanner')}</p>
        ) : null}

        <MembershipActions
          labId={lab.id}
          viewerRelation={view.viewerRelation}
          joinMode={lab.join_mode}
          isPinned={Boolean(pin)}
        />

        <ShareActions path={`/labs/${slug}`} text={t('share.labText', { name: lab.name })} />

        <div className="xidig-tabs">
          {tabs.map((value) => (
            <Link
              key={value}
              className="xidig-tabs__tab"
              href={`/labs/${slug}?tab=${value}`}
              aria-current={tab === value ? 'page' : undefined}
            >
              {t(tabKeys[value])}
            </Link>
          ))}
          {isManager ? (
            <Link className="xidig-tabs__tab" href={`/labs/${slug}/settings`}>
              {t('lab.tabSettings')}
            </Link>
          ) : null}
        </div>

        {tab === 'overview' ? (
          <>
            {isVenture ? (
              <VentureOverview
                overview={await getVentureOverview(ctx, lab)}
                slug={slug}
                labId={lab.id}
                locale={locale}
                prefs={litePrefs}
              />
            ) : (
              <Overview view={view} />
            )}
            {/* Merged discovery (extras item 8): the Space's upcoming events.
                Member surface — public + members visibility rows (space_only
                events stay on their own page, see lib/events/views.ts).
                This is also where a venture's meetings live: the frames' own
                "Kulamo" tab has no repo mechanic (plan flag F4), and events
                already surface here. */}
            <UpcomingEventsSection target={{ labId: lab.id }} publicOnly={false} />
          </>
        ) : null}

        {tab === 'work' ? (
          <VentureBoard
            board={await getVentureBoard(
              ctx,
              lab,
              // safeParse, not parse: a hand-edited ?ws= is a bad link, not a
              // crash. An unrecognised filter falls back to the whole board.
              boardQuerySchema.safeParse({
                workstreamId: typeof sp.ws === 'string' ? sp.ws : undefined,
              }).data ?? {},
            )}
            slug={slug}
            labId={lab.id}
            locale={locale}
            prefs={litePrefs}
          />
        ) : null}

        {tab === 'ledger' ? (
          <VentureLedger
            ledger={await getVentureLedger(
              ctx,
              lab,
              ledgerQuerySchema.safeParse({
                memberId: typeof sp.member === 'string' ? sp.member : undefined,
                type: typeof sp.type === 'string' ? sp.type : undefined,
                days: typeof sp.days === 'string' ? sp.days : undefined,
              }).data ?? {},
            )}
            slug={slug}
            labId={lab.id}
            locale={locale}
            prefs={litePrefs}
          />
        ) : null}

        {tab === 'capital' ? (
          <VentureCapital capital={await getVentureCapital(ctx, lab)} locale={locale} />
        ) : null}
        {tab === 'updates' ? (
          <TabUpdates labId={lab.id} isContributor={isContributor} />
        ) : null}
        {tab === 'artifacts' ? (
          <TabArtifacts labId={lab.id} isContributor={isContributor} />
        ) : null}
        {tab === 'decisions' ? (
          <TabDecisions labId={lab.id} isContributor={controls.canRecordDecision} />
        ) : null}
        {tab === 'members' ? <TabMembers labId={lab.id} /> : null}
        {tab === 'history' ? <TabHistory labId={lab.id} /> : null}
      </LiteMediaProvider>
    </main>
  );
}

// --- Space art header (cover strip + icon, §22-aware) ------------------------

/**
 * Cover strip (MediaSlot — deferred behind a tap in Lite) + icon next to the
 * name. Spaces have names not handles, so the slug seeds the deterministic
 * initials-disc color; the icon follows the Lite smallAvatars rule.
 */
function SpaceArtHeader({
  name,
  slug,
  media,
  chrome,
  coverAlt,
  prefs,
}: {
  name: string;
  slug: string;
  media: LabMediaView;
  chrome: string;
  coverAlt: string;
  prefs: LitePrefs;
}) {
  return (
    <>
      {media.coverUrl ? (
        <MediaSlot
          kind="image"
          src={media.coverUrl}
          thumbSrc={media.coverThumbUrl ?? undefined}
          blurhash={media.coverBlurhash}
          alt={coverAlt}
          estBytes={SPACE_COVER_EST_BYTES}
          prefs={prefs}
          className="xidig-space-cover"
          width={1600}
          height={600}
        />
      ) : null}
      <div className="xidig-card__header xidig-space-header">
        <Avatar
          name={name}
          handle={slug}
          src={media.iconThumbUrl}
          blurhash={media.iconBlurhash}
          size={56}
          prefs={prefs}
        />
        <h1 className="xidig-auth__title">{name}</h1>
        <span className="xidig-badge">{chrome}</span>
      </div>
    </>
  );
}

// --- overview ---------------------------------------------------------------

async function Overview({ view }: { view: LabView }) {
  const t = await getT();
  const { lab } = view;
  return (
    <section className="xidig-section">
      {lab.short_description ? <p className="xidig-card__body">{lab.short_description}</p> : null}

      {/* IP / ownership reminder (§16) */}
      <p className="xidig-card__meta">{t('lab.ipBanner')}</p>

      {lab.problem_statement ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldProblem')}:</strong> {lab.problem_statement}
        </p>
      ) : null}
      {lab.hypothesis ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldHypothesis')}:</strong> {lab.hypothesis}
        </p>
      ) : null}
      {lab.success_definition ? (
        <p className="xidig-card__body">
          <strong>{t('lab.fieldSuccess')}:</strong> {lab.success_definition}
        </p>
      ) : null}

      <p className="xidig-card__meta">
        {t('lab.lookingFor')}:{' '}
        {view.skillNeeds.length > 0
          ? view.skillNeeds.map((s) => s.skill).join(', ')
          : t('lab.emptySkills')}
      </p>
    </section>
  );
}

// --- content tabs (RSC reads run under the caller's RLS) --------------------

async function TabUpdates({ labId, isContributor }: { labId: string; isContributor: boolean }) {
  const ctx = await getAuthContext();
  const t = await getT();
  const admin = getSupabaseAdmin();
  const { data } = await ctx!.supabase
    .from('lab_updates')
    .select(UPDATE_COLUMNS)
    .eq('lab_id', labId)
    .order('created_at', { ascending: false })
    .limit(50);
  const items = await attachAuthors(admin, (data ?? []) as UpdateRow[], 'author_user_id');

  return (
    <section className="xidig-section">
      {isContributor ? <ContentComposer labId={labId} kind="update" /> : null}
      {items.length === 0 ? <p className="xidig-card__body">{t('lab.emptyUpdates')}</p> : null}
      <ul className="xidig-post-list">
        {items.map((u) => (
          <li key={u.id} className="xidig-card">
            {u.title ? <h3 className="xidig-card__title">{u.title}</h3> : null}
            {u.collaboration_id ? (
              <p className="xidig-card__meta">{t('lab.crossPostedFrom', { name: '↔' })}</p>
            ) : null}
            <p className="xidig-card__body">{u.body}</p>
            <p className="xidig-card__meta">{u.author?.display_name ?? ''}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function TabArtifacts({ labId, isContributor }: { labId: string; isContributor: boolean }) {
  const ctx = await getAuthContext();
  const t = await getT();
  const admin = getSupabaseAdmin();
  const { data } = await ctx!.supabase
    .from('lab_artifacts')
    .select(ARTIFACT_COLUMNS)
    .eq('lab_id', labId)
    .order('created_at', { ascending: false })
    .limit(100);
  const items = await attachAuthors(admin, (data ?? []) as ArtifactRow[], 'added_by_user_id');

  return (
    <section className="xidig-section">
      {isContributor ? <ContentComposer labId={labId} kind="artifact" /> : null}
      {items.length === 0 ? <p className="xidig-card__body">{t('lab.emptyArtifacts')}</p> : null}
      <ul className="xidig-post-list">
        {items.map((a) => (
          <li key={a.id} className="xidig-card">
            <h3 className="xidig-card__title">
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                {a.title}
              </a>
            </h3>
            {a.description ? <p className="xidig-card__body">{a.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function TabDecisions({ labId, isContributor }: { labId: string; isContributor: boolean }) {
  const ctx = await getAuthContext();
  const t = await getT();
  const admin = getSupabaseAdmin();
  const { data } = await ctx!.supabase
    .from('lab_decisions')
    .select(DECISION_COLUMNS)
    .eq('lab_id', labId)
    .order('decided_at', { ascending: false })
    .limit(100);
  const items = await attachAuthors(admin, (data ?? []) as DecisionRow[], 'created_by_user_id');

  return (
    <section className="xidig-section">
      {isContributor ? <ContentComposer labId={labId} kind="decision" /> : null}
      {items.length === 0 ? <p className="xidig-card__body">{t('lab.emptyDecisions')}</p> : null}
      <ul className="xidig-post-list">
        {items.map((d) => (
          <li key={d.id} className="xidig-card">
            <h3 className="xidig-card__title">{d.title}</h3>
            {d.context ? <p className="xidig-card__meta">{d.context}</p> : null}
            <p className="xidig-card__body">{d.decision}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function TabMembers({ labId }: { labId: string }) {
  const ctx = await getAuthContext();
  const t = await getT();
  const admin = getSupabaseAdmin();
  const { data } = await ctx!.supabase
    .from('lab_members')
    .select('user_id, role, status, joined_at')
    .eq('lab_id', labId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });
  const items = await attachAuthors(admin, data ?? [], 'user_id');

  return (
    <section className="xidig-section">
      {items.length <= 1 ? <p className="xidig-card__body">{t('lab.emptyMembers')}</p> : null}
      <ul className="xidig-post-list">
        {items.map((m) => (
          <li key={m.user_id} className="xidig-card__meta">
            {m.author ? (
              <Link href={`/u/${m.author.handle}`}>{m.author.display_name}</Link>
            ) : (
              m.user_id
            )}{' '}
            · {m.role}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function TabHistory({ labId }: { labId: string }) {
  const ctx = await getAuthContext();
  const t = await getT();
  const admin = getSupabaseAdmin();
  const { data } = await ctx!.supabase
    .from('lab_events')
    .select(EVENT_COLUMNS)
    .eq('lab_id', labId)
    .order('created_at', { ascending: false })
    .limit(50);
  const items = await attachAuthors(admin, (data ?? []) as EventRow[], 'actor_user_id');

  return (
    <section className="xidig-section">
      {items.length === 0 ? <p className="xidig-card__body">{t('lab.emptyHistory')}</p> : null}
      <ul className="xidig-post-list">
        {items.map((e) => (
          <li key={e.id} className="xidig-card__meta">
            {t(eventKey(e.event_type, e.metadata))}
            {e.author ? ` · ${e.author.display_name}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- public build-in-public projection (anonymous) --------------------------

async function PublicLabView({ slug }: { slug: string }) {
  const view = await getPublicLabView(slug);
  if (!view) notFound();
  const t = await getT();
  const litePrefs = await getLitePrefs();
  const { lab } = view;
  const admin = getSupabaseAdmin();

  // Never more than a member sees: suspended/deactivated authors are hidden
  // here exactly as under RLS (lib/labs/public-updates.ts).
  const updates = await listPublicSpaceUpdates(admin, lab.id as string);

  return (
    <main className="xidig-section">
      <BackLink href="/labs" labelKey="nav.labs" />
      <LiteMediaProvider>
        <LiteShowAll />
        <SpaceArtHeader
          name={lab.name ?? ''}
          slug={slug}
          media={view.media}
          chrome={t(CHROME_KEYS[(lab.space_mode as 'club' | 'lab') ?? 'club'])}
          coverAlt={t('lab.coverAlt', { name: lab.name ?? '' })}
          prefs={litePrefs}
        />
        <p className="xidig-card__meta">
          {t('lab.publicBadge')} · {t('lab.memberCount', { count: view.memberCount })}
        </p>

        {lab.short_description ? <p className="xidig-card__body">{lab.short_description}</p> : null}
        {lab.problem_statement ? (
          <p className="xidig-card__body">
            <strong>{t('lab.fieldProblem')}:</strong> {lab.problem_statement}
          </p>
        ) : null}

        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('lab.tabUpdates')}</h2>
          <ul className="xidig-post-list">
            {(updates ?? []).map((u) => (
              <li key={u.id} className="xidig-card">
                {u.title ? <h3 className="xidig-card__title">{u.title}</h3> : null}
                <p className="xidig-card__body">{u.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Signed-out surface: PUBLIC events only + organic-proof filters. */}
        <UpcomingEventsSection target={{ labId: lab.id as string }} publicOnly />

        <ShareActions path={`/labs/${slug}`} text={t('share.labText', { name: lab.name ?? '' })} />

        <p className="xidig-card__meta">
          <Link href={`/signin?next=/labs/${slug}`}>{t('lab.signInToJoin')}</Link>
        </p>
      </LiteMediaProvider>
    </main>
  );
}
