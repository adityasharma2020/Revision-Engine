-- Database-first public chapters and reviewable edits from any signed-in user.

alter table public.community_chapters alter column owner_id drop not null;

create table if not exists public.chapter_edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  chapter_record_id uuid not null references public.community_chapters (id) on delete cascade,
  chapter_id text not null,
  proposer_id uuid not null references auth.users (id) on delete cascade,
  proposed_content jsonb not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chapter_suggestions_queue_idx
  on public.chapter_edit_suggestions (status, created_at);
create index if not exists chapter_suggestions_proposer_idx
  on public.chapter_edit_suggestions (proposer_id, created_at desc);

alter table public.chapter_edit_suggestions enable row level security;
revoke all on public.chapter_edit_suggestions from public, anon, authenticated;

create or replace function public.validate_chapter_payload(chapter jsonb, expected_id text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(chapter) <> 'object'
     or nullif(trim(chapter ->> 'id'), '') is null
     or chapter ->> 'id' <> expected_id
     or nullif(trim(chapter ->> 'title'), '') is null
     or nullif(trim(chapter ->> 'subject'), '') is null
     or jsonb_typeof(chapter -> 'prelims') <> 'array'
     or jsonb_typeof(chapter -> 'mains') <> 'array' then
    raise exception 'Invalid chapter structure';
  end if;
end;
$$;

create or replace function public.get_public_chapter_access(target_chapter_id text)
returns table (owner_id uuid, is_owner boolean, admin_access boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.owner_id,
         c.owner_id = auth.uid(),
         public.is_admin()
  from public.community_chapters c
  where c.chapter_id = target_chapter_id
    and c.published_content is not null
  limit 1;
$$;

create or replace function public.save_public_chapter_edit(
  target_chapter_id text,
  chapter jsonb,
  edit_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare target public.community_chapters;
begin
  if auth.uid() is null then raise exception 'Sign in to edit a public chapter'; end if;
  perform public.validate_chapter_payload(chapter, target_chapter_id);

  select * into target
  from public.community_chapters
  where chapter_id = target_chapter_id and published_content is not null
  limit 1;
  if target.id is null then raise exception 'Public chapter not found'; end if;

  if public.is_admin() then
    update public.community_chapters
    set draft_content = chapter,
        published_content = chapter,
        status = 'published',
        review_note = null,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    where id = target.id;
    return 'published';
  elsif target.owner_id = auth.uid() then
    update public.community_chapters
    set draft_content = chapter,
        status = 'pending',
        review_note = null,
        submitted_at = now(),
        updated_at = now()
    where id = target.id;
    return 'pending';
  else
    insert into public.chapter_edit_suggestions (
      chapter_record_id, chapter_id, proposer_id, proposed_content, note
    ) values (
      target.id, target_chapter_id, auth.uid(), chapter, nullif(trim(edit_note), '')
    );
    return 'suggested';
  end if;
end;
$$;

create or replace function public.get_my_edit_suggestions()
returns setof public.chapter_edit_suggestions
language sql
stable
security definer
set search_path = public
as $$
  select * from public.chapter_edit_suggestions
  where proposer_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.get_edit_suggestion_queue()
returns setof public.chapter_edit_suggestions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query select * from public.chapter_edit_suggestions
    where status = 'pending' order by created_at;
end;
$$;

create or replace function public.review_edit_suggestion(
  suggestion_id uuid,
  decision text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare suggestion public.chapter_edit_suggestions;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if decision not in ('accepted', 'rejected') then raise exception 'Invalid decision'; end if;

  select * into suggestion from public.chapter_edit_suggestions where id = suggestion_id;
  if suggestion.id is null then raise exception 'Suggestion not found'; end if;

  if decision = 'accepted' then
    update public.community_chapters
    set published_content = suggestion.proposed_content,
        draft_content = case when status = 'published' then suggestion.proposed_content else draft_content end,
        updated_at = now()
    where id = suggestion.chapter_record_id;
  end if;

  update public.chapter_edit_suggestions
  set status = decision,
      review_note = nullif(trim($3), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = suggestion_id;
end;
$$;

revoke all on function public.get_public_chapter_access(text) from public;
revoke all on function public.save_public_chapter_edit(text, jsonb, text) from public;
revoke all on function public.get_my_edit_suggestions() from public;
revoke all on function public.get_edit_suggestion_queue() from public;
revoke all on function public.review_edit_suggestion(uuid, text, text) from public;
grant execute on function public.get_public_chapter_access(text) to authenticated;
grant execute on function public.save_public_chapter_edit(text, jsonb, text) to authenticated;
grant execute on function public.get_my_edit_suggestions() to authenticated;
grant execute on function public.get_edit_suggestion_queue() to authenticated;
grant execute on function public.review_edit_suggestion(uuid, text, text) to authenticated;
