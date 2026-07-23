-- Web Push device registrations and idempotent delivery history.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push subscriptions are self-owned" on public.push_subscriptions;
create policy "push subscriptions are self-owned" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
create index if not exists push_subscriptions_active_user_idx
  on public.push_subscriptions (user_id) where disabled_at is null;

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  notification_type text not null,
  dedupe_key text not null,
  delivered_at timestamptz not null default now(),
  unique (user_id, notification_type, dedupe_key, subscription_id)
);

alter table public.notification_deliveries enable row level security;
drop policy if exists "notification deliveries are self-readable" on public.notification_deliveries;
create policy "notification deliveries are self-readable" on public.notification_deliveries
  for select using (auth.uid() = user_id);
create index if not exists notification_deliveries_user_idx
  on public.notification_deliveries (user_id, delivered_at desc);

grant select, insert, update on public.push_subscriptions to authenticated;
grant select on public.notification_deliveries to authenticated;
grant usage, select on sequence public.notification_deliveries_id_seq to authenticated;

comment on table public.push_subscriptions is 'Private per-device Web Push endpoints and encryption keys.';
comment on table public.notification_deliveries is 'Idempotency and audit history for delivered study notifications.';
