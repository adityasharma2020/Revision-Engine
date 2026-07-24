-- Community chapter publishing: private author drafts, admin-reviewed public copies.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create table if not exists public.community_chapters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  chapter_id text not null,
  draft_content jsonb not null,
  published_content jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'changes_requested')),
  review_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, chapter_id)
);

create unique index if not exists community_published_chapter_id_idx
  on public.community_chapters (chapter_id)
  where published_content is not null;
create index if not exists community_owner_idx on public.community_chapters (owner_id);
create index if not exists community_status_idx on public.community_chapters (status, submitted_at);

alter table public.community_chapters enable row level security;

drop policy if exists "published chapters or owned submissions are readable" on public.community_chapters;
create policy "published chapters or owned submissions are readable"
  on public.community_chapters for select
  using (published_content is not null or owner_id = auth.uid() or public.is_admin());

-- Writes go through narrow security-definer functions so authors cannot publish
-- themselves or change ownership/review fields.
revoke all on public.community_chapters from public, anon, authenticated;
-- Public clients may read only these three columns. RLS below limits them to
-- rows that have an approved published_content value. No role receives table
-- INSERT, UPDATE, or DELETE privileges.
grant select (chapter_id, published_content, updated_at)
  on public.community_chapters to anon, authenticated;

create or replace function public.get_my_community_submissions()
returns setof public.community_chapters
language sql
stable
security definer
set search_path = public
as $$
  select * from public.community_chapters
  where owner_id = auth.uid()
  order by submitted_at desc;
$$;

create or replace function public.get_community_review_queue()
returns setof public.community_chapters
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select * from public.community_chapters
    where status = 'pending'
    order by submitted_at;
end;
$$;

create or replace function public.submit_community_chapter(chapter jsonb)
returns public.community_chapters
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_chapters;
  requested_id text := nullif(trim(chapter ->> 'id'), '');
begin
  if auth.uid() is null then raise exception 'Sign in to submit a chapter'; end if;
  if requested_id is null then raise exception 'Chapter id is required'; end if;
  if jsonb_typeof(chapter) <> 'object'
     or jsonb_typeof(chapter -> 'prelims') <> 'array'
     or jsonb_typeof(chapter -> 'mains') <> 'array'
     or nullif(trim(chapter ->> 'title'), '') is null
     or nullif(trim(chapter ->> 'subject'), '') is null then
    raise exception 'Invalid chapter structure';
  end if;

  insert into public.community_chapters (owner_id, chapter_id, draft_content, status, submitted_at, review_note)
  values (auth.uid(), requested_id, chapter, 'pending', now(), null)
  on conflict (owner_id, chapter_id) do update
    set draft_content = excluded.draft_content,
        status = 'pending',
        submitted_at = now(),
        review_note = null,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.review_community_chapter(
  submission_id uuid,
  decision text,
  note text default null
)
returns public.community_chapters
language plpgsql
security definer
set search_path = public
as $$
declare result public.community_chapters;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if decision not in ('published', 'changes_requested') then
    raise exception 'Invalid review decision';
  end if;

  update public.community_chapters
  set status = decision,
      published_content = case when decision = 'published' then draft_content else published_content end,
      review_note = nullif(trim($3), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = submission_id
  returning * into result;
  if result.id is null then raise exception 'Submission not found'; end if;
  return result;
end;
$$;

revoke all on function public.submit_community_chapter(jsonb) from public;
revoke all on function public.review_community_chapter(uuid, text, text) from public;
revoke all on function public.get_my_community_submissions() from public;
revoke all on function public.get_community_review_queue() from public;
grant execute on function public.submit_community_chapter(jsonb) to authenticated;
grant execute on function public.review_community_chapter(uuid, text, text) to authenticated;
grant execute on function public.get_my_community_submissions() to authenticated;
grant execute on function public.get_community_review_queue() to authenticated;
