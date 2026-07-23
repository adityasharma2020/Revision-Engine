-- Motivational reminders are opt-in and belong to one browser/PWA installation.
-- Preferences stay in the existing JSON document so this remains backward-compatible.

alter table public.push_subscriptions
  alter column preferences set default '{
    "enabled": false,
    "dailyRevision": true,
    "weeklySummary": true,
    "milestones": true,
    "memoryNudges": true,
    "motivation": false,
    "motivationTime": "08:00",
    "motivationDays": [0, 1, 2, 3, 4, 5, 6],
    "motivationTone": "mixed",
    "motivationImages": true,
    "dailyReminderTime": "18:00",
    "weeklySummaryDay": 0,
    "weeklySummaryTime": "18:00",
    "timezone": "UTC"
  }'::jsonb;

update public.push_subscriptions
set preferences = jsonb_build_object(
  'motivation', false,
  'motivationTime', '08:00',
  'motivationDays', jsonb_build_array(0, 1, 2, 3, 4, 5, 6),
  'motivationTone', 'mixed',
  'motivationImages', true
) || coalesce(preferences, '{}'::jsonb)
where not (coalesce(preferences, '{}'::jsonb) ?& array[
  'motivation',
  'motivationTime',
  'motivationDays',
  'motivationTone',
  'motivationImages'
]);
