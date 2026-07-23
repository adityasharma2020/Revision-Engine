-- Private, opt-in PDF storage. Objects are immutable revisions; the row points
-- at the current revision so concurrent devices cannot silently overwrite it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-pdfs', 'user-pdfs', false, 104857600, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 104857600,
  allowed_mime_types = array['application/pdf'];

create table if not exists public.user_pdfs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  storage_path text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  linked_chapter_ids jsonb not null default '[]'::jsonb,
  annotations jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

alter table public.user_pdfs enable row level security;
drop policy if exists "user_pdfs are self-owned" on public.user_pdfs;
create policy "user_pdfs are self-owned" on public.user_pdfs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists user_pdfs_set_updated_at on public.user_pdfs;
create trigger user_pdfs_set_updated_at before update on public.user_pdfs
  for each row execute function public.set_updated_at();
create index if not exists user_pdfs_user_updated_idx on public.user_pdfs (user_id, updated_at desc);
grant all privileges on public.user_pdfs to authenticated;

drop policy if exists "user pdf objects are readable by owner" on storage.objects;
create policy "user pdf objects are readable by owner" on storage.objects for select to authenticated
  using (bucket_id = 'user-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user pdf objects are insertable by owner" on storage.objects;
create policy "user pdf objects are insertable by owner" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user pdf objects are deletable by owner" on storage.objects;
create policy "user pdf objects are deletable by owner" on storage.objects for delete to authenticated
  using (bucket_id = 'user-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.update_user_pdf_annotations(
  p_id uuid, p_expected_revision bigint, p_annotations jsonb,
  p_linked_chapter_ids jsonb default null
) returns public.user_pdfs language plpgsql security invoker as $$
declare result public.user_pdfs;
begin
  update public.user_pdfs set
    annotations = p_annotations,
    linked_chapter_ids = coalesce(p_linked_chapter_ids, linked_chapter_ids),
    revision = revision + 1
  where id = p_id and user_id = auth.uid() and revision = p_expected_revision
  returning * into result;
  if result.id is null then raise exception 'PDF_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  return result;
end;
$$;
grant execute on function public.update_user_pdf_annotations(uuid, bigint, jsonb, jsonb) to authenticated;
