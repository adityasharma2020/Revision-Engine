-- Give administrators useful uploader provenance without exposing profile data
-- through the community table or to non-admin clients.

drop function if exists public.get_admin_chapter_catalog();

create function public.get_admin_chapter_catalog()
returns table (
  id uuid,
  owner_id uuid,
  chapter_id text,
  draft_content jsonb,
  published_content jsonb,
  status text,
  review_note text,
  submitted_at timestamptz,
  owner_email text,
  owner_display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select
      chapter.id,
      chapter.owner_id,
      chapter.chapter_id,
      chapter.draft_content,
      chapter.published_content,
      chapter.status,
      chapter.review_note,
      chapter.submitted_at,
      owner.email,
      owner.display_name
    from public.community_chapters as chapter
    left join public.profiles as owner on owner.id = chapter.owner_id
    order by chapter.updated_at desc;
end;
$$;

revoke all on function public.get_admin_chapter_catalog() from public, anon;
grant execute on function public.get_admin_chapter_catalog() to authenticated;
