# UPSC Revision Engine

A calm, offline-first **personal revision system** for UPSC CSE preparation.
Not a quiz app — a long-term knowledge companion built to be used every day for
years. Chapter content lives entirely in JSON; the UI is generic and never
hard-codes a subject or chapter.

Built with **React 19 · Vite · TypeScript · React Router · CSS Modules · React
Context**. No UI framework, no Redux — everything is designed from scratch.

---

## Quick start

```bash
npm install
npm run dev        # regenerates the chapter manifest, then starts Vite
```

| Script            | What it does                                             |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Generate manifest → start dev server                     |
| `npm run build`   | Generate manifest → typecheck → production build         |
| `npm run manifest`| Rebuild `public/chapters/manifest.json` on its own       |
| `npm run typecheck`| Type-only check                                         |
| `npm run lint`    | oxlint                                                    |

### Release version

The version shown at the bottom of the sidebar comes from `package.json` and is
embedded automatically during development and production builds. Use one of
these commands before deploying a release:

```bash
npm run version:patch  # bug fix:       1.2.3 → 1.2.4
npm run version:minor  # new features:  1.2.3 → 1.3.0
npm run version:major  # breaking work: 1.2.3 → 2.0.0
```

Commit both `package.json` and `package-lock.json` after changing the version.

---

## Adding a chapter (no code changes)

1. Drop a JSON file into [`public/chapters/`](public/chapters) — e.g.
   `geography_ch03.json`.
2. That's it. The manifest is regenerated automatically on the next
   `dev`/`build`, and the chapter appears in the library.

### Chapter JSON schema

The full contract lives in [`src/types/domain.ts`](src/types/domain.ts) and is
validated at load time — malformed files fail loudly with the exact JSON path.

```jsonc
{
  "id": "history-ch01",        // globally unique, stable
  "subject": "History",         // any string; drives grouping + colour
  "chapterNumber": 1,
  "title": "Sources of Ancient Indian History",
  "source": "Coaching Notes",   // optional
  "description": "…",           // optional
  "tags": ["ancient-india"],    // optional

  "prelims": [
    {
      "id": "hist-c1-p1",       // unique within the chapter
      "statement": "…",
      "options": [
        { "id": "a", "text": "…" },
        { "id": "b", "text": "…" }
      ],
      "answer": "a",             // must match an option id
      "explanation": "…",       // optional
      "difficulty": "easy",     // optional: easy | medium | hard
      "tags": ["…"],            // optional
      "year": 2021               // optional (PYQ)
    }
  ],

  "mains": [
    {
      "id": "hist-c1-m1",
      "question": "…",
      "keyPoints": ["…"],       // optional — the revision skeleton
      "modelAnswer": "…",       // optional
      "explanation": "…",       // optional
      "wordLimit": 150,          // optional
      "marks": 10,               // optional
      "difficulty": "medium",   // optional
      "year": 2019               // optional
    }
  ]
}
```

Both `prelims` and `mains` are optional arrays — a chapter can contain only one
type.

---

## Architecture

```
src/
  components/        UI only, one responsibility each
    common/          Button, Badge, Icon, Tabs, Spinner, EmptyState,
                     AsyncBoundary, ErrorBoundary, ThemeToggle
    layout/          AppShell, Sidebar, Page, PageHeader
    dashboard/       ChapterCard, SubjectSection
    quiz/            PrelimsCard, MainsCard
  context/           ServicesContext (DI), ThemeContext
  hooks/             useAsync, useChapters
  services/
    storage/         KeyValueStore + LocalStorageStore + StorageService
    parser/          ChapterService + schema validation
  types/             domain / progress / theme models (source of truth)
  utils/             theme, chapters, cx
  constants/         routes, navigation, subjects, app
  pages/             Dashboard, Chapter, Statistics, Bookmarks, Settings
  styles/            tokens.css (design tokens), reset.css, global.css
public/
  chapters/          *.json + generated manifest.json
scripts/
  generate-manifest.mjs
```

### Design principles enforced here

- **Separation of concerns.** UI, business logic, storage, parsing, theme and
  navigation are separate layers. Components never touch `localStorage`,
  `fetch`, or theme internals directly.
- **Storage is pluggable.** Nothing imports `localStorage`. Everything goes
  through `StorageService`, which delegates to a `KeyValueStore`. See below.
- **Services via dependency injection.** Components read services from
  `ServicesContext`, not module singletons — trivial to swap for tests or the
  cloud.
- **The design system is tokenised.** No component hard-codes a colour, radius,
  spacing or duration; all come from [`src/styles/tokens.css`](src/styles/tokens.css),
  keeping light and dark perfectly in sync.

---

## Accounts, cloud sync & PWA

The app is offline-first and works with **no account** (guest mode, data in the
browser). Add Supabase and it becomes a multi-device, multi-user system — same
URL on laptop/tablet/phone, continue where you left off. **No custom backend.**

### 1. Environment

```bash
cp .env.example .env       # then fill in your Supabase values
```

| Var | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Public anon key — safe in the browser, guarded by RLS |
| `VITE_ENABLE_GUEST_MODE` | Allow use without an account (default `true`) |
| `VITE_AUTH_PROVIDERS` | `google,email` |

`.env` is git-ignored. Never put a `service_role` key in a `VITE_` var.

### 2. Database

Run the migration once (Supabase → SQL Editor → paste → Run, or `supabase db push`):

- [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)

It creates `profiles` and `user_state` with **Row Level Security** — every row is
scoped to `auth.uid()`, so a user can only ever read/write their own data.

### 3. Auth providers

- **Google**: Supabase → Authentication → Providers → Google. Add your OAuth
  client id/secret and set the redirect URL to your app origin (and
  `http://localhost:5173` for local dev).
- **Email**: enabled by default (magic-link / OTP).
- **Guest**: always available; local-only until the user signs in, at which point
  their local data migrates into the account.

### How storage works (the seam)

Everything user-generated flows through `StorageService` → `KeyValueStore`. There
are three backends, chosen automatically by [`StorageContext`](src/context/StorageContext.tsx):

| Backend | When |
| --- | --- |
| [`LocalStorageStore`](src/services/storage/LocalStorageStore.ts) | guest / no Supabase |
| [`SupabaseKeyValueStore`](src/services/supabase/SupabaseKeyValueStore.ts) | signed in (the `user_state` table) |
| [`SyncedKeyValueStore`](src/services/storage/SyncedKeyValueStore.ts) | signed in — local-first cache + remote mirror + offline outbox |

Writes hit local first (instant, offline-safe) and mirror to Supabase; offline
writes queue in an [`Outbox`](src/services/storage/Outbox.ts) and flush on
reconnect. On sign-in the app reconciles (empty account ← local guest data;
otherwise account → local cache). Conflict rule: newest write wins.

### Uploading your own chapters

The **Import** page lets anyone add chapters without touching code: choose or
paste a chapter JSON → it's validated against the schema → saved to *your*
library and synced to *your* account (private, RLS-isolated). Built-in chapters
stay read-only; your uploads live alongside them. See [ROADMAP](docs/ROADMAP.md)
for the sharing/authoring plans.

### PWA / offline

Built with `vite-plugin-pwa`. After `npm run build && npm run preview` (or once
deployed) the app is **installable** on desktop/Android/iPad and works fully
offline — the shell and every opened chapter JSON are cached.

### Deploy (no backend)

- **Vercel**: import the repo, add the `VITE_*` env vars, deploy. Easiest.
- **GitHub Pages**: set Vite `base: '/Revision-Engine/'` in `vite.config.ts`,
  build, and publish `dist/` (e.g. via an Actions workflow). Add the Pages URL to
  Supabase Auth redirect URLs.

### Web Push notifications

Reliable reminders while the app is closed use Supabase Cron, Edge Functions,
and standards-based Web Push. The schema and functions are included; follow the
one-time deployment guide in [`supabase/NOTIFICATIONS.md`](supabase/NOTIFICATIONS.md).

The full phase plan, schema notes and multi-user design are in
[`docs/ROADMAP.md`](docs/ROADMAP.md).
