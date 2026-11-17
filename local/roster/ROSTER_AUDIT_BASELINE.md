# Molly Roster 审计基线

> 审计日期：2026-09-27（Australia/Sydney）  
> 审计边界：只读应用代码、合同、运行时、数据库与 API；除本轮 Markdown 报告外未修改业务代码、Schema、迁移、依赖或业务数据。

## 目录与 Git

- 当前目录：`E:\PY Study\Molly Roster`
- Git root：`E:/PY Study/Molly Roster`
- Branch：`master`
- HEAD：不存在；`git log` 返回 `current branch 'master' does not have any commits yet`
- Dirty/untracked：项目文件全部为 `??`；没有可审计的提交历史或可复现基线。
- Sibling `E:\PY Study\Evaluate Molly` 仅窄范围读取 integration contract、员工 DTO 和 CLOSED round aggregate 代码。

## 启动与真实状态

| 服务 | 实际地址 | 结果 |
|---|---|---|
| Frontend | `http://127.0.0.1:5176/` | HTTP 200 |
| Roster Backend | `http://127.0.0.1:4020/api/health` | HTTP 200；database=true；evaluateMolly=true |
| Evaluate Molly | `http://127.0.0.1:4000/api/health` | HTTP 200 |
| PostgreSQL | `127.0.0.1:5433` / container `molly-roster-postgres` | healthy |

首次运行 `scripts/start-dev.ps1` 时 Docker Desktop 未运行。脚本在 `docker compose` 失败后仍启动前后端并打印 URL，Roster health 当时为 503。启动 Docker Desktop、Roster PostgreSQL 和 sibling Evaluate 后，使用原项目命令重启并恢复到以上 200 状态。该失败没有通过改代码掩盖。

## 启动命令（来自仓库，不是推测）

- 全栈：`npm run dev:all` → `scripts/start-dev.ps1`
- Frontend：`npm run dev` → `vite --host 127.0.0.1 --port 5176`
- Backend：`npm --prefix backend run dev` → `tsx watch src/server.ts`
- Frontend test/build/lint：`npm test`、`npm run build`、`npm run lint`
- Backend test/build：`npm --prefix backend test`、`npm --prefix backend run build`
- Prisma：`prisma:validate`、`prisma:migrate:status`

## 验证基线

- Frontend：12 test files / 68 tests passed；ESLint passed；TypeScript + Vite build passed。
- Backend：4 test files / 36 tests passed；TypeScript build passed。
- Prisma schema validate passed；2 migrations，数据库为 up to date。
- `npm audit --omit=dev`：frontend 0、backend 0 known vulnerabilities。
- Browser：ADMIN 真实登录成功；Calendar、Staff、Settings、Templates、Export、store switch、dialog cancel 与 Logout 已检查；Logout 后跳转 `/login` 并显示密码输入框；应用自身 console 无 error/warning。
- Browser 中出现的 MetaMask/ObjectMultiplex/MaxListeners 信息来自 `chrome-extension://`，不归因于 Molly Roster。
- 文档中的三个 STORE_EVALUATOR 测试账号均返回 401；因此真实 evaluator browser scope matrix 未完成。
- Day 显式 Add Shift 验证为当前日期、09:00–10:00；Cancel 后数据库仍为 10 shifts / 18 assignments。当前浏览器控制面未能可靠触发 FullCalendar drag，故没有把 drag-create 标记为已通过。

## 数据库只读基线

当前计数：2 periods、10 shifts、18 assignments、7 roles、14 availability rows、2 shift templates、2 availability templates、4 publications。

以下检查均为 0：duplicate assignment、orphan shift、orphan assignment、role/store mismatch、invalid range、invalid break、employee overlap、overlapping current periods、inactive role in future draft、bad publication snapshot、published assignment missing employee/role snapshot、invalid availability、template/role store mismatch。

对 periods、calendar、roles、templates、availability templates、settings、availability 等 GET 请求执行前后，10 个业务表计数完全不变。

## 基线结论

服务当前可运行，但该运行状态不等于 Pilot readiness。正式判断见 `FULL_ROSTER_CODE_AUDIT_REPORT.md`：**NOT READY FOR INTERNAL PILOT**。
