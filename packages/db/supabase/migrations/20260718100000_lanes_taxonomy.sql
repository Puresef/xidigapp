-- ============================================================================
-- Lanes taxonomy — promote "Lanes" (sectors) from a hardcoded TS enum to a
-- seeded, admin-extensible DB lookup table.
-- ============================================================================
-- "Lanes" (the sectors a member builds in, §20) shipped as a frozen 15-item
-- `const LANES` in apps/web/src/lib/lanes.ts — so the profile picker could never
-- grow without a code deploy, and members hit a wall with no relevant option.
-- This makes Lanes a proper lookup table, mirroring listing_categories /
-- event_categories / open_to_kinds: member-readable, writes revoked (admin/
-- service-role via the API), so ops can add a sector with one INSERT.
--
-- Slugs are the shared taxonomy token (also seeded into `tags`, the listing
-- categories and the playbook venture types) so directory lane filtering matches
-- exactly across surfaces — the reconciliation the lanes.ts header documents.

create table lanes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
                constraint lanes_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
  name_en     text not null,
  name_so     text not null,
  position    integer not null default 0,
  is_active   boolean not null default true,
  -- Provenance parity with tags: 'seed' for the shipped set, 'member' if a
  -- future "suggest a sector" flow lets admins promote a member request.
  source      content_source not null default 'seed',
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index lanes_active_idx on lanes (position) where is_active;

alter table lanes enable row level security;

-- Member-readable catalog (the profile picker + directory filter read it);
-- writes are admin/service-role-only, exactly like the other taxonomies.
create policy lanes_select_authenticated on lanes
  for select to authenticated
  using (true);

revoke insert, update, delete on public.lanes from anon, authenticated;

-- Seed: the shipped 15 (positions 1-15, unchanged slugs) + a grown set covering
-- the sectors members kept bouncing off (livestock/fishing are core to the
-- Somali economy; remittance/hawala is core to the diaspora). name_so is
-- best-effort and flagged for native review (docs/i18n.md convention).
insert into lanes (slug, name_en, name_so, position) values
  ('fintech',               'Fintech',               'Fintech',                 1),
  ('logistics',             'Logistics',             'Saadka',                  2),
  ('import-export',         'Import / Export',       'Dhoofin & Soo-dejin',     3),
  ('agri-food',             'Agri-food',             'Beeraha & Cuntada',       4),
  ('e-commerce',            'E-commerce',            'Ganacsi-koronto',         5),
  ('real-estate',           'Real estate',           'Hantida guryaha',         6),
  ('construction',          'Construction',          'Dhismaha',                7),
  ('education',             'Education',             'Waxbarashada',            8),
  ('health',                'Health',                'Caafimaadka',             9),
  ('media',                 'Media',                 'Warbaahinta',            10),
  ('fashion',               'Fashion',               'Moodada',                11),
  ('travel',                'Travel',                'Safarka',                12),
  ('energy',                'Energy',                'Tamarta',                13),
  ('halal-finance',         'Halal finance',         'Maaliyad xalaal',        14),
  ('diaspora',              'Diaspora',              'Qurbaha',                15),
  ('livestock',             'Livestock',             'Xoolo-dhaqatada',        16),
  ('fishing',               'Fishing',               'Kalluumaysiga',          17),
  ('manufacturing',         'Manufacturing',         'Warshadaha',             18),
  ('hospitality',           'Hospitality',           'Marti-soorka',           19),
  ('transport',             'Transport',             'Gaadiidka',              20),
  ('telecom',               'Telecom',               'Isgaarsiinta',           21),
  ('professional-services', 'Professional services', 'Adeegyo xirfadeed',      22),
  ('creative-arts',         'Creative arts',         'Fanka & Farshaxanka',    23),
  ('nonprofit',             'Nonprofit',             'Samafalka',              24),
  ('public-sector',         'Public sector',         'Qaybta dawladda',        25),
  ('retail',                'Retail',                'Tafaariiqda',            26),
  ('remittance',            'Remittance',            'Xawaalada',              27);

-- NOTE: lane slugs deliberately overlap the shared taxonomy tokens (tags,
-- listing categories, playbook venture types) where they already do, but we do
-- NOT auto-expand the `tags` vocabulary from here — post tagging is a separate
-- surface with its own curated seed, and the directory's lane filter matches on
-- profiles.lanes directly, not through tags.
