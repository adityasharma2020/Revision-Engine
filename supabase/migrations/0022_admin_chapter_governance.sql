-- Complete admin governance for submitted and platform-managed chapters.
-- Never-submitted private uploads remain in user_state and are not exposed.

alter table public.community_chapters
  drop constraint if exists community_chapters_status_check;
alter table public.community_chapters
  add constraint community_chapters_status_check
  check (status in (
    'private', 'pending', 'published', 'changes_requested', 'unpublished', 'archived'
  ));

alter table public.chapter_edit_suggestions
  add column if not exists base_content jsonb;

create or replace function public.validate_chapter_payload(chapter jsonb, expected_id text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  question jsonb;
  option_item jsonb;
  question_id text;
  answer_id text;
  question_ids text[] := array[]::text[];
  answer_found boolean;
begin
  if jsonb_typeof(chapter) <> 'object'
     or chapter ->> 'id' <> expected_id
     or nullif(trim(chapter ->> 'id'), '') is null
     or nullif(trim(chapter ->> 'title'), '') is null
     or length(chapter ->> 'title') > 300
     or nullif(trim(chapter ->> 'subject'), '') is null
     or length(chapter ->> 'subject') > 120
     or jsonb_typeof(chapter -> 'chapterNumber') <> 'number'
     or jsonb_typeof(chapter -> 'prelims') <> 'array'
     or jsonb_typeof(chapter -> 'mains') <> 'array' then
    raise exception 'Invalid chapter structure';
  end if;
  if pg_column_size(chapter) > 5242880 then
    raise exception 'Chapter JSON exceeds the 5 MB limit';
  end if;
  if jsonb_array_length(chapter -> 'prelims') > 2000
     or jsonb_array_length(chapter -> 'mains') > 2000 then
    raise exception 'Chapter contains too many questions';
  end if;

  for question in select value from jsonb_array_elements(chapter -> 'prelims') loop
    question_id := nullif(trim(question ->> 'id'), '');
    answer_id := nullif(trim(question ->> 'answer'), '');
    if jsonb_typeof(question) <> 'object'
       or question_id is null
       or question_id = any(question_ids)
       or nullif(trim(question ->> 'statement'), '') is null
       or jsonb_typeof(question -> 'options') <> 'array'
       or jsonb_array_length(question -> 'options') < 2
       or answer_id is null then
      raise exception 'Invalid or duplicate prelims question';
    end if;
    answer_found := false;
    for option_item in select value from jsonb_array_elements(question -> 'options') loop
      if nullif(trim(option_item ->> 'id'), '') is null
         or nullif(trim(option_item ->> 'text'), '') is null then
        raise exception 'Invalid prelims option';
      end if;
      if option_item ->> 'id' = answer_id then answer_found := true; end if;
    end loop;
    if not answer_found then raise exception 'Prelims answer does not match an option'; end if;
    question_ids := array_append(question_ids, question_id);
  end loop;

  for question in select value from jsonb_array_elements(chapter -> 'mains') loop
    question_id := nullif(trim(question ->> 'id'), '');
    if jsonb_typeof(question) <> 'object'
       or question_id is null
       or question_id = any(question_ids)
       or nullif(trim(question ->> 'question'), '') is null then
      raise exception 'Invalid or duplicate mains question';
    end if;
    question_ids := array_append(question_ids, question_id);
  end loop;
end;
$$;

create table if not exists public.chapter_admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  chapter_record_id uuid,
  chapter_id text not null,
  action text not null check (action in (
    'publish', 'unpublish', 'archive', 'edit_draft', 'edit_and_publish',
    'request_changes', 'accept_suggestion', 'reject_suggestion'
  )),
  previous_status text,
  next_status text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.chapter_admin_audit enable row level security;
revoke all on public.chapter_admin_audit from public, anon, authenticated;
create index if not exists chapter_admin_audit_chapter_idx
  on public.chapter_admin_audit (chapter_id, created_at desc);

create or replace function public.submit_community_chapter(chapter jsonb)
returns public.community_chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.community_chapters;
  requested_id text := nullif(trim(chapter ->> 'id'), '');
begin
  if auth.uid() is null then raise exception 'Sign in to submit a chapter'; end if;
  if requested_id is null then raise exception 'Chapter id is required'; end if;
  perform public.validate_chapter_payload(chapter, requested_id);
  if exists (
    select 1 from public.community_chapters
    where chapter_id = requested_id
      and published_content is not null
      and owner_id is distinct from auth.uid()
  ) then
    raise exception 'This chapter id is already public. Open that chapter and use Suggest Edit.';
  end if;
  if exists (
    select 1 from public.community_chapters
    where owner_id = auth.uid() and chapter_id = requested_id and status = 'archived'
  ) then
    raise exception 'This chapter was archived by an administrator. Contact support before resubmitting it.';
  end if;

  insert into public.community_chapters (
    owner_id, chapter_id, draft_content, status, submitted_at, review_note
  ) values (
    auth.uid(), requested_id, chapter, 'pending', now(), null
  )
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
set search_path = ''
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
  where id = submission_id and status = 'pending'
  returning * into result;
  if result.id is null then
    raise exception 'This submission is no longer pending. Refresh the review queue.';
  end if;
  return result;
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
set search_path = ''
as $$
declare
  suggestion public.chapter_edit_suggestions;
  target_status text;
  target_content jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if decision not in ('accepted', 'rejected') then raise exception 'Invalid decision'; end if;
  select * into suggestion
  from public.chapter_edit_suggestions
  where id = suggestion_id and status = 'pending'
  for update;
  if suggestion.id is null then
    raise exception 'This suggestion is no longer pending. Refresh the review queue.';
  end if;

  if decision = 'accepted' then
    select status, published_content into target_status, target_content
    from public.community_chapters
    where id = suggestion.chapter_record_id
    for update;
    if target_status <> 'published' then
      raise exception 'The chapter is no longer public. Publish it before accepting suggestions.';
    end if;
    if suggestion.base_content is not null
       and suggestion.base_content is distinct from target_content then
      raise exception 'The public chapter changed after this suggestion was submitted. Review and resubmit the correction against the latest version.';
    end if;
    update public.community_chapters
    set published_content = suggestion.proposed_content,
        draft_content = suggestion.proposed_content,
        status = 'published',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
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

create or replace function public.save_public_chapter_edit(
  target_chapter_id text,
  chapter jsonb,
  edit_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare target public.community_chapters;
begin
  if auth.uid() is null then raise exception 'Sign in to edit a public chapter'; end if;
  perform public.validate_chapter_payload(chapter, target_chapter_id);
  select * into target
  from public.community_chapters
  where chapter_id = target_chapter_id
    and status = 'published'
    and published_content is not null
  limit 1
  for update;
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
      chapter_record_id, chapter_id, proposer_id,
      proposed_content, base_content, note
    ) values (
      target.id, target_chapter_id, auth.uid(),
      chapter, target.published_content, nullif(trim(edit_note), '')
    );
    return 'suggested';
  end if;
end;
$$;

create or replace function public.get_admin_chapter_catalog()
returns setof public.community_chapters
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select * from public.community_chapters
    order by updated_at desc;
end;
$$;

create or replace function public.admin_set_chapter_state(
  p_record_id uuid,
  p_action text,
  p_note text default null
)
returns public.community_chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.community_chapters;
  result public.community_chapters;
  next_state text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_action not in ('publish', 'unpublish', 'archive') then
    raise exception 'Invalid chapter action';
  end if;

  select * into before_row from public.community_chapters where id = p_record_id for update;
  if before_row.id is null then raise exception 'Chapter not found'; end if;

  if p_action = 'publish'
     and before_row.status = 'private'
     and before_row.owner_id is distinct from auth.uid() then
    raise exception 'A private owner chapter must be submitted before publishing';
  end if;

  next_state := case p_action
    when 'publish' then 'published'
    when 'unpublish' then 'unpublished'
    else 'archived'
  end;

  update public.community_chapters
  set published_content = case when p_action = 'publish' then draft_content else null end,
      status = next_state,
      review_note = nullif(trim(p_note), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_record_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_update_chapter(
  p_record_id uuid,
  p_chapter jsonb,
  p_publish boolean,
  p_note text default null
)
returns public.community_chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.community_chapters;
  result public.community_chapters;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into before_row from public.community_chapters where id = p_record_id for update;
  if before_row.id is null then raise exception 'Chapter not found'; end if;
  perform public.validate_chapter_payload(p_chapter, before_row.chapter_id);
  if p_publish
     and before_row.status = 'private'
     and before_row.owner_id is distinct from auth.uid() then
    raise exception 'A private owner chapter must be submitted before publishing';
  end if;

  update public.community_chapters
  set draft_content = p_chapter,
      published_content = case when p_publish then p_chapter else published_content end,
      status = case when p_publish then 'published' else status end,
      review_note = nullif(trim(p_note), ''),
      reviewed_at = case when p_publish then now() else reviewed_at end,
      reviewed_by = case when p_publish then auth.uid() else reviewed_by end,
      updated_at = now()
  where id = p_record_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.audit_admin_chapter_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare action_name text;
begin
  if not public.is_admin() then return new; end if;
  action_name := case
    when new.status = 'archived' and old.status <> 'archived' then 'archive'
    when old.published_content is not null and new.published_content is null then 'unpublish'
    when new.status = 'changes_requested' and old.status <> 'changes_requested' then 'request_changes'
    when old.published_content is null and new.published_content is not null then 'publish'
    when new.published_content is distinct from old.published_content then 'edit_and_publish'
    else 'edit_draft'
  end;
  insert into public.chapter_admin_audit (
    actor_id, chapter_record_id, chapter_id, action,
    previous_status, next_status, note
  ) values (
    auth.uid(), new.id, new.chapter_id, action_name,
    old.status, new.status, new.review_note
  );
  return new;
end;
$$;

drop trigger if exists community_chapters_admin_audit on public.community_chapters;
create trigger community_chapters_admin_audit
  after update on public.community_chapters
  for each row execute function public.audit_admin_chapter_change();

create or replace function public.audit_admin_suggestion_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or old.status = new.status then return new; end if;
  if new.status not in ('accepted', 'rejected') then return new; end if;
  insert into public.chapter_admin_audit (
    actor_id, chapter_record_id, chapter_id, action,
    previous_status, next_status, note
  ) values (
    auth.uid(), new.chapter_record_id, new.chapter_id,
    case when new.status = 'accepted' then 'accept_suggestion' else 'reject_suggestion' end,
    old.status, new.status, new.review_note
  );
  return new;
end;
$$;

drop trigger if exists chapter_suggestions_admin_audit on public.chapter_edit_suggestions;
create trigger chapter_suggestions_admin_audit
  after update on public.chapter_edit_suggestions
  for each row execute function public.audit_admin_suggestion_change();

create or replace function public.get_admin_chapter_audit(p_limit integer default 100)
returns setof public.chapter_admin_audit
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select * from public.chapter_admin_audit
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.get_admin_chapter_catalog() from public, anon;
revoke all on function public.admin_set_chapter_state(uuid, text, text) from public, anon;
revoke all on function public.admin_update_chapter(uuid, jsonb, boolean, text) from public, anon;
revoke all on function public.audit_admin_chapter_change() from public, anon, authenticated;
revoke all on function public.audit_admin_suggestion_change() from public, anon, authenticated;
revoke all on function public.get_admin_chapter_audit(integer) from public, anon;
grant execute on function public.get_admin_chapter_catalog() to authenticated;
grant execute on function public.admin_set_chapter_state(uuid, text, text) to authenticated;
grant execute on function public.admin_update_chapter(uuid, jsonb, boolean, text) to authenticated;
grant execute on function public.get_admin_chapter_audit(integer) to authenticated;
