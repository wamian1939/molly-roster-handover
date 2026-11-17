# Roster Multi-Agent Autonomous Scheduling Engine V1

主系统现提供 `/agent-rules` 规则设置，并从 `/calendar` 工具栏“智能体排班”发起。固定规则与指定周规则独立保存，完整验证通过后由 Roster 后端直接写入普通可编辑班次；Python 引擎继续保持不直接写班次数据库的边界。参见 [使用与写入说明](../docs/AGENT_RULES_AND_CALENDAR_WRITE.md)。下述 4191 入口作为独立诊断工具保留。

当前真实测试入口：**http://127.0.0.1:4191/**（与 CP-SAT 共用竖版班表组件）。已加入按报班可用总小时计算的评分目标比例，以及 Bob 周二、周四完整晚班硬条件；公平性权重保持 0。规则、档位和最新真实运行验收见 [评分目标与 Bob 规则](docs/score-targets-bob-rule-v1.md)。最新结果为 `.data/live-real-targets-bob-v3/`；5 天通过、周三与周六源数据不足，整周状态仍为 FAILED，不可发布。

独立、只生成草稿的 Python 引擎。四个专业化 LLM Agent 通过不同 Prompt 和严格 Schema 协作；Orchestrator 顺序提交，Validator 独立重放硬约束。**运行路径没有 CP-SAT、MILP、组合求解器，也没有生产班表写入接口。**

## 运行

在项目根目录构建现有 Lab 的双入口 React 界面：

```powershell
npm --prefix scheduling-engine/lab-ui run build
powershell -ExecutionPolicy Bypass -File multi-agent-engine/scripts/start.ps1
```

打开 **http://127.0.0.1:4191/**。现有 Lab 侧栏也有独立入口。使用「载入已运行的全周样例」可以查看本机已完成的真实 LLM 合成全周运行，该操作会重新验证结果，不发起 LLM 请求。样例只在对应默认日期和合成场景下显示，绝不替代 REAL 数据。

运行依赖复用 `scheduling-engine/.venv-isolated`。没有增加 Agent 框架或修改原有求解器。新目录 `requirements.txt` 列出了自身依赖，不依赖 OR-Tools。

LLM 使用可替换的 `Provider` Protocol。当前实现支持 Anthropic Messages 兼容接口，模型与端点由环境配置，不固定供应商模型。支持已有 `ANTHROPIC_MODEL`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`，或独立的 `MULTI_AGENT_*` 配置，详见 `.env.example`。每个 Agent 可以配置独立模型。默认关闭扩展思考并强制结构化 tool 输出；`MULTI_AGENT_THINKING=enabled` 使用 auto tool 模式，仍须通过同样 Schema。

`start.ps1` 加载原 Lab 的只读来源配置及新目录 `.env`，只绑定 localhost:4191，不重启原 4188 服务。不要在代码、浏览器输入框或日志内写 API Key。停止时核对 `.data/server.pid` 对应进程命令行为 `uvicorn multi_agent.api:app`，再停止该进程。

## 真实数据与现有项目适配

审计发现当前 Roster 后端是 **Node/Express + Prisma**，不是 .NET 8。因此适配实际 `CalendarResponse` / `Shift` 合同，没有虚构 .NET 接口，也未重写生产 API。

- RuleSet：复用 `scheduling-engine/engine/models.py`；REAL 读取既有 Lab 已保存版本，要求 `EXACT_SCHEDULED` 和 30 分钟槽。遗留班型计数规则必须显式派生并确认后使用，不自动重解释。
- Hurstville：现有 `configs/hurstville-exact-scheduled.json` 在审计时是 v20，已经具备用户指定的七日 3/4/4 等精确区间。合成运行仅在内存派生 `v20:multi-agent-v1-derived`；v16、v20 和 Lab SQLite 规则均未覆盖。
- Snapshot：复用 `adapters.real.load_snapshot`；通过经过门店范围验证的 Evaluate 会话读取员工，通过现有只读数据库连接读取 Availability / 既有班次。
- 评分：Evaluate `rosterIntegrationService.ts` 复用 `loadLatestValidClosedAggregates`，提供最新有效 CLOSED 轮次正式汇总；`adapters.real._employees` 原样使用 `officialScore.score`。缺失评分为 null，绝不生成评分或把它当资格。
- 资格：正式岗位 ID 与 `qualified_roles`；当前技能来自 `role_required_skills`。Availability 的 AVAILABLE 区间和 UNAVAILABLE 否决继续由原适配器处理，批准休假另有硬性否决。
- 导出岗位：Evaluate 正式岗位 ID 不等于 Roster `shiftRoleId`。REAL 输入读取并校验当前有效 Roster 岗位映射，缺失映射时拒绝成功导出。
- 真实来源需要 Evaluate 登录；无登录 HTTP 401。预览与运行比较 RuleSet/Snapshot 版本，版本变化返回 409。新服务不读取浏览器凭据、不创建管理员会话。

## 语义与边界

Coverage 计算实际 `[start,end)` 区间内每个完整 30 分钟槽的去重员工人数；开早是首个覆盖区间起点的精确开始人数，包含 Full。Early 与 Late 员工集合不必互斥，Full 只记录一次完整班次和一次名义时长。没有 69 班硬性要求。

允许的班型、岗位和时间来自 RuleSet，候选生成仅枚举个人合法区间，不决定人员分配。LLM 自主选候选 ID。候选按实际评分、已累计工时和偏好计算的综合优先级呈现；剩余日期提供按班型的资格/Availability 摘要。最终硬校验仍独立执行，候选有效不等于组合有效。

原规则未启用数值工时限制时，不静默套用历史全局限制。`Policy` 可明确设置本次运行的名义日/周上限；有现有启用上限时只能收紧。合成 CLI 和界面默认 **38 小时测试周上限**，不是法定上限或确认过的生产规则；切换 REAL 时界面清空测试上限。权重、低工时阈值与修复预算可配置。

V1 明确不实现休息安排、跨日回溯、复杂交接或自动发布。只验证名义覆盖，`total_paid_minutes=null`，`publishable=false`。日历兼容字段 `breakMinutes=0` 表示此草稿尚未排休息，**不表示员工不需要休息或净有薪时长已经确认**。合规/工资处理必须通过现有流程。

日期范围为同一周内连续 1–7 天；支持先测周一至周三。V1 拒绝跨午夜生成与孤立短班，不能静默跳过遗留 demand / headcount / opening-qualified 规则。既有目标门店班次全部作为固定状态保留，外部门店和目标范围之外的本周工时计入台账，重叠与适用上限一并校验。

## 执行与审计

1. Agent 1 输出 `SchedulingContext`，与规范化原始输入逐项比较，只允许新增优先级建议。
2. 必要资格上界检查可证明某些覆盖不足/固定班次超额；它不排班，也不声称上界通过就一定可行。
3. Agent 2 依次提交当天 `DailyScheduleProposal`；校验失败时台账和状态版本不变，只修复同一天。
4. Orchestrator 在硬校验、工时重算再次验证通过后原子提交，并保存 v1…v7 的工时快照。
5. Agent 3 输出未排/低工时分析和 `REPLACE_EMPLOYEE` 建议，不能增删班次、修改时间或更换日期。
6. Agent 4 审查并批准替换索引；Validator 对替换后的完整星期重放。失败时回到 Review 修复，不提交无效替换。完成日期后的原始需求/排班修复要求明确诊断并终止该运行，V1 不自动回改已提交日期。
7. 最终从已验证状态生成 CalendarResponse，并独立核对员工、姓名、正式评分、岗位映射、日期、时间和 DRAFT 元数据。失败无可导出 JSON。

每个阶段最多重试 5 次（默认）之外加首次尝试。LLM 收到 JSON 深拷贝，没有共享状态、数据库或发布工具的访问能力。

`.data/<run-id>/events.jsonl` 保存每个 Agent 的输入/输出、状态版本、验证和修复路由、台账及 Token/模型元数据；`result.json` 保存结果。API 只返回去掉完整输入/输出的事件摘要，完整 Trace 在本机并由 `.gitignore` 排除。当前 HTTP 会话内运行记录保存在内存，进程重启后可从本机日志审计；不是持久任务队列。

未配置费率时费用显示 UNKNOWN，不伪装免费。配置费率后的估价另标明缓存费用未计入，Token 单独记录输入、输出及缓存用量。

## 测试与回放

```powershell
cd multi-agent-engine
..\scheduling-engine\.venv-isolated\Scripts\python.exe -m pytest tests -q
..\scheduling-engine\.venv-isolated\Scripts\python.exe -m multi_agent.cli --output .data/live-synthetic-capped-week
..\scheduling-engine\.venv-isolated\Scripts\python.exe -m multi_agent.cli --end 2026-10-28 --output .data/three-days
..\scheduling-engine\.venv-isolated\Scripts\python.exe -m multi_agent.cli --scenario availability_conflict --output .data/conflict
```

测试替身仅在 `tests/scripted_provider.py`，不能由应用 API 选择，也不能假称真实 LLM。真实 CLI / 页面运行始终调用配置的 Provider。

CP-SAT 只在独立对照进程导入：

```powershell
..\scheduling-engine\.venv-isolated\Scripts\python.exe scripts/compare.py --multi-result .data/live-synthetic-capped-week/result.json --output .data/comparison-capped.json
..\scheduling-engine\.venv-isolated\Scripts\python.exe scripts/analyze_snapshot.py --snapshot ../scheduling-engine/.data/hurstville-real-2026-10-26-2026-11-01.json --detach-target-for-comparison
```

对照统一按名义覆盖重放，CP-SAT 对照的休息数量仅在内存副本设为 0，以免把尚未解决的休息差异混入名义覆盖比较。人工历史班表使用不同员工快照，单列参考，不作相同输入的优劣排名。`--detach-target-for-comparison` 只在内存分离该冻结 Snapshot 的已发布目标班次，不删除或改写实际班表。

详细审计、真实 LLM 结果与限制见 [验收记录](docs/acceptance-2026-10-31.md)。Provider 请求结构依据 [官方 Messages API](https://platform.claude.com/docs/en/api/messages/create) 和 [tool schema 文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)，所有返回仍由本地 Schema 独立校验。
