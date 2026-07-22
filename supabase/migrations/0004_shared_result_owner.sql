-- Optional owner identity shown on public quiz-result links.

alter table public.shared_quiz_results
  add column if not exists show_owner boolean not null default true,
  add column if not exists owner_name text,
  add column if not exists owner_avatar_url text;

comment on column public.shared_quiz_results.show_owner is
  'Owner-controlled consent for showing name/avatar on the public result.';
