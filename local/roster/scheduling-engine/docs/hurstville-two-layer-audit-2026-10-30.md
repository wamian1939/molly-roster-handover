# Hurstville 双层排班约束审计（2026-10-30）

## 边界与来源

- 本次只修改独立 Scheduling Engine Lab。`hurstville:v15`、正式排班、员工资料、Evaluate 评分和数据库结构均未改写。
- 对照输入：`.data/hurstville-real-2026-10-26-2026-11-01.json`，SHA-256 `B4E2B7DB20C6C98519FC56C6576F802E92630F6C018BECD94FB89E632FD3EFA7`。它包含 25 名员工、75 段可用时间、41 条当周已发布班次。比较时只在内存副本中移除目标周的 41 条已发布班次；原快照仍保留。
- 原规则从只读的 Lab SQLite 精确读取 `hurstville:v15`。提案位于 `configs/hurstville-two-layer-proposal.json`，版本标注 `UNSAVED`，不会替换 v15。
- 快照的 `leave_data_complete`、`compliance_policy_confirmed`、`staffing_rules_confirmed` 均为 `false`。因此全部结果仅限探索，正式验收状态仍是 `NOT_ELIGIBLE`。

## 代码审计：原有行为

| 问题 | 代码证据 | 实际影响 |
| --- | --- | --- |
| `pattern_only` 下 V1 不使用时段覆盖 | `engine/config.py` 中将需求槽写为 0；`engine/solver.py` 中 `all_slots=[]` | V1 的班型等式不能证明每半小时真实在岗人数。 |
| V1 将 `pattern_minimums` 当精确数量 | `engine/solver.py` 的 `assigned_count == minimum`，尽力模式为 `assigned_count + gap == minimum` | 名称虽叫 minimum，实际不能多排。 |
| 旧 V2 将相同字段解释为连续阶段的精确总排班人数 | `engine/v2.py:compile_coverage()` 与旧分支的 `scheduled + gap == required` | 周一 `开早3、Early4` 只要求 11 点总共 4 人，不要求 4 个 Early；全天班可替代阶段人数。 |
| 旧 V2 没把休息后的净在岗作为硬性最低 | `engine/v2.py` 旧分支只把 `effective_gap` 记账 | 可能显示排班人数已满，而休息时真实工作人数下降。 |
| `allow_early_late_start` 仅标记已声明的较早开始时间 | `engine/candidates.py:generate_candidates()` | Late 只生成 16:00 和 17:00，不会凭该布尔值发明其他开始时间。 |
| Full 岗位与其他班型使用不同 formal role ID | v15 JSON 与真实 Snapshot 的岗位资格 | 25 人具备其他班型对应岗位资格，只有 4 人具备 Full 的 formal role 资格。不能为了提高 Full 数量擅自放宽资格。 |
| `unnecessary_work` 在旧 V2 由 API 映射为净工作槽惩罚 | `api/app.py` 与 `engine/v2.py` 的 `net_work_slot_weight * work_slots` | 不是直接惩罚班次数；旧 V1 同样按净工时槽计。 |
| 旧目标数值未统一 | 旧 V2 将正式分数乘 10、成本以分计、工时按槽计 | 权重的数字不能直接互相比较；30 秒耗尽时后续评分阶段可能根本未执行。 |
| 星期索引 | `RuleSet.for_date()` 使用 Python `date.weekday()` | `0=周一`，`6=周日`。 |

## 新增的规则语义

选择 `requirement_mode: PATTERN_AND_COVERAGE` 才启用双层模型；缺省值继续使用 v15 的旧解释。

1. `weekly.pattern_minimums` 在新模式下是真正的班型最低数。`weekly_pattern_bounds` 可以补充最低、最高、精确数量及是否允许额外班次；补充字段不能降低原有最低数。
2. `weekly_coverage` 独立配置每个星期、每个时段的 `min_staff`、`target_staff`、可选 `max_staff` 与可选岗位最低数。最低数按实际工作人数计算；休息中的人不计入。目标是软目标；上限只有显式填写时才是硬约束。
3. `STRICT` 不允许班型或实际在岗最低数缺口。`BEST_EFFORT` 明确记录每个缺口并显示已有候选，不能解释成规则已全部满足。人工锁定班次保持不变。
4. `minimum_complete_shift_minutes` 是可配置的业务下限。Hurstville 提案设为 180 分钟，避免出现孤立 1 小时班；它不是未经核实的法律规定。
5. `BreakRule.granularity_minutes` 可独立于 30 分钟人力格设为 10 分钟等可整除粒度。求解器以更细粒度校验短休息期间的净在岗，带薪休息计入有薪时间但不计入实际工作覆盖。

### 未保存的 Hurstville 提案

| 星期 | 开早最低 | Early 最低 | Full 最低 | Late 最低 | 10–11 最低/目标 | 11–17 最低/目标 | 17–22 最低/目标 |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 周一至周三 | 3 | 4 | 0 | 4 | 3/3 | 4/5 | 4/4 |
| 周四至周五 | 3 | 5 | 0 | 5 | 3/3 | 5/5 | 5/5 |
| 周六 | 3 | 7 | 0 | 6 | 3/3 | 7/7 | 6/6 |
| 周日 | 3 | 7 | 0 | 5 | 3/3 | 7/7 | 5/5 |

提案保留 v15 的岗位 ID、班型时刻、休息时长和权重。11–17 的目标 5 人取自本次任务给出的参考场景；它是**待业务确认的软目标**。周一有 3 个开早加 4 个 Early 时，11–17 理论排班人数为 7，超出目标 5 的 2 人属于软目标偏差，并非自动违反硬上限。提案没有填写 `max_staff`。

## 求解与独立验证

- 决策变量仍采用现有候选完整班次及休息方案；每人每天最多 1 个班次，Availability、岗位资格、技能、请假、锁定班次和已配置的周工时/班间休息继续作为约束。
- 三层目标为：最低需求缺口 → 运营目标偏差及多余工时/班次 → 分数、成本、公平性、稳定性和偏好。每层的最优值或限时最优上界成为下一层约束。后续阶段未到达时记录 `NOT_REACHED`，未证明全局最优时记录 `priority_proven=0`。
- 新模式的评分单位改为每 30 分钟的正式评分百分值；成本启用时按每班四舍五入的澳元计。`labor_cost=0` 继续关闭成本目标。原 v15 的分数、工资或员工数据未改写。
- 结果由独立回放复算：班型数量、每个内部时间槽的在岗与休息、岗位匹配、Availability、净/有薪工时、固定班次、短班次和跨班冲突。每班说明会给出班型最低数贡献及移除该班后实际缺口的变化；这只是可核查的局部解释，不冒称全局因果证明。
- 明显的规则冲突会提前给出 `V2_PATTERN_COVERAGE_MAX_CONFLICT`；不同员工可用性与岗位资格不足给出 `V2_PATTERN_ELIGIBILITY_SHORTAGE`。

## 真实一周对照与复现

运行：`cd scheduling-engine` 后执行 `.\\.venv-isolated\\Scripts\\python.exe scripts\\audit_hurstville_two_layer.py`。脚本只读本地 Snapshot 与 v15 规则，输出 `.data/hurstville-two-layer-comparison.json`。两次求解使用相同员工、Availability、正式分数、目标日期和 30 秒预算；模型语义不同，所以两列的缺口不可当作同一指标的改善百分比。

最新逐项数值以该 JSON 为准。真实数据的结果会存在缺口，`FEASIBLE` 只表示在对应模式下找到了可展示的候选；`priority_proven=0` 表示没有证明全局最优。

## 法规边界与剩余风险

[Fair Work Ombudsman 的 Breaks 说明](https://www.fairwork.gov.au/employment-conditions/hours-of-work-breaks-and-rosters/breaks)明确指出，休息长度、时间、带薪与否以及班间休息依适用 Award 或 registered agreement 而定。本次没有确认 Hurstville 员工适用的具体 Award/协议，故没有把某个行业条款硬编码到全部门店。

目前每个班型的 `BreakRule` 可配置带薪或无薪和短休息粒度，但**同一班次内同时组合多种不同付薪状态的休息**仍未建模。真实快照也没有已核实的全部请假、工时合同及精确休息时刻。因此候选班表不能用于合规或发布验收。30 秒限时与单线程随机种子使小规模确定性测试可重现，但真实全周限时搜索不保证逐班完全相同。

