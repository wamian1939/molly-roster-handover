# 每周班型人数规则与真实一周验收

2026-10-26，Hurstville Scheduling Engine Lab，独立实验环境。引擎版本 `0.1.23`，规则版本 `hurstville:v7`。正式班次写入开关为 `false`。

## 当前规则

| 星期 | Early | Full | Late |
|---|---:|---:|---:|
| 周一 | 4 | 0 | 4 |
| 周二 | 4 | 0 | 4 |
| 周三 | 4 | 0 | 4 |
| 周四 | 5 | 0 | 5 |
| 周五 | 5 | 0 | 5 |
| 周六 | 7 | 0 | 6 |
| 周日 | 7 | 0 | 5 |

七天人数与先前 `hurstville:v6` 一致。新版本保存 `pattern_only=true`、`enforce_work_rest_limits=false`、`dates={}`、`employee_limits={}`、空 `demand`，开早人数与开早资格人数均为 0。新模式的引擎只把上述完整班型人数作为人力需求目标。班型起止时间、岗位、休息次数和时长仍定义完整班次；员工可用时间、正式岗位资格、已提供的请假与班次冲突仍参与检查。休息发生时刻不要求预先确定。

规则界面只编辑周一至周日的班型人数及班型定义；旧规则保留为只读历史。截图：[Hurstville 规则页](pattern-only-rules-hurstville.png)。

## 真实来源验收

范围：`2026-10-26` 至 `2026-11-01`，`Australia/Sydney`。从真实来源读取 25 名员工、75 段可用时间、41 条周边已发布员工班次。运行采用只读重排对比，目标日期的已发布班次仅从候选求解中排除，仍作为人工参考。来源版本为 `evaluate:f40e5470d3fdbc2d0300c54321c0d39d|source:533fda477e70d266d1e0`。

| 模式 | 运行 ID | 状态 | 候选班次 | 诊断 |
|---|---|---|---:|---|
| STRICT | `b0cb6978-05b7-47e3-a81b-28b47d116bcf` | INFEASIBLE | 0 | 10 月 28 日 Early 需 4 人，整段可用的合资格员工只有 3 人 |
| BEST_EFFORT | `4f7ce365-2aa8-4a50-8481-1816587c7d4c` | OPTIMAL | 68 | 10 月 28 日 Early 缺 1 个完整班次，其余每日班型人数达标 |

两次运行的独立验证错误均为 0，所有逐时段需求均为 0。`OPTIMAL` 仅表示该模式和已知输入下的最优候选；两次运行的验收门均为 `NOT_ELIGIBLE`，没有向正式 Roster 发布或写入班次。当前来源没有已批准请假的权威表，因此运行属于探索性验证。

## 检查记录

- `scripts/test-lab.ps1 -SkipInstall`：227 个后端测试通过，比较和时间显示测试通过，前端构建通过。
- 文案与结果展示调整后再次执行 `npm run build`：通过。
- Lab 启动后 `/api/health` 返回 `engine_version=0.1.23` 与 `formal_roster_write=false`。
- 写入 v7 前已备份独立 Lab SQLite 至 `.data/backups/lab-before-pattern-only-2026-10-26.sqlite3`，SHA-256 为 `7B29DA3E2BEF9B9C543E4FAC1E33050158E0C61F55F13967784C73F126B34015`。
- 用只读账号对正式 Roster 的七张表做前后摘要；行数和 SHA-256 全部一致。
