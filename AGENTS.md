# Repository instructions

## Versioning

Every completed code change must update the application version exactly once for that task using semantic versioning:

- Patch (`x.y.Z`): bug fixes, UI polish, refactors, and other small changes.
- Minor (`x.Y.0`): normal user-facing features or meaningful capability additions.
- Major (`X.0.0`): foundational, breaking, or exceptionally large feature releases.

Keep the root versions in `package.json` and `package-lock.json` synchronized. Do not bump once per file or intermediate iteration; choose the appropriate single bump for the completed user request.
