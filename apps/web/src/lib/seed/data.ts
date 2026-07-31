/**
 * Curated launch-density seed dataset (PRD §21/§28).
 *
 * DETERMINISTIC + CURATED (not live-LLM-generated) so the seed is reproducible
 * and safe to re-run. Every item has a stable natural `key` → the registry
 * dedup key, so re-running never duplicates. All content is clearly demo /
 * platform-provided: the `source` flag drives the "Seeded"/"AI-assisted"
 * ContentSourceBadge chip — provenance is a BADGE, never a text label in the
 * name or description (§21 / DESIGN.md §4) — and listings use generic
 * descriptive names (never a real business's identity) per the §18 "no fake
 * real-world claims" rule.
 *
 * Categories reference the 15 seeded `listing_categories` slugs; playbook slugs
 * are chosen NOT to collide with the migration-seeded charter templates.
 */

export const SEED_RUN_LABEL = 'launch-density-v1';

/** Email GoTrue provisions the AI-assistant account under (system mailbox). */
export const AI_ASSISTANT_EMAIL = 'ai-assistant@xidig.app';

/** Approved starter tags (must match the tags_name_format CHECK). */
export const SEED_TAGS = [
  'fintech',
  'logistics',
  'agri-food',
  'e-commerce',
  'import-export',
  'remittance',
  'solar-energy',
  'healthtech',
  'construction',
  'education',
] as const;

export interface SeedPlaybook {
  slug: string;
  name: string;
  ventureType: string;
  template: Record<string, unknown>;
}

/** Additional Lab TEMPLATES (playbooks). Slugs avoid the migration set. */
export const SEED_PLAYBOOKS: SeedPlaybook[] = [
  {
    slug: 'ecommerce-store',
    name: 'E-commerce store',
    ventureType: 'e-commerce',
    template: {
      problem_statement: 'Buyers cannot easily discover and pay for this product online.',
      hypothesis: 'A focused online store with reliable delivery will convert repeat buyers.',
      success_definition: 'A live store with repeat orders and a working fulfilment loop.',
    },
  },
  {
    slug: 'import-export-trade',
    name: 'Import / export trade',
    ventureType: 'import-export',
    template: {
      problem_statement: 'A supply gap exists between two markets that trusted logistics can close.',
      hypothesis: 'A vetted supplier + clear paperwork lets us move goods predictably.',
      success_definition: 'A first completed shipment with documented margins and a repeat buyer.',
    },
  },
  {
    slug: 'agri-food-coop',
    name: 'Agri-food cooperative',
    ventureType: 'agri-food',
    template: {
      problem_statement: 'Smallholder producers lack a shared route to buyers and fair pricing.',
      hypothesis: 'Pooling supply + shared cold storage raises quality and price for members.',
      success_definition: 'An active cooperative with pooled sales and a reinvested surplus.',
    },
  },
];

export interface SeedPost {
  key: string;
  type: 'intro' | 'ask' | 'win' | 'update';
  title: string;
  body: string;
  source: 'seed' | 'ai';
  tags?: string[];
}

/** Starter Plaza posts authored by the AI-assistant account (labelled). */
export const SEED_POSTS: SeedPost[] = [
  {
    key: 'welcome',
    type: 'intro',
    title: 'Welcome to Plaza / Ku soo dhawoow Plaza',
    body: "This is Plaza — where Somali builders share Wins, ask for help, and post updates. This starter post is AI-assisted; real member posts will fill this space. Say salaan and introduce what you're building.",
    source: 'ai',
  },
  {
    key: 'win-fintech-pilot',
    type: 'win',
    title: 'Sample Win: first 100 wallet sign-ups',
    body: 'A demo Win to show the format: a fintech team hit their first 100 wallet sign-ups in Mogadishu this month. Post your own Wins — momentum is contagious.',
    source: 'seed',
    tags: ['fintech', 'remittance'],
  },
  {
    key: 'win-agri-harvest',
    type: 'win',
    title: 'Sample Win: cooperative sold its first pooled harvest',
    body: 'Demo Win: an agri-food cooperative sold its first pooled harvest to a wholesale buyer, sharing the margin across members. Small, visible progress beats vibes.',
    source: 'seed',
    tags: ['agri-food'],
  },
  {
    key: 'ask-logistics',
    type: 'ask',
    title: 'Sample Ask: reliable last-mile delivery in Hargeisa?',
    body: 'Demo Ask: who has run reliable last-mile delivery in Hargeisa? Looking for partners who can handle 20–30 parcels a day. (Asks let you credit the answer that helped.)',
    source: 'seed',
    tags: ['logistics', 'e-commerce'],
  },
  {
    key: 'update-solar',
    type: 'update',
    title: 'Sample Update: solar kiosk pilot, week 2',
    body: 'Demo Update: week 2 of a solar-charging kiosk pilot — 3 sites live, learning about peak-hour demand. Updates keep your Lab’s progress visible to backers.',
    source: 'seed',
    tags: ['solar-energy'],
  },
  // --- Launch-day density manifest additions (docs/seeding.md) -------------
  {
    key: 'ask-education',
    type: 'ask',
    title: 'Sample Ask: teaching programming basics in Somali?',
    body: 'Demo Ask: an after-school coding class wants to teach the basics in Somali. Who has curriculum ideas or a working word list for programming terms? Asks let you credit the answer that helped.',
    source: 'seed',
    tags: ['education'],
  },
  {
    key: 'win-import-export',
    type: 'win',
    title: 'Sample Win: first container cleared customs on the first pass',
    body: 'Demo Win: an import team cleared its first container through the port with complete paperwork on the first pass. Share the boring wins too — they compound.',
    source: 'seed',
    tags: ['import-export', 'logistics'],
  },
  {
    key: 'update-healthtech',
    type: 'update',
    title: 'Sample Update: clinic booking pilot, week 3',
    body: 'Demo Update: a clinic-booking pilot now confirms appointments by SMS and no-shows are down by a third. Small numbers, posted honestly, beat big claims.',
    source: 'seed',
    tags: ['healthtech'],
  },
];

export interface SeedListing {
  key: string;
  businessName: string;
  categorySlug: string;
  city: string;
  country: string;
  shortDescription: string;
  /** Badge driver: ContentSourceBadge renders the "Seeded" chip from the
   *  row's source column — never a "(demo)" suffix in the display name. */
  source: 'seed' | 'ai';
  latitude?: number;
  longitude?: number;
  tags?: string[];
}

/**
 * Starter (UNCLAIMED) directory listings for launch density. Generic
 * descriptive names — not real businesses — so nothing misrepresents a real
 * entity; real owners can claim seeded rows via the §18 claim flow.
 */
export const SEED_LISTINGS: SeedListing[] = [
  {
    key: 'moga-fresh-produce',
    businessName: 'Banadir Fresh Produce',
    categorySlug: 'agriculture',
    city: 'Mogadishu',
    country: 'Somalia',
    shortDescription: 'Fresh produce wholesale and distribution.',
    source: 'seed',
    latitude: 2.0469,
    longitude: 45.3182,
    tags: ['agri-food'],
  },
  {
    key: 'hargeisa-logistics',
    businessName: 'Hargeisa Last-Mile Logistics',
    categorySlug: 'transport-logistics',
    city: 'Hargeisa',
    country: 'Somalia',
    shortDescription: 'Parcel and last-mile delivery across the city.',
    source: 'seed',
    latitude: 9.562,
    longitude: 44.077,
    tags: ['logistics'],
  },
  {
    key: 'moga-fintech-desk',
    businessName: 'Xarunta Fintech',
    categorySlug: 'finance',
    city: 'Mogadishu',
    country: 'Somalia',
    shortDescription: 'Mobile wallet and remittance support desk.',
    source: 'seed',
    tags: ['fintech', 'remittance'],
  },
  {
    key: 'bosaso-import-export',
    businessName: 'Bosaso Trade & Import-Export',
    categorySlug: 'import-export',
    city: 'Bosaso',
    country: 'Somalia',
    shortDescription: 'Import/export brokerage and customs paperwork.',
    source: 'seed',
    tags: ['import-export'],
  },
  {
    key: 'kismayo-solar',
    businessName: 'Kismayo Solar Kiosks',
    categorySlug: 'construction',
    city: 'Kismayo',
    country: 'Somalia',
    shortDescription: 'Solar charging kiosks and small installs.',
    source: 'seed',
    tags: ['solar-energy'],
  },
  {
    key: 'hargeisa-ecommerce',
    businessName: 'Hargeisa Online Bazaar',
    categorySlug: 'retail',
    city: 'Hargeisa',
    country: 'Somalia',
    shortDescription: 'Online storefront for local retailers.',
    source: 'seed',
    tags: ['e-commerce'],
  },
  // --- Launch-day density manifest additions (docs/seeding.md) -------------
  {
    key: 'garowe-tutoring',
    businessName: 'Garowe Tutoring Centre',
    categorySlug: 'education',
    city: 'Garowe',
    country: 'Somalia',
    shortDescription: 'After-school tutoring and exam preparation.',
    source: 'seed',
    tags: ['education'],
  },
  {
    key: 'galkacyo-clinic-supplies',
    businessName: 'Galkacyo Clinic Supplies',
    categorySlug: 'health',
    city: 'Galkacyo',
    country: 'Somalia',
    shortDescription: 'Basic medical supplies for local clinics.',
    source: 'seed',
    tags: ['healthtech'],
  },
  {
    key: 'moga-family-restaurant',
    businessName: 'Banadir Family Restaurant',
    categorySlug: 'restaurant-food',
    city: 'Mogadishu',
    country: 'Somalia',
    shortDescription: 'Family restaurant and event catering.',
    source: 'seed',
  },
  {
    key: 'hargeisa-accounting',
    businessName: 'Hargeisa Accounting Desk',
    categorySlug: 'professional-services',
    city: 'Hargeisa',
    country: 'Somalia',
    shortDescription: 'Bookkeeping and tax paperwork for small businesses.',
    source: 'seed',
  },
];
