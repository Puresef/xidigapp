import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';
import { DEFAULT_LOCALE, type Locale, type Translator } from '@xidig/i18n';

// Type-only, so nothing from the component tree reaches this module at
// runtime: the Suuq card's props ARE the contract for what the projection
// owes it, and re-declaring the shape here would let the two drift silently.
import type {
  SuuqListingSummary,
  SuuqTestimonial,
} from '@/components/profile/modules/suuq-module';
import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { loadModuleFlags } from '@/lib/aniga/flags';
import { loadLaneCatalog, resolveLaneLabels, type LaneOption } from '@/lib/aniga/lanes';
import { normalizeUrlKey } from '@/lib/aniga/links';
import { resolveModuleStates, type AnigaModuleState } from '@/lib/aniga/modules';
import { findLabsSeekingSkills } from '@/lib/matching/looking-for';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import {
  getMemberProfileView,
  getPublicProfileView,
  loadLocationGranularities,
  applyLocationGranularity,
  type ProfileView,
} from '@/lib/profile-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The Aniga v3 projection (migration 20260811000000). The header stays fixed
 * chrome and comes from `ProfileView` unchanged — this module adds only what
 * the MODULES below the bio need, and it adds it under the same client split
 * lib/profile-view.ts established:
 *
 *   * the CALLER's RLS client for anything whose visibility is a policy
 *     decision (showcase targets, helper posts, link metadata, matches);
 *   * the service role ONLY where RLS answers for auth.uid() and would
 *     therefore lie about a third party — mutual Spaces, media byte sizes,
 *     aggregate counts — plus the verification token, which the column grant
 *     withholds from every member client, the owner's included.
 *
 * Four visitor rules are enforced HERE rather than in the renderer, because a
 * component that never receives the value cannot leak it:
 *
 *   * `privateStats` is null for anyone but the owner;
 *   * `ownerFacts` is null for anyone but the owner — and the fold state it
 *     discloses is itself an unpublished fact, so a visitor's DOM must not be
 *     able to tell `hidden` apart from never-entered;
 *   * `metrics` is null unless the viewer is the owner or the platform flag
 *     `profile_metrics_module` is ON (ruling 7 — the owner does not own that
 *     decision, so the flag is read server-side, never inferred from a row);
 *   * `AnigaLink.verificationToken` is null for anyone but the owner.
 *
 * Endorsement counts are NOT covered by "no counts on the visitor DOM" (A1):
 * that rule is about follower/engagement counts. An endorsement count is
 * attested evidence — the frames render it to visitors (ANIGA-SPEC §3.2).
 *
 * Test-account quarantine (users.is_test, 20260912050000). Two rules:
 *
 *   * a test account's OWN profile gets `testAccountAnigaView` — no module,
 *     skill, helper row, mutual, metric or owner fact is read for it; the
 *     page renders the test-account notice (the public variant is null);
 *   * on a REAL profile, an edge whose other end is a test account is not
 *     evidence: endorsements from test endorsers, Caawimo credits from test
 *     askers, test members in the mutuals strip/count and asks from test
 *     askers in `asksHelped` are all left out. The test-account set is read
 *     ONCE per projection (service role) and shared by every loader.
 */

type AnyClient = SupabaseClient<Database>;

/**
 * The quarantined test accounts, as a set (post-filtering fetched rows) and as
 * a PostgREST list literal (`not in` filters for counts and limited lists that
 * cannot be filtered after the fact). `list` is null when there are none — an
 * empty `in ()` is not valid PostgREST, and there is nothing to exclude.
 */
interface TestAccounts {
  ids: ReadonlySet<string>;
  list: string | null;
}

async function loadTestAccounts(): Promise<TestAccounts> {
  const ids = await loadTestAccountIds(getSupabaseAdmin());
  return { ids: new Set(ids), list: ids.length > 0 ? postgrestIdList(ids) : null };
}

export interface AnigaShowcaseItem {
  position: number;
  entityType: 'post' | 'lab' | 'listing';
  entityId: string;
  href: string;
  /** 'guul' | 'warshad' | 'war' | null — drives the source chip. Guul is the only orange one. */
  sourceKind: 'guul' | 'warshad' | 'war' | null;
  title: string;
  mediaUrl: string | null;
  mediaThumbUrl: string | null;
  blurhash: string | null;
  estBytes: number | null;
}

export interface AnigaSkill {
  skill: string;
  /** Distinct endorsers. Guaranteed by unique(endorser,endorsee,skill). */
  endorsers: number;
  /** 1-based depth rank, 1 = most endorsed. Drives chip size ramp. */
  rank: number;
  /** True when the viewer has already endorsed this skill (hides the endorse action). */
  endorsedByViewer: boolean;
}

export interface AnigaLink {
  label: string;
  url: string;
  /** Normalized key matching profile_link_meta.url_key. */
  urlKey: string;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
  /** Tier 2. When ogStatus !== 'ok' the card is NOT rendered — the chip stands alone. */
  ogStatus: 'pending' | 'ok' | 'failed';
  ogTitle: string | null;
  ogSiteName: string | null;
  ogImageUrl: string | null;
  /** Owner-only. Never projected to visitors. */
  verificationToken: string | null;
}

export interface AnigaHelperEntry {
  postId: string;
  title: string;
  resolvedAt: string;
  /** The asker who credited this resolution — the whole point of the surface. */
  creditedBy: { displayName: string; handle: string; avatarUrl: string | null; city: string | null };
}

export interface AnigaMatch {
  href: string;
  title: string;
  /** MANDATORY and non-empty. A match with no reason must not be emitted. */
  reason: string;
  memberCount: number | null;
}

export interface AnigaMetrics {
  posts: number;
  asksHelped: number;
  connections: number;
}

export interface AnigaMutuals {
  members: Array<{ displayName: string; handle: string; avatarUrl: string | null }>;
  totalCount: number;
  /** Shared space name, computed from lab_members only — never a contacts upload. */
  sharedSpaceName: string | null;
}

/**
 * The Xogta card (docs/aniga-modules.md, 11 Aug). Owner-only: the two facts
 * that decide how a member gets found and that the owner structurally cannot
 * see any other way.
 */
export interface AnigaOwnerFacts {
  /** The member's stored lanes, resolved through the catalog's LABELS. */
  lanes: LaneOption[];
  /** The fold as it applies to VISITORS: null when 'exact' or 'city' (nothing to explain). */
  fold: 'region' | 'hidden' | null;
  /** What a visitor actually sees for location, AFTER folding. null when nothing survives. */
  place: string | null;
}

export interface AnigaView {
  /** Existing profile projection, reused unchanged. */
  base: ProfileView;
  headline: string | null;
  modules: AnigaModuleState[];
  showcase: AnigaShowcaseItem[];
  skills: AnigaSkill[];
  links: AnigaLink[];
  lookingFor: { slugs: string[]; matches: AnigaMatch[] };
  helper: AnigaHelperEntry[];
  mutuals: AnigaMutuals | null;
  /**
   * The member's Suuq listing, or null when they have none — the module then
   * self-hides for visitors and shows the owner the invitation, exactly like
   * every other empty module.
   *
   * `testimonial` is ALWAYS null today: this schema has no testimonial table,
   * so the verified-customer quote has no data source yet. That satisfies the
   * acceptance criterion honestly — a testimonial whose customer cannot be
   * resolved to a linkable member must not render — rather than by inventing
   * a store or borrowing a review row that nobody attested as a customer.
   */
  suuq: { listing: SuuqListingSummary | null; testimonial: SuuqTestimonial | null } | null;
  /** null unless the viewer is the owner, OR the metrics flag is on. */
  metrics: AnigaMetrics | null;
  /** Owner-only private block. Always null for visitors — no DOM either way. */
  privateStats: (AnigaMetrics & { cachedAt: string | null }) | null;
  /** Owner-only facts card. Always null for visitors — no DOM either way. */
  ownerFacts: AnigaOwnerFacts | null;
}

/** profile_showcase caps position at 6; the grid is 3-up mobile / 4-up desktop. */
const SHOWCASE_LIMIT = 6;
/** Caawimo is a history, not a feed — the module shows the recent end of it. */
const HELPER_LIMIT = 6;
/** Overlapping avatars in the mutuals strip; the rest becomes "+N kale". */
const MUTUALS_STRIP = 3;

// ---------------------------------------------------------------------------
// Module registry

async function loadModuleStates(
  client: AnyClient,
  userId: string,
  flags: Record<string, boolean>,
): Promise<AnigaModuleState[]> {
  const { data, error } = await client
    .from('profile_modules')
    .select('module_id, position, visible')
    .eq('user_id', userId);
  if (error) throw new Error(`profile modules lookup failed: ${error.message}`);
  return resolveModuleStates(data ?? [], flags);
}

// ---------------------------------------------------------------------------
// Showcase (Bandhig)

/**
 * The source chip. Guul is the ONLY orange one (earned milestone), so the
 * mapping lives here rather than in the tile: a renderer that decided from a
 * post type string would be one typo away from an orange War.
 */
function showcaseSourceKind(
  entityType: 'post' | 'lab' | 'listing',
  postType: string | null,
): AnigaShowcaseItem['sourceKind'] {
  if (entityType === 'lab') return 'warshad';
  if (entityType !== 'post') return null;
  if (postType === 'win') return 'guul';
  if (postType === 'update') return 'war';
  return null;
}

interface ShowcaseMedia {
  mediaUrl: string | null;
  mediaThumbUrl: string | null;
  blurhash: string | null;
  estBytes: number | null;
}

const NO_MEDIA: ShowcaseMedia = {
  mediaUrl: null,
  mediaThumbUrl: null,
  blurhash: null,
  estBytes: null,
};

/**
 * Pinned refs only — nothing engagement-sourced reaches this grid (A5).
 *
 * Targets hydrate through the CALLER's RLS, exactly like profile pins: a row
 * is a bare (type, uuid) pair, so a removed post or a Space the viewer cannot
 * read simply drops out instead of rendering a dead tile.
 */
async function loadShowcase(
  client: AnyClient,
  userId: string,
): Promise<AnigaShowcaseItem[]> {
  const { data: rows, error } = await client
    .from('profile_showcase')
    .select('position, entity_type, entity_id, media_id')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .limit(SHOWCASE_LIMIT);
  if (error) throw new Error(`showcase lookup failed: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const idsOf = (type: string) =>
    rows.filter((row) => row.entity_type === type).map((row) => row.entity_id);
  const postIds = idsOf('post');
  const labIds = idsOf('lab');
  const listingIds = idsOf('listing');
  const mediaIds = rows
    .map((row) => row.media_id)
    .filter((id): id is string => typeof id === 'string' && id !== '');

  const [posts, labs, listings, media] = await Promise.all([
    postIds.length > 0
      ? client.from('posts').select('id, title, body, type').in('id', postIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null; body: string; type: string }> }),
    labIds.length > 0
      ? client.from('labs').select('id, name, slug').in('id', labIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string }> }),
    listingIds.length > 0
      ? client.from('business_listings').select('id, business_name').in('id', listingIds)
      : Promise.resolve({ data: [] as Array<{ id: string; business_name: string }> }),
    // media_uploads is own-rows-only under RLS, so the byte size a MediaSlot
    // needs for its "~90 KB" estimate can only come from the service role
    // (same reason lib/plaza/views.ts hydrates post images that way).
    mediaIds.length > 0
      ? getSupabaseAdmin()
          .from('media_uploads')
          .select('id, storage_path, thumb_path, blurhash, bytes')
          .in('id', mediaIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const postById = new Map((posts.data ?? []).map((row) => [row.id, row]));
  const labById = new Map((labs.data ?? []).map((row) => [row.id, row]));
  const listingById = new Map((listings.data ?? []).map((row) => [row.id, row]));
  const mediaById = new Map(
    (media.data ?? []).map((raw) => {
      const row = raw as unknown as {
        id: string;
        storage_path: string;
        thumb_path: string | null;
        blurhash: string | null;
        bytes: number | null;
      };
      return [
        row.id,
        {
          mediaUrl: publicMediaUrl(row.storage_path),
          mediaThumbUrl: publicMediaUrl(row.thumb_path ?? derivedThumbPath(row.storage_path)),
          blurhash: row.blurhash,
          estBytes: row.bytes,
        } satisfies ShowcaseMedia,
      ];
    }),
  );

  const items: AnigaShowcaseItem[] = [];
  for (const row of rows) {
    const tile = (row.media_id ? mediaById.get(row.media_id) : null) ?? NO_MEDIA;
    if (row.entity_type === 'post') {
      const post = postById.get(row.entity_id);
      if (!post) continue;
      items.push({
        position: row.position,
        entityType: 'post',
        entityId: post.id,
        href: `/p/${post.id}`,
        sourceKind: showcaseSourceKind('post', post.type),
        title: post.title?.trim() || post.body,
        ...tile,
      });
    } else if (row.entity_type === 'lab') {
      const lab = labById.get(row.entity_id);
      if (!lab) continue;
      items.push({
        position: row.position,
        entityType: 'lab',
        entityId: lab.id,
        href: `/labs/${lab.slug}`,
        sourceKind: showcaseSourceKind('lab', null),
        title: lab.name,
        ...tile,
      });
    } else if (row.entity_type === 'listing') {
      const listing = listingById.get(row.entity_id);
      if (!listing) continue;
      items.push({
        position: row.position,
        entityType: 'listing',
        entityId: listing.id,
        href: `/l/${listing.id}`,
        sourceKind: showcaseSourceKind('listing', null),
        title: listing.business_name,
        ...tile,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Skills (Xirfadaha) — §14 endorsements

/** Endorsements are free text; the member's declared spelling is what renders. */
const skillKey = (skill: string) => skill.trim().toLowerCase();

/**
 * Depth per DECLARED skill. `unique(endorser, endorsee, skill)` already makes
 * "distinct endorsers" structurally true, and the Set below keeps it true even
 * if that constraint is ever relaxed — the count is people, never rows.
 *
 * Only skills the member still declares render: an endorsement for a skill
 * they have since removed would resurrect a self-description they retracted.
 *
 * An endorsement from a quarantined test account is not attested evidence, so
 * it adds nothing to the depth (or the rank it drives). `endorsedByViewer`
 * still reads the viewer's own row: it answers "did I already endorse this?",
 * which stays true whoever is asking.
 */
async function loadSkills(
  client: AnyClient,
  userId: string,
  declared: readonly string[],
  viewerId: string | null,
  test: TestAccounts,
): Promise<AnigaSkill[]> {
  const unique = declared.map((skill) => skill.trim()).filter((skill) => skill !== '');
  if (unique.length === 0) return [];

  const { data } = await client
    .from('skill_endorsements')
    .select('endorser_user_id, skill')
    .eq('endorsee_user_id', userId);

  const endorsersBySkill = new Map<string, Set<string>>();
  const endorsedByViewer = new Set<string>();
  for (const row of data ?? []) {
    const key = skillKey(row.skill);
    if (viewerId !== null && row.endorser_user_id === viewerId) endorsedByViewer.add(key);
    if (test.ids.has(row.endorser_user_id)) continue;
    const set = endorsersBySkill.get(key) ?? new Set<string>();
    set.add(row.endorser_user_id);
    endorsersBySkill.set(key, set);
  }

  return unique
    .map((skill) => {
      const endorsers = endorsersBySkill.get(skillKey(skill)) ?? new Set<string>();
      return {
        skill,
        endorsers: endorsers.size,
        rank: 0,
        endorsedByViewer: endorsedByViewer.has(skillKey(skill)),
      };
    })
    // Depth first, then the member's own declared order — a stable ramp that
    // does not reshuffle between reads when two skills tie.
    .sort((a, b) => b.endorsers - a.endorsers)
    .map((skill, index) => ({ ...skill, rank: index + 1 }));
}

// ---------------------------------------------------------------------------
// External links (Bogagga dibadda)

interface ProfileLinkRow {
  label: string;
  url: string;
}

function declaredLinks(links: unknown): ProfileLinkRow[] {
  if (!Array.isArray(links)) return [];
  return links.flatMap((raw) => {
    const row = raw as { label?: unknown; url?: unknown };
    if (typeof row?.url !== 'string' || typeof row?.label !== 'string') return [];
    return [{ label: row.label, url: row.url }];
  });
}

interface LinkMetaRow {
  url_key: string;
  verification_status: string;
  og_status: string;
  og_title: string | null;
  og_site_name: string | null;
  og_image_path: string | null;
}

const VERIFICATION_STATUSES = new Set(['unverified', 'pending', 'verified', 'failed']);
const OG_STATUSES = new Set(['pending', 'ok', 'failed']);

/**
 * `profiles.links` stays the member-ordered label+url store; profile_link_meta
 * is a sidecar of SERVER-owned facts keyed by the normalized URL. A link with
 * no sidecar row has simply never been fetched or checked — unverified,
 * pending preview, no card.
 *
 * The token is read separately, through the service role, and ONLY for the
 * owner: the column grant withholds `verification_token` from every member
 * client (a visitor who could read the nonce could plant it and mint a check).
 */
async function loadLinks(
  client: AnyClient,
  userId: string,
  links: unknown,
  isOwner: boolean,
): Promise<AnigaLink[]> {
  const declared = declaredLinks(links);
  if (declared.length === 0) return [];

  const { data: meta } = await client
    .from('profile_link_meta')
    .select('url_key, verification_status, og_status, og_title, og_site_name, og_image_path')
    .eq('user_id', userId);
  const metaByKey = new Map<string, LinkMetaRow>((meta ?? []).map((row) => [row.url_key, row]));

  const tokenByKey = new Map<string, string>();
  if (isOwner) {
    const { data: tokens } = await getSupabaseAdmin()
      .from('profile_link_meta')
      .select('url_key, verification_token')
      .eq('user_id', userId);
    for (const row of tokens ?? []) {
      if (row.verification_token) tokenByKey.set(row.url_key, row.verification_token);
    }
  }

  return declared.map((link) => {
    // A URL the normalizer rejects can never have a sidecar row (the writer
    // uses the same function), so it renders as a plain unverified chip.
    const urlKey = normalizeUrlKey(link.url) ?? '';
    const row = urlKey === '' ? undefined : metaByKey.get(urlKey);
    const ogImagePath = row?.og_image_path ?? null;
    return {
      label: link.label,
      url: link.url,
      urlKey,
      verificationStatus: VERIFICATION_STATUSES.has(row?.verification_status ?? '')
        ? (row!.verification_status as AnigaLink['verificationStatus'])
        : 'unverified',
      ogStatus: OG_STATUSES.has(row?.og_status ?? '')
        ? (row!.og_status as AnigaLink['ogStatus'])
        : 'pending',
      ogTitle: row?.og_title ?? null,
      ogSiteName: row?.og_site_name ?? null,
      // The fetcher caches the preview image into our own bucket (Lite +
      // privacy: no third-party request from the member's browser), so the
      // stored value is a storage path — an absolute URL means a legacy row.
      ogImageUrl:
        ogImagePath === null
          ? null
          : /^https?:\/\//i.test(ogImagePath)
            ? ogImagePath
            : publicMediaUrl(ogImagePath),
      verificationToken: isOwner ? (tokenByKey.get(urlKey) ?? null) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Looking for (Waxaan raadinayaa)

/**
 * Every match carries its reason (ANIGA-SPEC §3.4: "Sabab kasta waa la
 * muujiyaa"). The reason is COPY, so it needs the request translator — and
 * without one there is no honest way to render a match, so none are emitted.
 * That is the safe direction: a silent match is a recommendation the member
 * cannot audit, which is the thing this module refuses to be.
 *
 * OWNER ONLY, for two reasons that point the same way: the reason copy is
 * second-person ("Ku habboon xirfaddaada"), which only resolves when the
 * reader is the member whose skills were matched; and the matcher runs under
 * the CALLER's RLS, so a visitor would be shown the Spaces THEY can see
 * against the owner's skills — a mix that belongs to nobody. Visitors still
 * see the "Waxaan raadinayaa" tags; the match rows are the owner's tool.
 */
async function loadMatches(
  client: AnyClient,
  skills: readonly string[],
  t: Translator | undefined,
): Promise<AnigaMatch[]> {
  if (!t || skills.length === 0) return [];
  const labs = await findLabsSeekingSkills(client, [...skills]);
  if (labs.length === 0) return [];

  // lab_members RLS answers for auth.uid(); a member count is an aggregate
  // with no PII, so it rides the service role like every other count here.
  const admin = getSupabaseAdmin();
  const counts = await Promise.all(
    labs.map(async (lab) => {
      const { count } = await admin
        .from('lab_members')
        .select('*', { count: 'exact', head: true })
        .eq('lab_id', lab.labId)
        .eq('status', 'active');
      return count ?? null;
    }),
  );

  return labs.flatMap((lab, index) => {
    const need = lab.matchedSkills[0];
    // findLabsSeekingSkills only returns labs with at least one overlap, so
    // this cannot normally fire — but an empty reason must never ship.
    if (!need) return [];
    return [
      {
        href: `/labs/${lab.slug}`,
        title: t('profile.matchLookingFor', { lab: lab.name, need }),
        reason: t('profile.matchReasonSkill'),
        memberCount: counts[index] ?? null,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Helper history (Caawimo)

/**
 * Asker-credited resolutions ONLY. `posts.ask_helper_user_id` is set when the
 * asker accepts an offer and `ask_status='fulfilled'` when the asker closes it
 * — both are the ASKER's acts (codsi-lifecycle migration), which is what makes
 * this surface evidence rather than a self-report.
 *
 * Posts ride the caller's RLS, so a helper credit on something the viewer
 * cannot read never surfaces here.
 *
 * A credit from a quarantined test account is not evidence — the crediting
 * asker is the whole point — so those asks are excluded IN the query, which
 * keeps the recent end of the history HELPER_LIMIT organic rows long rather
 * than letting test rows eat the slots.
 */
async function loadHelper(
  client: AnyClient,
  userId: string,
  test: TestAccounts,
): Promise<AnigaHelperEntry[]> {
  let query = client
    .from('posts')
    .select('id, title, body, author_user_id, ask_fulfilled_at')
    .eq('ask_helper_user_id', userId)
    .eq('ask_status', 'fulfilled')
    .eq('status', 'published');
  if (test.list) query = query.not('author_user_id', 'in', test.list);
  const { data: posts } = await query
    .order('ask_fulfilled_at', { ascending: false })
    .limit(HELPER_LIMIT);
  const rows = (posts ?? []).filter(
    (row): row is typeof row & { ask_fulfilled_at: string } =>
      typeof row.ask_fulfilled_at === 'string' &&
      // Belt and braces for the query filter: never a test asker's credit,
      // and never a read of a test asker's profile.
      !test.ids.has(row.author_user_id),
  );
  if (rows.length === 0) return [];

  const askerIds = [...new Set(rows.map((row) => row.author_user_id))];
  const [{ data: askers }, granularities] = await Promise.all([
    client
      .from('profiles')
      .select('user_id, display_name, handle, avatar_path, location_city, location_country')
      .in('user_id', askerIds),
    // The asker's own location_granularity governs their city here too — this
    // is their data appearing on someone else's profile.
    loadLocationGranularities(askerIds),
  ]);
  const askerById = new Map(
    (askers ?? []).map((asker) => [
      asker.user_id,
      applyLocationGranularity(asker, granularities.get(asker.user_id) ?? 'city'),
    ]),
  );

  return rows.flatMap((row) => {
    const asker = askerById.get(row.author_user_id);
    // No asker, no credit: the crediting member IS the evidence.
    if (!asker) return [];
    return [
      {
        postId: row.id,
        title: row.title?.trim() || row.body,
        resolvedAt: row.ask_fulfilled_at,
        creditedBy: {
          displayName: asker.display_name,
          handle: asker.handle,
          avatarUrl: asker.avatar_path
            ? publicMediaUrl(derivedThumbPath(asker.avatar_path))
            : null,
          city: asker.location_city,
        },
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Mutuals — shared Spaces only

/**
 * "Waxaad wadaagtaan: … — Warshadda Ganacsi Yaryar 101".
 *
 * Computed from `lab_members` intersection and NOTHING ELSE. There is no
 * contacts upload in this product and there must not be an inferred one: the
 * only reason two members are connected here is that they both joined the same
 * Space, which is a fact both of them created deliberately.
 *
 * Service role because lab membership RLS answers for auth.uid() — the viewer
 * cannot read the profile owner's memberships, and asking under their own
 * client would silently return "no mutuals" for every real case.
 *
 * Scoped to ONE shared Space (the frame names one), which also keeps the count
 * exact: `lab_members` is keyed (lab_id, user_id), so counting rows in a
 * single lab counts people.
 *
 * Quarantined test accounts are not people to have in common: they are left
 * out of both the face strip and the count, in the query.
 */
async function loadMutuals(
  viewerId: string,
  userId: string,
  test: TestAccounts,
): Promise<AnigaMutuals | null> {
  const admin = getSupabaseAdmin();
  const [mine, theirs] = await Promise.all([
    admin.from('lab_members').select('lab_id').eq('user_id', viewerId).eq('status', 'active'),
    admin.from('lab_members').select('lab_id').eq('user_id', userId).eq('status', 'active'),
  ]);
  const theirLabs = new Set((theirs.data ?? []).map((row) => row.lab_id));
  const sharedId = (mine.data ?? []).map((row) => row.lab_id).find((id) => theirLabs.has(id));
  if (!sharedId) return null;

  let countQuery = admin
    .from('lab_members')
    .select('*', { count: 'exact', head: true })
    .eq('lab_id', sharedId)
    .eq('status', 'active');
  let othersQuery = admin
    .from('lab_members')
    .select('user_id')
    .eq('lab_id', sharedId)
    .eq('status', 'active');
  if (test.list) {
    countQuery = countQuery.not('user_id', 'in', test.list);
    othersQuery = othersQuery.not('user_id', 'in', test.list);
  }

  const [{ data: lab }, { count }, { data: others }] = await Promise.all([
    admin.from('labs').select('name').eq('id', sharedId).maybeSingle(),
    countQuery,
    othersQuery
      // Ordered so the strip shows the same faces on every render — an
      // unordered LIMIT reshuffles per request and reads as a glitch.
      .order('created_at', { ascending: true })
      // Room for the two of them to be filtered back out.
      .limit(MUTUALS_STRIP + 2),
  ]);

  const otherIds = (others ?? [])
    .map((row) => row.user_id)
    .filter((id) => id !== viewerId && id !== userId && !test.ids.has(id))
    .slice(0, MUTUALS_STRIP);
  // The two of them are both active members of the shared Space, so each one
  // the count above still includes (i.e. each who is not a test account) is
  // subtracted — they are not their own mutuals.
  const selves = [viewerId, userId].filter((id) => !test.ids.has(id)).length;
  const profiles =
    otherIds.length > 0
      ? ((
          await admin
            .from('profiles')
            .select('user_id, display_name, handle, avatar_path')
            .in('user_id', otherIds)
        ).data ?? [])
      : [];

  return {
    members: profiles.map((row) => ({
      displayName: row.display_name,
      handle: row.handle,
      avatarUrl: row.avatar_path ? publicMediaUrl(derivedThumbPath(row.avatar_path)) : null,
    })),
    // The two of them are not their own mutuals.
    totalCount: Math.max((count ?? 0) - selves, 0),
    sharedSpaceName: lab?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Suuq listing (§3.9)

/**
 * Rough weight of the hero photo the card defers in Lite. `business_listings`
 * denormalizes the primary photo's PATH but not its bytes (migration
 * 20260706300000), and the only row that carries the real size — media_uploads
 * — is reachable by storage_path alone, which is unindexed. So this is the
 * same order-of-magnitude estimate `listing-card.tsx` uses, one step up for a
 * 16/7 hero rather than a 480px thumb; MediaSlot shows it as "~N KB", and an
 * estimate the viewer can act on beats a query that scans a growing table.
 */
const LISTING_COVER_EST_BYTES = 90_000;

/**
 * The member's business, as the Suuq card needs it (spec §3.9).
 *
 * Read under the CALLER's RLS with an explicit `status = 'published'` filter:
 * the policy already answers published-or-own-or-mod, and the filter is what
 * keeps a moderated listing off a third party's profile even when the viewer
 * happens to be a moderator — this is the member's shop window, not a review
 * queue. The owner sees their own listing through the same gate, which is the
 * honest reading: what is on their profile is what visitors get.
 *
 * ONE listing: the frames draw a single card, and a member who somehow owns
 * two would otherwise turn their profile into a directory page. Oldest first
 * so the choice is stable between reads rather than moving with edits.
 */
async function loadSuuq(
  client: AnyClient,
  userId: string,
  locale: Locale,
): Promise<AnigaView['suuq']> {
  const { data: listing } = await client
    .from('business_listings')
    .select(
      'id, business_name, category_id, city, verification_status, opening_hours, primary_photo_path, primary_photo_blurhash, primary_photo_alt',
    )
    .eq('owner_user_id', userId)
    .eq('status', 'published')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!listing) return null;

  const { data: category } = await client
    .from('listing_categories')
    .select('name_en, name_so')
    .eq('id', listing.category_id)
    .maybeSingle();

  const photoPath = listing.primary_photo_path;
  return {
    listing: {
      id: listing.id,
      businessName: listing.business_name,
      // Same fold lib/categories.ts uses: Somali when we have it, English as
      // the per-row fallback rather than a blank chip.
      categoryName: category
        ? locale === 'so'
          ? (category.name_so ?? category.name_en)
          : category.name_en
        : null,
      city: listing.city,
      // §18: the chip comes from the verification flow's column and nothing
      // else — never from the owner having filled the listing in well.
      verified: listing.verification_status === 'verified',
      photoUrl: photoPath ? publicMediaUrl(photoPath) : null,
      photoThumbUrl: photoPath ? publicMediaUrl(derivedThumbPath(photoPath)) : null,
      photoBlurhash: listing.primary_photo_blurhash,
      photoAlt: listing.primary_photo_alt,
      photoBytes: photoPath ? LISTING_COVER_EST_BYTES : null,
      openingHours: listing.opening_hours,
    },
    // No testimonial store exists in this schema. Null is the whole answer:
    // the module drops the block, which is the required behaviour for a quote
    // whose customer cannot be resolved to a member.
    testimonial: null,
  };
}

// ---------------------------------------------------------------------------
// Metrics (Tirakoobka) + owner-private stats

/**
 * The same three numbers feed both the flag-gated Tirakoobka module and the
 * owner-private block — one loader so they can never disagree, and one place
 * where "Xiriir" is defined (followers, already aggregated by ProfileView, no
 * second round trip — and already without test followers).
 *
 * `asksHelped` leaves out asks posted by quarantined test accounts: help
 * credited by a fake person is not help anyone received.
 */
async function loadMetrics(
  userId: string,
  followers: number,
  test: TestAccounts,
): Promise<AnigaMetrics> {
  const admin = getSupabaseAdmin();
  let asksHelpedQuery = admin
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('ask_helper_user_id', userId)
    .eq('ask_status', 'fulfilled');
  if (test.list) asksHelpedQuery = asksHelpedQuery.not('author_user_id', 'in', test.list);
  const [{ count: posts }, { count: asksHelped }] = await Promise.all([
    admin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_user_id', userId)
      .eq('status', 'published'),
    asksHelpedQuery,
  ]);
  return { posts: posts ?? 0, asksHelped: asksHelped ?? 0, connections: followers };
}

// ---------------------------------------------------------------------------
// Owner facts (Xogta)

/**
 * Lanes, labelled — and the location fold MIRRORED as a visitor experiences it.
 *
 * `getMemberProfileView` deliberately skips `applyLocationGranularity` for the
 * owner, so `base.profile` still carries their real city whatever they chose.
 * That is right for the header (a privacy setting must never hide a member's
 * data from themselves) and wrong for this card: a member who picked `hidden`
 * at onboarding would read their own page forever and never learn that nobody
 * local can find them. So the fold is run here explicitly, on the owner's raw
 * row, and `place` is derived the way the header derives it (city ?? country)
 * — one expression, so the mirror cannot drift from the thing it mirrors.
 *
 * The granularity itself comes from the service role, which is the access path
 * lib/profile-view.ts already established for `user_settings` (own-rows under
 * RLS, but the setting carries no payload of its own).
 *
 * Lanes resolve through `lanes.name_so`/`name_en`: the read path has rendered
 * raw slugs since the label columns landed in 20260718100000.
 */
async function loadOwnerFacts(
  client: AnyClient,
  profile: ProfileView['profile'],
  locale: Locale,
): Promise<AnigaOwnerFacts> {
  const [catalog, granularities] = await Promise.all([
    loadLaneCatalog(client, locale),
    loadLocationGranularities([profile.user_id]),
  ]);
  const granularity = granularities.get(profile.user_id) ?? 'city';
  const folded = applyLocationGranularity(profile, granularity);
  return {
    lanes: resolveLaneLabels(catalog, profile.lanes ?? []),
    // exact/city fold nothing away, so there is nothing to explain — a notice
    // that never changes teaches the owner nothing.
    fold: granularity === 'region' || granularity === 'hidden' ? granularity : null,
    place: folded.location_city ?? folded.location_country ?? null,
  };
}

// ---------------------------------------------------------------------------

/**
 * A quarantined test account's projection: the stripped base
 * (`testAccountProfileView`) and nothing else — no module arrangement, no
 * skills, links, helper history, mutuals, Suuq card, metrics or owner facts.
 * Every consumer renders the test-account notice from `base.isTest`; one that
 * forgot would still have nothing to present as proof.
 */
function testAccountAnigaView(base: ProfileView): AnigaView {
  return {
    base,
    headline: null,
    modules: [],
    showcase: [],
    skills: [],
    links: [],
    lookingFor: { slugs: [], matches: [] },
    helper: [],
    mutuals: null,
    suuq: null,
    metrics: null,
    privateStats: null,
    ownerFacts: null,
  };
}

/**
 * The Aniga projection for one profile, from one viewer's seat.
 *
 * `t` is the request translator. It is optional only so the 3-argument
 * contract call keeps compiling; without it `lookingFor.matches` is empty,
 * because a match with no reason string must never be emitted (§3.4). Server
 * components already hold one — pass it.
 *
 * `locale` is the request locale, and it is here for the ONE value in this
 * projection that is localized by the database rather than the dictionary: the
 * Suuq category name, which lives in `listing_categories.name_so/name_en`.
 * Defaulting to the Somali-first app default keeps the 3- and 4-argument
 * contract calls compiling and correct for the majority locale.
 */
export async function getAnigaView(
  supabase: AnyClient,
  handle: string,
  viewerId: string | null,
  t?: Translator,
  locale: Locale = DEFAULT_LOCALE,
): Promise<AnigaView | null> {
  const [base, flags, test] = await Promise.all([
    getMemberProfileView(supabase, handle, viewerId ?? undefined),
    loadModuleFlags(supabase),
    loadTestAccounts(),
  ]);
  if (!base) return null;
  // A test account's profile — for every viewer, its owner included — is the
  // notice, never a profile. Nothing below is read for it.
  if (base.isTest) return testAccountAnigaView(base);

  const userId = base.profile.user_id;
  const isOwner = viewerId !== null && viewerId === userId;
  // Ruling 7: the owner does not own this decision, so it is read from the
  // platform flag — never inferred from the member's stored module row.
  const metricsVisible = isOwner || flags.profile_metrics_module === true;

  const [
    headlineRow,
    modules,
    showcase,
    skills,
    links,
    matches,
    helper,
    mutuals,
    metrics,
    suuq,
    ownerFacts,
  ] = await Promise.all([
    // headline postdates PROFILE_MEMBER_COLUMNS, so it is the one profile
    // column this projection fetches for itself.
    supabase.from('profiles').select('headline').eq('user_id', userId).maybeSingle(),
    loadModuleStates(supabase, userId, flags),
    loadShowcase(supabase, userId),
    loadSkills(supabase, userId, base.profile.skills ?? [], viewerId, test),
    loadLinks(supabase, userId, base.profile.links, isOwner),
    isOwner ? loadMatches(supabase, base.profile.skills ?? [], t) : Promise.resolve([]),
    loadHelper(supabase, userId, test),
    viewerId !== null && !isOwner ? loadMutuals(viewerId, userId, test) : Promise.resolve(null),
    metricsVisible ? loadMetrics(userId, base.counts.followers, test) : Promise.resolve(null),
    loadSuuq(supabase, userId, locale),
    // Not fetched-then-dropped for visitors: the reads never happen, so the
    // fold state cannot reach a payload it could be un-hidden from.
    isOwner ? loadOwnerFacts(supabase, base.profile, locale) : Promise.resolve(null),
  ]);

  return {
    base,
    headline: headlineRow.data?.headline ?? null,
    modules,
    showcase,
    skills,
    links,
    lookingFor: { slugs: base.openTo, matches },
    helper,
    mutuals,
    suuq,
    metrics,
    // Owner-only, and null for everyone else so no branch downstream can
    // render it by accident. `cachedAt` belongs to the offline shell (a4) —
    // a server render is by definition fresh.
    privateStats: isOwner && metrics ? { ...metrics, cachedAt: null } : null,
    ownerFacts,
  };
}

/**
 * The login-free variant (§28 share pages), for the one viewer `getAnigaView`
 * cannot serve: `profiles_select_authenticated` means an anonymous client can
 * read no profile row at all, so the whole projection has to come from the
 * service role — and the moment it does, RLS stops answering the question
 * "may this visitor see that?" for us.
 *
 * So the rule this function follows is the one `getPublicProfileView` already
 * set for pins: **a module whose contents are member-visible surfaces renders
 * nothing here.** Showcase, helper history and the Suuq card all hydrate other
 * tables' rows through the caller's RLS in the member path; served by the
 * service role they would each be a bypass, so they arrive empty and their
 * modules self-hide. Links follow `PROFILE_PUBLIC_COLUMNS`, which withholds
 * `profiles.links` from logged-out readers on purpose.
 *
 * What DOES cross is aggregate or identity data the public projection already
 * serves through the same service role: the member's declared skills with
 * their endorsement DEPTH (a count of people, never their identities — the
 * same class of aggregate as `counts` and `reputation`, and the evidence the
 * whole surface rests on), their open-to slugs, their headline, and the order
 * they arranged their own page in.
 *
 * A quarantined test account has no login-free projection at all:
 * `getPublicProfileView` already returns null for one (anon 404, brand OG
 * card), and the `isTest` check below keeps that true here even if the base
 * ever changed.
 */
export async function getPublicAnigaView(handle: string): Promise<AnigaView | null> {
  const base = await getPublicProfileView(handle);
  if (!base || base.isTest) return null;

  const admin = getSupabaseAdmin();
  const userId = base.profile.user_id;
  const [flags, headlineRow, test] = await Promise.all([
    loadModuleFlags(admin),
    admin.from('profiles').select('headline').eq('user_id', userId).maybeSingle(),
    loadTestAccounts(),
  ]);
  const [skills, modules] = await Promise.all([
    // viewerId null: nobody is signed in, so no chip can be "already endorsed"
    // and the module's endorse action never renders.
    loadSkills(admin, userId, base.profile.skills ?? [], null, test),
    loadModuleStates(admin, userId, flags),
  ]);

  return {
    base,
    headline: headlineRow.data?.headline ?? null,
    modules,
    showcase: [],
    skills,
    links: [],
    // Matching is an owner-only surface even for signed-in visitors.
    lookingFor: { slugs: base.openTo, matches: [] },
    helper: [],
    // Mutual Spaces need a viewer to be mutual WITH.
    mutuals: null,
    suuq: null,
    // A logged-out visitor is never the owner, so the flag is the only gate —
    // and it is off by default (ruling 7).
    metrics:
      flags.profile_metrics_module === true
        ? await loadMetrics(userId, base.counts.followers, test)
        : null,
    privateStats: null,
    // A logged-out reader is never the owner. `getPublicProfileView` has
    // already folded the location for the header; the mirror has no audience.
    ownerFacts: null,
  };
}
