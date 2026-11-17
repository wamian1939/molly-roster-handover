# 合成样本

本包不含真实员工数据 dump。可执行的纯合成样本生成器为 `production-site/tools/handover-local.mjs`，直接在内存 D1 初始化 schema、合成管理员/门店/岗位/技能，并通过真实 API 创建 `synthetic-employee-001`。密码在运行时由用户环境或 check 模式随机生成，退出清空。

development 各自 tests/fixtures 中的人员标识已替换为 HandoverEmployeeNNN 等合成文本，保留等值/大小写匹配语义。原 .local export 驱动的 E2E 未提供真实 fixtures；不拿这些合成样例冒充脱敏真实生产 dump。
