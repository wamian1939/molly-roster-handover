# Evaluate Molly — Codex Goal Mode Master Audit & Production Hardening Plan

> **用途**：将本文件直接交给 Codex 的「目标模式 / 长时间运行模式」执行。  
> **目标**：不是做一次普通 code review，而是让 Codex 在现有项目基础上，像一名真正接手项目的资深全栈工程师 + QA + 产品工程师一样，进行长时间、分阶段、可回滚的审计、测试、修复、清理和落地准备。  
> **核心原则**：先理解、先测试、再修改；删除必须有证据；每次修改必须能被验证；业务语义优先于“代码看起来更漂亮”。

---

# 0. Mission

你现在接手的是一个已经经过多轮开发、规则演化、UI 重构、数据库迁移和部署准备的内部员工评价系统：

**Evaluate Molly**

这是一个真实准备投入门店内部使用的系统，不是 Demo。

你的任务不是继续堆功能，而是：

1. **全面审计整个项目**
2. **理解现有业务语义**
3. **识别前端、后端、数据库、路由、状态管理、权限、测试、构建和部署中的真实问题**
4. **先以真人方式大量测试**
5. **根据真实问题修复**
6. **删除安全确认后的冗余代码和冗余文件**
7. **减少历史遗留与重复实现**
8. **保证现有功能不回归**
9. **让系统达到真正可以长期内部使用、继续上线和迭代的状态**

最终判断标准不是：

- lint 分数多高
- 文件有多少
- coverage 数字多漂亮
- generic audit 工具打多少分

而是：

> **一个真实门店管理员、多个分管评分账号和总 ADMIN 可以持续使用它，不会因为状态、路由、历史、权限、评分、刷新、重新登录或多人操作而出现混乱。**

---

# 1. Working Mode

本任务使用 **Goal Mode / Long Running Autonomous Work**。

你需要尽可能持续自主工作，不要每完成一个小步骤就停下来问用户。

## 1.1 可以自主完成

你可以自主执行：

- 阅读项目全部源码
- 阅读 package / lockfile / config
- 阅读 migrations
- 阅读 tests
- 阅读 scripts
- 查看 Git 状态
- 创建工作分支（如果当前是 Git repo）
- 运行 frontend/backend
- 浏览器操作
- 多账号浏览器测试
- API 测试
- DB 查询
- Prisma validate / migrate status
- build
- lint
- unit / integration / browser tests
- 搜索 dead code
- 搜索未引用文件
- 修复明确 Bug
- 重构重复代码
- 删除确认安全的冗余文件
- 增加必要 tests
- 改善错误处理
- 改善性能
- 修复 UI/UX 明显问题
- 修复 responsive
- 修复 accessibility
- 清理无效 CSS / stale component
- 清理旧 API / service / helper
- 清理历史 scoring runtime 依赖
- 更新项目文档
- 生成最终报告

## 1.2 必须谨慎或停下确认

遇到以下情况不要擅自做不可逆操作：

- 删除 Production 数据
- `prisma migrate reset`
- Production `db push`
- 修改真实生产数据库
- 删除用户真实员工资料
- 修改评分业务规则但无法从本文件确认
- 修改权限模型的业务含义
- 购买付费服务
- 重置真实账号密码
- 删除 Git history
- force push
- 删除无法证明无用的重要历史 migration
- 把敏感信息提交 Git

如果是“技术上可以改，但业务意图不明确”，优先：

1. 保持现状
2. 记录 Remaining Decision
3. 不要自行猜业务规则

---

# 2. Golden Rule — 先测试，再修改

不要进入项目以后立刻开始大规模重构。

必须按以下顺序：

```text
Understand
→ Baseline
→ Reproduce
→ Audit
→ Prioritize
→ Fix
→ Test
→ Browser verify
→ Clean
→ Regression
→ Final audit
```

任何重要修改都必须回答：

1. 原问题是什么？
2. 能否稳定复现？
3. 修改改变了什么？
4. 为什么这个方案不会破坏其他流程？
5. 什么测试证明它正常？
6. 浏览器真实操作是否通过？

---

# 3. Project Business Contract

这是整个审计中最重要的部分。

**不要因为旧代码还存在，就默认旧代码代表当前业务。**

以下内容是当前正式业务语义。

---

# 4. Store / Account Model

系统角色：

```text
ADMIN
STORE_EVALUATOR
```

## ADMIN

- 总账号
- 可以查看所有 Store
- 可以管理账号
- 可以管理员工
- 可以查看各门店评价
- 可以查看每个评分账号当前评分
- 可以查看门店综合评分
- 可以自己评分
- 可以结束一轮评价
- ADMIN 自己的评分与门店分管账号的综合平均分分开

## STORE_EVALUATOR

- 绑定一个 Store
- 同一个 Store 可以有多个 STORE_EVALUATOR
- 只能操作自己 Store
- 每个账号独立评分
- 不共享评分表单
- 不能修改其他 evaluator 的评分
- 不应该看到其他 evaluator 的具体当前评分（除非当前产品明确允许；默认保护独立判断）

---

# 5. Employee Type

Employee 有两类：

```text
TRAINING = 培训员工
REGULAR = 正式员工
```

每个 Store 都可以同时有：

- 培训员工
- 正式员工

Employee Type 是 Employee 属性，不是 Store 属性。

---

# 6. Training → Regular

培训员工必须可以直接：

```text
TRAINING → REGULAR
```

不能：

- 删除旧员工
- 重建 Employee
- 清空历史
- 清空技能
- 更换 Employee ID

转正以后：

- Current Employee Type = REGULAR
- 新评价使用正式员工最新 policy
- 历史培训评价保持 TRAINING snapshot
- 历史评分不重算
- 历史清楚显示“培训员工评价 / 正式员工评价”

如果转正时存在 OPEN Round：

- 当前 OPEN Round 保持原 EmployeeTypeSnapshot / policy
- 下一轮才使用新类型

---

# 7. Scoring Model

## 7.1 REGULAR — 正式员工

最新正式员工评分规则：

| Component | Weight |
|---|---:|
| Skill Capability | 60 |
| Speed | 10 |
| Initiative / 眼里有活 | 10 |
| Attitude | 10 |
| Availability / 报班自由度 | 5 |
| Text Evaluation | 5 |
| **Total** | **100** |

正式员工 Skill = **60%**

---

## 7.2 TRAINING — 培训员工

| Component | Weight |
|---|---:|
| Skill Capability | 20 |
| Speed | 10 |
| Initiative / 眼里有活 | 25 |
| Attitude | 25 |
| Availability / 报班自由度 | 10 |
| Text Evaluation | 10 |
| **Total** | **100** |

培训员工：

- Skill = 20%
- 眼里有活 = 25%
- 态度 = 25%

---

# 8. Tier Rules

当前统一 Tier：

```text
T5: 0 <= score < 40
T4: 40 <= score < 60
T3: 60 <= score < 70
T2: 70 <= score < 85
T1: 85 <= score <= 100
```

必须验证边界：

```text
0       → T5
39.99   → T5
40      → T4
59.99   → T4
60      → T3
69.99   → T3
70      → T2
84.99   → T2
85      → T1
100     → T1
```

不要把历史旧 Completed Evaluation 重新计算。

---

# 9. Skill Model

技能分必须直接进入评分。

当前技能包含：

## 后厨

- 开茶
- 奶吧

## 水吧

- 贴杯
- 扫码
- 加冰
- 炫杯

## 前场

- 中转
- 外卖打包
- 出杯
- 点单

## 操作能力

- 开早
- 收晚
- 周清

---

# 10. Operation Skills

开早 / 收晚 / 周清：

不是：

- 岗位资格意见
- 投票
- 不计分 metadata

它们是：

> **员工操作技能**

需要在评分中直接确认并进入 Skill Score。

只需要知道：

```text
未确认
会
不会
```

不要再做：

- Qualification opinion aggregate
- 几人认为会
- 几人认为不会
- Admin consensus vote

如果当前代码仍保留 Qualification 旧体系，必须审计其 runtime 使用情况。

---

# 11. Progressive Skill Status

普通制作 Skill：

```text
NotTrained  = 0
Training    = 0.30
Independent = 0.70
Proficient  = 1.00
```

Unknown ≠ NotTrained。

---

# 12. Skill Category Breakdown

系统必须能告诉用户：

- Skill Overall
- 后厨 %
- 水吧 %
- 前场 %
- 操作能力

例如：

```text
技能总分：51.8 / 60

后厨：90%
水吧：78%
前场：83%

操作能力：
开早 ✓
收晚 ✓
周清 —
```

Backend 应为计算权威。

Frontend 不应该复制业务计算。

History 必须基于 Evaluation Skill Snapshot，而不是当前 EmployeeSkill。

---

# 13. Current Skill vs Historical Skill

必须严格区分：

```text
EmployeeSkill
= 当前技能状态

EvaluationSkillSnapshot
= 当次评价历史技能快照
```

历史不能随着 Employee 当前技能改变。

---

# 14. Multi-Evaluator Current Business Model

这是当前系统最容易出错的地方。

旧的：

```text
Draft → Completed
```

共享 Draft / 一次提交锁死

已经不符合最新业务。

当前正式模型：

> **STORE_EVALUATOR 维护当前 OPEN Round 的“最新评分”。  
> ADMIN 负责在合适时间“结束本轮”，该时间点生成正式历史快照。**

---

# 15. No Draft

当前业务明确：

**彻底摒弃 Draft 用户流程。**

不要有：

- 草稿
- 继续草稿
- 草稿恢复
- 650ms autosave
- Draft 锁
- 因为打开过评分页面就留下草稿

任何账号进入评分：

```text
进入
→ 本地编辑
→ 提交
```

如果直接退出：

```text
本次未提交修改全部丢弃
```

下次重新进入。

---

# 16. Existing Submitted Score in OPEN Round

如果 evaluator 当前 Round 已经提交过：

```text
76
```

再次进入：

可以用当前已保存 76 的评分内容作为初始值。

如果不提交就退出：

数据库仍然是 76。

如果重新提交：

```text
76 → 81
```

当前 Round 只保留：

```text
81
```

ADMIN 不需要看到：

- 76
- 之前版本
- revision history

同轮只看最新值。

---

# 17. OPEN Round Evaluation Semantics

同一个：

```text
roundId + evaluatorAccountId
```

最多一份当前评分。

重新提交使用：

```text
UPSERT / UPDATE
```

不是新增历史 row。

---

# 18. Round Progress

OPEN Round denominator：

必须来自：

```text
当前 Store
+
role = STORE_EVALUATOR
+
isActive = true
```

例如 Hurstville 有 3 个 active 分管账号：

所有员工当前轮进度只可能：

```text
0/3
1/3
2/3
3/3
```

不能因为某员工历史 membership 不同出现：

```text
1/2
1/1
```

这是必须重点验证的问题。

ADMIN 不计入 denominator。

---

# 19. Round Numerator

numerator：

当前 OPEN Round 中，有最新提交评分的 active STORE_EVALUATOR 数量。

同一个 evaluator 重评 10 次仍只算一个。

---

# 20. Store Aggregate

门店当前临时综合分：

只计算 STORE_EVALUATOR 的当前最新评分。

例如：

```text
A = 80
B = 70
C = 未评分

本轮：2/3
临时综合 = 75
```

未评分账号不按 0。

ADMIN 自己的评分：

单独显示。

不要加入门店 evaluator 平均。

---

# 21. ADMIN Current Score

ADMIN 也可以评分。

但：

```text
ADMIN score ≠ Store aggregate
```

例如：

```text
Store evaluator aggregate = 80
ADMIN score = 85
```

UI 必须分开。

---

# 22. End Round

只有 ADMIN 可以：

```text
结束本轮
```

ADMIN 可以在：

```text
1/3
2/3
3/3
```

任何进度结束。

未全部完成时必须提示。

点击结束本轮的那个时间：

```text
closedAt
```

就是正式历史快照时间。

---

# 23. Round Snapshot

ADMIN 点击结束本轮时，在 transaction 内：

1. 锁定 Round
2. snapshot 当前 active STORE_EVALUATOR 列表
3. snapshot 每个账号当前最新评分
4. snapshot 未评分 evaluator
5. snapshot aggregate
6. snapshot ADMIN 当前评分（如果存在）
7. snapshot Employee Type
8. snapshot scoring policy
9. snapshot skill evaluation
10. closedAt = NOW()
11. Round = CLOSED

之后 immutable。

---

# 24. Automatic Next Round

Round CLOSED 后：

下一次任意有权限的 evaluator 再评分该员工：

自动进入：

```text
下一轮 OPEN Round
```

不需要 ADMIN 手动“开始下一轮”。

并发首次评分不能创建两个 OPEN Round。

---

# 25. History

History 一级单位：

```text
CLOSED Evaluation Round
```

不是每次 evaluator submit。

例如：

```text
第 1 轮
结束：2026-08-01 18:00
正式员工
3/3
综合 78.4

第 2 轮
结束：2026-09-01 18:00
正式员工
2/3
综合 81.2
```

OPEN Round 不计入正式历史。

---

# 26. Current Score

Employee 的正式 Current Score：

```text
最近一次 CLOSED Round 的 final aggregate
```

不是：

- latest individual submission
- OPEN provisional average
- latest evaluator score

ADMIN 页面可以额外显示：

```text
本轮临时综合
```

但必须明确“临时”。

---

# 27. Navigation Contract

评分和汇总必须是两个不同入口：

```text
我的评分
查看本轮汇总
```

ADMIN 两者都可以用。

查看 Round Detail：

必须纯 read-only。

不能因为查看汇总：

- 创建自己的评分
- claim evaluator slot
- 锁定评分
- 影响以后评分入口

GET 必须纯读。

---

# 28. Evaluation Route Responsibility

`/evaluations/v1/...`

只代表：

```text
个人评分 / 个人评分详情
```

`/evaluation-rounds/...`

只代表：

```text
本轮汇总 / Round Detail
```

不要混合职责。

---

# 29. Return Navigation

Navigation 必须来源驱动。

例如：

```text
/evaluations/stores/hurstville/employees/regular
→ Round Detail
→ Back
```

必须回：

```text
/evaluations/stores/hurstville/employees/regular
```

Training 同理。

Round Detail → Individual Evaluation → Back：

回 Round Detail。

不要全部：

“返回评分概览”。

不要仅依赖 `window.history.back()`。

需要 semantic fallback。

---

# 30. Employee Evaluation Navigation

Store evaluation workflow：

```text
评分概览
→ Store
→ 选择员工类型
    ├ 正式员工
    └ 培训员工
→ 对应 Employee List
→ 评分 / 本轮汇总
```

Store 进入后优先选择：

```text
正式员工
培训员工
```

而不是默认混在一张大表。

---

# 31. Employee Profile

Employee 不需要：

```text
岗位 / Position / Staff
```

不要把 Account Role 和 Employee Position 混淆。

Employee Profile 当前需要支持：

## Identity

- displayName / legacy name
- surname
- givenName
- englishName
- gender
- dateOfBirth

## Employment

- employeeType
- employmentType
- storeId
- employmentCommencementDate
- status

## Contact

- emailAddress
- mobileTelephoneNumber

## Address

- addressLine
- suburb
- state
- postcode

## Bank / Tax

- bankAccountName
- bsbNumber
- bankAccountNumber
- taxFileNumber
- abn

## Visa

- holdsWorkingHolidayVisa
- visaType

## Super

- superannuationCompany
- superannuationAccountNumber
- uniqueSuperannuationIdentifier

## Derived

- tenure

不要再保存重复：

```text
Which Shop
```

Store relation 是唯一来源。

---

# 32. Sensitive PII

以下属于敏感员工资料：

- TFN
- Bank Account Number
- BSB
- DOB
- Full Address
- Super Account Number
- Visa information

默认：

STORE_EVALUATOR 不应该因为能评分就能读取这些资料。

至少做到：

- Employee list DTO 不泄露
- Evaluation DTO 不泄露
- Skill Board 不泄露
- Analytics 不泄露
- Logs 不泄露
- Search 不索引这些字段
- ADMIN-only full profile（在现有两角色模型下）

不要为了本轮新增复杂 HR Role。

---

# 33. Frontend Visual System

当前项目已经做过较多视觉改造。

方向：

```text
Floating Layered App Shell
```

浏览器背景是底层：

```text
App background
├ Sidebar floating panel
└ Main workspace floating panel
```

Sidebar 和 Main Workspace：

- 四角圆角
- 外层 gutter
- 独立层级
- workspace 内滚动
- desktop-first
- responsive

不要退回普通矩形后台。

---

# 34. Brand

Molly 品牌主色：

```text
#e9b2b6
```

Pantone：

```text
501 C
```

Logo：

公司四叶草 SVG。

Brand motion 可以存在：

- Login Clover reveal
- Login success transition
- Loader
- 少量 signature moments

不要让整个后台变成粉色。

---

# 35. Custom Controls

正式 UI 中不要出现浏览器原生丑陋 Select popup。

Custom Select / Combobox 应统一。

检查：

- Store selector
- Employee type
- Role
- Status
- Analytics
- Skill Board filters
- Employee edit
- Dialog select

---

# 36. Responsive

重点视口：

```text
1920×1080
1440×900
1366×768
1024×768
768px
390px
```

Desktop 信息密度不能为了 Mobile 被破坏。

Skill Board desktop 仍应高密度。

---

# 37. Phase 0 — Safety & Workspace Snapshot

在任何删除/重构前：

1. 检查 Git 是否存在
2. 检查 branch
3. 检查 dirty files
4. 检查 untracked files
5. 检查 `.gitignore`
6. 检查 secret
7. 记录当前 package versions
8. 记录 migration status
9. 记录 frontend/backend current ports
10. 记录当前 test count
11. 记录 build baseline

如果 Git 可用：

建议建立：

```text
codex/production-hardening
```

不要直接破坏 main。

如果 repo dirty：

先识别用户未提交改动。

不要覆盖。

---

# 38. Secret Audit

扫描：

- `.env`
- credentials files
- API keys
- passwords
- DATABASE_URL
- session tokens
- Supabase URI
- DeepSeek key

确认：

不会被 Git 跟踪。

不要把 secret 打进最终报告。

---

# 39. Phase 1 — Full Project Inventory

建立完整项目地图。

至少审计：

```text
/
src/
backend/
backend/src/
backend/prisma/
tests/
public/
assets/
scripts/
docs/
dist/
generated/
```

列出：

- frontend pages
- frontend components
- hooks
- services
- shared types
- backend routes
- backend services
- auth
- scoring
- evaluation
- round
- analytics
- employee
- skill
- prisma schema
- migrations
- test suites
- unused dirs
- generated dirs
- duplicate configs
- stale docs

生成临时内部：

```text
PROJECT_AUDIT_MAP.md
```

供本轮使用。

---

# 40. Phase 2 — Baseline Tests

在修改前运行完整 baseline。

至少：

```text
Frontend tests
Backend tests
TypeScript
ESLint
Production build
Prisma validate
Prisma migrate status
```

如果有：

```text
integration
browser
smoke
```

全部运行。

记录：

- passed
- failed
- skipped
- warnings
- flaky

不要一看到失败就立刻改。

先分类。

---

# 41. Phase 3 — Start Application

实际启动：

Frontend
Backend

确认：

```text
/api/health
login
auth/me
logout
```

记录：

- startup warnings
- console errors
- network errors
- DB errors

---

# 42. Phase 4 — Real Human QA First

在大量改代码之前，先像真人一样用系统。

至少准备：

```text
ADMIN
Store Evaluator A
Store Evaluator B
Store Evaluator C
```

同一 Store。

如果测试账号已存在，优先使用现有安全测试账号。

不要把真实密码写入报告。

---

# 43. Human QA — Authentication

测试：

- Login
- Wrong password
- Refresh
- Session restore
- Logout
- Expired session
- Direct protected URL
- ADMIN nav
- Store evaluator nav
- Cross-store direct URL

---

# 44. Human QA — Employee Type

测试：

- Store landing
- Regular
- Training
- Type counts
- Type badge
- Deep link
- Back
- Mobile

---

# 45. Human QA — Training → Regular

测试：

1. Training employee
2. 查看历史
3. 当前 Training 评价
4. 转正式
5. Employee ID 不变
6. Skill 不丢
7. History 不丢
8. Current type = Regular
9. 新评分 = REGULAR policy
10. 旧 Training history = Training policy

---

# 46. Human QA — Multi-Evaluator

同一个 employee：

Evaluator A：
提交一个分数。

Evaluator B：
提交另一个。

Evaluator C：
暂不提交。

确认：

```text
2/3
```

A 再评分：

旧分被覆盖。

确认：

- 不出现旧版本
- numerator 不增加
- aggregate 更新

---

# 47. Human QA — No Draft

A 进入评分。

修改多个字段。

直接 Back。

重新进入。

确认：

未提交修改没有保存。

如果之前已有已提交评分：

确认旧已提交值仍在。

不要出现：

草稿
继续草稿
Autosave 提示

---

# 48. Human QA — ADMIN

ADMIN：

- 查看 Round
- 不创建自己评分
- 从 Round 返回
- 开始自己评分
- 再打开 Round
- 评分入口仍存在
- ADMIN score 单独
- progress denominator 不包含 ADMIN
- Store aggregate 不包含 ADMIN

---

# 49. Human QA — End Round

A / B 已评分，C 未评分。

ADMIN：

点击结束本轮。

确认：

```text
2/3
```

提示未完成。

结束后：

- Round CLOSED
- closedAt 正确
- final aggregate 正确
- History 出现
- A/B 旧分 immutable
- C 未评分 snapshot 正确

A 再评分：

确认自动进入下一 Round。

---

# 50. Human QA — Denominator

当前 Store 3 个 active STORE_EVALUATOR。

检查至少 10 个员工。

所有 OPEN Round：

只能：

```text
x/3
```

如果出现：

```text
/1
/2
```

必须追踪根因。

不要只修数据。

修 calculation source。

---

# 51. Human QA — Scoring

REGULAR：

确认 UI max：

```text
Skill 60
Speed 10
Initiative 10
Attitude 10
Availability 5
Text 5
```

TRAINING：

```text
Skill 20
Speed 10
Initiative 25
Attitude 25
Availability 10
Text 10
```

---

# 52. Human QA — Tier

人工构造 / test fixture 验证：

```text
39.9
40
60
70
85
```

UI / backend 一致。

---

# 53. Human QA — Skill Breakdown

选一个员工。

实际修改：

- 后厨
- 水吧
- 前场
- 开早
- 收晚
- 周清

确认：

- Skill total 更新
- category ratio 更新
- operations 进入 Skill Score
- History snapshot 保留

---

# 54. Human QA — Navigation

逐条测试：

```text
Regular list → scoring → Back → Regular list
Training list → scoring → Back → Training list
Regular list → round → Back → Regular list
Training list → round → Back → Training list
Round → individual score → Back → Round
Refresh Round → semantic fallback
Direct deep link → safe fallback
```

---

# 55. Human QA — Employee Management

测试：

- Create
- Edit
- Archive
- Reactivate
- Store change
- Employee type
- Employment type
- Start date
- tenure
- HR profile
- sensitive data visibility

确认：

没有 Position / Staff 无意义字段。

---

# 56. Human QA — Archive

Active Employee archive。

如果当前存在 OPEN Round / current evaluation：

审计行为是否符合最新业务。

历史 CLOSED Round 绝不能被删。

Completed / snapshot 不能被 cascade 破坏。

---

# 57. Human QA — Skill Board

测试：

- Current Skill
- Regular/Training
- Category
- Operations
- filter
- sort
- crosshair
- current official score
- responsive

确认 Current Score 使用：

最近 CLOSED Round aggregate。

---

# 58. Human QA — Dashboard

检查：

- Active Employee count
- Regular / Training breakdown
- Current Score
- Tier Distribution T1–T5
- Skill Coverage
- no duplicate evaluator weighting

---

# 59. Human QA — Analytics

确认：

一个 Employee 只贡献：

最近 CLOSED Round Aggregate 一次。

不能一个 Employee 因为 3 evaluator 变成 3 samples。

Trend：

Round aggregate。

Tier：

T1–T5。

Employee Type filter。

---

# 60. Phase 5 — Backend Architecture Audit

审计：

- route handlers
- services
- auth middleware
- employee scope
- round service
- scoring policy
- aggregate service
- DB transaction
- error handling
- DTOs
- logging

寻找：

- route 内 business logic 过多
- duplicated calculations
- stale Draft code
- stale legacy evaluation code
- stale qualification code
- N+1
- client authority
- missing scope
- missing transaction
- unsafe cascade
- wrong unique indexes

---

# 61. Backend — Scoring Authority

评分业务必须由 Server authority。

审计 frontend 是否仍有：

- tier calculation
- authoritative overall
- hardcoded policy
- category calculation

如果有重复：

修剪。

Frontend 只展示 server metadata / preview。

---

# 62. Backend — Round Authority

检查：

- get/create OPEN Round
- evaluator UPSERT
- denominator
- aggregate
- close
- next round
- concurrency

必须是 server authoritative。

---

# 63. Backend — GET Pure Read

所有 GET：

尤其：

```text
evaluation-round detail
aggregate
employee
history
```

不能产生：

- Round
- Evaluation
- Draft
- membership
- status update

发现 side-effect GET 必须修。

---

# 64. Backend — Concurrency

重点测试：

A/B 同时首次评分 Closed Round 后员工。

必须：

只创建一个新的 OPEN Round。

同 evaluator 快速双 submit：

不能产生两条 current submission。

ADMIN close 与 evaluator submit 并发：

必须有可解释结果。

优先 transaction + constraints。

---

# 65. Backend — DB Constraints

核对实际 schema 与业务。

至少：

- Employee 同时最多 1 OPEN Round
- roundId + evaluatorAccountId 唯一
- CLOSED Round immutable
- proper FK
- historical Restrict
- no destructive cascade
- employeeType snapshot
- policy snapshot
- skill snapshot

---

# 66. Backend — Error Model

不要返回：

```text
员工管理暂不可用
草稿 ID: xxx
raw Prisma error
stack
```

Production user-facing error：

中文、明确、可行动。

技术 ID：

只在 logs。

---

# 67. Backend — PII

确保 DTO 分层。

不要：

`select: employee` 然后全部 JSON 返回。

建立清晰：

```text
EmployeeSummaryDTO
EmployeeDetailDTO
EmployeeSensitiveProfileDTO
```

按权限返回。

---

# 68. Backend — Logging

safeLogging 至少 redact：

- password
- token
- cookie
- DATABASE_URL
- TFN
- bankAccountNumber
- BSB
- DOB
- address
- super account
- API keys

---

# 69. Phase 6 — Frontend Audit

逐页审计：

```text
Login
Dashboard
Store Type Selection
Store Employee List
Evaluation Form
Round Detail
Employee Management
Employee Detail
History
Analytics
Skill Board
Store Management
Account Management
```

检查：

- information hierarchy
- stale labels
- incorrect state
- duplicated components
- native selects
- layout
- responsive
- loading
- empty
- error
- focus
- back navigation
- route state
- stale Draft UI

---

# 70. Frontend — State Audit

寻找：

- localStorage authority
- stale Draft state
- duplicate server state
- race conditions
- hidden disabled forms
- stale cache
- role-based accidental lock
- route state lost after refresh
- optimistic logic that conflicts with server

---

# 71. Frontend — Evaluation Form

最终必须：

- 无 Draft
- 无 autosave
- Submit 才保存
- 退出未提交提示
- existing current submission 可 preload
- Regular / Training 明显
- dynamic policy metadata
- Skill category breakdown
- operations scoring
- no hidden lock

---

# 72. Frontend — Round Detail

ADMIN：

看到：

- OPEN/CLOSED
- progress
- Store evaluator latest scores
- updatedAt
- provisional/final aggregate
- ADMIN score separate
- end round
- individual details

STORE_EVALUATOR 不应该默认看到别人具体分数。

---

# 73. Frontend — Employee List

字段语义建议：

```text
员工
最近正式综合评分
Tier
本轮进度
本轮临时综合（ADMIN only）
我的评分
操作
```

不要再出现：

草稿。

---

# 74. Frontend — History

History 一级：

CLOSED Round。

明确：

- Training / Regular
- scoring policy
- final aggregate
- completion denominator snapshot
- closedAt

---

# 75. Frontend — Employee Detail

当前：

- Employee Type
- Current official score
- Skill category breakdown
- operations
- current skill
- latest round
- history

如果 current Employee type ≠ latest history type：

清楚说明。

---

# 76. Phase 7 — Dead Code / Redundant Files Audit

这次需要真正清理项目，但必须非常保守。

不要：

看到“像旧文件”就删。

每个候选删除必须经过：

1. 全文引用搜索
2. import graph
3. route usage
4. dynamic import
5. package script
6. test reference
7. build reference
8. migration/runtime relevance
9. Git diff review

---

# 77. Dead File Categories

重点寻找：

- 旧 Evaluation form
- Draft UI
- old scoring policy
- legacy grade/risk components
- unused qualification aggregate
- old generated Prisma folder
- duplicate service
- old API client
- duplicate presentation helper
- obsolete CSS
- orphan test fixture
- screenshots / temp files
- stale local docs
- old build artifacts
- unused assets
- copied components
- old AI scoring service

---

# 78. Delete Strategy

对于确认无用文件：

优先：

```text
git rm
```

保持可回滚。

删除后立即：

```text
TypeScript
tests
build
```

不要一次删 100 个再检查。

---

# 79. Large Deletion Batches

每批最多按一个明确主题：

例如：

```text
Draft legacy cleanup
Qualification aggregate cleanup
Old Prisma generated cleanup
Unused frontend components
```

每批完成后：

- tests
- build
- smoke

---

# 80. Do Not Delete Historical Migrations

即使 migration 看起来旧：

只要已经进入 migration history，

不要为了“干净”删除。

数据库 migration history 是生产契约。

---

# 81. Phase 8 — Dependency Audit

检查：

- unused packages
- duplicate UI libs
- obsolete motion libs
- duplicated utility packages
- dev-only packages in prod
- security advisories

但不要为了升级而升级。

原则：

```text
Remove unused > Upgrade blindly
```

Prisma major / Node major / framework major：

除非真实阻塞，不做大升级。

---

# 82. Motion Libraries

项目可能已有：

- Framer Motion
- GSAP
- Recharts

审计是否真的都在使用。

如果某个库完全无引用：

可以删除。

如果 Login / scoring / charts 使用：

保留。

不要为了减少 package count 重写成熟动画。

---

# 83. Phase 9 — Performance

重点真实场景：

- 25
- 100
- 500 Employee

检查：

- Store roster
- Skill Board
- Dashboard
- Analytics
- Round aggregate

Backend：

避免 N+1。

Frontend：

避免每个 Skill cell 昂贵 JS animation。

---

# 84. SQL / Prisma Query Audit

对关键 roster / aggregate query：

检查 query shape。

必要时：

- DISTINCT ON
- indexes
- grouping
- batch fetch

不要为了理论性能做复杂缓存。

---

# 85. Phase 10 — Accessibility

检查：

- keyboard
- focus
- dialog focus trap
- escape
- select
- combobox
- button
- aria
- reduced motion
- contrast

视觉升级不能破坏 accessibility。

---

# 86. Phase 11 — Responsive

真实浏览器，不只改 CSS。

对每个关键页面测：

```text
1920
1366
1024
768
390
```

检查：

- overflow
- sticky
- drawer
- floating shell
- table
- skill board
- round detail
- dialog
- employee edit
- login

---

# 87. Phase 12 — Production Readiness

当前预期部署：

```text
Render
+
Supabase PostgreSQL
```

生产前检查：

- production build
- same-origin `/api`
- cookie Secure
- SameSite=Lax
- host-only
- health
- Prisma Linux client
- argon2 Linux
- no localhost in production bundle
- SPA fallback
- deep links
- Helmet
- no X-Powered-By
- sanitized 500
- logs no secrets

---

# 88. Render Free Considerations

系统应能容忍：

- cold start
- process restart

不要依赖本地磁盘保存业务数据。

不要实现 keep-alive hack。

---

# 89. Phase 13 — Data Integrity Audit

用 SQL / Prisma 查询检查：

- duplicate OPEN Round
- duplicate evaluator submission
- CLOSED without closedAt
- OPEN with closedAt
- orphan Evaluation
- orphan snapshots
- orphan EmployeeSkill
- archived employee with active invalid state
- invalid employee type
- invalid tier
- invalid policy snapshot
- denominator inconsistencies

先报告，再修。

---

# 90. Migration Discipline

任何 schema change：

必须：

```text
formal Prisma migration
prisma migrate deploy compatible
```

不要：

```text
db push
migrate reset
```

做 migration rehearsal。

---

# 91. Phase 14 — Automated Regression Expansion

对于每个发现过的真实 Bug：

增加 regression test。

特别包括：

- ERR connection behavior where appropriate
- ADMIN scoring/view conflict
- `/2` denominator bug
- Draft removal
- repeated scoring overwrite
- round close snapshot
- automatic next round
- Training → Regular history
- REGULAR 60
- TRAINING 20
- T5
- operation skills scoring
- source-aware back navigation

---

# 92. Phase 15 — Multi-Account Browser Test Suite

必须像真人一样连续操作。

建议流程：

## Scenario A

- ADMIN login
- Hurstville
- Regular
- HandoverEmployee006
- 查看本轮
- 返回
- 评分
- 退出未提交
- 再进入

## Scenario B

Evaluator A：
提交 70

Evaluator B：
提交 80

Evaluator C：
不提交

ADMIN：
确认 2/3
aggregate 75

A：
改 85

ADMIN：
确认仍 2/3
aggregate 82.5

## Scenario C

ADMIN：
结束本轮

History：
final 82.5

A：
再评分 90

确认：
新 OPEN Round

---

# 93. Phase 16 — User Experience Audit

以真实门店经理角度逐页问：

1. 我知道现在在哪吗？
2. 我知道这个分是谁的吗？
3. 我知道是临时还是正式吗？
4. 我知道 Training / Regular 吗？
5. 我知道返回去哪吗？
6. 我能不能误操作旧历史？
7. 我能不能因为打开一个页面就创建数据？
8. 我能不能理解按钮？
9. 我需要点击太多吗？
10. 有没有开发者术语暴露给用户？

---

# 94. UI Copy Audit

清理用户可见：

- Draft
- ID
- raw enum
- REGULAR
- TRAINING
- INTERNAL ERROR
- English technical message

中文保持统一：

- 正式员工
- 培训员工
- 本轮
- 临时综合评分
- 最终综合评分
- 我的评分
- 查看本轮汇总
- 结束本轮
- 评分
- 再次评分

---

# 95. Phase 17 — Code Quality Cleanup

在真实功能稳定之后再做。

目标：

- smaller responsibilities
- consistent naming
- remove duplicate helpers
- shared presentation
- shared route helpers
- shared employee type visual
- shared scoring metadata
- shared back resolver
- remove stale conditional branches

不要做：

为了“架构漂亮”大规模重写。

---

# 96. Component Refactor Threshold

只有满足以下条件才重构：

- 同逻辑 >= 3 处重复
- 已导致 Bug
- 组件超过合理复杂度
- 测试困难
- 类型不一致
- state ownership 混乱

否则保持。

---

# 97. Service Refactor Threshold

后端优先把真正 business authority 放 Service。

不要创建：

几十个只包一行 Prisma 的 service。

---

# 98. Phase 18 — Final Full Regression

最后必须重新运行：

```text
Frontend tests
Backend tests
Integration
Browser
TypeScript
ESLint
Production build
Prisma validate
Migration status
Production smoke
```

并再次走关键人工路径。

---

# 99. Final Visual Review

至少截图/检查：

- Login
- Dashboard
- Regular employee list
- Training employee list
- Evaluation Form Regular
- Evaluation Form Training
- Round Detail OPEN
- Round Detail CLOSED
- Employee Detail
- History
- Skill Board
- Employee Management
- Account Management

---

# 100. Cleanup Acceptance Rule

只有同时满足：

```text
No references
+
No runtime usage
+
No route usage
+
Tests pass
+
Build pass
+
Browser smoke pass
```

才能删除。

---

# 101. Do Not Chase Generic Audit Score

不要为了：

- dark mode
- 100 Lighthouse
- 100% coverage
- zero bundle warning
- latest dependencies
- generic architecture purity

牺牲业务稳定。

这个系统是：

**内部桌面优先的门店员工评价工具。**

---

# 102. Priority Classification

所有发现按：

## P0

- 数据损坏
- 权限泄漏
- Completed/CLOSED 历史被修改
- 跨店访问
- PII 泄漏
- round snapshot 错
- aggregate 错
- 评分被错误覆盖

立即修。

## P1

- 无法评分
- 无法结束本轮
- 进度 denominator 错
- admin 入口冲突
- route 返回错
- score/tier 错
- Training/Regular policy 错
- 关键页面挂掉

立即修。

## P2

- UX 摩擦
- responsive
- loading
- empty
- minor inconsistencies
- visual polish

批量处理。

## P3

- nice-to-have
- generic optimization
- speculative feature

只记录。

---

# 103. Deletion Log

维护：

```text
CLEANUP_LOG.md
```

每个删除项：

```text
File:
Reason:
Reference search:
Replacement:
Tests after deletion:
Build:
Browser:
```

这样不要“删完不知道删了什么”。

---

# 104. Change Log

维护：

```text
AUDIT_FIX_LOG.md
```

每个真实 Bug：

```text
Issue
Severity
Reproduction
Root cause
Fix
Tests
Browser verification
```

---

# 105. No Silent Business Changes

如果你发现代码与本文件冲突：

以本文件当前业务 contract 为准。

但如果某条需求确实存在歧义：

记录：

```text
BUSINESS_DECISION_REQUIRED
```

不要自己编规则。

---

# 106. Git Checkpoints

如果 Git 可用，建议按主题 checkpoint：

```text
audit: establish baseline
fix: evaluation round semantics
fix: scoring policy consistency
fix: navigation and admin flows
cleanup: remove draft legacy
cleanup: remove unused files
fix: employee profile privacy
test: multi-account browser regressions
chore: production hardening
```

不要每个小 CSS 一个 commit。

---

# 107. Do Not Auto Push

除非用户已明确要求：

不要自动 push production branch。

本地 commit 可以作为安全 checkpoint。

最终报告说明 branch / commits。

---

# 108. Final Deliverables

最终必须输出：

```text
FINAL_PRODUCTION_AUDIT_REPORT.md
CLEANUP_LOG.md
AUDIT_FIX_LOG.md
```

其中：

# FINAL_PRODUCTION_AUDIT_REPORT.md

至少包含：

1. Executive Summary
2. Final readiness verdict
3. Business model verification
4. Frontend audit
5. Backend audit
6. Database audit
7. Auth / Store Scope
8. Multi-evaluator scoring
9. Round snapshot model
10. Scoring policies
11. Tier rules
12. Skill model
13. Employee Type
14. Training → Regular
15. Employee profile / PII
16. Navigation
17. Dashboard
18. Analytics
19. Skill Board
20. Responsive
21. Accessibility
22. Performance
23. Dead code removed
24. Files deleted
25. Dependencies removed
26. Migrations
27. Automated tests
28. Browser manual tests
29. Production build
30. Remaining P0/P1/P2
31. Deferred decisions
32. Deployment readiness
33. Internal Pilot readiness

---

# 109. Final Verdict

最终必须明确只给一个：

```text
READY FOR INTERNAL PILOT
```

或：

```text
NOT READY FOR INTERNAL PILOT
```

不能模糊。

如果 NOT READY：

列出阻塞 P0/P1。

---

# 110. Stop Condition

直到满足以下条件才停止：

- 没有已知 P0
- 没有未处理关键 P1
- 当前评分业务语义正确
- Multi-account browser 测试通过
- Round denominator 正确
- No Draft UX
- ADMIN close snapshot 正确
- Training / Regular 正确
- Skill breakdown 正确
- T1–T5 正确
- History immutable
- Store Scope 正确
- PII 没有明显泄漏
- Frontend tests pass
- Backend tests pass
- Production build pass
- Prisma validate pass
- Browser critical flows pass
- 冗余删除经过验证
- Final report 完成

---

# 111. Final Instruction to Codex

不要把这当成：

“请帮我 review 一下代码。”

请把它当成：

> **你现在正式接手这个项目，并需要负责把它从一个经历多轮快速开发的内部系统，整理成一个可以真实投入使用、长期维护、继续部署的产品。**

你的工作顺序永远是：

```text
先理解
先复现
先验证
再修改
再测试
再浏览器复查
最后才清理和收尾
```

宁可少删一个文件，也不要误删需要的东西。

宁可保留一个暂时不完美的实现，也不要为了“架构漂亮”破坏真实业务。

但对于已经确认无用的：

- Draft legacy
- Qualification opinion legacy
- duplicate runtime
- stale component
- unused generated files
- dead CSS
- unused dependency

要果断、系统地清理。

最终目标不是“代码看起来更干净”。

最终目标是：

# Evaluate Molly 真正可以落地。
