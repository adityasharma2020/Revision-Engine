-- Support several motivational reminder slots per device while preserving an
-- existing single custom time as the first slot.

alter table public.push_subscriptions
  alter column preferences set default '{
    "enabled": false,
    "dailyRevision": true,
    "weeklySummary": true,
    "milestones": true,
    "memoryNudges": true,
    "motivation": false,
    "motivationTimes": ["05:30", "19:00", "22:00"],
    "motivationDays": [0, 1, 2, 3, 4, 5, 6],
    "motivationTone": "mixed",
    "motivationImages": true,
    "dailyReminderTime": "18:00",
    "weeklySummaryDay": 0,
    "weeklySummaryTime": "18:00",
    "timezone": "UTC"
  }'::jsonb;

update public.push_subscriptions
set preferences = jsonb_set(
  coalesce(preferences, '{}'::jsonb) - 'motivationTime',
  '{motivationTimes}',
  case
    when jsonb_typeof(preferences -> 'motivationTimes') = 'array'
      then coalesce(nullif(preferences -> 'motivationTimes', '[]'::jsonb), '["05:30", "19:00", "22:00"]'::jsonb)
    when nullif(preferences ->> 'motivationTime', '') is not null
      and preferences ->> 'motivationTime' <> '08:00'
      then jsonb_build_array(preferences ->> 'motivationTime', '19:00', '22:00')
    else '["05:30", "19:00", "22:00"]'::jsonb
  end,
  true
);
