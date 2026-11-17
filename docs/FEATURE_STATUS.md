# 功能状态（区分实现、验证与生产可用性）

| 功能 | 分类 | 依据与当前限制 |
|---|---|---|
| 两套 UI / Worker 构建 | 已完成并有验证依据 | 本次 production-site 独立 build 成功；本地两套前后端 build 成功 |
| 管理员 Evaluate 登录、员工新增、Roster workforce 投影 | 已完成并有验证依据 | 本次内存 D1 合成数据跨模块检查通过；不代表所有生产流程重新验收 |
| 门店、员工、岗位、当前技能、评价轮次与正式分数 | 已实现；部分已有测试，本次全量结果见 TEST_REPORT | Evaluate routes/services；CLOSED 不可变约束；本次未用真实人员写入验收 |
| Availability 管理、AA/BB/CC 脚本 | 已实现；自动化覆盖 | 原始码配置来源不能改成 LLM 生成规则；并发版本/范围校验见源码 |
| 普通员工自助报班账号 | 模拟功能 | sites_demo_* / employee-demo routes；没有 UserAccount→EmployeeID 正式绑定 |
| 手动新增、修改、草稿、发布、历史与 CSV/打印 | 已实现；自动化覆盖 | RosterService、routes、ExportPage；本次只做隔离测试，无生产写入验收 |
| 本地 CP-SAT 排班与确定性验证器 | 已实现并有本次验证依据 | 90 个选定引擎测试通过，不能推定所有规则组合或线上求解已验收 |
| Sites 自动排班 | 未连接 / 不可用 | 明确 503 stub，health automaticScheduling=false |
| Xero OAuth、员工/Rate 映射、preview/确认、Draft sync、history/retry | 已开发但真实外部集成未验证 | 后端 Mock 测试；缺少真实 Client 配置与人工 OAuth；真实写入未尝试 |
| Xero 自动定期同步 | 未实现 / 关闭 | 无可靠已启用后端调度验收 |
| XLSX 导出 | 未发现实际实现 | 现有 CSV/打印仍保留，不能把 CSV 宣称为原生 Excel workbook |
| Staff SSO / 员工中心整合 | 未实现 | 本阶段仅评估；公开 discovery 返回 HTML；后端资料待提供 |
| 正式员工通知/确认、ZiiPOS | 无法确认或未发现实现 | 没有生产端到端证据，不能承诺存在 |
| 本地未提交功能 | 开发中 | development 下保留 547/140 条 dirty 来源，范围见 DEVELOPMENT_STATUS，不混入生产快照 |

“已实现”不等于“本次已完整人工验收”，特别是员工真实身份、外部服务、通知和自动求解。具体失败/跳过测试应作为接手后的优先项。
