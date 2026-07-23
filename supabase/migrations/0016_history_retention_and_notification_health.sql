-- Keep recovery useful without turning high-frequency state into an unlimited log.

create or replace function public.archive_user_state_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Double-underscore keys are ephemeral implementation state (timers, device
  -- state, locks, and similar values) and are never useful recovery points.
  if old.key like '\_\_%' escape '\' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Do not archive an update that did not meaningfully change the row.
  if tg_op = 'UPDATE'
    and old.value is not distinct from new.value
    and old.is_deleted is not distinct from new.is_deleted then
    return new;
  end if;

  insert into public.user_state_history (
    user_id, key, value, is_deleted, source_updated_at
  ) values (
    old.user_id, old.key, old.value, old.is_deleted, old.updated_at
  );

  -- Bound every key independently. Ten recent recovery points are enough to
  -- undo accidental changes without allowing a frequently saved key to grow.
  delete from public.user_state_history history
  where history.user_id = old.user_id
    and history.key = old.key
    and (
      history.archived_at < now() - interval '30 days'
      or history.id not in (
        select recent.id
        from public.user_state_history recent
        where recent.user_id = old.user_id and recent.key = old.key
        order by recent.archived_at desc, recent.id desc
        limit 10
      )
    );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Clean up rows accumulated before retention existed.
delete from public.user_state_history where key like '\_\_%' escape '\';

with ranked as (
  select id,
    row_number() over (partition by user_id, key order by archived_at desc, id desc) as position
  from public.user_state_history
)
delete from public.user_state_history history
using ranked
where history.id = ranked.id
  and (ranked.position > 10 or history.archived_at < now() - interval '30 days');

create index if not exists user_state_history_retention_idx
  on public.user_state_history (user_id, key, archived_at desc);

comment on table public.user_state_history is
  'Bounded recovery snapshots: meaningful keys only, at most 10 versions per key and 30 days.';

-- A singleton heartbeat proves that the external Cron job actually invokes the
-- dispatcher. It contains operational metadata only, never user data.
create table if not exists public.notification_dispatch_health (
  id boolean primary key default true check (id),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_delivered_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.notification_dispatch_health enable row level security;
drop policy if exists "notification health is authenticated-readable" on public.notification_dispatch_health;
create policy "notification health is authenticated-readable"
  on public.notification_dispatch_health for select to authenticated using (true);

grant select on public.notification_dispatch_health to authenticated;
grant select, insert, update on public.notification_dispatch_health to service_role;

comment on table public.notification_dispatch_health is
  'Operational heartbeat for dispatch-notifications; one global row and no user data.';
