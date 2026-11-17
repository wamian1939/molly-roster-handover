# V1 验收记录（悉尼时间 2026-10-31）

## 结论

独立测试版本已经实现并通过真实 LLM 全周合成运行：四个 Agent、顺序提交、独立硬约束校验、按日工时台账、遗漏审查、同日替换复核和 CalendarResponse JSON 导出均可运行。

**尚未完成真实门店最新 Snapshot 的全周验收，也未完成浏览器视觉验收。** 真实接口需要有效 Evaluate 登录；本次运行未读取浏览器凭据或替用户创建登录会话。已有冻结真实 Snapshot 的独立分析证明周三存在资格/Availability 覆盖缺口。不能将合成全周成功宣称为门店全周成功或正式发布资格。

## 审计证据与适配决定

| 范围 | 当前实现及处理 |
|---|---|
| 后端 | `backend/package.json`、`backend/src/routes.ts` 确认 Express/Prisma；未发现需要接入的 .NET 后端 |
| 日历 | `src/types/roster.ts` 的 CalendarResponse/Shift；Lab 复用 `ScheduleViews.tsx` |
| 创建 API | `backend/src/routes.ts` 的 shiftCreateSchema 需要真实 Roster shiftRoleId；新引擎不调用写入端点 |
| RuleSet | `engine/models.py`，本次读取 Hurstville v20 精确时段规则；v16 与所有既有版本保留 |
| 员工身份/正式岗位 | 原 `adapters.real._employees`，Evaluate canonical ID 和 positions ID |
| 正式评分 | Evaluate `rosterIntegrationService.ts` 调用 `loadLatestValidClosedAggregates`；`roundAggregateRead.ts` 筛选 CLOSED 且有效的汇总；原适配器使用 officialScore.score |
| Availability | 原 `load_snapshot` / `_effective_availability`，保留 UNAVAILABLE 否决与未知状态，不创建第二来源 |
| 岗位映射 | REAL 读取当前 shift_roles 并使用原 `map_historical_shift_roles` 和原技能优先关系，避免把正式岗位 ID 误当 shiftRoleId |
| Employee 类型 | Snapshot 仅有 employment_type，不能假装它等于业务 employeeType；新输出明确 UNKNOWN，并将可得 employmentType 另存 |
| 休息/工资 | 不排休息，只计算名义覆盖，paid minutes 为 null，所有结果不可发布 |

没有变更 Prisma schema、数据库结构、生产班次、员工数据、发布逻辑、CP-SAT 代码或保存的 Hurstville RuleSet。工作区原有大量修改均保留。

## 真实 LLM 全周结果

输入使用实际 Hurstville 七日覆盖规则和明确标记为 MOCK 的 18 名合成员工，评分为测试评分，资格与 Availability 为合成测试数据。每次 Agent 请求都是真实配置的 LLM Provider 调用；不存在生产路径的脚本排班兜底。

最终全周运行：`.data/live-synthetic-capped-week/`。

| 指标 | 结果 |
|---|---:|
| 四 Agent 调用次数（含重试） | 18 |
| 同日/Review 修复事件 | 7 |
| 已提交每日台账版本 | v1–v7 |
| 独立完整班次 | 48 |
| Full | 21 |
| 周一完整班次 | 5（3 Full + 1 Early + 1 Late） |
| 验证时间槽 | 168 |
| 人数不符时间槽 | 0 |
| 名义总工时 | 402 小时 |
| 本次显式测试名义周上限 | 38 小时/人 |
| 实际最高个人名义工时 | 36 小时 |
| 0 小时员工 | 1 人，Agent 3 明确识别并解释保留原因 |
| 输入 / 输出 Token | 250259 / 13986 |
| 费用 | UNKNOWN，未配置实际 Provider 费率 |
| 最终状态 | DRAFT_VALIDATED |
| 发布资格 | false |

该运行保留了 LLM 的失败过程：人数不足/超额、超周上限，以及 Audit 首次输出 Schema 不符都被拒绝并重新验证。失败提案没有更新台账。最终 Audit 未批准替换；有效与无效替换分别有独立自动化测试覆盖。

曾先运行无周上限版本：59 班、10 Full，168 槽精确覆盖，但最高工时达到 84 小时，不能接受为公平性证明。随后增加组合优先级的候选排序、相近评分公平性提示、明确的测试周上限并重新运行。两组数据不是单一权重的受控因果实验，不能将全部差异归因于某一个权重；正式评分、累计工时、偏好的计算项在 Agent 输入与日志中可核对。

完整 SchedulingContext 由经过 LLM 理解和一致性验证的需求清单，以及程序从同一 Snapshot/RuleSet 确定性补入的员工、评分、资格、Availability、批准休假、已有班次、班型定义、工时限制组成。避免让模型重新抄写和篡改权威数据。来源摘要对集合排序后计算，可跨 Python 进程稳定回放。

## 自动化与运行时验证

- 新引擎：39 项测试通过，覆盖 Full/开早包含关系、半开区间边界、16:00 结束后的覆盖、重复员工、评分/工时组合、未知评分、资格/技能、Availability/休假、外部工时、日/周上限、失败不提交、连续三日台账、已完成日期保护、LLM 状态隔离、上下文一致性、替换与回算、JSON 一致性、登录边界、版本冲突、失败导出 409、跨进程来源摘要。
- 旧 Scheduling Engine：完整 294 项回归通过。
- Lab React：TypeScript/Vite build、`test:comparison`、`test:time` 通过。原有构建提示 Tailwind content 未配置；测试环境有 Starlette/httpx 弃用提示，均非失败。
- 实际服务：`GET /multi-api/health` 200、界面与静态资源 200、MOCK 输入 200、未登录 REAL 输入 401。
- 当前代码另外通过真实 HTTP 发起四 LLM Agent 的周一运行：POST 202、最终 DRAFT_VALIDATED、5 班（3 Full + 1 Early + 1 Late）、完整上下文含 18 名员工、导出 HTTP 200。记录为 `.data/http-live-verification.json`。
- 已运行样例加载端点会从原 Trace 还原权威输入，重新执行上下文、全周 Validator 和 CalendarResponse 核对，再开放会话内导出；结果/导出 HTTP 200。
- `.data/validated-example.json` 是重新回放后包含完整上下文和运行 Policy 的可查看结果。
- 只读数据库基线/结束对照：Roster 7 张表行数与内容 SHA256 完全相同，文件为 `.data/formal-before.json` 和 `formal-after.json`。
- 浏览器视觉与交互验收未完成：浏览器连接 host 不可用，Windows Computer Use 随后因无法可靠确定 URL 而停止。没有将 HTTP 200 或 TypeScript 构建当成视觉通过。

## CP-SAT 与人工参考

对照程序 `scripts/compare.py` 在独立进程运行，绝不由新引擎导入。统一按名义 `[start,end)` 覆盖重放，CP-SAT 的休息生成只在对照内存副本关闭。

| 同源合成场景 | Multi-Agent | CP-SAT |
|---|---|---|
| 无名义周上限 | 59 班、10 Full、0 槽差异 | FEASIBLE，48 班、21 Full、0 槽差异 |
| 显式 38h 测试上限 | 48 班、21 Full、0 槽差异 | 30 秒限制内 UNKNOWN，无可用候选；不代表不可行 |

历史人工参考来自 2026-10-27 生成的冻结真实员工 Snapshot，有 41 个班次、315 名义小时。相对于本次精确时段规则有 144 槽人数差异。其员工数据与合成输入不同，原班型名称也未保存在 Snapshot，因此不能把该差异当成同条件性能排名或将 Full 数量误报为 0。

## 冻结真实 Snapshot 的独立诊断

使用 `.data/hurstville-real-2026-10-26-2026-11-01.json`，Snapshot 生成于 2026-10-27 13:23 UTC（悉尼 2026-10-28 00:23），本次没有实时刷新。

仅在内存中显式分离 41 个已发布目标班次作为比较，实际数据保持不变。对所有个人合法班型做必要资格上界分析，**10 月 28 日 11:00–16:00（悉尼）** 的 10 个半小时槽要求 4 人，但最多只有 3 名合格且 Availability 覆盖的员工。即使不保留目标已发布班次，也无法满足该冻结来源的当前精确规则。

该诊断没有使用优化求解器，没有分配员工，也没有降低需求。上界通过的其他日期不等于证明整个排班可行。REAL API 仍需有效登录读取最新版本；不会用合成员工或旧 Snapshot 冒充实时来源。

## 明确限制

V1 没有生产写入/发布入口；不自动回改先前完成日期，不自动排休息、不处理跨午夜生成，不推断未知有薪工时。当前 HTTP 任务存储为单机内存加本机 Trace，不是分布式队列；进程重启后不能恢复执行中的任务。评分与累计工时为可观测软决策因素，没有声称求得全局最优或证明排序公平性在所有 LLM 输出中必然最优。
