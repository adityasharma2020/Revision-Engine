-- Explicit, revocable public snapshots of quiz results.
-- Private user_state remains protected; only purpose-built snapshots are shared.

create table if not exists public.shared_quiz_results (
  id          bigint generated always as identity primary key,
  share_token uuid not null unique default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  result_id   text not null,
  result      jsonb not null,
  questions   jsonb not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

alter table public.shared_quiz_results enable row level security;

drop policy if exists "active quiz shares are publicly readable" on public.shared_quiz_results;
create policy "active quiz shares are publicly readable"
  on public.shared_quiz_results for select
  using (is_active = true or auth.uid() = owner_id);

drop policy if exists "users create their own quiz shares" on public.shared_quiz_results;
create policy "users create their own quiz shares"
  on public.shared_quiz_results for insert
  with check (auth.uid() = owner_id);

drop policy if exists "users update their own quiz shares" on public.shared_quiz_results;
create policy "users update their own quiz shares"
  on public.shared_quiz_results for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists shared_quiz_results_owner_result_idx
  on public.shared_quiz_results (owner_id, result_id, created_at desc);

grant select on public.shared_quiz_results to anon, authenticated;
grant insert, update on public.shared_quiz_results to authenticated;
grant usage, select on sequence public.shared_quiz_results_id_seq to authenticated;

comment on table public.shared_quiz_results is
  'Explicit public quiz snapshots addressed by unguessable tokens. Revocation is soft.';
