/**
 * Social graph for the test community: follows, endorsements, vouches.
 *
 * Deterministic by construction (seeded PRNG, fixed hub lists) so every run of
 * the seeder produces the same graph — re-runs are no-ops thanks to the
 * unique constraints (follows_unique, endorsement/vouch uniques).
 */

import { TEST_PERSONAS, type TestPersona } from './personas';

/** Cluster affinity: who plausibly follows whom without explicit curation. */
const CLUSTERS: Record<string, string[]> = {
  staff: ['warsame_admin', 'hodan_mod', 'cumar_mod', 'leyla_verifier'],
  tech: [
    'ayaan_dev',
    'khalid_codes',
    'nasra_sec',
    'liibaan_data',
    'sagal_ux',
    'daauud_devops',
    'zakariye_ml',
    'faadumo_qa',
    'cawo_cargo',
    'hamdi_agritech',
  ],
  agri: ['xasan_beero', 'amina_biyo', 'geedi_xoolo', 'hamdi_agritech', 'kalluun_kismayo', 'ubax_beerta'],
  coop: ['khadra_coop', 'hibo_dhar', 'sahra_xinne', 'muna_macaan', 'fartuun_forsa', 'luul_dukaan'],
  business: [
    'abshir_maal',
    'deeqa_dirham',
    'yusuf_xawilaad',
    'ifrah_invest',
    'tahliil_textile',
    'asli_cijaar',
    'guuleed_dhismo',
  ],
  health: ['maryan_kalkaal', 'cabdi_daawo', 'nimco_caafimaad', 'axmed_caafi', 'xaliimo_hooyo'],
  education: ['cali_macalin', 'hafsa_dugsi', 'zamzam_dugsiga', 'bashiir_baro', 'khalid_codes'],
  trades: ['saciid_makaanik', 'faarax_gaadiid', 'jamaal_bir', 'cawo_cargo', 'guuleed_dhismo', 'luul_dukaan'],
  culture: ['warda_gabay', 'abwaan_dhool', 'idil_warbaahin', 'samatar_sawir', 'safiya_aragto'],
  civic: ['nuur_samafal', 'deeq_organiser', 'koos_kubad', 'dalmar_dood', 'xaliimo_hooyo'],
};

/** Accounts nearly everyone knows — high follower counts to test popular profiles. */
const HUBS = [
  'ayaan_dev',
  'maryan_kalkaal',
  'khadra_coop',
  'warda_gabay',
  'amina_biyo',
  'deeqa_dirham',
  'idil_warbaahin',
];

/** The dedicated super-follower (lurker persona). */
const SUPER_FOLLOWER = 'safiya_aragto';

/** Tag follows by interest (tag names must exist in content tags). */
export const TAG_FOLLOWS: Record<string, string[]> = {
  fintech: ['ayaan_dev', 'khalid_codes', 'nasra_sec', 'ifrah_invest', 'yusuf_xawilaad', 'safiya_aragto'],
  'agri-food': ['xasan_beero', 'amina_biyo', 'ubax_beerta', 'hamdi_agritech', 'muna_macaan'],
  remittance: ['yusuf_xawilaad', 'abshir_maal', 'ayaan_dev'],
  education: ['cali_macalin', 'hafsa_dugsi', 'bashiir_baro', 'zamzam_dugsiga', 'safiya_aragto'],
  healthtech: ['maryan_kalkaal', 'cabdi_daawo', 'axmed_caafi'],
  community: ['nuur_samafal', 'deeq_organiser', 'hodan_mod', 'safiya_aragto', 'xaliimo_hooyo'],
  'import-export': ['deeqa_dirham', 'tahliil_textile', 'geedi_xoolo', 'cawo_cargo'],
};

/** Skill endorsements: endorser → (endorsee, skill). Skills must be on the endorsee. */
const RAW_ENDORSEMENTS: [endorser: string, endorsee: string, skill: string][] = [
  ['khalid_codes', 'ayaan_dev', 'software development'],
  ['sagal_ux', 'ayaan_dev', 'typescript'],
  ['nasra_sec', 'ayaan_dev', 'node.js'],
  ['cawo_cargo', 'ayaan_dev', 'product management'],
  ['ayaan_dev', 'nasra_sec', 'cybersecurity'],
  ['daauud_devops', 'nasra_sec', 'cybersecurity'],
  ['ayaan_dev', 'sagal_ux', 'ux design'],
  ['khalid_codes', 'sagal_ux', 'ui design'],
  ['xasan_beero', 'amina_biyo', 'agriculture'],
  ['ubax_beerta', 'amina_biyo', 'civil engineering'],
  ['hamdi_agritech', 'amina_biyo', 'project management'],
  ['amina_biyo', 'ubax_beerta', 'agriculture'],
  ['hibo_dhar', 'khadra_coop', 'leadership'],
  ['muna_macaan', 'khadra_coop', 'fundraising'],
  ['fartuun_forsa', 'khadra_coop', 'bookkeeping'],
  ['khadra_coop', 'fartuun_forsa', 'finance'],
  ['asli_cijaar', 'fartuun_forsa', 'consulting'],
  ['xaliimo_hooyo', 'maryan_kalkaal', 'nursing'],
  ['cabdi_daawo', 'maryan_kalkaal', 'teaching'],
  ['zamzam_dugsiga', 'maryan_kalkaal', 'nursing'],
  ['hafsa_dugsi', 'cali_macalin', 'teaching'],
  ['zamzam_dugsiga', 'cali_macalin', 'tutoring'],
  ['ifrah_invest', 'deeqa_dirham', 'logistics'],
  ['tahliil_textile', 'deeqa_dirham', 'business development'],
  ['abshir_maal', 'ifrah_invest', 'finance'],
  ['deeq_organiser', 'koos_kubad', 'leadership'],
  ['cumar_mod', 'koos_kubad', 'fundraising'],
  ['muna_macaan', 'luul_dukaan', 'sales'],
  ['ayaan_dev', 'cawo_cargo', 'logistics'],
];

export const ENDORSEMENTS = RAW_ENDORSEMENTS.filter(([, endorsee, skill]) => {
  const p = TEST_PERSONAS.find((x) => x.handle === endorsee);
  return p ? p.skills.includes(skill) : false;
});

/** Vouches (3+ → community_verified). Vouchers chosen from adjacent clusters. */
export const VOUCHES: Record<string, string[]> = {
  ayaan_dev: ['nasra_sec', 'sagal_ux', 'cawo_cargo', 'yusuf_xawilaad'],
  maryan_kalkaal: ['cabdi_daawo', 'xaliimo_hooyo', 'zamzam_dugsiga', 'hodan_mod'],
  khadra_coop: ['fartuun_forsa', 'hibo_dhar', 'muna_macaan'],
  amina_biyo: ['xasan_beero', 'ubax_beerta', 'hamdi_agritech'],
  nasra_sec: ['ayaan_dev', 'daauud_devops', 'sagal_ux'],
  yusuf_xawilaad: ['abshir_maal', 'deeqa_dirham', 'ayaan_dev'],
  cali_macalin: ['hafsa_dugsi', 'zamzam_dugsiga', 'bashiir_baro'],
  abwaan_dhool: ['warda_gabay', 'nuur_samafal', 'cali_macalin'],
  nuur_samafal: ['xaliimo_hooyo', 'khadra_coop', 'nimco_caafimaad'],
  deeq_organiser: ['cumar_mod', 'luul_dukaan', 'koos_kubad'],
  hodan_mod: ['cumar_mod', 'warsame_admin', 'deeq_organiser'],
  cumar_mod: ['hodan_mod', 'deeq_organiser', 'koos_kubad'],
};

/** Tiny deterministic PRNG (mulberry32) so the graph never shifts between runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the user→user follow edge list (deterministic). */
export function buildFollowEdges(): [follower: string, target: string][] {
  const rand = mulberry32(0x51d195);
  const edges = new Set<string>();
  const add = (a: string, b: string) => {
    if (a !== b) edges.add(`${a}→${b}`);
  };

  const active = TEST_PERSONAS.filter((p) => p.activity !== 'none' && p.accountStatus === 'active');

  // Cluster affinity: follow 2-4 same-cluster members.
  for (const members of Object.values(CLUSTERS)) {
    for (const m of members) {
      const others = members.filter((x) => x !== m);
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n && others.length > 0; i++) {
        add(m, others[Math.floor(rand() * others.length)]!);
      }
    }
  }

  // Hubs: ~70% of active members follow each hub.
  for (const hub of HUBS) {
    for (const p of active) {
      if (p.handle !== hub && rand() < 0.7) add(p.handle, hub);
    }
  }

  // The super-follower follows nearly everyone active.
  for (const p of active) {
    if (p.handle !== SUPER_FOLLOWER && rand() < 0.92) add(SUPER_FOLLOWER, p.handle);
  }

  // Mods keep an eye on the moderation-risk accounts (watch-list realism).
  for (const risky of ['guhaad_ganax', 'xaawo_hadal', 'dalmar_dood']) {
    add('hodan_mod', risky);
    add('cumar_mod', risky);
  }

  return [...edges].map((e) => e.split('→') as [string, string]);
}

/** Lab follows: non-member observers watching the public spaces. */
export const LAB_FOLLOWS: Record<string, string[]> = {
  'xawilaad-sandbox': ['yusuf_xawilaad', 'abshir_maal', 'ifrah_invest', 'safiya_aragto', 'idil_warbaahin', 'dalmar_dood'],
  'iskaashato-hooyo': ['fartuun_forsa', 'asli_cijaar', 'safiya_aragto', 'ifrah_invest', 'zamzam_dugsiga'],
};

/** Candidate follows (watching the venture without joining). */
export const CANDIDATE_FOLLOWS = ['abshir_maal', 'dalmar_dood', 'idil_warbaahin', 'safiya_aragto'];

export type { TestPersona };
