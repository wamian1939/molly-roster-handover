# 外部依赖状态

| 服务 | 当前状态 | 源码/调用与限制 |
|---|---|---|
| Evaluate Molly | 生产真实集成 | 同域 `/api/evaluate`；员工/账号/门店/技能/正式分数；本地通过 EVALUATE_API_BASE_URL 调用 |
| ChatGPT Sites / D1 | 真实部署，version 5 已核实 | `server/worker.mjs`、`server/snapshot-db.mjs`；本次不改绑定/访问策略 |
| Python OR-Tools / CP-SAT | 本地实现，有隔离测试；Sites 未连接 | `local/roster/scheduling-engine`；原生库不能直接作为 Worker ESM 依赖；没有已部署 HTTPS 求解器地址 |
| Multi-Agent 模型 API | 本地实现，生产入口明确不可用 | `multi-agent-engine`，MULTI_AGENT_* / ANTHROPIC_*；规则解释/编排不得替代确定性验证器 |
| DeepSeek 评价文本 | 调用代码真实存在，当前真实返回未验收 | `generated/evaluate/aiTextEvaluationV1.ts`，AI_ANALYSIS_PROVIDER / DEEPSEEK_API_KEY / DEEPSEEK_MODEL / DEEPSEEK_BASE_URL / AI_ANALYSIS_TIMEOUT_MS；secret 不随包交付 |
| Xero Payroll AU | 代码已开发、Mock 测试；真实 OAuth 与公司写入未验证 | `generated/vendor/payroll`，Timesheets 2.0 与其他资源按实际客户端版本；需要管理员授权、真实映射/Calendar/Rate；默认只 Draft |
| Zii / ZiiPOS | 未找到直接 API 集成依据 | 不将文件/文本提及视为真实接入 |
| Email / SMS / 员工通知 | 未核实真实发送闭环 | 无有效生产通知投递验收；发布班表不是通知送达证明 |
| Staff 员工中心 | 公开前端可读，Roster SSO 未实现 | `staff.mollytea.com.au`；后端/DB/协议缺失，详见 STAFF_INTEGRATION |

Xero OAuth 需要 XERO_CLIENT_ID、XERO_CLIENT_SECRET、XERO_TOKEN_KEY（32字节 base64）、XERO_REDIRECT_URI，tracking 可选 XERO_ENABLE_TRACKING；均仅服务端。连接管理员选择 tenant，员工手工确认映射，确认 Payroll preview 后 sync。没有真实组织凭据，禁止用生产公司进行测试。本次未发起 OAuth、刷新、写入或支付。自动 payroll sync 未实现/默认不可用。

Excel 是此前需求称呼；实际可取得导出为 CSV 和打印，不把按钮或需求文档当成已有 XLSX 写入器。`payroll/preparation.ts` 共享分钟工时计算；不会统一扣 1 小时。Tracking、半月/月历发薪、Award 工资规则有明确限制，详见现有 `docs/XERO_PAYROLL.md`（如位于 local/roster/docs）和客户端/测试。
