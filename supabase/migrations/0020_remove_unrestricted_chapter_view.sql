-- Security remediation for projects that already applied migration 0017.
-- Replace the security-definer public view with column-level SELECT + table RLS.

drop view if exists public.published_community_chapters;

revoke all on public.community_chapters from public, anon, authenticated;
grant select (chapter_id, published_content, updated_at)
  on public.community_chapters to anon, authenticated;

alter table public.community_chapters enable row level security;
alter table public.community_chapters force row level security;

drop policy if exists "published chapters or owned submissions are readable"
  on public.community_chapters;
create policy "published chapters or owned submissions are readable"
  on public.community_chapters
  for select
  to anon, authenticated
  using (
    published_content is not null
    or owner_id = (select auth.uid())
    or public.is_admin()
  );

-- Sensitive mutation functions are authenticated-only. Explicit anon revokes
-- make the intended boundary visible during privilege audits.
revoke execute on function public.submit_community_chapter(jsonb) from anon;
revoke execute on function public.review_community_chapter(uuid, text, text) from anon;
revoke execute on function public.get_my_community_submissions() from anon;
revoke execute on function public.get_community_review_queue() from anon;
revoke execute on function public.get_public_chapter_access(text) from anon;
revoke execute on function public.save_public_chapter_edit(text, jsonb, text) from anon;
revoke execute on function public.get_my_edit_suggestions() from anon;
revoke execute on function public.get_edit_suggestion_queue() from anon;
revoke execute on function public.review_edit_suggestion(uuid, text, text) from anon;
revoke execute on function public.validate_chapter_payload(jsonb, text)
  from public, anon, authenticated;

-- SECURITY DEFINER functions use an empty search path and schema-qualified
-- relations, preventing object-shadowing attacks.
alter function public.is_admin() set search_path = '';
alter function public.get_my_community_submissions() set search_path = '';
alter function public.get_community_review_queue() set search_path = '';
alter function public.submit_community_chapter(jsonb) set search_path = '';
alter function public.review_community_chapter(uuid, text, text) set search_path = '';
alter function public.get_public_chapter_access(text) set search_path = '';
alter function public.save_public_chapter_edit(text, jsonb, text) set search_path = '';
alter function public.get_my_edit_suggestions() set search_path = '';
alter function public.get_edit_suggestion_queue() set search_path = '';
alter function public.review_edit_suggestion(uuid, text, text) set search_path = '';

do $$
begin
  if has_table_privilege('anon', 'public.community_chapters', 'INSERT')
     or has_table_privilege('anon', 'public.community_chapters', 'UPDATE')
     or has_table_privilege('anon', 'public.community_chapters', 'DELETE')
     or has_table_privilege('authenticated', 'public.community_chapters', 'INSERT')
     or has_table_privilege('authenticated', 'public.community_chapters', 'UPDATE')
     or has_table_privilege('authenticated', 'public.community_chapters', 'DELETE') then
    raise exception 'Unsafe community_chapters mutation grant detected';
  end if;
end;
$$;
