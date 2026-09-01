-- ============================================================================
-- Normalize lab_skill_needs.skill onto the canonical skill-token form.
--
-- There is ONE skill vocabulary shared by profiles.skills, skill_endorsements,
-- the skills popularity table — all btrim(lower()) canonical since migrations
-- 20260718200000/20260718300000 — and lab_skill_needs, which was left raw.
-- Because the "looking for" matcher joins member tokens against this column
-- with case-sensitive equality, a need entered as "React" or "Graphic Design"
-- could NEVER match any member: suggested-follows Lab matches silently missed
-- and the 7-day skills-gap alert fired on tokens no member can satisfy.
-- Same fix shape as 20260718300000 (endorsements): backfill, then trigger.
-- ============================================================================

-- Backfill: collapse OPEN needs that would collide once normalized (keep the
-- earliest — the open-need unique index is partial on filled_at is null), then
-- lowercase/trim every surviving row. Before deleting, propagate any
-- alerted_at stamp to the survivor so the 7-day skills-gap sweep does not
-- re-fire for a need that already alerted under a case-variant spelling.
update lab_skill_needs a
set alerted_at = d.alerted_at
from lab_skill_needs d
where a.lab_id = d.lab_id
  and a.filled_at is null
  and d.filled_at is null
  and a.alerted_at is null
  and d.alerted_at is not null
  and btrim(lower(a.skill)) = btrim(lower(d.skill))
  and (a.created_at, a.id) < (d.created_at, d.id);

delete from lab_skill_needs a
using lab_skill_needs b
where a.lab_id = b.lab_id
  and a.filled_at is null
  and b.filled_at is null
  and btrim(lower(a.skill)) = btrim(lower(b.skill))
  and (a.created_at, a.id) > (b.created_at, b.id);

update lab_skill_needs
  set skill = btrim(lower(skill))
  where skill <> btrim(lower(skill));

create or replace function public.tg_normalize_lab_skill_need()
returns trigger
language plpgsql
as $$
begin
  new.skill := btrim(lower(new.skill));
  return new;
end
$$;

create trigger lab_skill_needs_normalize
  before insert or update of skill on lab_skill_needs
  for each row execute function public.tg_normalize_lab_skill_need();
