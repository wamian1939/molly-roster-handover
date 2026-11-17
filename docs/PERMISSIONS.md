# 权限与业务概念

| 概念 | 当前来源 | 边界 |
|---|---|---|
| Account Role | Evaluate UserAccount.role | ADMIN、STORE_EVALUATOR，仅决定管理身份 |
| Employee Home Store | Employee.storeId | 员工资料、当前工作/评价归属 |
| Management Store Scope | UserAccountStoreAccess + ADMIN all | 管理人员可访问的门店集合 |
| Employee Position | StoreJobDefinition / EmployeeJobAssignment | 员工正式岗位，不等于账号角色 |
| Employee Skill | EmployeeSkill / SkillDefinition | 当前技能，不等于任意岗位名 |
| Roster Shift Role | ShiftRole | 排班岗位；与正式岗位/技能进行资格校验 |

管理员维护门店、账号、员工、岗位等主数据，Payroll 路由全体要求 ADMIN。店评估员仅访问授权门店，员工/轮次/报班/班表要检查记录所属门店。发布、草稿提交、Availability 修改还执行版本与目标归属校验。具体每个接口的 require 调用见 API_INVENTORY.json 与 API_REFERENCE。

员工转店不应被 OPEN 轮次简单阻塞；当前 EmployeeService 将对应门店元数据一起原子更新，保留 canonical ID；CLOSED 轮次/评分历史有不可变约束。历史班表快照不能重写为当前门店记录。

尚未实现普通员工登录→EmployeeID→仅本人 availability/班表的统一生产授权链。模拟员工身份不应获得管理权限。区域管理员可以未来通过一组独立门店 scope 表达，先确认是否需要新角色；不要利用 Employee.storeId 推导管理 scope，也不要直接接受 Staff 浏览器提交的门店数组作为可信授权。
