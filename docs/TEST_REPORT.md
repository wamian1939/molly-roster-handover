# 本次实际测试报告

日期：2026-11-17；仅在原工作区之外的脱敏副本执行，不对生产服务写入、迁移或破坏性测试。Node20.19.0 / Python3.11.7 / Windows；五个构建目标均通过。

| 项目 | 总数 | 通过 | 失败 | 跳过 |
|---|---:|---:|---:|---:|
|Roster backend|358|286|0|72|
|Roster frontend|587|583|4|0|
|Evaluate backend|200|160|0|40|
|Evaluate frontend|101|101|0|0|
|CP-SAT selected synthetic suites|90|90|0|0|

其中 Roster backend 包含34个 Payroll/Xero Mock 用例。全量机器可读用例结果与失败首行见 TEST_RESULTS.json；没有把先前任务的测试结果冒充本次执行。

生产 Worker：npm ci --ignore-scripts、npm run build、node tests/smoke.mjs、node tools/handover-local.mjs --check 均成功。check 在内存新库执行4个生产 SQL 迁移、创建纯合成账号/门店/技能/岗位，通过真实员工 API 新增，检查 Roster 同一员工 ID 和未认证401；外部生产请求数0。

本地四个项目：各目录 npm ci --ignore-scripts、npm run build、npm test。backend build 会 generate Prisma client，但不迁移数据库。

CP-SAT：用原已安装隔离 venv 的 Python 只执行副本中的四个合成测试文件（test_engine_scenarios.py、test_dst_instant_order.py、test_joint_breaks_and_overnight.py、test_v2_coverage.py），90 passed in53.02s。解释器依赖已存在，**没有验证从全新机器 pip install 的完整过程**；requirements 可供重建。

## 仍然失败的测试

- `local/roster/src/pages/TemplatesPage.test.tsx` — Templates store scope keeps a created shift template visible when the follow-up list refresh fails；AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
- `local/roster/src/pages/TemplatesPage.test.tsx` — Templates store scope keeps a created availability template visible when its list refresh fails；AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
- `local/roster/src/pages/TemplatesPage.test.tsx` — Templates returning-store refresh refreshes a completed shift-template save after A to B to A navigation；Error: Unable to find an element with the text: store-a 更新后早班. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.
- `local/roster/src/pages/TemplatesPage.test.tsx` — Templates returning-store refresh does not let an earlier returning-store read overwrite the committed template；AssertionError: expected 2 to be 3 // Object.is equality

模板页面失败已用单文件再测复现（21项中17通过、4失败）。该 TemplatesPage.tsx 与原本地工作树字节相同；本次没有修改它来掩盖问题。不能仅凭副本测试断言生产一定存在相同问题。

脱敏初期出现的大小写重名匹配、Handover 名称与旧 Synthetic 禁止字段正则冲突、普通“培训”标签被误识别，已在**副本的脱敏处理**中修正并重新运行，Evaluate前后端现均通过；业务原始代码未改。

## 未运行及原因

- PostgreSQL integration tests: RUN_DATABASE_TESTS not enabled, no DB supplied
- private real-export Sites e2e fixtures withheld
- real Xero OAuth and company writes
- full scheduling-engine suite and external model calls
- production mutation/manual browser E2E

Postgres skip 共112项，显式 RUN_DATABASE_TESTS=1 才开启。不能以通过的 Mock 测试代替 PostgreSQL事务、真实身份或 Xero Demo 公司验收。部署/源码 provenance 与只读门店检查另见 PROVENANCE、STORE_MAPPING。

npm audit 报告见 DEPENDENCY_AUDIT.json：生产Site5 high；Roster前端4 high/10 moderate、后端7 high/2 moderate；Evaluate前端5 high/10 moderate、后端4 high/3 moderate。没有执行升级或 audit fix。构建有大 bundle 与 Prisma package.json配置弃用提示；Evaluate UI测试有 jsdom scrollTo 未实现警告，但其101项通过。
