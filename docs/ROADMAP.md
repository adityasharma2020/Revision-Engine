# Architecture Roadmap — PWA + Supabase + Offline Sync

This is the phased plan for evolving the app from local-first (today) to an
installable, offline-first PWA that syncs user data through Supabase — **no
custom backend**. Each phase ships independently and leaves the app working.

The current codebase was built to make this cheap: user data already flows
through one seam (`StorageService` → `KeyValueStore`) and is loaded reactively by
`UserDataContext`. Swapping in the cloud does **not** touch components.

---

## What needs YOU (I can't do these)

- Create the **Supabase project** and share `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- Configure **Google OAuth** in Supabase Auth (client id/secret, redirect URLs).
- Decide the **hosting** target (GitHub Pages vs Vercel) and, for Pages, the repo name (sets Vite `base`).

Everything else — abstractions, schema, migrations, service worker, sync engine,
UI — I build. Until credentials exist, the Supabase provider ships behind a flag
and the app keeps using the local provider.

---

## Static vs user data (the split, already in place)

| Static (JSON, read-only) | User data (synced) |
| --- | --- |
| subjects, chapters, questions, options, answers, explanations | progress, quiz results, bookmarks, notes, user tags, theme, streaks |
| lives in `public/chapters/**`, indexed by `manifest.json` | lives in `StorageService` today → Supabase next |
| edit file + reload (Vite HMR) | edited in-app, persisted instantly, synced later |

---

## Phases

### Phase 1 — Storage provider abstraction (small refactor, no creds)
- Rename the seam to the PRD's vocabulary: `StorageProvider` interface with
  `loadProgress/saveProgress/loadBookmarks/... /sync()`. (Today's `StorageService`
  is already this; we formalise the interface + add `sync()` as a no-op.)
- Providers: `LocalStorageProvider` (exists as `LocalStorageStore`), stub
  `SupabaseStorageProvider`. Chosen in one factory (`createStorageService`).
- **Ships today, zero UI change.**

### Phase 2 — PWA shell (no creds)
- Add `vite-plugin-pwa` (Workbox): manifest, service worker, installability.
- Precache the app shell; runtime-cache `chapters/*.json` + `manifest.json`
  (stale-while-revalidate) so chapters open offline.
- App icons + splash (maskable), `theme-color`, offline fallback.
- Result: installable on desktop/Android/iPad, works fully offline (local data).

### Phase 3 — Supabase auth (needs creds)
- `AuthService` over Supabase Auth: Google, email/OTP, and **Guest mode**
  (fully local, no account). Auth injected via context, same DI pattern.
- Guest → sign-in flow offers a one-time **merge of local data into the account**.

### Phase 4 — Supabase data + RLS (needs creds)
- Normalised schema (UUIDs, `auth.uid()` RLS on every table):
  `profiles, user_progress, user_answers, bookmarks, review_flags, statistics, notes`.
- SQL migrations committed under `supabase/migrations`; documented in README.
- `SupabaseStorageProvider` implements the interface against these tables.

### Phase 5 — Offline-first sync engine (needs creds)
- `SyncService`: write-through to local + an **outbox queue**; flush when online.
- Conflict rule: **newest `updated_at` wins**, idempotent upserts (no dupes).
- Background sync on reconnect + on visibility change; silent to the user.
- Every mutation already carries `updatedAt` — the model is ready for this.

### Phase 6 — Deploy
- GitHub Pages (or Vercel): CI builds, runs `manifest`, sets Vite `base`, publishes.
- `.env.example` documents every `VITE_*` var; `.env` git-ignored.

---

## Future (designed for, not blocking)

Global search · subject dashboards · flashcards · spaced repetition · weak-topic
detection · daily goals/streaks · PDF viewer · AI revision assistant · import/export ·
multi-language. The service split (`Auth/Storage/Sync/Chapter/Manifest/Statistics/Search`)
and the static/user-data boundary keep each of these additive.

---

## Suggested order to start

Phase 1 + Phase 2 need nothing from you and deliver the biggest visible win
(installable + offline). I recommend doing those next while you set up the
Supabase project in parallel; then Phases 3–5 land once creds exist.

---

## Multi-user + friends uploading their own chapters

Goal: friends (non-coders) sign in, upload their own question JSON, edit and
"restart" it — with **full freedom but zero risk to the shared database or to
each other's data**. Here's how it works.

### Two tiers of chapter content

| Built-in chapters | User-uploaded chapters |
| --- | --- |
| shipped in the repo (`public/chapters`), curated by you | uploaded by each signed-in user |
| identical for everyone, read-only | private to that user (their `owner_id`) |
| not in the database at all | stored in Supabase `user_chapters` (JSONB) |

The library merges both: built-ins + "My uploads". A friend never touches the
built-in files and can't see or edit anyone else's uploads.

### Why the DB can't be corrupted
- **Row Level Security**: every `user_chapters` / user-data row is gated by
  `owner_id = auth.uid()`. A user can only read/write their own rows — enforced
  by Postgres, not the client. One friend cannot alter another's data, the
  built-in content, or the schema.
- **No SQL access**: friends only use the UI. They never run queries.
- **Validated on upload**: the JSON is parsed against the existing chapter
  schema (`parseChapter`) *before* insert — malformed files are rejected with a
  precise error. Stored as JSONB with a size cap and per-user row-count cap.
- **"Restart" is safe**: it only clears that user's progress/answers for that
  chapter (their own rows), never the content.

### How a non-coder actually uses it
1. **Sign in** with Google (one click) or email link. Guest mode stays available
   for offline/no-account use; guest uploads live locally and can be merged on
   sign-in.
2. **Import chapter**: pick a `.json` file or paste JSON. The app validates it,
   shows a preview (title, #prelims, #mains), and saves it. It appears in their
   library instantly.
3. **Edit / manage**: rename, edit tags, delete, or replace by re-uploading.
4. It syncs across their devices (same Supabase account) via the sync engine.

### The honest hard part
Turning a coaching **PDF** into correct JSON is the real barrier for a non-coder
— hand-writing JSON is error-prone. Options, roadmapped:
- ship a **downloadable JSON template** + inline schema help + friendly validation (easy, do first);
- a **guided form builder** (add a question via form fields → app generates valid JSON) so they never see JSON;
- later, an **AI import**: paste raw question text → structured questions auto-extracted, user confirms.

### Buildable now vs needs Supabase
- **Now, no creds**: the whole **Import chapter** flow can ship against the local
  provider — upload → validate → store in browser → merges into the library.
  Same seam that later writes to `user_chapters`. This gives you (and a local
  tester) the feature immediately.
- **Needs Supabase**: accounts, per-user isolation (RLS), cross-device sync,
  sharing between friends.

### Schema addition
```
user_chapters (
  id uuid pk default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  subject text not null,
  title text not null,
  chapter_number int not null,
  content jsonb not null,          -- the validated chapter
  visibility text not null default 'private',  -- future: 'shared'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- RLS: owner_id = auth.uid() for select/insert/update/delete
```

**Recommendation:** build the local **Import chapter** flow next (real, useful,
no creds), then layer Supabase auth + `user_chapters` + sync on top. That way
the feature is usable today and becomes multi-user the moment your project has
credentials.
