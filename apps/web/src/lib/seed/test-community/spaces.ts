/**
 * Space (Club/Lab) structure for the test community: five spaces exercising
 * every visibility/mode combination, plus the collaboration link and the two
 * venture candidates' lifecycle metadata (copy text lives in content.ts).
 */

export interface SeedSpaceMember {
  handle: string;
  role: 'lead' | 'core' | 'member' | 'observer';
  specialization?: 'operator' | 'researcher' | 'advisor';
  /** Membership state (default 'active'); 'invited'/'requested' exercise the join flows. */
  status?: 'active' | 'invited' | 'requested';
}

export interface SeedSpace {
  slug: string;
  name: string;
  shortDescription: string;
  spaceMode: 'club' | 'lab';
  visibility: 'private' | 'members' | 'public';
  memberListVisibility: 'private' | 'members' | 'public';
  isSupporterOnly: boolean;
  isListed: boolean;
  joinMode: 'open' | 'request' | 'invite';
  stage: 'idea' | 'building' | 'validating' | 'launched';
  leadHandle: string;
  /** Labs need a complete charter; clubs leave these null. */
  charter?: { problemStatement: string; hypothesis: string; successDefinition: string };
  /** Set for spaces that took the Club→Lab promotion path. */
  promotedDaysAgo?: number;
  createdDaysAgo: number;
  /** Overrides last_activity_at (default: creation). Old values test dormancy UX. */
  lastActivityDaysAgo?: number;
  /** Marks the space dormant (28-day sweep state) — the "abandoned" example. */
  dormantSinceDaysAgo?: number;
  members: SeedSpaceMember[];
  skillNeeds: string[];
}

export const SEED_SPACES: SeedSpace[] = [
  {
    slug: 'xawilaad-sandbox',
    name: 'Xawilaad Sandbox',
    shortDescription:
      'Building open payment tooling for xawilaad-style transfers — sandbox first, real rails later. Build-in-public.',
    spaceMode: 'lab',
    visibility: 'public',
    memberListVisibility: 'public',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'request',
    stage: 'building',
    leadHandle: 'ayaan_dev',
    charter: {
      problemStatement:
        'Small xawilaad operators run on paper and trust; there is no affordable, safe way for them to test digital rails without risking real money.',
      hypothesis:
        'A sandboxed transfer API with realistic fees, delays and failure modes will let operators and builders learn digital flows safely before touching production money.',
      successDefinition:
        'Three independent operators complete a full simulated remittance cycle in the sandbox and say they would pilot the real thing.',
    },
    createdDaysAgo: 20,
    members: [
      { handle: 'ayaan_dev', role: 'lead', specialization: 'operator' },
      { handle: 'nasra_sec', role: 'core', specialization: 'researcher' },
      { handle: 'sagal_ux', role: 'core', specialization: 'operator' },
      { handle: 'cawo_cargo', role: 'core', specialization: 'operator' },
      { handle: 'khalid_codes', role: 'member' },
      { handle: 'liibaan_data', role: 'member' },
      { handle: 'daauud_devops', role: 'member' },
      { handle: 'hamdi_agritech', role: 'member' },
      { handle: 'yusuf_xawilaad', role: 'observer', specialization: 'advisor' },
      { handle: 'warshad_ai', role: 'observer' },
    ],
    skillNeeds: ['mobile development', 'accounting'],
  },
  {
    slug: 'beeraha-iyo-biyaha',
    name: 'Beeraha iyo Biyaha',
    shortDescription:
      'Kooxda beeraha iyo biyaha — waraab, abaar-adkaysi, iyo suuqyo. Farmers and water people of the Shabelle and beyond.',
    spaceMode: 'club',
    visibility: 'members',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'open',
    stage: 'idea',
    leadHandle: 'amina_biyo',
    createdDaysAgo: 16,
    members: [
      { handle: 'amina_biyo', role: 'lead' },
      { handle: 'xasan_beero', role: 'member' },
      { handle: 'geedi_xoolo', role: 'member' },
      { handle: 'ubax_beerta', role: 'member' },
      { handle: 'kalluun_kismayo', role: 'member' },
      { handle: 'hamdi_agritech', role: 'core' },
      { handle: 'cali_macalin', role: 'member' },
    ],
    skillNeeds: ['electrical engineering'],
  },
  {
    slug: 'iskaashato-hooyo',
    name: 'Iskaashato Hooyo',
    shortDescription:
      'Iskaashatada haweenka: hagbad, tababar, iyo ganacsi yaryar — hadda si furan ayaanu wax u dhisaynaa. Women’s co-op building in the open.',
    spaceMode: 'lab',
    visibility: 'public',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'request',
    stage: 'validating',
    leadHandle: 'khadra_coop',
    charter: {
      problemStatement:
        'Co-op members sew and bake to a high standard but sell only within one district; middlemen capture the margin.',
      hypothesis:
        'A shared micro-brand with pooled quality control and diaspora mentors will let 40 women sell beyond the district at fair prices.',
      successDefinition:
        'One collective order fulfilled outside Hargeisa with transparent member payouts published to the ledger.',
    },
    promotedDaysAgo: 9,
    createdDaysAgo: 15,
    members: [
      { handle: 'khadra_coop', role: 'lead' },
      { handle: 'fartuun_forsa', role: 'core', specialization: 'advisor' },
      { handle: 'hibo_dhar', role: 'member' },
      { handle: 'sahra_xinne', role: 'member' },
      { handle: 'muna_macaan', role: 'member' },
      { handle: 'luul_dukaan', role: 'member' },
      { handle: 'asli_cijaar', role: 'observer', specialization: 'advisor' },
    ],
    skillNeeds: ['digital marketing'],
  },
  {
    slug: 'barasho-online',
    name: 'Barasho Online',
    shortDescription:
      'Private working group for the Barasho micro-lessons app — curriculum drafts and beta coordination.',
    spaceMode: 'club',
    visibility: 'private',
    memberListVisibility: 'private',
    isSupporterOnly: false,
    isListed: false,
    joinMode: 'invite',
    stage: 'building',
    leadHandle: 'bashiir_baro',
    createdDaysAgo: 12,
    members: [
      { handle: 'bashiir_baro', role: 'lead' },
      { handle: 'cali_macalin', role: 'core', specialization: 'advisor' },
      { handle: 'hafsa_dugsi', role: 'member' },
      { handle: 'zamzam_dugsiga', role: 'member' },
      { handle: 'khalid_codes', role: 'member' },
    ],
    skillNeeds: ['video editing', 'translation'],
  },
  {
    slug: 'golaha-maalgashiga',
    name: 'Golaha Maalgashiga',
    shortDescription:
      'Supporter circle for diaspora and returnee investors: deal notes, diligence habits, no hype. Everything in the space, nothing in DMs.',
    spaceMode: 'club',
    visibility: 'members',
    memberListVisibility: 'members',
    isSupporterOnly: true,
    isListed: true,
    joinMode: 'request',
    stage: 'idea',
    leadHandle: 'abshir_maal',
    createdDaysAgo: 11,
    members: [
      { handle: 'abshir_maal', role: 'lead' },
      { handle: 'deeqa_dirham', role: 'core' },
      { handle: 'ifrah_invest', role: 'core' },
      { handle: 'fartuun_forsa', role: 'member' },
      { handle: 'yusuf_xawilaad', role: 'member' },
    ],
    skillNeeds: [],
  },
];

/**
 * Wave-2 spaces: fill out the 8–15 target with every lifecycle state —
 * launched (Dixon Cup), abandoned/dormant (Suuq Nadiifin), disputed duplicate
 * (Xawilaad Tools, reported), needs-funding (Bajaaj Co-op), needs-volunteers
 * (Caafimaadka Hooyada), multilingual (Af-Soomaali Online), region-relevant
 * (Suuq Nadiifin, Mogadishu-specific), AI-helper contribution (media lab).
 */
export const SEED_SPACES_WAVE2: SeedSpace[] = [
  {
    slug: 'af-soomaali-online',
    name: 'Af-Soomaali Online',
    shortDescription:
      'Barashada af Soomaaliga ee qurbaha — weekly practice circles pairing diaspora learners with native speakers. Bilingual by design.',
    spaceMode: 'club',
    visibility: 'public',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'open',
    stage: 'building',
    leadHandle: 'warda_gabay',
    createdDaysAgo: 14,
    members: [
      { handle: 'warda_gabay', role: 'lead' },
      { handle: 'zakariye_ml', role: 'core' },
      { handle: 'zamzam_dugsiga', role: 'core', specialization: 'advisor' },
      { handle: 'cali_macalin', role: 'member' },
      { handle: 'hafsa_dugsi', role: 'member' },
      { handle: 'safiya_aragto', role: 'member' },
      { handle: 'xaliimo_hooyo', role: 'member', status: 'requested' },
    ],
    skillNeeds: ['translation', 'teaching'],
  },
  {
    slug: 'dixon-cup',
    name: 'Dixon Cup',
    shortDescription:
      'Toronto Somali youth football league — 12 teams, volunteer coaches, one very loud summer. Season one: done and dusted.',
    spaceMode: 'lab',
    visibility: 'public',
    memberListVisibility: 'public',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'request',
    stage: 'launched',
    leadHandle: 'koos_kubad',
    charter: {
      problemStatement:
        'Somali youth in Toronto have talent and energy but no organised, affordable league of their own — pitches, referees and insurance are out of reach for individual families.',
      hypothesis:
        'A volunteer-run league with pooled registration fees and community sponsors can give 12 teams a full season for less than the cost of one commercial camp.',
      successDefinition: 'A completed season: every fixture played, finances published, zero serious incidents.',
    },
    promotedDaysAgo: 10,
    createdDaysAgo: 18,
    members: [
      { handle: 'koos_kubad', role: 'lead' },
      { handle: 'cumar_mod', role: 'core', specialization: 'operator' },
      { handle: 'deeq_organiser', role: 'core', specialization: 'advisor' },
      { handle: 'samatar_sawir', role: 'member' },
      { handle: 'hafsa_dugsi', role: 'observer' },
    ],
    skillNeeds: [],
  },
  {
    slug: 'bajaaj-coop',
    name: 'Bajaaj Co-op Xamar',
    shortDescription:
      'Iskaashato darawallada bajaajta Muqdisho — shared maintenance, fair dispatch, iyo sanduuq caymis wadareed. Raadinaya maalgelin bilow ah.',
    spaceMode: 'club',
    visibility: 'members',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'request',
    stage: 'idea',
    leadHandle: 'faarax_gaadiid',
    createdDaysAgo: 9,
    members: [
      { handle: 'faarax_gaadiid', role: 'lead' },
      { handle: 'saciid_makaanik', role: 'core', specialization: 'operator' },
      { handle: 'cawo_cargo', role: 'member' },
      { handle: 'liibaan_data', role: 'member', status: 'invited' },
    ],
    skillNeeds: ['accounting', 'fundraising'],
  },
  {
    slug: 'warbaahinta-bulshada',
    name: 'Warbaahinta Bulshada',
    shortDescription:
      'Community media lab: a Somali/English podcast telling builder stories from home and diaspora. Episode drafts in the open.',
    spaceMode: 'club',
    visibility: 'public',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'request',
    stage: 'building',
    leadHandle: 'idil_warbaahin',
    createdDaysAgo: 12,
    members: [
      { handle: 'idil_warbaahin', role: 'lead' },
      { handle: 'warda_gabay', role: 'core' },
      { handle: 'samatar_sawir', role: 'core', specialization: 'operator' },
      { handle: 'zakariye_ml', role: 'member' },
      { handle: 'warshad_ai', role: 'observer' },
    ],
    skillNeeds: ['video editing'],
  },
  {
    slug: 'caafimaadka-hooyada',
    name: 'Caafimaadka Hooyada',
    shortDescription:
      'Maternal-health awareness circle: plain-Somali guides, clinic open days, iyo mutadawiciin baahsan. Volunteers urgently wanted.',
    spaceMode: 'club',
    visibility: 'members',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'open',
    stage: 'building',
    leadHandle: 'maryan_kalkaal',
    createdDaysAgo: 11,
    members: [
      { handle: 'maryan_kalkaal', role: 'lead' },
      { handle: 'nimco_caafimaad', role: 'core', specialization: 'operator' },
      { handle: 'cabdi_daawo', role: 'member' },
      { handle: 'xaliimo_hooyo', role: 'member' },
      { handle: 'zamzam_dugsiga', role: 'member' },
      { handle: 'axmed_caafi', role: 'member', status: 'requested' },
    ],
    skillNeeds: ['graphic design', 'translation', 'nursing'],
  },
  {
    slug: 'suuq-nadiifin',
    name: 'Suuq Nadiifin — Bakaaraha',
    shortDescription:
      'Ololaha nadiifinta agagaarka suuqa Bakaaraha (Muqdisho oo keliya) — bilowgii wanaagsanaa, kadibna wuu hakaday. Dib-u-noolayn ma rabtaa?',
    spaceMode: 'club',
    visibility: 'members',
    memberListVisibility: 'members',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'open',
    stage: 'idea',
    leadHandle: 'nuur_samafal',
    createdDaysAgo: 45,
    lastActivityDaysAgo: 32,
    dormantSinceDaysAgo: 4,
    members: [
      { handle: 'nuur_samafal', role: 'lead' },
      { handle: 'saciid_makaanik', role: 'member' },
      { handle: 'qali_qarsoon', role: 'member' },
      { handle: 'deeq_organiser', role: 'observer' },
    ],
    skillNeeds: [],
  },
  {
    slug: 'xawilaad-tools',
    name: 'Xawilaad Tools PRO',
    shortDescription:
      'Building THE tools for xawilaad — APIs, dashboards, everything. Join early, win big. 🚀',
    spaceMode: 'club',
    visibility: 'public',
    memberListVisibility: 'private',
    isSupporterOnly: false,
    isListed: true,
    joinMode: 'open',
    stage: 'idea',
    leadHandle: 'guhaad_ganax',
    createdDaysAgo: 3,
    members: [{ handle: 'guhaad_ganax', role: 'lead' }],
    skillNeeds: [],
  },
];

/** Accepted collaboration: co-op lab ↔ investor circle (cross-post channel). */
export const SEED_COLLABORATION = {
  labASlug: 'iskaashato-hooyo',
  labBSlug: 'golaha-maalgashiga',
  proposedByHandle: 'khadra_coop',
  proposedDaysAgo: 7,
  respondedDaysAgo: 6,
} as const;

/** Candidate lifecycle metadata (copy lives in content.ts). */
export const CANDIDATE_META = {
  /** Submitted 3 days ago → the 7-day Supporter vote window is live. */
  xawilaad: {
    labSlug: 'xawilaad-sandbox',
    createdByHandle: 'ayaan_dev',
    status: 'submitted' as const,
    submittedDaysAgo: 3,
    visibility: 'all_members' as const,
    regionGated: true,
    timelinePublic: true,
    reviews: [
      { reviewerHandle: 'hodan_mod', team: 4, traction: 3, feasibility: 4, notes: 'Clear problem, honest traction. Sandbox-first derisks the pilot.' },
      { reviewerHandle: 'cumar_mod', team: 4, traction: 3, feasibility: 3, notes: 'Team is strong; want to see operator commitments in writing.' },
    ],
    votes: [
      { handle: 'abshir_maal', vote: 'approve' as const },
      { handle: 'ifrah_invest', vote: 'approve' as const },
      { handle: 'fartuun_forsa', vote: 'approve' as const },
      { handle: 'deeqa_dirham', vote: 'approve' as const },
      { handle: 'khadra_coop', vote: 'approve' as const },
      { handle: 'amina_biyo', vote: 'approve' as const },
      { handle: 'bashiir_baro', vote: 'reject' as const },
      { handle: 'deeq_organiser', vote: 'approve' as const },
      { handle: 'maryan_kalkaal', vote: 'approve' as const },
    ],
    helpInterests: ['khalid_codes', 'hamdi_agritech', 'daauud_devops'],
    cosignInterests: ['yusuf_xawilaad', 'cawo_cargo', 'sagal_ux', 'khadra_coop', 'deeq_organiser'],
    /** ifrah passes the SO gate; abshir is denied (US profile country). */
    investGranted: ['ifrah_invest'],
    investDenied: [{ handle: 'abshir_maal', reason: 'country_mismatch', profileCountry: 'US' }],
  },
  /** Draft candidate — visible only to lab members/creator/mods. */
  hooyo: {
    labSlug: 'iskaashato-hooyo',
    createdByHandle: 'khadra_coop',
    status: 'draft' as const,
    visibility: 'all_members' as const,
    regionGated: true,
    timelinePublic: false,
  },
} as const;
