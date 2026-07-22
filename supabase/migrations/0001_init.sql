-- ===========================================================================
-- UPSC Revision Engine — initial schema
--
-- Run this once in your Supabase project (SQL Editor → paste → Run, or
-- `supabase db push`). It creates the per-user data store and locks every row
-- down with Row Level Security so a user can only ever touch their own data.
--
-- Design: all synced user data (bookmarks, notes, tags, progress, quiz results,
-- settings, theme, and uploaded chapters) lives in ONE key/value table,
-- `user_state`, mirroring the app's KeyValueStore seam. This keeps offline-first
-- sync simple and robust (per-key, newest-write-wins) instead of a fragile
-- many-table sync. Static question content is never stored here — it stays in
-- the app's JSON files.
-- ===========================================================================

-- ---- Helper: keep updated_at fresh ----------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- profiles --------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-owned" on public.profiles;
create policy "profiles are self-owned"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- user_state (the synced key/value store) ------------------------------
create table if not exists public.user_state (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_state enable row level security;

drop policy if exists "user_state is self-owned" on public.user_state;
create policy "user_state is self-owned"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_state_set_updated_at on public.user_state;
create trigger user_state_set_updated_at
  before update on public.user_state
  for each row execute function public.set_updated_at();

create index if not exists user_state_user_idx on public.user_state (user_id);
