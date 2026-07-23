-- Notification delivery choices belong to a browser/device subscription.

alter table public.push_subscriptions
  add column if not exists preferences jsonb not null default '{
    "enabled": false,
    "dailyRevision": true,
    "weeklySummary": true,
    "milestones": true,
    "memoryNudges": true,
    "dailyReminderTime": "18:00",
    "weeklySummaryDay": 0,
    "weeklySummaryTime": "18:00",
    "timezone": "UTC"
  }'::jsonb;

-- Preserve the previous account-level choices as each existing device's
-- starting point. From this migration onward devices diverge independently.
update public.push_subscriptions as subscription
set preferences = jsonb_build_object(
  'enabled', true,
  'dailyRevision', true,
  'weeklySummary', true,
  'milestones', true,
  'memoryNudges', true,
  'dailyReminderTime', '18:00',
  'weeklySummaryDay', 0,
  'weeklySummaryTime', '18:00',
  'timezone', 'UTC'
) || coalesce(state.value -> 'notifications', '{}'::jsonb)
from public.user_state as state
where state.user_id = subscription.user_id
  and state.key = 'settings'
  and state.is_deleted = false;

comment on column public.push_subscriptions.preferences is
  'Per-device notification categories, schedule and timezone. Never account-synced.';
