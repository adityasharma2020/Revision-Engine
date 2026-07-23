-- Edge Functions use the service_role Postgres role. RLS bypass does not
-- replace ordinary table/sequence privileges, so grant them explicitly.

grant select on public.user_state to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.notification_deliveries to service_role;
grant usage, select on sequence public.notification_deliveries_id_seq to service_role;

grant select, insert, update, delete on public.memory_nudges to service_role;
grant select, insert, update, delete on public.nudge_preferences to service_role;
grant select, insert, update, delete on public.nudge_interactions to service_role;
grant usage, select on sequence public.nudge_interactions_id_seq to service_role;
