# Role data source audit

> **Current audit verdict (2026-09-27):** Pass。Calendar、Dialog、Filter、Legend、Settings 与 Staff 共用数据库 `shift_roles` authority；当前独立证据见本文末尾 update，旧段落仅为历史基线。

Audit date: 2026-09-10

## Database facts

The local `shift_roles` table is the role source of truth. It already contains the formal fields needed by the product: nullable `storeId`, `code`, `nameZh`, `colorToken`, `requiredSkillCodes`, `isActive`, `displayOrder` and optimistic-lock `version`.

Current local database snapshot:

- 7 total roles; all 7 active.
- 6 global roles and 1 Hurstville-scoped role.
- No inactive rows and no duplicate `(storeId, code)` rows.
- Every current colour is a six-digit hex value and the database constraint rejects invalid colour strings.
- Hurstville resolves to 7 active roles (6 global + 1 store role). Other stores resolve to the 6 active global roles.

The six global roles are initialised by `backend/prisma/seed.ts`. This is seed-only database setup, not a production frontend fallback. The browser never imports this array.

## Source matrix

| Use location | Current source | DB driven | Problem found | Final source |
|---|---|---:|---|---|
| Calendar events | Shift DTO with `shiftRole` plus role name/colour snapshots | Yes | Snapshot colour was not validated; display group omitted role code | Normalised `CalendarShiftGroup` with DB role identity and safe historical snapshot fallback |
| Add/Edit Shift role | `GET /roster/roles?storeId=…` | Yes | Colour application duplicated in component styles | Active scoped API + shared role-colour helper |
| Staff role filter in Shift dialog | Same `roles` array as Calendar | Yes | Correct source; only visual normalisation missing | Same active scoped API + shared role-colour helper |
| Staff page role matching | Not present | No | Staff page did not load ShiftRole data | Same active scoped API joined in the UI through `requiredSkillCodes` |
| Settings | Same active-only roles API | Partly | An inactive store role would disappear and could not be reactivated | `includeInactive=true` for Settings only |
| Month legend | Not present | No | No DB-driven colour key | Same active scoped API |

## Hardcoded/mock/fallback search

- No production frontend array of role definitions was found.
- No production role-name-to-colour `if/switch` mapping was found.
- Role names appearing in tests are fixtures, not runtime sources.
- The database seed contains the initial global role definitions and skill requirements. These become normal database rows before reaching production UI.
- The previous fallback `#647180` in calendar normalisation was constant and not identity-stable. It will be replaced by a deterministic role-id/code fallback and used only when persisted data is absent or invalid.

## Scope and history rules

- Current assignable roles are `active global roles + active roles for the selected store`.
- Inactive, deleted or other-store roles are excluded from Calendar, Dialog, Filter and Legend.
- Existing historical shifts retain `roleNameSnapshot` and `roleColorSnapshot`; they remain readable if the active role later changes or becomes unavailable.
- Employee skills are capabilities from Evaluate Molly. They are never promoted into ShiftRole rows. Matching is computed with `ShiftRole.requiredSkillCodes`.

# 2026-09-27 Independent Audit Update

> 本节是本轮独立审计的权威结论；下方旧内容仅作为历史记录。

## 结论

**Pass：生产运行时岗位 authority 是 PostgreSQL `shift_roles`，不是 hardcoded/mock/reference list。**

数据链：`backend/prisma/schema.prisma:52-69` → `RosterService.listRoles()` → `GET /api/roster/roles` → Calendar state → ShiftDialog、RoleLegend、Staff role filter、Settings 与 role color helper。

- `backend/prisma/seed.ts:6-20` 的 6 个 global roles 是初始化数据，不是 frontend runtime list。
- 普通 consumers 只取 active global + current-store roles；仅 ADMIN Settings 可 `includeInactive`。
- Runtime：Green Square 6 global roles；Hurstville 额外 1 store role。没有 cross-store role 泄漏。
- Calendar/Dialog/Legend/Staff 使用同一 `roleColorStyle`。颜色首选 DB `colorToken`；fallback 以 role id/code hash，非 name/index/random（`src/lib/roleColor.ts:12-27`）。
- 历史 shift 保留 roleName/roleColor snapshot；当前匹配的 nested DB role 优先，snapshot 仅 fallback（`src/lib/calendarGrouping.ts:126-131`）。
- inactive role 不出现在新排班；历史 shift 仍可用 snapshot 展示。

## 搜索结果

全文搜索 `role/job/shiftRole/roles/ROLE_/mock/demo/全岗/前台/后厨/培训/带训` 未发现第二套 production role list 或按岗位名写死的颜色分支。Evaluate jobs 不作为 Roster role authority；Roster 按 `requiredSkillCodes` 与 Evaluate skill summary 计算员工匹配。

## 剩余风险

- Settings role create/toggle 没有 in-flight disabled，见 FEEDBACK-01。
- seed 更新同 code 的 global role 会改当前显示；发布/历史展示仍应通过 snapshot/revision path 保护。

---

