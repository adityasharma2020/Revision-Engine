-- Give every browser/PWA installation a stable cloud identity. Preferences
-- remain JSON because they evolve together, while each device gets its own row
-- so concurrent updates cannot overwrite another device.

alter table public.push_subscriptions
  add column if not exists device_key text,
  add column if not exists device_name text,
  add column if not exists platform text,
  add column if not exists last_seen_at timestamptz not null default now();

update public.push_subscriptions
set device_key = id::text
where device_key is null;

alter table public.push_subscriptions
  alter column device_key set default gen_random_uuid()::text,
  alter column device_key set not null;

create unique index if not exists push_subscriptions_user_device_idx
  on public.push_subscriptions (user_id, device_key);

create index if not exists push_subscriptions_active_device_idx
  on public.push_subscriptions (user_id, last_seen_at desc)
  where disabled_at is null;

comment on column public.push_subscriptions.device_key is
  'Stable random identifier for one browser or installed PWA; never shared between devices.';
comment on column public.push_subscriptions.device_name is
  'Human-readable browser/device label for device management UI.';
comment on column public.push_subscriptions.last_seen_at is
  'Last time this installation reconciled its push subscription and preferences.';
