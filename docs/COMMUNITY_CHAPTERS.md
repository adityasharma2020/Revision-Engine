# Community chapters

Chapter content has three distinct sources:

- **Private** chapters belong to one user and sync through `user_state`.
- **Public** chapters live in Supabase and are visible to everyone.

Authors can keep a chapter private, edit its questions in the import page, or
submit it for review. Approval copies the draft into `published_content`. If an
author later submits edits, the last approved copy stays public until the new
draft is approved.

## Setup

Apply Supabase migration `0017_community_chapters.sql`, then promote an account
from the Supabase SQL editor:

```sql
update public.profiles
set is_admin = true
where email = 'admin@example.com';
```

Admins see the review queue on the Import page. Database functions enforce
submission ownership and admin-only publishing; clients cannot write directly
to the community table.

Admins also have a platform chapter catalogue for editing drafts, publishing,
unpublishing, and recoverable archiving. Critical actions require confirmation
and every admin mutation is retained in `chapter_admin_audit`. Suggestions are
bound to the public version they were created from, so stale corrections cannot
overwrite a newer approved revision.

Never-submitted private uploads remain in each owner's `user_state`; they are
not visible to administrators. A user must explicitly submit a private chapter
before it enters the moderation system.

Public reading uses column-level `SELECT` privileges plus table RLS. Anonymous
and authenticated client roles have no direct `INSERT`, `UPDATE`, or `DELETE`
privileges. Migration `0020` removes the earlier public view and audits those
mutation grants.

The former bundled chapters are seeded by migration
`0019_seed_public_chapters.sql`. Public questions have an Edit action. Owners
submit a revision, administrators publish directly, and everyone else submits
a suggestion for review.
