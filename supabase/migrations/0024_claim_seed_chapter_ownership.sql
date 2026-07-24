-- The original bundled chapters were authored and added by the project owner.
-- Keep the attribution portable: fresh databases may apply migrations before
-- the Google account exists, so claim ownership when the matching profile is
-- created as well as backfilling an existing profile now.

alter table public.community_chapters
  add column if not exists original_uploader_email text;

update public.community_chapters
set original_uploader_email = 'aditya15116617@gmail.com'
where chapter_id in ('history-mughals-ch01', 'history-mughal-decline-ch02');

create or replace function public.claim_seed_chapters_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then return new; end if;

  update public.community_chapters as chapter
  set owner_id = new.id,
      updated_at = now()
  where chapter.owner_id is null
    and lower(chapter.original_uploader_email) = lower(new.email)
    and not exists (
      select 1
      from public.community_chapters as owned
      where owned.owner_id = new.id
        and owned.chapter_id = chapter.chapter_id
        and owned.id <> chapter.id
    );

  return new;
end;
$$;

drop trigger if exists profiles_claim_seed_chapters on public.profiles;
create trigger profiles_claim_seed_chapters
  after insert or update of email on public.profiles
  for each row execute function public.claim_seed_chapters_for_profile();

-- Claim immediately when the project owner's profile already exists.
update public.community_chapters as chapter
set owner_id = owner.id,
    updated_at = now()
from public.profiles as owner
where chapter.owner_id is null
  and chapter.original_uploader_email is not null
  and lower(owner.email) = lower(chapter.original_uploader_email)
  and not exists (
    select 1
    from public.community_chapters as owned
    where owned.owner_id = owner.id
      and owned.chapter_id = chapter.chapter_id
      and owned.id <> chapter.id
  );

revoke all on function public.claim_seed_chapters_for_profile() from public, anon, authenticated;
