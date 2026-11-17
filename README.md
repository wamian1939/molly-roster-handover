# Molly Roster 技术交接

交接日期：2026-11-17（Australia/Sydney）。本包包含可取得的生产 Sites 源码快照，以及**单独存放的本地开发工作树**。本次只读取原项目和线上数据结构；没有部署、生产数据库写入、迁移、账号权限或域名变更。

## 已核实版本

- 线上：https://molly-tea-roster-migration-20261115.light-lyric-6601.chatgpt.site ，Evaluate 入口为 `/evaluate/`。
- Sites **version 5**；源提交 `1029bad20c64e48cc937b5acec12a6e33e650b89`，源分支 `main`；部署成功时间 `2026-11-17T05:48:44.911200+00:00`（Sydney 16:48）。通过 Sites 保存版本来源、部署状态和干净的专用源码检出核实，详见 [版本证据](docs/PROVENANCE.json)。
- `production-site/` 从上述提交导出，经过脱敏及禁用外部源码自动覆盖的构建调整；**不是字节完全相同的原始提交，也不能直接用交接提交替代生产原提交号**。
- `local/roster/`、`local/evaluate/` 是另行保存的未上线开发状态。原 Roster `master@5d2c9f6ba13d159acc99835e7970b1539dce45b3` 有 547 条 Git 状态项，Evaluate `main@001af5453e0cc5540dc0fb711efcb213d784ad6a` 有 140 条。不能把这些本地 HEAD 或未提交文件视为当前线上代码。

实际技术栈是 React 19 / Vite / Tailwind / TypeScript，Express 5 / Prisma 6 / PostgreSQL（本地），Cloudflare Worker / D1（Sites），Python OR-Tools CP-SAT（本地引擎）。本次没有发现运行中的 ASP.NET / EF Core / MUI 项目。

## 目录与阅读顺序

| 目录 | 内容 |
|---|---|
| `production-site/` | 已核实 version 5 的 Roster、Evaluate、Worker、D1 SQL、Payroll/Xero 源码 |
| `local/roster/` | 当前本地前后端、Prisma 迁移、Python 求解器、Lab、Multi-Agent 和测试；development 分支提供 |
| `local/evaluate/` | 员工、账号、门店、评价和正式分数的权威服务开发副本；development 分支提供 |
| `database/` | 数据模型字段/约束目录、ERD、迁移索引、纯合成样例说明 |
| `docs/` | 架构、鉴权、门店映射、真实 API 索引、外部依赖、员工中心整合评估、测试与问题 |
| `FILE_TREE.md` / `MANIFEST.json` | 文件树、来源和最终文件哈希清单 |
| `SHA256SUMS.txt` | 交接文件 SHA-256；清单自身及 MANIFEST 的自引用规则见 SECURITY_REPORT |

建议先读 [架构](docs/ARCHITECTURE.md)、[登录权限](docs/AUTHENTICATION.md)、[员工中心整合评估](docs/STAFF_INTEGRATION.md)、[已知问题](docs/KNOWN_ISSUES.md)。原项目子目录中的旧 README/部署报告是历史资料；当前状态以根目录交接文档和实际源码为准。

## 最快独立启动（不需要生产数据库或真实凭据）

Node **20.19.x–22.x**、npm、Python 3.11+（仅文档/引擎工具）。Windows PowerShell：

```powershell
cd production-site
npm ci --ignore-scripts
npm run build
node tools/handover-local.mjs --check
$env:HANDOVER_ADMIN_PASSWORD = '<自行设置至少12位的本地密码>'
node tools/handover-local.mjs
```

访问 `http://127.0.0.1:18787`（Roster）和 `/evaluate/`（Evaluate），账号 `handover-admin`，密码为自己刚设置的变量。这里运行真实 Worker 路由、业务服务及 D1 SQL，使用**内存合成数据库**，退出即清空。可在 Evaluate 员工管理中新增合成员工，验证 Roster 员工列表。没有携带原账号密码或真实人员。此工具仅用于交接，源位置 `production-site/tools/handover-local.mjs`，不属于线上原版本。

本地 HTTP 适配器只绑定回环地址，并仅为本地响应移除 Secure Cookie 标志；生产 Worker 的 Cookie 安全配置没有修改。模拟报班仍是上游 Hurstville 演示模型，不构成正式员工登录；本工具未装载真实门店规则/历史班表。需要完整排班验收时使用自建合成门店设置与数据，不能把空数据本地启动视为生产业务全部验收。

## 构建与测试

```powershell
cd production-site
npm run build
node tests/smoke.mjs
node tools/handover-local.mjs --check
```

开发分支还可进入 `local/roster` 和 `local/evaluate` 执行 `npm ci --ignore-scripts; npm run build; npm test`；各自 `backend` 目录也执行安装、构建、测试。命令逐条运行；测试结果和跳过项见 [TEST_REPORT](docs/TEST_REPORT.md)，不要假设全部测试绿色。

独立 PostgreSQL 初始化、端口、环境变量、调试和引擎命令见 [LOCAL_DEVELOPMENT](docs/LOCAL_DEVELOPMENT.md)；所有数据库命令只能用于自己新建的 `handover_*` 数据库。

## 部署、状态与协作

部署方式说明见 [DEPLOYMENT](docs/DEPLOYMENT.md)，本次**未执行部署**。生产 Site 绑定/写入凭据、真实环境文件和历史数据库导出均已移除；交接包不能直接覆盖现站点。

手动排班、报班管理、发布历史、CSV/打印导出、员工与评价模块有实现。普通员工自助报班仍为 mock；Sites 自动求解器未连接；Xero 代码存在但真实 OAuth 和真实组织同步未验证；SSO、员工中心集成尚未实施。详见 [FEATURE_STATUS](docs/FEATURE_STATUS.md)。

新交接仓库采用干净历史：`production` 分支只包含已核实生产快照与交接材料，标签 `production-sites-v5-1029bad-sanitized`；`development` 在此基础上加入当前本地开发副本。原项目 remote、分支和历史保持原状。GitHub 上传结果、私有性和交接提交号见外部交付报告；本包中的原始来源号见 PROVENANCE。新开发应从 development 建 feature 分支，经 PR、测试和代码审查合并；不要将缺失凭据或私有真实数据加入 Git。

已知缺失资料及获取方式见 [MISSING_ITEMS](MISSING_ITEMS.md)。
