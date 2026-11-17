# 可复现的本地开发

## 推荐：复现生产 Worker

README 中的 production-site 命令已在 Node 20.19.0 / npm / Windows 上实际执行。npm ci 需要网络与正常注册表；源 package-lock 保留。无需安装 .NET，无需访问现有 PostgreSQL，也不需要任何生产账号。handover-local 为内存 D1 + 实际 SQL/业务服务，启动时创建合成管理员、门店、岗位/技能；退出即清空。--check 自动创建随机内存密码，不在输出中打印，验证一名合成员工跨系统投影和权限边界。普通手动使用时密码由 HANDOVER_ADMIN_PASSWORD 设置，未随 ZIP 提供。

可用 `node --inspect tools/handover-local.mjs` 调试适配器，Worker 内部逻辑请结合 Miniflare 调试说明和 server 源码。此工具不接收生产 DATABASE_URL、Xero 或模型 key，防止本地演示误调外部服务。hand­over 工具不是完整的全量业务验收 fixture。

## PostgreSQL 原生开发副本（development 分支）

原源码保留，操作下面命令前确认当前目录是交接副本。不要运行旧 scripts/start-dev.ps1，它们包含原机器目录与已有 Docker 名称/端口。

为每个 backend 手动建立**新的空数据库**，推荐 PostgreSQL 16、回环端口 Evaluate 15432 / Roster 15433，库名 handover_evaluate / handover_roster，账号密码自行设置。不要复用当前机器 5432/5433 的实际服务；不要导入真实 dump。示例连接格式见根 .env.example，非真实凭据。

```powershell
cd local/evaluate/backend
npm ci --ignore-scripts
Copy-Item .env.example .env
# 编辑新 .env：DATABASE_URL 指向自己新建的 handover_evaluate；PORT=14000；CORS_ORIGIN 包含 5174 和 5176。
npm run prisma:generate
npm run prisma:migrate:deploy
$env:ADMIN_USERNAME='handover-admin'
$env:ADMIN_DISPLAY_NAME='Example Admin'
$env:ADMIN_INITIAL_PASSWORD='<自行设置的本地密码>'
npm run auth:bootstrap-admin
Remove-Item Env:ADMIN_INITIAL_PASSWORD
npm run dev
```

上面 migrate/bootstrap 是接手人在**全新本地库**初始化时执行的操作，本次未对任何 PostgreSQL 执行写入或迁移。Evaluate seed 脚本含原业务参考资料，若要保留隐私边界建议不运行 seed，使用登录后的管理员 UI 创建合成门店/岗位/员工。Evaluate 初始化只有管理员，没有门店；必须先通过管理员页面创建合成门店，供 Roster 同步使用。

另开终端在 `local/evaluate`：安装依赖，设置自己的 `.env` 为 `VITE_API_BASE_URL=http://127.0.0.1:14000/api`，然后 npm run dev（5174）。在 `local/roster/backend` 安装依赖，复制并编辑 `.env.example`：DATABASE_URL 指向新 handover_roster，PORT=14020，EVALUATE_API_BASE_URL=http://127.0.0.1:14000/api；prisma generate、prisma migrate deploy，再 npm run dev。在 `local/roster` 设置 VITE_API_BASE_URL=http://127.0.0.1:14020/api，npm ci --ignore-scripts，npm run dev（5176）。

不要混用 localhost 和 127.0.0.1，否则 Cookie/Origin 可能不一致。前端 vite.config 还保留默认 /api 代理至原端口的行为，指定完整 VITE_API_BASE_URL 或在副本明确设置开发代理；原项目不修改。生产前端应使用同域 /api，不能发布带本地端口的环境。

构建：各前端目录 npm run build，各 backend 目录 npm run build（其中会 generate Prisma client，不迁移数据）。测试：npm test；数据库集成测试只在专用空测试库与显式配置下启用，不使用运行中的业务库。

## Python 引擎

```powershell
cd local/roster/scheduling-engine
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests/test_engine_scenarios.py tests/test_dst_instant_order.py tests/test_joint_breaks_and_overnight.py tests/test_v2_coverage.py -q
```

requirements 钉 OR-Tools 9.12.4544；其余依赖有范围而非全量 lock。Python 3.11 为已测解释器，独立 pip 安装仍取决于平台可用 wheel。启动 Lab 看 scheduling-engine/README.md 与 api/ 的 FastAPI 入口。Multi-Agent 另有 requirements 和 README，仅在合成数据/草稿下试验；模型 API key 不存在时不要声称自动排班可用。不要把 ROSTER_DATABASE_READONLY_URL 指向生产后运行写入脚本。

## 变量位置与要求

| 变量 | 配置位置 | 要求/作用 |
|---|---|---|
| HANDOVER_ADMIN_PASSWORD / HANDOVER_PORT | 启动本地工具的进程环境 | 前者必填≥12字符；后者可选；不写仓库 |
| DATABASE_URL | 两个 backend/.env，各自不同 | 原生本地模式必填，仅新建 handover 库；Worker 内存模式不用 |
| PORT / NODE_ENV / CORS_ORIGIN / APP_ORIGIN | backend/.env | 开发端口/模式/CORS；生产必须明确 origin；本任务不改生产 |
| EVALUATE_API_BASE_URL / EVALUATE_APP_ORIGIN | Roster backend/.env | 原生服务调用与认证来源；本地新端口 14000 |
| VITE_API_BASE_URL | 对应 frontend/.env | 前端 API 基址；可公开，不放秘密 |
| AUTH_SESSION_DAYS | Evaluate backend/.env | 可选，默认7天 |
| ADMIN_USERNAME / ADMIN_DISPLAY_NAME / ADMIN_INITIAL_PASSWORD | bootstrap 进程环境 | 新空库创建首个管理员时必需，操作后移除密码 |
| XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_TOKEN_KEY / XERO_REDIRECT_URI | 服务端环境/托管 Secret Store | 仅 Xero 启用时必填；token key 32随机字节 base64；不放 VITE_ |
| XERO_ENABLE_TRACKING | 同上 | 可选默认0；需要额外 scope 与真实 tracking 映射 |
| AI_ANALYSIS_PROVIDER / DEEPSEEK_* / AI_ANALYSIS_TIMEOUT_MS | Evaluate 服务端 | 可选，文本评价模型；缺 key 不启动真实调用 |
| MULTI_AGENT_ENGINE_URL | Roster backend | 本地引擎 API 地址，Sites stub 不使用 |
| MULTI_AGENT_* / ANTHROPIC_* | Multi-Agent 服务端环境 | 可选模型服务地址/模型/key/timeout/成本；逐项见子目录 .env.example 与代码 |
| ROSTER_DATABASE_READONLY_URL / SCHEDULING_LAB_DATA | scheduling-engine/.env | 可选 Lab 快照只读来源/本地数据目录 |

常见错误：Prisma generate 的 Windows EPERM 通常是进程占用；只停自己的交接进程，不停止现有生产/原服务。空库不会自动有原门店或角色；先创建合成资料。SQL CHECK / FK 错误应查合法字段与关系，不能用关闭 FK 绕过。Xero configured=false 和 automaticScheduling=false 是当前真实能力状态，不是本地启动失败。
