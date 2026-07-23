-- Public PDF links are synced as lightweight references. No duplicate object is
-- stored in Supabase Storage; only the URL, chapter links and annotations sync.
alter table public.user_pdfs add column if not exists source_url text;
alter table public.user_pdfs alter column storage_path drop not null;

alter table public.user_pdfs drop constraint if exists user_pdfs_has_source;
alter table public.user_pdfs add constraint user_pdfs_has_source check (
  (storage_path is not null and source_url is null) or
  (storage_path is null and source_url is not null)
);

create unique index if not exists user_pdfs_user_source_url_idx
  on public.user_pdfs (user_id, source_url) where source_url is not null;
