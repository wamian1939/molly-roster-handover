# Test Gap Matrix

更新日期：2026-09-28

## 本轮已执行

| Layer | Command / method | Result |
|---|---|---|
| Frontend unit/component | `npm test` | 13 files / 77 passed |
| Backend unit/route + PostgreSQL integration | `RUN_DATABASE_TESTS=1; npm --prefix backend test` | 6 files / 44 passed |
| Frontend lint | `npm run lint` | passed |
| Frontend typecheck/production build | `npm run build` | passed；main 381.59 kB，Calendar 302.53 kB，Staff 16.75 kB，Export 9.93 kB |
| Backend typecheck/production build | `npm --prefix backend run build` | passed |
| Prisma schema | `npx prisma validate` | valid |
| Prisma migrations | `npx prisma migrate status` | 3 migrations；up to date |
| Dependency audit | frontend/backend `npm audit` | 0 vulnerabilities |
| Startup | `scripts/start-dev.ps1` | only reported READY after frontend/backend/DB/Evaluate became healthy |
| Runtime health | frontend + `/api/health` | 200 / 200；`database=true,evaluateMolly=true` |
| Browser smoke | real Chrome | ADMIN pages, mobile, Network, drag, publication, availability, 500-person fixture completed |
| DB cleanup/integrity | exact fixture queries | production-like baseline counts restored；all isolated remediation fixtures 0 |

## 覆盖矩阵

| Capability | Unit / route | Real DB | Real browser | Status / remaining gap |
|---|---:|---:|---:|---|
| Health DB + Evaluate readiness | Yes | Yes | startup observed | Closed |
| Store scope / IDOR | Route tests | Publication cross-store | ADMIN only | **Open:** legal STORE_EVALUATOR manual session required |
| PII stripping | Route/service | employee-safe snapshot | ADMIN Network verified | **Open:** repeat Network inspection as STORE_EVALUATOR |
| CLOSED official score / Tier / Skill | Integration contract/code | runtime ADMIN values | ADMIN Staff inspected | **Open:** evaluator-visible acceptance; mixed OPEN/CLOSED live fixture remains a useful future enhancement |
| Calendar exact grouping | Strong unit tests | existing shifts | Month/Week/Day inspected | Closed for current finding |
| `assignments` runtime safety | Unit guards | N/A | no uncaught errors | Closed for current finding |
| Drag 09:00→10:00 | Browser-run evidence | cancel no-write + isolated save | exact pointer drag | Closed; automate in Playwright later |
| Availability 0/1/2/3 slots | Frontend/backend tests | multi-row save/reload | mobile editor | Closed |
| Availability template round-trip/source | Tests | two-row TEMPLATE persisted | save/apply/reload | Closed |
| Availability overlap/adjacent | Tests | backend reject/accept | UI error + disabled save | Closed |
| Employee picker multi-slot | scheduling tests | N/A | picker path exercised | Closed |
| Publication history invariance | Service/route tests | Publish #1/#2 integration | list/view/export | Closed |
| Publication employee-safe export | Route/service | revision export | Network sensitive scan zero | Closed; evaluator repetition pending under QA-01 |
| Period overlap concurrency | Mapping/unit | real concurrent PostgreSQL test | N/A | Closed |
| Settings role submission lock | behavior verified | isolated role create/toggle | double-click generated one POST/PATCH | Closed |
| Calendar request race | sequence guard | N/A | rapid date/view/store switches | Closed |
| Staff 500-person scale | filtering helpers | no master-data write | 500-response fixture, incremental DOM, search/picker timings | Closed for current performance finding |
| Responsive Settings | CSS/build | N/A | 390/1366/1920 no document overflow | Closed |
| Month compact readability | card behavior | existing event | employee + time visible desktop/mobile | Closed |
| Accessibility | keyboard role-filter test, dialog primitives | N/A | Escape verified | Partial: automated axe/focus-trap/contrast suite not present |

## 新增的关键回归测试

- `src/lib/availability.test.ts`：slot cardinality、reload、template、overlap、adjacent。
- `src/lib/scheduling.test.ts`：shift 落在第一 slot、第二 slot、两 slot 之间。
- `backend/tests/publicationHistory.integration.test.ts`：immutable revision 与 employee-safe/cross-store/export。
- `backend/tests/rosterPeriodConcurrency.integration.test.ts`：真实 PostgreSQL overlapping create 竞争。
- backend availability/service/route tests：多 slot replace、zero-slot clear、API scope 与 publication permissions。

## 仍存在但不阻断本轮修复的测试基础设施缺口

- 尚无仓库内 Playwright/Cypress suite；真实 pointer/browser evidence 本轮由受控 Chrome 完成，后续应自动化。
- 尚无 automated visual regression 与 axe suite。
- QA-01 在合法 STORE_EVALUATOR 会话完成前保持 OPEN；这也是唯一 Pilot blocker。
- Shift update/delete 双管理员真实并发测试不是本轮既有 finding，现有 version/advisory-lock tests 仍应在后续加强。
