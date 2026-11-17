# Production Readiness Remediation Report

Date: 21 Aug 2026

Final decision: **Ready for Internal Pilot**

## 1. Store deletion / archive final semantics

- The production Store `DELETE` route and `force=true` bypass have been removed.
- ADMIN can archive and reactivate Stores through explicit POST actions.
- Store management defaults to active Stores and offers an explicit archived-Store view.
- Archiving is blocked while an active `STORE_EVALUATOR` account is attached. This avoids the ambiguous `active evaluator -> archived Store` state and keeps reactivation reversible.
- There is no physical Store cleanup operation exposed through the normal production API, including to ADMIN.

## 2. Historical data protection

- Archiving a Store does not delete Employees, Completed Evaluations, skill snapshots, AI evidence, evaluator snapshots, performance notes, or historical analytics inputs.
- Archived Store history remains readable through employee detail and history queries.
- Archived Stores are excluded from active selectors, current analytics/skill-board scope, new employee creation, and new or continued V1 evaluation writes.
- A database-backed regression fixture proves archive, preservation, exclusion, blocked writes, reactivation, and restored behavior.

## 3. Prisma relation policy

| Relation | Policy | Reason |
| --- | --- | --- |
| Store -> Employee | Restrict | Employee identity/history must survive Store lifecycle changes. |
| Store -> Evaluation | Restrict | Completed evaluation history is immutable. |
| Store -> UserAccount | Restrict | Account lifecycle must be explicit. |
| Store -> AI analysis/activity/performance note | Restrict | Historical evidence must not disappear with a Store. |
| Employee -> Evaluation | Restrict | Employee deletion cannot erase evaluation history. |
| Employee -> current EmployeeSkill | Cascade | Current mutable capability rows are employee-owned, not historical snapshots. |
| Evaluation -> draft/snapshot/AI evidence children | Cascade under Evaluation | Children remain evaluation-owned; production has no Evaluation or Store hard-delete path. |

The migration adds Store lifecycle fields, changes the relevant foreign keys, makes the legacy period nullable, and adds the active V1 Draft uniqueness index.

## 4. Runtime evaluationPeriod removal

- New V1 Draft creation accepts only `employeeId`.
- Store is resolved from the active Employee server-side; evaluator identity comes from the authenticated session.
- V1 create, resume, update, complete, history, dashboard, employee detail, and analytics no longer require or expose a period.
- User-facing `Instant ...`, Period, and period-query presentation was removed from the V1 flow. Completion timestamps are shown as localized evaluation time.

## 5. Draft identity changes

- The invariant is now one active Draft for `employeeId + scoringVersion=v1 + status=Draft`.
- A partial unique database index enforces the invariant under concurrency.
- Draft identity no longer depends on Store or `evaluationPeriod`; Store is still retained on the row as server-derived ownership/history context.

## 6. Legacy period compatibility

- `Evaluation.evaluationPeriod` remains in the schema for legacy records but is nullable.
- Existing historical values are preserved.
- Legacy catalog compatibility was not migrated or removed; only the formal V1 runtime was decoupled.

## 7. Dialog and autocomplete fixes

- A shared Dialog now supplies `role=dialog`, `aria-modal`, `aria-labelledby`, focus entry, Tab trapping, Escape close, trigger focus restoration, background inertness, and body scroll lock.
- It is used by password reset, employee create/edit, quick notes, and completion confirmation flows.
- Login uses `username` / `current-password`; account creation/reset password fields use `new-password` and avoid ADMIN credential autofill.
- Automated Dialog regression covers focus entry, trap, Escape, restoration, and background inertness. Live browser inspection confirmed the password-reset and employee dialogs.

## 8. Contrast fixes

- Existing `signal-teal`, `graphite-400`, and `graphite-500` tokens were darkened conservatively.
- Primary, secondary, and muted hierarchy remains intact; no palette redesign or dark theme was introduced.

## 9. Mobile navigation and touch targets

- At 390 px, four primary routes remain directly visible plus an explicit More entry.
- ADMIN More contains analytics, Store management, account management, and logout; Store evaluator scope excludes ADMIN routes.
- High-frequency mobile navigation, main actions, icon actions, and Dialog close controls received practical 44 px-class targets. Dense desktop matrix cells were intentionally unchanged.

## 10. Dashboard, localization, and presentation cleanup

- Dashboard two-column sections now align at the start and use intrinsic card height, removing forced Tier-card whitespace.
- Quick Notes, evaluation-time labels, Dialog copy, tooltip/presentation labels, document language, and title were localized to Chinese where user-visible.
- Technical IDs, usernames, and internal enums were not translated.

## 11. Backend error handling and Express security

- Production 500 responses expose only the generic Chinese server error; detailed exceptions remain in server logs.
- Express disables `x-powered-by`.
- Helmet default low-risk headers are enabled. CSP and cross-origin resource policy are intentionally not forced because they were not safely justified for the current Vite/Recharts/API stack.
- Login uses a process-local limiter keyed by IP and normalized username: 10 failed attempts per 15 minutes, with the next request returning 429 and `Retry-After`; a successful login clears the failure record.

## 12. Sensitive local files

- `.gitignore` protects `.env`, `.env.*` (with example exceptions), `LOCAL_ACCOUNT_CREDENTIALS.md`, and Prisma temporary engines.
- `.env.example` contains placeholders only.
- This directory is not currently a Git repository; the protection is ready for future initialization.

## 13. Dependency audit classification

- Low-risk compatible updates were applied without `--force` and without major framework upgrades.
- Frontend: one remaining low-severity transitive `esbuild` development-server issue; no remaining moderate/high/critical finding.
- Backend: one low-severity transitive `esbuild` development issue plus three high-severity Prisma CLI/config-chain findings (`prisma -> @prisma/config -> deepmerge-ts`). The reported remediation is a disruptive Prisma version change and is build/development tooling rather than a demonstrated production request path, so it is reported, not forced.
- React, Vite, Prisma, Recharts, and Express were not subjected to broad major upgrades.

## 14. Temporary Prisma files

- Eight stale `query_engine-windows.dll.node.tmp*` files totaling 169,463,808 bytes were removed after application listeners were stopped and the exact paths verified.
- The official Prisma Windows engine remains present; temporary-engine patterns are now ignored.

## 15. Automated verification

- Frontend tests: 17 files, 68 tests passed.
- Backend tests: 17 files / 93 tests passed; one intentionally gated integration suite skipped in the normal run.
- Store archive and period database integration: 1 test passed, including Completed evaluation, snapshot, AI evidence, note preservation, selector/write blocking, reactivation, and V1 Draft completion without a period.
- Frontend TypeScript/build: passed.
- Backend TypeScript/build: passed.
- ESLint: passed with one non-blocking Fast Refresh warning and zero errors.
- Prisma validate: passed.
- Prisma migrate status: 14 migrations found; database up to date.

## 16. Browser regression

- ADMIN: Dashboard, Store employees, V1 evaluation/resume, History, Analytics, Skill Board, Store management, Account management, employee Dialog, and password-reset Dialog checked.
- STORE_EVALUATOR: Login, Dashboard, employees, Store evaluation, V1 Draft, History, Analytics, and Skill Board checked; ADMIN Store/account routes redirect away.
- Viewports checked: 1366x768, 1920x1080, and 390 px mobile.
- At 390 px, the core pages showed no body-level horizontal overflow; primary navigation and explicit More affordance remained visible.
- Browser regression did not complete a real business Draft to avoid mutating production-like data; the exact create/update/complete-without-period path is covered by the isolated database integration regression.

## 17. Runtime/service state

- Frontend is running at `http://127.0.0.1:5174` and returned HTTP 200.
- Backend is running at `http://127.0.0.1:4000`; `/api/health` returned HTTP 200.
- Live headers confirm `X-Powered-By` is absent and `X-Content-Type-Options: nosniff` is present.
- PostgreSQL was left running.

## 18. Remaining known issues

- Prisma `package.json#prisma` configuration deprecation remains Future Maintenance; no Prisma major upgrade was performed.
- One existing Fast Refresh warning remains non-blocking.
- Recharts can emit a jsdom-only container-size warning in a component test; runtime rendering and build pass.
- Chart/main bundle sizes remain approximately 105.15 KB and 81.92 KB gzip and are not an internal-pilot blocker.
- CSP remains intentionally unforced pending a separately validated policy.
- Dark mode, full mobile redesign, legacy contract migration, scheduling work, new scoring features, and major dependency upgrades remain out of scope.

## 19. Final judgment

**Ready for Internal Pilot.** Store management can no longer destroy historical records through the production path; V1 operates as an anytime evaluation flow without frontend period knowledge; manager workflows, basic error/security boundaries, and the scoped UI issues have regression evidence.

