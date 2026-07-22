-- Soft deletion and append-only change history for user_state.
-- Application-level clears never physically delete synced study data.

alter table public.user_state
  add column if not exists is_deleted boolean not null default false;

create index if not exists user_state_active_idx
  on public.user_state (user_id, key)
  where is_deleted = false;

create table if not exists public.user_state_history (
  id                bigint generated always as identity primary key,
  -- Deliberately no cascading foreign key: retained snapshots must survive
  -- changes to the active/auth rows.
  user_id           uuid not null,
  key               text not null,
  value             jsonb not null,
  is_deleted        boolean not null,
  source_updated_at timestamptz not null,
  archived_at       timestamptz not null default now()
);

alter table public.user_state_history enable row level security;

drop policy if exists "user_state_history is self-readable" on public.user_state_history;
create policy "user_state_history is self-readable"
  on public.user_state_history for select
  using (auth.uid() = user_id);

create or replace function public.archive_user_state_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_state_history (
    user_id,
    key,
    value,
    is_deleted,
    source_updated_at
  ) values (
    old.user_id,
    old.key,
    old.value,
    old.is_deleted,
    old.updated_at
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists user_state_archive_before_change on public.user_state;
create trigger user_state_archive_before_change
  before update or delete on public.user_state
  for each row execute function public.archive_user_state_version();

grant select on public.user_state_history to authenticated;

comment on column public.user_state.is_deleted is
  'Soft-delete marker. The application filters rows where this is true.';
comment on table public.user_state_history is
  'Append-only snapshots retained before every user_state update or deletion.';
