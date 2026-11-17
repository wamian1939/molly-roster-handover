# Deep Cleanup Log

Audit date: 2026-09-06

## Method

Every deletion candidate was checked against repository text references, static and dynamic imports, routes, package scripts, tests, build inclusion, migration relevance, and the active Git diff. Applied migration history was never edited or removed.

## Removed themes

1. **Draft lifecycle** — removed the Draft entry page, Draft completion dialog, obsolete Draft tests, autosave/fallback state, and database Draft/activity storage through ordered formal migrations.
2. **Qualification voting** — removed the user-facing aggregate component and retired voting/consensus paths. Opening, closing, and weekly cleaning now live only as weighted BINARY operation skills.
3. **Mock fallback runtime** — removed the production fallback hook/data/status layer so API and authentication failures fail explicitly.
4. **Orphan UI and scripts** — removed an unused quick-notes component, an obsolete integration harness, and two one-off scripts with no package/route/test responsibility.
5. **Dependency/symbol residue** — removed the unused direct `esbuild` declaration and unconsumed local exports/helpers.

## Retained deliberately

- All historical Prisma migrations and immutable CLOSED Round data contracts.
- Framer Motion, GSAP, `@gsap/react`, and Recharts: each has verified production imports.
- Nested backend files reported by root Knip: they are compiled/tested from `backend/tsconfig.json`, backend scripts, and backend package entrypoints.
- Public nested DTO types used through exported response shapes.

## Verification after cleanup

- Frontend: 22 test files, 79 tests passed.
- Backend: 20 test files passed, 1 database-gated file skipped; 116 tests passed, 5 skipped.
- Frontend/backend TypeScript and production builds passed.
- ESLint passed after the final unused-type removal.
- Root npm audit: 0 vulnerabilities. Backend Prisma tooling advisory is recorded as a P2 dependency decision rather than resolved through an untested downgrade/major change.
