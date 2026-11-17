# 员工报班账号接入

当前状态：报班前端已分离会话入口和周表单；正式员工认证与报班 API 尚未实现。本次没有修改认证服务、员工数据库或正式报班数据。

## 启用方式

开发环境默认沿用 `/api/employee-demo`。准备好正式后端后设置 `VITE_EMPLOYEE_PORTAL_MODE=account`，以及账号系统提供的同源登录路径 `VITE_EMPLOYEE_SIGN_IN_PATH=/实际登录路径`，重新构建前端。正式构建仅在显式设置 account 模式后开放 `/employee/availability`，不会开放演示账号选择。

`EmployeeAvailabilityPage` 接收 `EmployeePortalClient`，表单只依赖账号信息和报班客户端；可在页面入口注入其他账号适配器，不需要改动每日选择和提交界面。默认正式适配器指向 `/api/employee`，认证失败不会回退到演示模式。

## 预留 API 契约

| 接口 | 输入 | 返回 |
| --- | --- | --- |
| GET /api/employee/me | HttpOnly 会话 Cookie | `{ account: { id, name, storeId, storeName } }` |
| POST /api/employee/logout | 当前员工会话 | 成功响应 |
| GET /api/employee/week?week=YYYY-MM-DD | 周一日期 | `EmployeeWeek` |
| POST /api/employee/preview | expectedAccountId、week、script | 转换后的 `EmployeeWeek`，不落库 |
| PUT /api/employee/week | expectedAccountId、week、expectedRevision、ruleVersion、days | 已保存的 `EmployeeWeek`，revision 递增 1 |

完整 TypeScript DTO 见 `src/services/employeePortalRepository.ts`。日期与时段使用门店时区；`UNKNOWN`、`UNAVAILABLE`、`AVAILABLE` 分别代表未填写、无法报班、可报班，不能互相转换。热度只用于提示，不限制提交。

## 后端接入要求

- 使用现有统一账号系统，将员工账号绑定到 Evaluate 的规范员工 ID。Roster 不创建另一份员工或密码主数据。
- 后端必须根据会话确定员工及当前门店；`expectedAccountId` 只作并发校验，不可用作身份授权。查询参数 `account` 仅在演示模式选择演示账号。
- 每个读写接口校验会话、绑定关系、门店状态和本人权限。正式模式不提供 accounts 列表或仅凭 accountId 登录的端点。
- 更新以 revision、ruleVersion 作原子校验，冲突返回 409；登录失效返回 401；校验失败返回 400。失败响应使用 `{ message }`。
- 会话使用 HttpOnly、Secure、SameSite Cookie；写入接口校验可信来源并按统一认证方案处理 CSRF。员工 401 不触发管理端退出事件。
- 生产启用前必须验证：本人提交与读取成功、跨员工越权被拒绝、失效会话不能写入、跨标签页账号切换返回冲突、重复或并发提交不会覆盖最新数据。前端适配器测试不替代这些后端验收。

## 已有前端保护

表单校验返回账号、周、版本；账号或规则变化会阻止提交并保留当前填写内容。提交结果不确定时不显示成功，并要求重新读取核对。草稿留在当前页面内存，不跨账号保存到浏览器存储。
