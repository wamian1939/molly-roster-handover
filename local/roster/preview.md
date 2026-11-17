# Molly Roster — Codex Goal Mode Master Task

> **用途**：将本文件放入新建的排班项目目录，并交给 Codex 的目标模式 / 长时间运行模式执行。  
> **建议项目名**：`Molly Roster`  
> **相邻项目**：`Evaluate Molly`  
> **核心目标**：在不把排班功能重新塞回 Evaluate Molly 的前提下，建立一套独立、可长期维护的排班系统；功能上复刻现有排班软件的核心工作流，视觉上保持 Evaluate Molly 的品牌和前端设计语言，并实时使用 Evaluate Molly 中的员工、员工类型、正式综合评分、Tier 和技能数据。

---

# 0. Mission

你现在接手一个新的独立项目：

```text
Parent Folder/
├─ Evaluate Molly/
└─ Molly Roster/
```

`Evaluate Molly` 是现有员工评价与员工能力系统。

`Molly Roster` 是新的独立排班系统。

本任务不是把排班页面继续添加进 Evaluate Molly，而是：

1. 在 `Molly Roster` 中建立独立排班产品；
2. 复刻参考排班系统的核心功能；
3. 视觉、组件、交互与 Evaluate Molly 保持统一；
4. 员工、门店、员工类型、正式综合评分、Tier 和技能由 Evaluate Molly 提供；
5. Roster 自己维护班表、班次、员工可用时间、排班模板、发布状态和导出数据；
6. 不复制第二份 Employee 主数据；
7. 排班时必须直观看到员工评分和岗位能力；
8. 最终达到真实门店可以开始内部试用的状态。

---

# 1. Goal Mode Execution Contract

你现在进入长期 Goal Mode。

不要每完成一个小步骤就停止等待用户。

执行顺序必须是：

```text
理解现状
→ 建立 integration contract
→ 建立 baseline
→ 设计数据模型
→ 实现核心排班
→ 浏览器真人测试
→ 修复
→ 再测试
→ 完成次级功能
→ 全量回归
→ 最终报告
```

除非发生以下情况，否则持续执行：

1. 额度即将耗尽；
2. 需要用户登录、MFA、密码或外部账号授权；
3. 需要付费；
4. 需要破坏性删除真实生产数据；
5. 遇到本文件无法解决的真实业务歧义；
6. 工具或环境完全阻塞。

如果额度即将耗尽：

- 收束当前修改；
- 保证项目可 build；
- 跑当前阶段必要测试；
- 更新 `GOAL_MODE_PROGRESS.md`；
- 写清已完成、未完成、下一步；
- 不要留下无法运行的半成品。

---

# 2. Do Not Merge the Two Products

必须保持两个产品职责清晰。

## Evaluate Molly 负责

- Employee 主档案；
- Store；
- Account / Authentication；
- TRAINING / REGULAR；
- SkillDefinition；
- EmployeeSkill；
- 评分；
- Evaluation Round；
- CLOSED Round 综合评分；
- Tier；
- 历史评分；
- 员工当前能力。

## Molly Roster 负责

- 员工 Availability；
- 周 / 双周排班；
- Calendar；
- Shift；
- Shift Assignment；
- Shift Role / Job Tag；
- Break；
- Shift Note；
- Preset Shift；
- 批量操作；
- 发布排班；
- 导出；
- 技能覆盖警告；
- 工时汇总。

不要让 Roster：

- 修改评分；
- 修改 Round；
- 修改 Evaluation；
- 重算 Overall Score；
- 修改 Tier；
- 修改员工敏感 HR 信息；
- 复制第二份 Employee 主表作为权威来源。

---

# 3. Context and Token Budget Strategy

用户明确希望两个项目分开，避免 Codex 每次处理 Roster 都扫描整个 Evaluate Molly。

因此必须建立最小上下文边界。

## 第一次执行允许检查 Evaluate Molly

只为提取以下内容：

- API/Auth 契约；
- Employee/Store/Score/Skill DTO；
- Molly Logo；
- 品牌色与 design tokens；
- AppShell 视觉；
- Custom Select；
- Button；
- Dialog；
- Toast；
- Error/Empty/Loading；
- typography；
- motion tokens。

## 必须建立本地契约

在 `Molly Roster/docs/` 中创建：

```text
EVALUATE_INTEGRATION_CONTRACT.md
EVALUATE_STYLE_CONTRACT.md
```

完成后，后续 Roster 开发默认只读取：

- Molly Roster 自身代码；
- 上述两个 contract；
- Evaluate 暴露的 API schema / generated client。

不要每次重新全文扫描 Evaluate Molly。

如果 contract 与实际 API 不一致，才回到 Evaluate 做窄范围检查。

---

# 4. Functional Reference

用户提供的现有排班系统截图是**功能参考**，不是视觉参考。

需要复刻的核心能力包括：

- Calendar Month / Week / Day；
- Today / Back / Next；
- 月历中显示紧凑班次；
- 周 / 日时间轴；
- Day View 中拖选时间创建班次；
- 选择员工；
- 多员工同一班次；
- 班次角色 / 工作标签；
- 员工可用时间；
- 员工等级/分数展示；
- 开始时间、结束时间；
- Break；
- Preset Shift；
- Shift Note；
- Save / Cancel；
- 编辑已有班次；
- 批量操作；
- 发布 / Submit；
- Staff 页面；
- 可用时间模板；
- Export；
- Settings。

不要复刻旧系统的老旧视觉。

新 UI 必须使用 Evaluate Molly 的现代浮层风格。

---

# 5. Brand and Frontend Style Contract

Molly Roster 必须和 Evaluate Molly 看起来属于同一套产品。

## 品牌主色

```text
#e9b2b6
```

Pantone：

```text
501 C
```

## 品牌元素

- Molly 四叶草 SVG；
- Evaluate Molly 同系字体；
- 相同 icon family；
- 相同 motion family；
- 相同 custom controls；
- 相同 radius hierarchy；
- 相同 Toast / Dialog；
- 相同错误状态；
- 相同中文术语。

## App Shell

继续使用 Floating Layered App Shell：

```text
Browser / App Background
├─ Floating Sidebar
└─ Floating Main Workspace
```

要求：

- Sidebar 四角圆角；
- Main Workspace 四角圆角；
- 外层 gutter；
- Workspace 内滚动；
- desktop-first；
- responsive；
- reduced-motion。

不要退回普通矩形 Sidebar + Body。

---

# 6. Product Name and Navigation

推荐用户可见名称：

```text
Molly Roster
茉莉排班系统
```

建议一级导航：

```text
排班日历
员工与可用时间
排班模板
导出
设置
帮助
```

如果功能过多，可以把低频项放进设置或更多。

---

# 7. Shared Authentication

优先复用 Evaluate Molly 的正式账号体系：

```text
ADMIN
STORE_EVALUATOR
```

## ADMIN

- 查看全部 Store；
- 切换 Store；
- 创建、编辑、删除/归档班次；
- 发布排班；
- 导出；
- 修改 Roster 设置。

## STORE_EVALUATOR

- 只能访问自己绑定 Store；
- 只能排自己 Store 员工；
- 不能访问其他 Store 班表；
- 不能通过改 URL 越权。

不要复制一套新的 Account 数据。

如果两个应用不能直接安全共享 Session：

优先采用：

- same-origin gateway；
- 或后端验证现有 Session 的窄集成方式。

不要用 localStorage 声明 role/store。

---

# 8. Workforce Data Source

Roster 必须从 Evaluate 获取员工当前数据。

Roster 只需要最小 DTO。

推荐契约：

```ts
type RosterEmployeeSummary = {
  id: string;
  displayName: string;
  employeeType: "REGULAR" | "TRAINING";
  employmentType: string | null;
  storeId: string;
  storeName: string;
  isActive: boolean;

  officialScore: {
    score: number;
    tier: "T1" | "T2" | "T3" | "T4" | "T5";
    roundId: string;
    closedAt: string;
  } | null;

  skillSummary: {
    overallPercent: number | null;
    backOfHousePercent: number | null;
    waterBarPercent: number | null;
    frontOfHousePercent: number | null;
    qualifiedSkillCodes: string[];
    operations: {
      opening: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
      closing: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
      weeklyCleaning: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
    };
  };
};
```

Roster 不得获取：

- TFN；
- BSB；
- Bank Account；
- DOB；
- Address；
- Visa；
- Superannuation；
- Evaluation text；
- evaluator 个人评分详情；
- AI Evidence。

---

# 9. Official Score Semantics

Roster 中显示的员工评分必须是：

```text
最近一次 CLOSED Evaluation Round 的正式综合评分
```

不能显示为正式分数的内容：

- OPEN Round 临时平均；
- 某一个 evaluator 的个人评分；
- ADMIN 单独评分；
- Draft（系统当前已无 Draft）。

无正式评分时显示：

```text
未完成正式评分
```

不要显示 0 分。

---

# 10. Sync Semantics

Evaluate 是员工和评分的单一事实来源。

Roster：

- 页面打开时读取最新员工数据；
- Store 切换时重新读取；
- 新建 Shift modal 打开时使用最新员工数据；
- 支持手动刷新；
- 可以短暂 cache，但不能长期成为权威；
- 不提供“同步员工”按钮作为正常工作流。

Employee 在 Evaluate 中被：

- 改名；
- 转正；
- 归档；
- 更新技能；
- 产生新 CLOSED Round；

Roster 下次读取时必须反映最新状态。

---

# 11. Employee Archived Semantics

Archived Employee：

- 不允许被新增到未来班次；
- 不出现在默认 Staff Picker；
- 已发布历史班表仍应显示员工姓名快照；
- 不应导致历史 Shift Assignment 消失。

---

# 12. Roster Data Ownership

Roster 自己维护以下数据：

```text
RosterPeriod
Shift
ShiftAssignment
ShiftRole
ShiftTemplate
EmployeeAvailability
AvailabilityTemplate
RosterPublication
RosterStoreSettings
```

不要把这些塞进 Evaluation / EvaluationRound。

---

# 13. Recommended Roster Data Model

以下是推荐方向，可按现有技术栈调整。

## RosterPeriod

```ts
{
  id
  storeId
  startDate
  endDate
  cycleType // WEEK | FORTNIGHT
  status    // DRAFT | PUBLISHED
  version
  createdBy
  createdAt
  updatedAt
  publishedAt
}
```

## Shift

```ts
{
  id
  rosterPeriodId
  storeId
  date
  startAt
  endAt
  breakMinutes
  shiftRoleId
  note
  version
  createdBy
  updatedBy
  createdAt
  updatedAt
}
```

## ShiftAssignment

```ts
{
  id
  shiftId
  employeeId
  employeeNameSnapshot
  employeeTypeSnapshot
  officialScoreSnapshot
  tierSnapshot
  createdAt
}
```

一个 Shift 可以有多个 Employee。

## ShiftRole

```ts
{
  id
  storeId nullable
  code
  nameZh
  colorToken
  requiredSkillCodes[]
  isActive
  displayOrder
}
```

## EmployeeAvailability

```ts
{
  id
  employeeId
  storeId
  date
  startAt
  endAt
  availabilityStatus
  note
  source
}
```

## ShiftTemplate

```ts
{
  id
  storeId
  name
  startTime
  endTime
  breakMinutes
  shiftRoleId nullable
  isActive
}
```

---

# 14. Avoid Duplicating Employee Authority

Roster 数据库可以保存：

- employee external ID；
- assignment snapshot；
- cache metadata。

但不能把 Employee 全量复制成第二套可编辑主档。

Roster Staff 页面中的员工资料应为：

```text
Read-only workforce identity
+
Roster-specific availability/settings
```

Employee 创建、姓名、Store、类型和 Skill 继续由 Evaluate 管理。

---

# 15. Calendar Main Page

排班日历是系统第一核心页面。

必须支持：

```text
Month
Week
Day
```

顶部：

```text
Today
Back
Next
Current date/range
Month | Week | Day
Store
Draft/Published status
```

用户可见中文：

```text
今天
上一页
下一页
月
周
日
```

---

# 16. Month View

Month View 需要：

- 标准月历；
- 每日显示紧凑 Shift chips；
- Shift chip 显示：
  - 员工/员工组；
  - start-end；
  - break；
  - role；
- 同一天超过可见上限显示 `+N`；
- 点击 Shift 编辑；
- 点击日期进入 Day View；
- 周末可有轻微 surface 区分；
- 今天高亮；
- 已发布状态清楚。

不要让 Shift chips 过高。

---

# 17. Week View

Week View：

- 七天并列；
- 垂直时间轴；
- 班次按真实时间高度显示；
- 支持 overlap；
- 支持点击已有 Shift；
- 支持拖选空白时间创建；
- 支持拖动和 resize（如果实现稳定）；
- 保持可读性。

---

# 18. Day View

Day View 是创建班次的主要工作区。

必须实现：

```text
用户在时间轴上按下
→ 从 09:00 拖到 10:00
→ 显示 selection preview
→ 松开
→ 自动打开 Add Shift Dialog
```

Dialog 自动带入：

```text
date
start = 09:00
end = 10:00
```

---

# 19. Day Drag Selection Details

必须考虑：

- 上下方向拖拽；
- 时间自动 normalize；
- snap interval 可配置；
- 默认建议 30 分钟；
- 最短班次可配置；
- 拖动中显示起止时间；
- 松开后再开 Dialog；
- Cancel 不写 DB；
- 打开 Dialog 本身不写 DB；
- 只有 Save 才创建 Shift。

Mobile/Touch：

- 长按拖选；
- 或点击时间格后选择结束时间作为降级；
- 不能完全不可用。

---

# 20. Drag Selection Visual

拖选过程中：

- 使用 brand accent 的低透明度 selection block；
- 显示 `09:00–10:00`；
- 不要遮挡时间刻度；
- reduced-motion 下仍清楚。

---

# 21. Add Shift Dialog

参考现有系统图三的功能，但使用 Molly UI。

Dialog 至少包含：

## Shift Header

- 日期；
- 星期；
- 当前 Store；
- 新增班次 / 编辑班次。

## 班次角色

- 角色/Job tags；
- 可单选或按最终业务确定；
- 角色来自配置，不要硬编码。

## 员工选择

- Staff cards/grid；
- 评分；
- Tier；
- Employee Type；
- 可用时间；
- Skill fit；
- 是否已有冲突。

## 时间

- Start；
- End；
- Break；
- Preset Shift。

## Note

- Shift Note。

## Actions

- 取消；
- 保存班次。

---

# 22. Shift Role / Job Tags

参考系统可见标签可能包括：

- 全岗；
- 前台；
- 后厨；
- 培训；
- 带训相关角色；
- 门店自定义岗位。

由于截图文本可能并非最终业务标准：

不要把截图中的所有词永久 hardcode。

必须做成：

```text
configurable ShiftRole
```

ADMIN/Store 可以在 Settings 管理。

角色可关联 required skill codes。

---

# 23. Initial Role Seeds

可以提供合理初始项：

```text
全岗
前场
水吧
后厨
培训
带训
```

如果用户现有门店有特定名称：

通过 Settings 修改。

---

# 24. Employee Picker

员工选择是第二核心交互。

每个 Employee Card 至少显示：

```text
姓名
正式/培训
正式综合评分
Tier
当前可用时间
匹配技能
冲突状态
本周已排工时
```

例如：

```text
HandoverEmployee006
正式员工
82.4 · T2
今日可用 09:00–22:00
后厨 100% · 水吧 92%
本周 24h
```

---

# 25. Score Visibility

排班时必须能看到分数。

Employee Card：

- score 显示清楚；
- Tier 次级显示；
- 没有正式评分显示 `未评分`；
- 显示评分日期/closedAt tooltip；
- 不使用 OPEN provisional score 伪装正式分。

---

# 26. Skill Visibility

员工卡不需要铺满 13 项 Skill。

默认显示与当前 ShiftRole 相关的能力。

例如：

## 后厨班次

优先显示：

- 后厨百分比；
- 开茶；
- 奶吧。

## 水吧班次

优先显示：

- 水吧百分比；
- 贴杯/扫码/加冰/炫杯。

## 收晚班次

优先显示：

- 收晚 会/不会/未确认。

同时提供 hover/popover 查看完整 Skill Summary。

---

# 27. Employee Sorting in Picker

建议排序能力：

```text
可用优先
技能匹配优先
综合评分
本周工时少
姓名
```

默认不应只按 Overall Score 排序。

低分不代表不能排某个熟练岗位。

---

# 28. Score Is Auxiliary

不要基于 Tier 自动禁止排班。

判断：

- 员工是否能做岗位：看 Skill；
- 员工是否可排：看 Availability / conflict；
- Overall Score 只是辅助。

---

# 29. Level Filter

参考系统的 T1–T5 Level filter。

Employee Picker 可提供：

```text
全部
T1
T2
T3
T4
T5
未评分
```

但不要默认过滤低 Tier。

---

# 30. Employee Type Filter

支持：

```text
全部
正式员工
培训员工
```

培训员工 badge 使用 Molly brand pink。

正式员工使用中性专业色。

---

# 31. Multiple Employees per Shift

现有系统允许同一 Shift 有多个员工。

数据模型和 UI 必须支持：

```text
Shift
├ Employee A
├ Employee B
└ Employee C
```

Day View Shift block 中显示多个姓名。

如果人数多：

```text
HandoverEmployee006 / Bob / +2
```

点击查看全部。

---

# 32. Employee Availability

Roster 必须维护员工可用时间。

状态至少：

```text
AVAILABLE
UNAVAILABLE
UNKNOWN
```

可用时间可以有多个 time slots。

例如：

```text
09:00–14:00
17:00–22:00
```

---

# 33. Availability Picker Behavior

在 Shift modal 中：

- 班次时间完全位于 availability：正常；
- 部分重叠：警告；
- 完全不在 availability：明显警告；
- Unknown：显示未提交可用时间；
- 已有其他 Shift overlap：禁止或高强度确认。

---

# 34. Availability Override

第一版允许 ADMIN/authorized manager override Availability warning。

但必须：

- 明确提示；
- 保存 override reason 可选；
- 不能静默排入。

---

# 35. Availability Page

`员工与可用时间` 页面：

- 员工列表来自 Evaluate；
- 只读员工基本资料；
- 编辑 Roster-specific availability；
- 查看本周/下周；
- 查看 recorded dates；
- 当前正式评分/Tier；
- Employee Type；
- 搜索、筛选。

不要在 Roster 创建/编辑 Employee 主资料。

可以提供：

```text
在 Evaluate Molly 中打开员工
```

---

# 36. Availability Templates

复刻参考系统的 Preset Time Slot Script 功能，但不要使用“Script”这种技术词。

用户可见名称：

```text
可用时间模板
```

支持：

- 本周；
- 下周；
- 双周；
- 添加时段；
- 删除时段；
- 复制到员工；
- 保存命名模板。

例如：

```text
早班可用：09:00–17:00
全天可用：09:00–22:00
晚班可用：16:00–22:00
```

---

# 37. Shift Time Presets

Add Shift Dialog 中支持：

```text
选择班次模板
```

例如：

```text
早班 09:00–17:00，Break 0.5h
中班 11:00–19:00，Break 0.5h
晚班 14:00–22:00，Break 0.5h
收晚 17:00–22:00，Break 0h
全天 10:00–22:00，Break 1h
```

具体可配置。

---

# 38. Break

Break 支持：

- 0；
- 15 min；
- 30 min；
- 45 min；
- 60 min；
- 自定义。

班次显示：

```text
10:00–17:00
Break 0.5h
Net 6.5h
```

---

# 39. Shift Validation

保存前验证：

- start < end；
- break < shift duration；
- employee active；
- employee belongs to store；
- employee conflict；
- availability；
- duplicate assignment；
- role exists；
- date belongs to roster range；
- cross-store access。

Validation 错误必须中文且可行动。

---

# 40. Existing Shift Edit

点击 Calendar Shift：

打开 Edit Shift Dialog。

可修改：

- time；
- break；
- role；
- employees；
- note。

可删除 Shift。

已发布 Roster 的编辑策略需明确：

推荐：

- 发布后编辑产生 Draft revision；
- 或提示重新打开编辑。

第一版可选择最简单且安全方案，但必须记录。

---

# 41. Drag Move / Resize

如果使用成熟 calendar library 且行为稳定：

支持：

- drag shift 改时间/日期；
- resize 改 start/end。

每次操作：

- optimistic preview；
- server save；
- 失败 rollback；
- Toast 反馈。

不要因炫技造成数据错误。

---

# 42. Calendar Library

允许使用成熟免费 library，例如支持：

- month/dayGrid；
- week/day timeGrid；
- drag select；
- event overlap；
- drag/resize；
- responsive。

不要使用需要付费 license 的 premium 功能。

如果现有项目已有合适 library，优先复用。

---

# 43. Overlap Layout

Day/Week View 中重叠班次：

- 并列布局；
- 不完全遮盖；
- 显示姓名、角色、时间；
- 窄列可折叠信息；
- hover 展示完整详情。

---

# 44. Color Semantics

Shift Role 使用配置色。

不要用 Tier 颜色作为 Shift 颜色。

Employee Type 也不应决定整个 Shift 颜色。

建议：

- Role color = calendar event color；
- Employee Type = 小 badge；
- Tier = 小 badge。

---

# 45. Batch Operations

复刻参考系统 `Batch Operation`。

至少支持：

- 批量选择 Shift；
- 删除；
- 复制到下一天；
- 复制到下一周；
- 移动日期；
- 修改 Role；
- 修改 Break。

批量操作需要确认。

---

# 46. Copy Week / Fortnight

常用能力：

```text
复制本周到下周
复制本双周到下一双周
```

必须处理：

- 日期偏移；
- employee archived；
- availability warning；
- overlap；
- existing shifts；
- replace / merge 选择。

---

# 47. Draft and Publish

Roster 自身可以有：

```text
DRAFT
PUBLISHED
```

这与 Evaluate 的评价 Draft 无关。

不要混淆。

Roster Draft：

- 班表尚未正式发布；
- 可以编辑。

Publish：

- 形成发布版本；
- 记录 publishedAt；
- 可导出。

---

# 48. Publish Feedback

点击：

```text
发布排班
```

必须有：

- loading；
- success toast；
- page status update；
- duplicate submit protection。

文案：

```text
排班已发布
```

---

# 49. Publish Validation

发布前检查：

- 空班次；
- 冲突；
- 不可用员工；
- 关键技能缺口；
- 没有收晚员工；
- 超过周工时阈值；
- 未保存修改。

允许 warning 与 blocking error 分级。

---

# 50. Skill Coverage Warnings

每个 Day / Shift 可以配置或推断需要的技能。

例如：

```text
后厨至少 1 人
水吧至少 2 人
前场至少 1 人
收晚至少 1 人
```

Roster Summary 显示：

```text
技能覆盖完整
```

或：

```text
缺少 1 名收晚员工
缺少 1 名奶吧员工
```

不要自动排班。

只做决策辅助。

---

# 51. Right Summary Sidebar

参考旧系统 `Sidebar` 功能，建立可折叠右侧 Summary Panel。

显示：

- 当前日期总人数；
- 每个 Role 人数；
- 总工时；
- 净工时；
- 技能覆盖；
- 冲突；
- 未确认可用时间；
- 超时员工；
- 发布状态。

---

# 52. Weekly Hours

员工卡和 Summary 中显示：

```text
本周已排 24h
```

计算：

```text
sum(end-start-break)
```

避免同一 ShiftAssignment 重复计算。

---

# 53. Work Hour Warnings

第一版只做简单阈值，不做 Award interpretation。

例如：

- 每日 > 10h warning；
- 每周 > configured hours warning；
- 连续 overlap blocking；
- break 不合理 warning。

阈值放 Settings。

---

# 54. Export

复刻 Export 功能。

至少支持：

- CSV；
- printable roster；
- PDF（如果现有依赖可稳定实现）；
- 按 Store；
- 按 Week/Fortnight；
- 员工版；
- 管理版。

员工版不显示：

- Overall Score；
- Tier；
- Skill；
- 内部 Note。

管理版可以包含更多信息。

---

# 55. Staff-facing Output

发布/导出给员工的排班表只显示：

- 日期；
- 员工；
- start/end；
- break；
- role；
- store；
- note（公开 note）。

不要泄露评分和技能评价。

评分只在管理排班界面显示。

---

# 56. Staff Page

Roster Staff 页面定位：

```text
排班所需员工视图
```

不是 HR Profile。

显示：

- 姓名；
- Employee Type；
- Employment Type；
- Store；
- Official Score；
- Tier；
- Skill Summary；
- Availability；
- Weekly Hours；
- Roster Notes。

不显示 PII。

---

# 57. Settings

Store Settings 至少包括：

- opening time；
- closing time；
- slot interval；
- minimum shift duration；
- default break；
- week start day；
- week/fortnight；
- weekly hour warning；
- shift roles；
- shift role colors；
- required skills；
- shift templates；
- availability templates。

---

# 58. Help

第一版 Help 可以是简洁说明：

- 如何拖选时间；
- 如何选择员工；
- 如何查看评分；
- 如何处理 Availability warning；
- 如何发布；
- 如何复制到下周。

不需要复杂 support system。

---

# 59. Store Scope

所有 roster API 必须 server-side scope。

STORE_EVALUATOR：

- 只能看自己 Store；
- 只能排自己 Store；
- 不能通过改 storeId / employeeId / shiftId 越权。

ADMIN：

- 全部 Store。

---

# 60. Integration API

优先在 Evaluate 暴露一个窄的 Roster Read API。

推荐：

```text
GET /api/roster-integration/stores
GET /api/roster-integration/stores/:storeId/employees
GET /api/roster-integration/employees/:employeeId
GET /api/roster-integration/contract-version
```

必须返回最小 DTO。

不要让 Roster 调普通 Employee Profile API 获取敏感字段。

---

# 61. Integration Contract Version

API response 建议包含：

```text
contractVersion
generatedAt
```

当 contract 不兼容时：

Roster 显示明确错误，而不是 silent wrong data。

---

# 62. Evaluate Changes Must Be Minimal

如果 Evaluate 缺少 integration API：

只允许新增：

- read-only DTO；
- read-only route；
- contract tests。

不要为了 Roster 重构 Evaluate 核心评分代码。

所有 Evaluate 改动要单独记录：

```text
EVALUATE_CHANGES_FOR_ROSTER.md
```

---

# 63. Roster API

推荐 Roster API：

```text
GET    /api/roster/periods
POST   /api/roster/periods
GET    /api/roster/periods/:id
PATCH  /api/roster/periods/:id

GET    /api/roster/calendar
POST   /api/roster/shifts
PATCH  /api/roster/shifts/:id
DELETE /api/roster/shifts/:id

POST   /api/roster/shifts/:id/assignments
DELETE /api/roster/shifts/:id/assignments/:assignmentId

POST   /api/roster/batch/copy
POST   /api/roster/batch/delete
POST   /api/roster/periods/:id/publish

GET    /api/roster/availability
PUT    /api/roster/availability

GET    /api/roster/templates
POST   /api/roster/templates

GET    /api/roster/export
```

具体命名可按技术栈调整。

---

# 64. No Side-effect GET

GET 不允许：

- 创建 RosterPeriod；
- 创建 Shift；
- 创建 Availability；
- 发布；
- 修改状态。

所有写入必须明确 mutation。

---

# 65. Optimistic Concurrency

Shift / RosterPeriod 使用 version。

两个管理员同时修改：

- 第二个 stale update 返回 409；
- 不 silent overwrite；
- UI 提示重新加载。

---

# 66. Database Choice

优先让 Roster 自己拥有 roster-specific schema。

可使用：

- 同一 Supabase PostgreSQL 中独立 roster tables；
- 或独立 DB。

无论选择哪种：

不要复制 Employee 主数据作为权威。

在架构阶段明确选择并写入：

```text
ROSTER_ARCHITECTURE.md
```

---

# 67. Historical Roster Stability

Employee 改名或归档后，历史已发布 Roster 必须仍可读。

因此 Published Assignment 建议保留：

- employeeNameSnapshot；
- employeeTypeSnapshot；
- role snapshot；
- time；
- break。

评分是否 snapshot：

可保存管理员排班时看到的 score/tier，供内部 audit；
但员工导出不显示。

---

# 68. Error Handling

用户可见错误必须中文。

例如：

```text
员工数据暂时无法加载
该员工在此时间已有班次
班次时间超出员工可用时间
保存失败，请重试
该员工已被归档，无法继续排班
```

不要暴露：

- raw DB error；
- stack；
- technical ID。

---

# 69. Offline / Evaluate Unavailable

如果 Evaluate API 暂时不可用：

- 已有 Calendar 仍可查看；
- 已发布 roster 仍可查看；
- 新 Staff Picker 显示无法获取员工数据；
- 不使用过期缓存伪装最新分数；
- 可以明确显示 last successful sync 时间；
- 不允许新增未知员工。

---

# 70. Loading

使用与 Evaluate 相同的：

- Skeleton；
- updating indicator；
- no full page flashing。

Calendar 数据刷新时尽量保留现有视图。

---

# 71. Toast and Feedback

必须有统一反馈：

- 班次已创建；
- 班次已更新；
- 班次已删除；
- 排班已发布；
- 已复制到下周；
- 保存失败；
- 冲突。

按钮：

- loading；
- disabled；
- double-submit protection。

---

# 72. Motion

允许高级但克制的 Motion。

适合：

- Calendar view switch；
- Dialog；
- Staff card selection；
- Shift create；
- Shift drag；
- Filter；
- Publish success；
- Summary panel。

不要：

- 大量 bounce；
- 持续 glow；
- 影响拖拽性能的每 cell JS animation。

---

# 73. Reduced Motion

必须支持：

```text
prefers-reduced-motion
```

Calendar drag 功能不依赖动画才能理解。

---

# 74. Responsive

重点：

```text
1920×1080
1440×900
1366×768
1024×768
768
390
```

## Desktop

完整 Month/Week/Day。

## Tablet

Sidebar Drawer；
Calendar 可横向或压缩；
Modal 双列降级。

## Mobile

- Month 可用；
- Day 可用；
- Staff picker card；
- Modal 单列；
- 不要求完整 desktop density；
- 无页面级横向溢出。

---

# 75. Day View Mobile

Mobile 拖选难度高。

允许：

- 长按拖选；
- 点击起始时间后选择结束时间；
- Add Shift button。

但 desktop 必须支持真实 drag selection。

---

# 76. Accessibility

至少：

- Calendar keyboard navigation；
- Dialog focus trap；
- Escape；
- custom select keyboard；
- buttons aria-label；
- status 不只靠颜色；
- score/Tier 有文字；
- drag selection 有 alternative action。

---

# 77. Initial Folder Audit

开始时检查 Molly Roster 目录：

- 是否空项目；
- package manager；
- Git；
- existing files；
- secrets；
- port；
- tech stack。

如果目录为空：

优先使用与 Evaluate 一致的：

- React；
- TypeScript；
- Vite；
- Tailwind / existing styling approach；
- current motion library；
- current icon library。

不要无理由换框架。

---

# 78. Reuse Strategy

优先复用“设计语言”，不是直接让 Roster import Evaluate 内部页面源码。

可以复制/提炼：

- tokens；
- brand assets；
- base controls；
- AppShell pattern。

不要用脆弱的：

```text
../../Evaluate Molly/src/...
```

作为 production import。

如有必要建立小型 shared package，但不要把整个父目录重构成复杂 monorepo，除非确实有收益。

---

# 79. Calendar Functional Parity Matrix

必须创建：

```text
FUNCTIONAL_PARITY_MATRIX.md
```

列出参考系统功能：

| 参考功能 | Molly Roster 状态 | 实现方式 | 测试 |
|---|---|---|---|
| Month |  |  |  |
| Week |  |  |  |
| Day |  |  |  |
| Drag create |  |  |  |
| Add Shift modal |  |  |  |
| Multi staff |  |  |  |
| Availability |  |  |  |
| Staff score |  |  |  |
| Preset shift |  |  |  |
| Batch |  |  |  |
| Publish |  |  |  |
| Export |  |  |  |
| Staff page |  |  |  |
| Settings |  |  |  |

不能只写“已复刻”。

必须逐项证明。

---

# 80. Phase 0 — Workspace and Safety

1. 找到 sibling Evaluate Molly；
2. 找到 Molly Roster；
3. 检查 Git；
4. 检查 secrets；
5. 记录 baseline；
6. 创建 `GOAL_MODE_PROGRESS.md`；
7. 不修改 Evaluate 核心业务。

---

# 81. Phase 1 — Integration Discovery

只读审计 Evaluate 中：

- auth；
- store scope；
- roster-facing employee data；
- official score；
- tier；
- skill summary；
- brand/UI。

输出：

```text
docs/EVALUATE_INTEGRATION_CONTRACT.md
docs/EVALUATE_STYLE_CONTRACT.md
ROSTER_ARCHITECTURE.md
```

---

# 82. Phase 2 — New Project Foundation

建立：

- frontend；
- backend；
- test；
- env example；
- lint；
- TypeScript；
- production build；
- AppShell；
- Login/session integration；
- health。

---

# 83. Phase 3 — Roster Database

实现：

- RosterPeriod；
- ShiftRole；
- Shift；
- ShiftAssignment；
- EmployeeAvailability；
- ShiftTemplate；
- settings；
- migration；
- indexes；
- constraints。

禁止 `db push` 作为正式方案。

---

# 84. Phase 4 — Calendar Shell

实现：

- navigation；
- date controls；
- Month/Week/Day；
- store context；
- empty state；
- loading。

---

# 85. Phase 5 — Day Drag Create

这是第一关键 milestone。

必须完成：

```text
Day View
09:00 drag → 10:00
release
Add Shift Dialog opens
start/end prefilled
Cancel no write
Save creates shift
```

做浏览器真实验证。

---

# 86. Phase 6 — Add/Edit Shift

完成：

- role；
- staff cards；
- time；
- break；
- template；
- note；
- save；
- edit；
- delete；
- feedback。

---

# 87. Phase 7 — Workforce Sync

完成：

- current employees；
- official score；
- Tier；
- employee type；
- skill categories；
- operations skills；
- store scope；
- archived handling；
- PII exclusion。

---

# 88. Phase 8 — Availability

完成：

- weekly/fortnight availability；
- templates；
- unknown；
- conflicts；
- picker integration。

---

# 89. Phase 9 — Month/Week Full Behavior

完成：

- event rendering；
- overlap；
- edit；
- navigation；
- drag/resize；
- responsive。

---

# 90. Phase 10 — Batch / Publish / Summary

完成：

- batch operations；
- copy week；
- publish；
- right summary；
- skill warnings；
- weekly hours。

---

# 91. Phase 11 — Staff / Template / Settings

完成：

- Staff read-only directory；
- Availability management；
- preset templates；
- ShiftRole settings；
- Store settings。

---

# 92. Phase 12 — Export

完成：

- CSV；
- printable；
- employee-safe output；
- admin output。

---

# 93. Phase 13 — Exploratory QA

像门店经理使用：

1. 登录；
2. 选 Store；
3. Day View；
4. 9–10 drag；
5. 选 role；
6. 看评分；
7. 看技能；
8. 选员工；
9. 保存；
10. 编辑；
11. 复制；
12. 发布；
13. 导出。

发现问题后直接修。

---

# 94. Phase 14 — Adversarial QA

故意测试：

- 快速拖选；
- 重复保存；
- 两 tab 修改同一 Shift；
- 员工在 Evaluate 中归档；
- 分数更新；
- Store 切换；
- availability 不匹配；
- overlap；
- API 500；
- Evaluate down；
- Session expiry；
- cross-store URL；
- mobile；
- long names；
- 100+ employees；
- 500 employees synthetic dataset。

---

# 95. Phase 15 — Regression

重新走：

- Month；
- Week；
- Day；
- create；
- edit；
- delete；
- batch；
- publish；
- export；
- availability；
- score sync；
- skills；
- auth；
- responsive。

---

# 96. Testing Requirements

至少包括：

## Unit

- time math；
- break/net hours；
- overlap；
- availability；
- skill fit；
- weekly hours；
- score display mapping；
- role requirement；
- date range。

## Backend

- Store scope；
- CRUD；
- concurrency；
- publish；
- batch；
- archived employee；
- integration contract；
- no PII。

## Frontend

- view switch；
- drag selection；
- modal；
- staff selection；
- score/Tier；
- filters；
- save feedback；
- publish；
- responsive。

## Browser

- real pointer drag；
- multi-account；
- desktop；
- mobile。

---

# 97. Critical Browser Scenarios

## Scenario A — Basic Day Create

```text
Open Day View
Drag 09:00 → 10:00
Dialog opens
Select role
Select HandoverEmployee006
See HandoverEmployee006 score/Tier
Save
Shift appears at correct time
```

## Scenario B — Multi Staff

```text
Create 10:00–17:00
Select two employees
Save
Day block shows both
Month chip remains compact
```

## Scenario C — Availability

```text
Employee available 09:00–17:00
Create 17:00–22:00
Warning appears
No silent assignment
```

## Scenario D — Score Sync

```text
Evaluate official score changes after CLOSED Round
Refresh Roster
Employee card shows new official score
Existing published roster remains stable
```

## Scenario E — Store Scope

```text
Hurstville account
cannot access Green Square roster
cannot assign Green Square employee
```

---

# 98. Visual Acceptance

Molly Roster 必须：

- 与 Evaluate Molly 同品牌；
- 不像旧 BH Software；
- Calendar 信息密度高；
- Dialog 现代；
- Staff picker 清晰；
- 分数明显但不抢过技能；
- Floating Shell；
- Custom Select；
- Brand pink 克制使用；
- 中文完整；
- 无原生丑陋 Select；
- 1366 下不拥挤；
- 390 下可完成核心操作。

---

# 99. Performance Acceptance

在 500 Employee synthetic 数据下：

- Staff picker 可用；
- 搜索可用；
- 不冻结；
- Calendar 不因员工数渲染所有 cards；
- employee picker 可虚拟化或分页；
- API 无明显 N+1；
- shift grid 不为每分钟创建昂贵组件。

---

# 100. Security and Privacy Acceptance

- 不泄露员工敏感 HR 数据；
- 不信任客户端 storeId；
- 不允许 cross-store assignment；
- Session 不存 localStorage；
- API response 最小；
- server logs 不输出 PII；
- export 员工版不含评分。

---

# 101. Files to Produce

最终至少生成：

```text
GOAL_MODE_PROGRESS.md
ROSTER_ARCHITECTURE.md
FUNCTIONAL_PARITY_MATRIX.md
docs/EVALUATE_INTEGRATION_CONTRACT.md
docs/EVALUATE_STYLE_CONTRACT.md
ROSTER_DATABASE_MODEL.md
ROSTER_API_CONTRACT.md
ROSTER_QA_REPORT.md
ROSTER_DEPLOYMENT_READINESS.md
FINAL_MOLLY_ROSTER_REPORT.md
```

---

# 102. Final Report

`FINAL_MOLLY_ROSTER_REPORT.md` 必须包含：

1. Executive Summary；
2. Architecture；
3. Evaluate integration；
4. Auth；
5. Database；
6. Calendar；
7. Month；
8. Week；
9. Day drag selection；
10. Shift modal；
11. Employee picker；
12. Score/Tier integration；
13. Skill integration；
14. Availability；
15. Templates；
16. Batch operations；
17. Publish；
18. Export；
19. Staff page；
20. Settings；
21. Responsive；
22. Accessibility；
23. Performance；
24. Security/PII；
25. Tests；
26. Browser QA；
27. Remaining issues；
28. Internal pilot readiness。

---

# 103. Stop Conditions

只有同时满足以下条件才允许结束：

- Integration contract 完成；
- Style contract 完成；
- Calendar Month/Week/Day 完成；
- Day drag selection 真实可用；
- Add/Edit Shift 完成；
- 多员工 Shift 完成；
- 员工正式评分/Tier 可见；
- Skill Summary 可见；
- Availability 可见；
- overlap 检查完成；
- role/skill warning 完成；
- presets 完成；
- batch 完成；
- publish 完成；
- export 至少 CSV/print 完成；
- Staff page 完成；
- Settings 核心完成；
- Store Scope 完成；
- PII 不泄露；
- desktop browser QA 完成；
- mobile QA 完成；
- frontend tests 通过；
- backend tests 通过；
- production build 通过；
- Prisma validate / migration status 通过；
- no known P0；
- no blocking P1；
- Final report 完成。

不能因为：

- build green；
- tests green；
- calendar 能显示；
- drag demo 可用；
- health 200；

就提前停止。

---

# 104. Explicit Non-goals

第一版不要实现：

- 自动 AI 排班；
- 工资计算；
- Payroll；
- Clock-in；
- Timesheet approval；
- Leave approval；
- Award interpretation；
- 自动休息法规；
- 推送通知；
- 员工自助 App；
- SMS；
- 复杂预算；
- 复杂 labor cost；
- Dark Mode；
- 复杂角色系统；
- 替代 Evaluate 的 Employee Management。

---

# 105. Final Instruction

不要把这项任务理解成：

> “做一个日历页面。”

它是：

> **建立一个真正可以使用的门店排班产品。**

功能上先达到参考系统的核心能力。

体验上必须明显优于参考系统。

数据上必须和 Evaluate Molly 的 Employee、正式综合评分、Tier 和 Skill 保持一致。

边界上必须保持两个项目独立。

实现过程中：

```text
先理解
→ 先建契约
→ 先做核心工作流
→ 真人测试
→ 再补完整功能
→ 对抗测试
→ 最终回归
```

除非额度即将耗尽或遇到必须人工介入的阻塞，否则持续执行，不要提前结束。

# 最终目标

```text
经理在 Day View 从 09:00 拖到 10:00
→ 自动打开新增班次
→ 看见当前门店员工
→ 看见每个员工正式综合评分、Tier、技能和可用时间
→ 选择员工
→ 保存
→ 班次正确显示
→ 之后可复制、发布、导出
```

这条主流程必须成为系统最可靠、最顺滑的核心体验。
