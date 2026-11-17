# Project Structure Audit

## 实际项目地图

```text
Molly Roster/
├─ src/                         React frontend；colocated unit/component tests
│  ├─ components/calendar/     Calendar、event、dialog、role/staff filters
│  ├─ components/ui/           Dialog、Select、Toast 等基础组件
│  ├─ pages/                   Calendar、Staff、Templates、Settings、Export
│  └─ lib/                     API client、repository、grouping、overlap、rules
├─ backend/
│  ├─ src/                     Express app、routes、auth、RosterService、Evaluate client
│  ├─ prisma/                  schema、seed、2 migrations
│  └─ tests/                   4 backend test files
├─ docs/                       Evaluate integration/style contract
├─ scripts/                    start-dev.ps1
├─ package.json                frontend scripts/dependencies
├─ backend/package.json        backend scripts/dependencies
├─ vite.config.ts
├─ tsconfig*.json
├─ eslint.config.js
├─ vitest.config.ts
└─ docker-compose.yml          PostgreSQL 16, host port 5433
```

根目录不存在独立 `tests/`、`public/` 或 `config/` 目录；测试按实际结构位于 `src/**/*.test.*` 与 `backend/tests/`。环境样例为根 `.env.example` 和 `backend/.env.example`。

## 入口与责任边界

| Area | 入口 / 核心实现 | 审计结论 |
|---|---|---|
| Frontend | `src/main.tsx` → `src/App.tsx` | React Router app shell；页面 lazy load |
| Backend | `backend/src/server.ts` → `app.ts` → `routes.ts` | Express 5；Helmet、CORS、JSON、auth middleware |
| API | `backend/src/routes.ts` | 所有 store resource 在 route 层调用 `requireStore` |
| DB | `backend/prisma/schema.prisma` | PostgreSQL / Prisma；Roster 自有数据 |
| Auth | `backend/src/auth.ts`, Evaluate session proxy | HttpOnly cookie；frontend localStorage 非 authority |
| Calendar | `src/pages/CalendarPage.tsx` | FullCalendar month/week/day；repository server state |
| Shift | `backend/src/rosterService.ts` | transaction、version conflict、employee advisory lock |
| Staff | `src/pages/StaffPage.tsx` | Employee master 来自 Evaluate；availability 来自 Roster |
| Availability | `EmployeeAvailability` + StaffPage | DB 支持多行/日，UI 仅支持一行/日（P1） |
| Role | `ShiftRole` + `/roster/roles` | DB authority；seed 仅初始化全局角色 |
| Integration | `backend/src/evaluateClient.ts` | Store/employee/score/skill 的只读上游 |
| Settings | `RosterStoreSettings` | store-scoped，versioned update |
| Export | `/roster/export.csv`, `/roster/print` | employee/manager audience；manager 需 ADMIN |
| Tests | Vitest + Testing Library + Supertest | 单元/route 较强；无 browser/e2e suite |

## 数据所有权

- Evaluate Molly：Store、Employee、Employee Type、employment type、active status、正式评分/Tier、skill summary、opening/closing/weekly-cleaning 能力。
- Molly Roster：period、shift、assignment、role、availability、templates、settings、publication snapshot。
- 历史保护：Shift/Assignment 存 role、employee name/type/score/Tier snapshots；publication 另存 JSON snapshot。
- 缺口：publication snapshot 没有读取或指定 revision export 路径；当前 export 读取 mutable live period rows。

## 架构风险摘要

1. Git 仓库无任何 commit，全部文件 untracked，无法证明构建来源或回滚。
2. Staff availability 编辑器将同日多时段折叠成一行，再由 replace API 删除该日全部旧行。
3. immutable publication snapshot 仅写不读。
4. frontend 页面请求缺少统一 cancellation/request identity；Calendar 快速换 store/range 可被旧响应覆盖。
