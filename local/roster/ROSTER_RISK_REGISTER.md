# Molly Roster Risk Register

更新日期：2026-09-28

状态定义：`OPEN` 表示未修复；`FIXED` 表示实现完成但仍缺少指定验收；`VERIFIED` 表示实现和要求的自动化/运行时证据均完成。

## 总览

- P0：0 OPEN
- P1：1 OPEN（QA-01，等待合法 STORE_EVALUATOR 浏览器会话）；3 VERIFIED
- P2：0 OPEN；7 VERIFIED
- P3：1 OPEN；1 VERIFIED
- 当前判断：**NOT READY FOR INTERNAL PILOT**。唯一 Pilot gate 是 QA-01 的真人 evaluator scope/PII 验收。

## P1

### AVAIL-01 — 同日多时段会被 UI 确定性覆盖

- Severity：P1
- Status：**VERIFIED**
- 原问题：Staff draft 曾用 `date -> single row`，同日多行会被 `Map` 覆盖；Shift dialog 曾用 `.find()`，第二个及后续 slot 不参与判断。
- Fix：`src/lib/availability.ts` 将状态改为 `date -> slots[]`；`src/components/staff/AvailabilityEditor.tsx` 支持逐日新增/删除多行；保存和 template round-trip 保留所有 slot 与 `source`；backend replace 明确清理请求日期并在事务内拒绝自身重叠。
- Tests：0/1/2/3 slot、reload、template save/apply、overlap rejection、adjacent slots、picker 第一/第二/间隔 slot 均有回归测试；frontend 77/77、backend 44/44。
- Browser evidence：移动端编辑器同时显示 09:00–13:00 与 17:00–22:00；09:00–14:00 + 13:00–17:00 显示冲突且 Save disabled；保存、reload、template apply 后仍为两行，数据库两行均为 `source=TEMPLATE`。测试 fixture 已精确清理。
- Business impact：已消除多时段丢失及错误可用性提示。
- Required regression：保留 `src/lib/availability.test.ts`、`src/lib/scheduling.test.ts` 与 backend availability service tests。

### HIST-01 — Publication snapshot 写入后没有读取/导出路径

- Severity：P1
- Status：**VERIFIED**
- 原问题：publish 写入 snapshot，但没有 revision list/detail UI/API，CSV/print 只读 live Shift。
- Fix：新增 publication list/detail API、employee-safe/manager DTO、snapshot normalization、revision CSV/print export 和只读发布记录 UI。旧 revision 的 store、period、shift、assignment、employee、role、time、break、公开备注均从 snapshot 读取。
- Tests：`backend/tests/publicationHistory.integration.test.ts` 在真实 PostgreSQL 完成 Publish #1、修改 employee/role/color/store/shift、Publish #2，验证 #1 不变、#2 为新内容、两版 export 不同、employee-safe 无内部字段、cross-store 404。Route tests 验证 manager export 仅 ADMIN。
- Browser evidence：ADMIN 发布记录可列出、查看和选择导出 revision；employee-safe Network payload 未出现 score、tier、internalNote、round 或 PII 字段。
- Business impact：已发布排班现在可稳定重现，不再被 live master data 或当前草稿改变。
- Required regression：保留 publication integration + route/service tests；任何 snapshot schema 变更必须兼容旧 revision。

### DEPLOY-01 — 没有任何 Git commit，全部项目文件 untracked

- Severity：P1
- Status：**VERIFIED**
- 原问题：repository 无 HEAD，全部文件 untracked，无法 review/rollback/rebuild。
- Fix：检查 `.gitignore` 和 secrets 后建立 baseline commit `a77d6c1 chore: establish audited Molly Roster baseline`；将 compose 密码改为环境变量，example DB URL 留空；主要修复 checkpoint 为 `783cbbc fix: close roster audit integrity findings`。
- Evidence：`.env`、credentials、logs、dist、node_modules 和 reference screenshots 均未进入 Git；本轮最终文档 checkpoint 后要求 `git status` clean。未 push remote。
- Business impact：现在具有可审计 diff、migration/code 一致版本和回滚点。
- Required regression：从 clean checkout 安装、migrate、tests/build、health 的 CI 仍是后续非阻断增强项。

### QA-01 — STORE_EVALUATOR 真实权限验收被无效测试凭据阻断

- Severity：P1（验收阻断，不是已证实 auth bypass）
- Status：**OPEN — WAITING FOR MANUAL LOGIN**
- 原问题：审计文档中的 evaluator 测试凭据均返回 401；不能据 route tests 宣称真人 evaluator 验收完成。
- 已完成证据：route tests 覆盖 own-store、cross-store 和 manager-only export；ADMIN 浏览器与 Network PII 检查已完成，workforce response 只含 roster-safe 字段。
- 剩余验证：在用户手动登录合法 STORE_EVALUATOR 后，实际检查 own Store Calendar/Staff/Availability/Role/Shift/Picker/official score/Tier/Skill/allowed export，并直接访问其他 Store，必须 403 或 safe redirect；DevTools Network 必须无 TFN、BSB、bank、DOB、address、visa、super、private evaluation text。
- Business impact：这是当前唯一 Pilot gate。
- Required regression：真人 1366×768 与 390 browser matrix；console 0 uncaught errors。

## P2

### CONC-01 — RosterPeriod overlap check 存在并发竞态

- Severity：P2
- Status：**VERIFIED**
- Fix：migration `20260928010000_prevent_overlapping_roster_periods` 增加 PostgreSQL `btree_gist` exclusion constraint；create/copy period 同时使用 store advisory lock，并将 constraint violation 映射为 409。
- Evidence：真实 PostgreSQL 并发 integration test 同时创建 overlapping period，结果严格为一个成功、一个 409、数据库一行；Prisma migrate status 为 up to date。
- Required regression：`backend/tests/rosterPeriodConcurrency.integration.test.ts`。

### START-01 — 外部依赖失败时启动脚本仍报告 ready

- Severity：P2
- Status：**VERIFIED**
- Fix：`scripts/start-dev.ps1` 检查 native exit code，并轮询 backend listening、DB、Evaluate integration 与 frontend；未全部健康时仅输出 `WAITING/UNHEALTHY`，全部成功后才输出 `READY`。
- Evidence：真实启动脚本输出 READY 后，frontend HTTP 200；health HTTP 200 且 body 为 `database=true,evaluateMolly=true`。Health 任一依赖失败时返回 503 的 backend test 已通过。
- Required regression：`backend/tests/app.test.ts`。

### CAL-READ-01 — Month event 隐藏员工姓名

- Severity：P2
- Status：**VERIFIED**
- Fix：Month compact card 显示 `岗位 · 首位员工 [+N]` 与时间；完整内容留在 tooltip/accessible label；移动端 Month 使用 calendar 内部水平 surface 保持约 105 px card，不增加 document 横向 overflow。
- Browser evidence：桌面约 116×30、移动端约 105×30 的 card 均显示 `前场 · HandoverEmployee001` 与 `09:00–10:00`；移动端 document width 等于 viewport，calendar surface 自身可滚动。
- Required regression：Month 单人/多人/窄屏可见姓名与时间；不允许重新隐藏 assignment body。

### RESP-01 — 390 px Settings 内容被 workspace 裁切

- Severity：P2
- Status：**VERIFIED**
- Fix：Settings grids/cards/role rows 使用 `min-w-0`、wrap、break-words 与 shrink-safe actions；表单和 footer action 在窄屏可换行。
- Browser evidence：请求 390 viewport 时实际 content viewport 354 px，`document.scrollWidth=354`；workspace `scrollWidth=clientWidth=323`；无元素越出视口。1366 和 1920 亦无 document overflow。
- Required regression：移动端 role editor、长 skill codes 与按钮保持可操作。

### STATE-01 — Calendar async load 可由旧 store/range 响应覆盖

- Severity：P2
- Status：**VERIFIED**
- Fix：Calendar 主数据与 dialog 数据分别使用 request sequence；仅最新 store/range request 可 commit state。
- Browser evidence：快速 Next/Next/Back/Month/Week/Day/Today 后最终仍为 2026-09-28 Day；快速 Hurstville→Green Square 后标题、岗位、日期均只属于 Green Square，无 stale event/loading。
- Required regression：延迟旧响应不得覆盖新选择。

### FEEDBACK-01 — Role create/toggle 无 in-flight 锁

- Severity：P2
- Status：**VERIFIED**
- Fix：Settings role mutation 使用同步 `useRef` single-flight lock，加 loading text、disabled、success/error toast 和 refetch。
- Browser evidence：create 双击仅一条 POST、一条记录和成功 toast；toggle 双击仅一条 PATCH、状态更新和成功 toast。隔离 role fixture 已精确清理。
- Required regression：快速双击只能发送一条 mutation。

### PERF-01 — Staff/availability 在大门店按全量方式加载和渲染

- Severity：P2
- Status：**VERIFIED**
- Fix：availability 按当前员工获取；role match 使用 memoized derived data；Staff directory 与 picker 均按 60 条增量渲染，filter 变化重置窗口。
- Browser evidence：隔离的 500 人 Network fixture 下，Staff 初次 ready 1,555 ms、仅 60 cards、约 33.3 MB JS heap/2,299 DOM nodes；搜索 201 ms 返回 11 项；Load more 为 120 项。Picker 显示 500/500 但仅 60 buttons，搜索 167 ms 返回 11 项，未冻结。未写入 employee master data。
- Required regression：500 人浏览器 fixture 与 employee-scoped availability request。

## P3

### TOOL-01 — Prisma seed package.json 配置 deprecation warning

- Severity：P3
- Status：**OPEN**
- Evidence：validate/build 仍提示 Prisma 配置 deprecation；不影响当前 build/migrate/runtime。
- Recommendation：在独立依赖维护轮迁移到 Prisma config；本轮不为 warning 升级 major dependency。

### DRAG-QA-01 — 缺少真实 pointer drag 复验

- Severity：P3（原验证缺口）
- Status：**VERIFIED**
- Evidence：真实浏览器 pointer 从 Day 09:00 拖到 10:00；dialog start/end 精确为 09:00/10:00。Cancel 后 periods/shifts/assignments 计数不变；第二次在隔离 period 保存成功，DB 中时间正确，随后精确清理该 test-only fixture。
- Required regression：后续应固化为 Playwright pointer e2e；当前运行时证据已关闭审计缺口。
