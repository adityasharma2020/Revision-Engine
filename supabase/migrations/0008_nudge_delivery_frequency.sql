-- Explicit per-user spacing between Memory Nudge deliveries.

alter table public.nudge_preferences
  add column if not exists delivery_interval_minutes integer not null default 240;

alter table public.nudge_preferences
  drop constraint if exists nudge_preferences_delivery_interval_minutes_check;
alter table public.nudge_preferences
  add constraint nudge_preferences_delivery_interval_minutes_check
  check (delivery_interval_minutes between 60 and 10080);

alter table public.nudge_preferences
  drop constraint if exists nudge_preferences_max_per_day_check;
alter table public.nudge_preferences
  add constraint nudge_preferences_max_per_day_check
  check (max_per_day between 1 and 24);
