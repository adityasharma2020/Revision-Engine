-- Personal, weighted memory nudges with private scheduling and feedback.

create table if not exists public.memory_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'fact' check (kind in ('fact','data','quote','definition','mistake','reminder')),
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 500),
  context text not null default '',
  source text not null default '',
  source_url text not null default '',
  tags text[] not null default '{}',
  priority smallint not null default 3 check (priority between 1 and 5),
  cooldown_hours integer not null default 24 check (cooldown_hours between 1 and 8760),
  active boolean not null default true,
  archived boolean not null default false,
  next_eligible_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0,
  remembered_count integer not null default 0,
  forgotten_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.memory_nudges enable row level security;
create policy "memory nudges are self-owned" on public.memory_nudges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists memory_nudges_eligible_idx on public.memory_nudges (user_id, next_eligible_at)
  where active = true and archived = false;
create trigger memory_nudges_set_updated_at before update on public.memory_nudges
  for each row execute function public.set_updated_at();

create table if not exists public.nudge_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  max_per_day smallint not null default 1 check (max_per_day between 1 and 8),
  delivery_days smallint[] not null default '{0,1,2,3,4,5,6}',
  windows jsonb not null default '[{"start":"09:00","end":"20:00"}]',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  privacy_mode boolean not null default false,
  adaptive_scheduling boolean not null default true,
  minimum_cooldown_hours integer not null default 24,
  default_priority smallint not null default 3,
  avoid_repeats_until_cycle boolean not null default true,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);
alter table public.nudge_preferences enable row level security;
create policy "nudge preferences are self-owned" on public.nudge_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger nudge_preferences_set_updated_at before update on public.nudge_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.nudge_interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  nudge_id uuid not null references public.memory_nudges (id) on delete cascade,
  action text not null check (action in ('delivered','opened','remembered','forgot','snooze','archive')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.nudge_interactions enable row level security;
create policy "nudge interactions are self-owned" on public.nudge_interactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists nudge_interactions_user_date_idx on public.nudge_interactions (user_id, created_at desc);

grant select, insert, update, delete on public.memory_nudges to authenticated;
grant select, insert, update on public.nudge_preferences to authenticated;
grant select, insert on public.nudge_interactions to authenticated;
grant usage, select on sequence public.nudge_interactions_id_seq to authenticated;
