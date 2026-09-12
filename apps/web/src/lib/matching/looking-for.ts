import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * "Looking for" matching (§20): Labs actively seeking a skill the member has.
 *
 * A transparent tag-overlap matcher — an EXACT skill match scores 1.0 and the
 * `matchedSkills` list is the "why this appears" explanation shown to the user.
 * (A 0.5 "related skill" weight is part of the locked design but needs a curated
 * skill-relation table that does not exist yet; the scorer is shaped for it, and
 * it is tracked as follow-on work — today only exact overlap contributes.)
 *
 * NON-personalised beyond declared profile fields: it reads only the member's
 * own `skills` and the Labs' open `lab_skill_needs`. No ML, no ranking signals.
 *
 * RLS-scoped: `client` MUST be the member's session client so lab_skill_needs
 * and labs are filtered by can_read_lab — a private Lab never leaks a need.
 *
 * Test-account quarantine (users.is_test, migration 20260912050000): a Space
 * led by a quarantined seeded/test account is never suggested. The test-id
 * list is a payload-free service-role read; the labs query still rides the
 * member's client. Every caller (member Home, GET /api/me/looking-for,
 * suggested-follows) goes through here.
 */

export interface LabMatch {
  labId: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  stage: string;
  /** The member's skills this Lab is seeking — the transparent "why". */
  matchedSkills: string[];
  /** Sum of match weights (exact = 1.0 each). */
  score: number;
}

const EXACT_WEIGHT = 1.0;
const MAX_RESULTS = 6;
const NEED_POOL = 300;

export async function findLabsSeekingSkills(
  client: SupabaseClient<Database>,
  skills: string[],
): Promise<LabMatch[]> {
  const wanted = [...new Set(skills.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const { data: needs } = await client
    .from('lab_skill_needs')
    .select('lab_id, skill')
    .in('skill', wanted)
    .is('filled_at', null)
    .limit(NEED_POOL);
  if (!needs || needs.length === 0) return [];

  // Group matched skills per lab (dedup skills; each exact match adds 1.0).
  const wantedSet = new Set(wanted);
  const skillsByLab = new Map<string, Set<string>>();
  for (const need of needs) {
    if (!wantedSet.has(need.skill)) continue;
    const set = skillsByLab.get(need.lab_id) ?? new Set<string>();
    set.add(need.skill);
    skillsByLab.set(need.lab_id, set);
  }
  if (skillsByLab.size === 0) return [];

  const labIds = [...skillsByLab.keys()];
  // Fail CLOSED without failing the page: this matcher has always degraded to
  // an empty list on a read error, and the member Home / suggested-follows /
  // looking-for callers embed it without a catch. No suggestion is safer than
  // an unchecked one.
  let testIds: string[];
  try {
    testIds = await loadTestAccountIds(getSupabaseAdmin());
  } catch {
    return [];
  }
  let labsQuery = client
    .from('labs')
    .select('id, slug, name, short_description, stage')
    .in('id', labIds);
  if (testIds.length > 0) labsQuery = labsQuery.not('lead_user_id', 'in', postgrestIdList(testIds));
  const { data: labs } = await labsQuery;
  if (!labs) return [];

  const matches: LabMatch[] = labs.map((lab) => {
    const matchedSkills = [...(skillsByLab.get(lab.id) ?? new Set<string>())];
    return {
      labId: lab.id,
      slug: lab.slug,
      name: lab.name,
      shortDescription: lab.short_description,
      stage: lab.stage,
      matchedSkills,
      score: matchedSkills.length * EXACT_WEIGHT,
    };
  });

  return matches.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}
