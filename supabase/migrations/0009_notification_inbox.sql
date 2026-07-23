-- One user-level inbox entry per study notification, independent of device count.

create table if not exists public.notification_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  url text not null default '',
  metadata jsonb not null default '{}',
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, notification_type, dedupe_key)
);

alter table public.notification_inbox enable row level security;
create policy "notification inbox is self-owned" on public.notification_inbox for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists notification_inbox_user_date_idx
  on public.notification_inbox (user_id, delivered_at desc);

grant select, update, delete on public.notification_inbox to authenticated;
grant select, insert, update, delete on public.notification_inbox to service_role;
grant usage, select on sequence public.notification_inbox_id_seq to service_role;
