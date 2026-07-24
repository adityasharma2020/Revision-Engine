-- Allow an owner to withdraw a published chapter into their private library.
-- Unowned seed chapters may be claimed privately by an administrator.

alter table public.community_chapters
  drop constraint if exists community_chapters_status_check;
alter table public.community_chapters
  add constraint community_chapters_status_check
  check (status in ('private', 'pending', 'published', 'changes_requested'));

create or replace function public.make_public_chapter_private(
  target_chapter_id text,
  chapter jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_chapters;
  content jsonb;
  existing_private_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to change chapter visibility'; end if;
  perform public.validate_chapter_payload(chapter, target_chapter_id);

  select * into target
  from public.community_chapters
  where chapter_id = target_chapter_id
    and published_content is not null
  limit 1;
  if target.id is null then raise exception 'Public chapter not found'; end if;

  if target.owner_id = auth.uid() then
    null;
  elsif target.owner_id is null and public.is_admin() then
    null;
  else
    raise exception 'Only the chapter owner can make this chapter private';
  end if;

  content := chapter;

  if target.owner_id is null then
    select id into existing_private_id
    from public.community_chapters
    where owner_id = auth.uid()
      and chapter_id = target_chapter_id
      and id <> target.id
    limit 1;
  end if;

  if existing_private_id is not null then
    delete from public.community_chapters where id = existing_private_id;
  end if;

  update public.community_chapters
  set owner_id = coalesce(owner_id, auth.uid()),
      draft_content = content,
      published_content = null,
      status = 'private',
      review_note = null,
      updated_at = now()
  where id = target.id;

  return content;
end;
$$;

revoke all on function public.make_public_chapter_private(text, jsonb) from public, anon;
grant execute on function public.make_public_chapter_private(text, jsonb) to authenticated;
