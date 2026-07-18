-- ============================================================================
-- Tag usage_count — give tags the same count signal skills have, so a tag
-- picker can surface popular tags first (count-guided, anti-fragmentation).
-- ============================================================================

alter table tags
  add column usage_count integer not null default 0
    check (usage_count >= 0);

-- Backfill from the existing post↔tag links.
update tags t
  set usage_count = (select count(*) from post_tags pt where pt.tag_id = t.id);

create index tags_usage_idx on tags (usage_count desc, name);

-- Maintain on link/unlink. SECURITY DEFINER so it can update tags (client-write
-- revoked) on behalf of a member whose post gained/lost a tag.
create or replace function public.tg_tag_usage_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.tags set usage_count = usage_count + 1 where id = new.tag_id;
  elsif tg_op = 'DELETE' then
    update public.tags set usage_count = greatest(0, usage_count - 1) where id = old.tag_id;
  end if;
  return null;
end
$$;

create trigger post_tags_usage_count
  after insert or delete on post_tags
  for each row execute function public.tg_tag_usage_count();
