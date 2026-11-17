# Molly Roster — Full Code Audit Report

## Executive Summary

Molly Roster 当前可以完整启动：frontend 200、backend health 200、database 和 Evaluate integration 均 healthy；ADMIN 真实浏览器 smoke、104 个 automated tests、两端 build、lint、Prisma validate/migrate status 和只读 DB integrity audit 均通过。没有发现当前数据中的 orphan、duplicate assignment、非法班次、跨店关系或发布 snapshot 缺失，也没有发现 PII 暴露或 app console runtime error。

最终判断仍为：**NOT READY FOR INTERNAL PILOT**。

阻断原因不是 warning，也不是测试失败，而是四个 P1：Availability 多时段确定性丢失、publication history snapshot 仅写不读、仓库没有任何 commit/全部 untracked、真实 STORE_EVALUATOR 验收因测试凭据无效而未完成。完整逐项证据见 `ROSTER_RISK_REGISTER.md`。

## Startup Result

- Frontend URL：`http://127.0.0.1:5176/`，HTTP 200。
- Backend URL：`http://127.0.0.1:4020/api`。
- Health：`/api/health` HTTP 200，`database=true`，`evaluateMolly=true`。
- Evaluate：`http://127.0.0.1:4000/api/health` HTTP 200。
- 首次 Docker-off 复现 backend 503 和启动脚本 false-ready；恢复外部依赖后未改代码即健康。

## Project Architecture

React/Vite frontend 通过 repository 调用 Express API；Express 以 Evaluate HttpOnly session 做 auth，Roster PostgreSQL 保存排班域数据。Prisma 定义 period/shift/assignment/role/availability/templates/settings/publication。具体地图见 `PROJECT_STRUCTURE_AUDIT.md`。

## Evaluate Integration

- 读取合同后仅窄范围核对 sibling implementation。
- Runtime contract version 为 1.2.0；Roster 进行 compatible major check。
- Runtime 能取 Store、Employee、Employee Type、employment type、active status、official score/Tier、skill summary、opening/closing/weekly cleaning。
- Employee response keys 白名单未包含 TFN、BSB、bank、address、DOB、visa、super、private evaluation text 或 individual evaluator score。
- Evaluate `roundAggregateRead.ts:13` 默认只取 CLOSED；`:17` 按 employee/createdAt/id 选最新；`rosterIntegrationService.ts:63-89` 映射 final aggregate。未使用 OPEN provisional、individual score 或 ADMIN own score。
- Hurstville runtime：25 employees、24 有正式评分；Green Square：2 employees、0 正式评分。

## Auth / Store Scope

- `backend/src/routes.ts:97-230` 对 store resources 在 service 前执行 `requireStore`；manager export 额外 `requireAdmin`。
- 单员工 endpoint 先由 Evaluate 返回 employee store，再 scope check，避免 URL employee ID 绕过。
- Test-only `x-test-*` headers 仅 NODE_ENV=test 生效。
- Route tests覆盖 evaluator own-store、cross-store、inactive role administration、employee IDOR、manager export。
- 未发现 cross-store 或 PII leak，但真实 evaluator browser/API acceptance 尚未完成（QA-01）。

## Calendar

### Month

Month 视图可导航、显示日期和 event，布局紧凑；但 compact CSS 完全视觉隐藏 assignment body，实际 116×30 event 看不到员工名（CAL-READ-01）。

### Week

Week event 在真实浏览器中 role、time、break、name 均可读并居中；窄 viewport 使用 `.calendar-surface` 内部横向滚动，不造成 document overflow。

### Day

Day event 同样可读；显式 Add Shift dialog 的日期和 09:00–10:00 正确。Cancel 后 DB 仍为 10 shifts / 18 assignments。

### Drag Create

`selectable`/selection draft 代码存在，prior unit/component tests覆盖 dialog time/submission；本轮 browser input layer 未可靠触发 09:00→10:00 pointer selection，因此不宣称 drag 已通过。必须在 Pilot 前补正式 e2e。

### Grouping

`src/lib/calendarGrouping.ts:206` key 精确为 date + startTimestamp + endTimestamp + role.id + breakMinutes。相同时间不同 role、不同时间、不同 break 都独立；tests覆盖完全重叠、部分重叠、touching、long/short groups。

### Overlap

布局算法将 touching endpoints 视为 non-overlap，对重叠 group 分列，并允许空闲 column span；FullCalendar `slotEventOverlap=false`。未发现错误合并。

### ShiftEventCard

`isCalendarShiftGroup` 对 extendedProps 做 runtime shape guard；normalize 将缺失 assignments 转为空数组；invalid optimistic object 不创建 broken event。`CalendarEventContent.tsx:21-26` fallback 防止再次读取 undefined.assignments。当前 browser console 无该 TypeError。

## Role Source

所有 production consumers 使用 DB：`shift_roles` → `RosterService.listRoles` → `/roster/roles` → Calendar/Dialog/Filter/Legend/Settings/Staff。seed 仅提供 6 个初始 global roles，不是 runtime hardcoded authority。详见 `ROLE_DATA_SOURCE_AUDIT.md`。

## Role Colors

首选 DB `colorToken`；非法/缺失值使用 `role.id || role.code` 的 FNV-style deterministic hash，不依赖名称、数组 index 或 random。Calendar/Dialog/Legend/Staff 共用 `roleColorStyle`。普通接口只返回 active global+current store roles；ADMIN settings 可显式 include inactive。当前 Green Square 6 roles，Hurstville 加 1 store role，未发现 cross-store role leak。

## Employee Picker

Employee master 只来自 Evaluate；search/role filter、official score、skill/availability/work-rule warning 均存在。500 employee component test只渲染首批并可搜索后续；dialog 仍对 availability 同日多行使用 `.find`，受 AVAIL-01 影响。

## Staff

真实 Hurstville 显示 25/25 active employees，type、score、Tier、skill、weekly hours、role qualification 和 availability summary。无第二套 Employee master，页面明确隐藏 HR data。缺少 pagination/virtualization，且选员工时取全店 availability（PERF-01）。

## Availability

`EmployeeAvailability` 是 Roster 自有数据，schema 允许同日多行和 source/version。后端 replace 在 transaction 内，但 frontend draft 每日只有一个 slot，导致 AVAIL-01。unknown 保持显式；unavailable/available 提示是 advisory，backend shift save 不强制 availability。

## Templates

ShiftTemplate 和 AvailabilityTemplate store-scoped、versioned、具 unique name；route scope 正确。Availability template JSON 可以表达 slots，但 Staff 应用模板每个 dayOffset 只取第一条，并保存为 MANUAL，需和 AVAIL-01 一并修复。

## Batch

Batch update/delete 先验证所有 shift 存在且属 store、拒绝 published member，并在单一 transaction 内以 version update。未见 partial commit 路径。

## Publish

Publish 检查 non-empty period，以 version/status `updateMany` 做 optimistic concurrency，并在同一 transaction 写 publication snapshot。问题是 snapshot 后续不可读/不可导出（HIST-01）。

## Export

Employee CSV route tests确认不含 internal notes/score snapshots；manager export 只允许 ADMIN并包含运营字段。CSV/print 都经过 store scope。当前 export 从 live period rows 生成，不支持指定 publication revision。

## Database

只读 integrity audit 当前全部 clean：无 duplicate assignment、orphan、invalid range/break、employee overlap、period overlap、inactive future role、bad/missing snapshots、invalid availability 或 template/store mismatch。2 migrations applied。外部 Store/Employee 不设本地 FK 是 integration boundary，但 write 时会向 Evaluate 验证 active employee/store。

## Concurrency

- Shift create：transaction + sorted employee advisory locks + lock后 recheck overlap。
- Shift update/delete/batch/publish/settings/templates/roles：version compare 或 `updateMany` conflict。
- 缺口：period overlap 是 transaction 外语义 precheck，DB 只有 exact range unique（CONC-01）；availability 无 version precondition；首次 settings create 有小型 unique race并会呈现通用错误。

## Performance

- Build chunk 可接受但 Calendar lazy chunk 301.81 kB。
- Calendar 每个 range 同时取 6 resources，随后 active period 再取 summary/full range；dialog 打开再取员工和单日 availability。
- 25 employees 实测可用；500 仅纯函数/component test，没有 browser measurement。
- Staff 全量 DOM、重复 derived filtering、全店 availability/calendar fetch 是主要扩展风险（PERF-01）。

## Responsive

真实浏览器抽查 1920×1080、1366×768、1024×768、768 和 390。Calendar 的 week 横向滚动被限制在 surface；Staff 表格有自己的 scroller；Shift dialog 在 390 px 可见且 footer 可达。Settings 在 390 px 的 workspace 650/373，右侧内容被裁切（RESP-01）。

## Accessibility

- Dialog 实现 focus trap、Escape、focus restore 和 inert background。
- Radix Select、visible labels、focus-visible、44 px主要控件存在。
- Drag 有显式 Add Shift 替代路径。
- role filter 有 keyboard test；toast 尊重 reduced motion。
- 缺口：无 axe/contrast/全页面 keyboard e2e；本轮未完成真实 drag pointer regression。

## Error Handling

Backend 将 Zod/HttpError 安全映射并清洗未知 500；health 分离 DB/Evaluate。Frontend核心 mutation多数有 loading/disabled/success/error toast。Settings role create/toggle 没有 single-flight（FEEDBACK-01）；Calendar load 没有 stale request guard（STATE-01）。

## Dead Code

候选仅记录、未删除：FoundationPage、LoadingState、两个 test-only helpers、固定 `/session` route 等。详见 `DEAD_CODE_CANDIDATES.md`。

## Dependencies

两端 production audit 均 0 known vulnerabilities；未发现 duplicate calendar/date libs 或明显 unused package。Prisma seed config 有 deprecation warning，major upgrade 提示不构成本轮升级理由。

## Tests

68 frontend + 36 backend 全通过，但没有 e2e、真实 Postgres concurrency suite、visual/accessibility regression。覆盖与缺口见 `TEST_GAP_MATRIX.md`。

## P0

无已发现 P0。没有当前证据表明 cross-store/PII leak、saved roster corruption、wrong employee assignment 或 destructive data loss 已发生。

## P1

1. AVAIL-01：同日多时段保存会丢行。
2. HIST-01：发布 snapshot 不可查看/导出。
3. DEPLOY-01：Git 无 commit，全部 untracked。
4. QA-01：真实 evaluator scope acceptance 被无效凭据阻断。

每项的 reproduction、impact、file/line、code/runtime evidence、fix 和 regression test 均记录于 `ROSTER_RISK_REGISTER.md`。

## P2

CONC-01 period create race；START-01 false-ready；CAL-READ-01 month name hidden；RESP-01 390 Settings clipping；STATE-01 stale response；FEEDBACK-01 no single-flight；PERF-01 Staff scale path。详证见 risk register。

## Recommended Remediation Order

1. 建立受控 Git baseline 和 clean-clone CI，不改业务语义。
2. 修 AVAIL-01，并先添加 multi-slot round-trip tests。
3. 为 publication snapshots 建 revision read/export，完成历史不变性 tests。
4. 提供有效 STORE_EVALUATOR acceptance account，跑全 store/IDOR/browser matrix。
5. 增强 period DB concurrency constraint。
6. 修 startup false-ready、Calendar stale request、Settings mutation locking。
7. 修 390 Settings 和 Month event readable name。
8. 建 e2e、Postgres concurrency、a11y/visual regression，再做 100/500 performance tuning。

## Pilot Readiness

**NOT READY FOR INTERNAL PILOT**

重新评审门槛：四个 P1 均关闭；evaluator real-browser matrix 完成；drag create + cancel/save 在隔离数据中通过；publication revision 可稳定重现；multi-slot availability 无数据丢失；clean clone 能复建并通过 health/tests/build。
