-- ============================================================================
-- Normalize skill_endorsements.skill onto the canonical form used by
-- profiles.skills, so "React" / "react" aggregate and the
-- unique(endorser, endorsee, skill) actually de-dupes case/spacing variants.
-- ============================================================================

-- Backfill: collapse rows that would collide once normalized (keep the
-- earliest), then lowercase/trim the survivors.
delete from skill_endorsements a
using skill_endorsements b
where a.endorser_user_id = b.endorser_user_id
  and a.endorsee_user_id = b.endorsee_user_id
  and btrim(lower(a.skill)) = btrim(lower(b.skill))
  and (a.created_at, a.id) > (b.created_at, b.id);

update skill_endorsements
  set skill = btrim(lower(skill))
  where skill <> btrim(lower(skill));

create or replace function public.tg_normalize_endorsement_skill()
returns trigger
language plpgsql
as $$
begin
  new.skill := btrim(lower(new.skill));
  return new;
end
$$;

create trigger skill_endorsements_normalize
  before insert or update of skill on skill_endorsements
  for each row execute function public.tg_normalize_endorsement_skill();
