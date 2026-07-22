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

## Going to the cloud later (Supabase / Firebase / …)

The storage seam is one interface, [`KeyValueStore`](src/services/storage/types.ts).
To migrate:

1. Implement `KeyValueStore` against your backend (e.g. `SupabaseStore`).
2. Return it from `createStorageService()` in
   [`src/services/storage/index.ts`](src/services/storage/index.ts).

No React component, hook, or page changes. Because every method is already
async, no call site needs rewriting when storage becomes networked.
Authentication can be layered the same way — inject an auth service through
`ServicesContext`.

---

## Status

The foundation is complete and runs end-to-end: library → chapter → interactive
prelims/mains revision, theming, and a fully abstracted storage/parsing/DI
layer. The data models for **progress tracking, spaced repetition and bookmarks**
already exist in [`src/types/progress.ts`](src/types/progress.ts); the
Statistics and Bookmarks views are wired as placeholders awaiting that logic.
