# API 参考（从真实路由 AST 提取）

本文件不是假设的 REST 设计。生产 HTTP 前缀以 Worker 挂载为准；本地 Evaluate 是独立服务 `/api`，生产 Evaluate 是 `/api/evaluate`。完整每个 handler、源行、query/path 参数、schema.parse、权限调用、response 表达式见 [API_INVENTORY.json](API_INVENTORY.json)。Inline Zod schema、superRefine、service 校验以所列实际文件为最终依据；没有捕获的真实响应明确不提供伪造样例。

鉴权：Roster auth/login/logout 为代理/同域会话，auth 后全局 requireEvaluateAuth；Evaluate health/login 公开，其余 createRequireAuth；Payroll **所有路由包括 callback 都先要求登录和 ADMIN**（现有实现，真实 OAuth 重定向还需验证 SameSite/session），demo 是隔离 mock 会话。ADMIN/门店 require 还在 handler/service 执行，表中列出显式调用；不能把“未发现局部 require”理解为无鉴权。

常用错误：400 Zod/格式；401 无效/过期登录；403 角色、门店或 Origin；404 不存在；409 版本/并发/状态冲突；422 排班验证；429 登录或外部限流；503 未初始化/不可用集成。实际某个接口的错误由 service 和路由共同决定；未在所有端点实际触发验证。

已实际运行的合成请求：

```http
POST /api/auth/login
Content-Type: application/json
Origin: https://handover.test

{"username":"handover-admin","password":"<运行时自行设置，不随包交付>"}
```

返回200：`{"user":{"id":"synthetic-admin","accountId":"synthetic-admin","userId":"synthetic-admin","username":"handover-admin","displayName":"Synthetic Admin","role":"ADMIN","storeIds":[],"stores":[],"canAccessAllStores":true}}`，并设置 HttpOnly session cookie；没有携带 token 值。

```http
POST /api/evaluate/employees
Content-Type: application/json
Origin: https://handover.test
Cookie: evaluate_molly_session=<仅示意>

{"id":"synthetic-employee-001","storeId":"synthetic-store-a","displayName":"Synthetic Employee 001","employmentType":"Casual","employeeType":"REGULAR","jobIds":["synthetic-job-front"]}
```

返回201，真实对象结构由 employeeService.createEmployee 决定；本次验证创建后 `GET /api/workforce/stores/synthetic-store-a/employees` 返回 employees 中有相同 canonical ID。完整对象仅在内存中检查，不把未捕获字段写成示例。

`GET /api/health` 合成环境真实200响应：`{"ok":true,"services":{"database":true,"evaluateMolly":true,"automaticScheduling":false},"deployment":"Sites D1","employeeMode":"mock"}`。未登录 `GET /api/auth/me` 为401。`GET /api/payroll/status` 已实际验证 configured=false。

Payroll preview 示例**依据 DTO，不是已执行真实 Xero 结果**：`POST /api/payroll/previews` body `{ "selections":[{"storeId":"synthetic-store-a","periodId":"<本地周期ID>"}] }`；精确字段/可选项以该 handler 为准。审批/支付不在此集成功能中。未配置 Xero、Rate、员工映射时不能同步。

## Production Roster

### POST /api/auth/login

来源：[production-site/generated/vendor/routes.ts:148](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`loginSchema.parse(request.body)`。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(upstream.status).json(verifiedBody)`。

### GET /api/auth/me

来源：[production-site/generated/vendor/routes.ts:161](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ user: await evaluate.me(request.header("cookie")) })`。

### POST /api/auth/logout

来源：[production-site/generated/vendor/routes.ts:165](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(upstream.status).json(body)`。

### GET /api/session

来源：[production-site/generated/vendor/routes.ts:214](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/workforce/contract-version

来源：[production-site/generated/vendor/routes.ts:216](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await integrationBody(evaluate, "/contract-version", request.header("cookie")!))`。

### GET /api/workforce/stores

来源：[production-site/generated/vendor/routes.ts:219](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ...stores, stores: stores.stores.filter((store) => auth.role === "ADMIN" || auth.storeIds.includes(store.id)) })`。

### GET /api/workforce/stores/:storeId/employees

来源：[production-site/generated/vendor/routes.ts:224](../production-site/generated/vendor/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await workforceEmployees(evaluate, request.params.storeId, request.header("cookie")!))`。

### GET /api/workforce/skill-definitions

来源：[production-site/generated/vendor/routes.ts:228](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ skills: catalog.skills })`。

### GET /api/workforce/stores/:storeId/jobs

来源：[production-site/generated/vendor/routes.ts:233](../production-site/generated/vendor/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ jobs: jobs.filter((job) => job.isActive) })`。

### GET /api/workforce/employees/:employeeId

来源：[production-site/generated/vendor/routes.ts:238](../production-site/generated/vendor/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, payload.employee.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(payload)`。

### GET /api/roster/periods

来源：[production-site/generated/vendor/routes.ts:247](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`rangeSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listPeriods(query.storeId, query.from, query.to))`。

### POST /api/roster/periods

来源：[production-site/generated/vendor/routes.ts:251](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`periodSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createPeriod(payload, auth.accountId))`。

### GET /api/roster/periods/:periodId

来源：[production-site/generated/vendor/routes.ts:255](../production-site/generated/vendor/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getPeriod(storeId, request.params.periodId))`。

### GET /api/roster/periods/:periodId/summary

来源：[production-site/generated/vendor/routes.ts:259](../production-site/generated/vendor/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.periodSummary(storeId, request.params.periodId))`。

### POST /api/roster/periods/:periodId/publish

来源：[production-site/generated/vendor/routes.ts:263](../production-site/generated/vendor/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`versionBodySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.publishPeriod(payload.storeId, request.params.periodId, payload.version, { accountId: auth.accountId, displayName: auth.displayName }, store, currentEmployees, formalRoles.ids, formalRoles.names, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors))`。

### GET /api/roster/periods/:periodId/publications

来源：[production-site/generated/vendor/routes.ts:272](../production-site/generated/vendor/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`publicationQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listPublications(query.storeId, request.params.periodId))`。

### GET /api/roster/publications/:publicationId

来源：[production-site/generated/vendor/routes.ts:276](../production-site/generated/vendor/routes.ts)。

- path 参数：publicationId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`publicationDetailQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getPublication(query.storeId, request.params.publicationId, query.audience))`。

### POST /api/roster/periods/:periodId/reopen

来源：[production-site/generated/vendor/routes.ts:281](../production-site/generated/vendor/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`versionBodySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.reopenPeriod(payload.storeId, request.params.periodId, payload.version))`。

### POST /api/roster/batch/copy

来源：[production-site/generated/vendor/routes.ts:285](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.copyPeriod({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/copy/preview

来源：[production-site/generated/vendor/routes.ts:293](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewCopyPeriod({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/copy-day/preview

来源：[production-site/generated/vendor/routes.ts:300](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyDaySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewCopyDay({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/copy-day

来源：[production-site/generated/vendor/routes.ts:307](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyDayExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.copyDay({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/repeat/preview

来源：[production-site/generated/vendor/routes.ts:315](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`repeatSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewRepeatShift({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/repeat

来源：[production-site/generated/vendor/routes.ts:322](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`repeatExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.repeatShift({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/delete

来源：[production-site/generated/vendor/routes.ts:330](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`batchDeleteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.batchDelete(payload.storeId, payload.items))`。

### POST /api/roster/batch/update

来源：[production-site/generated/vendor/routes.ts:331](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`batchUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.batchUpdate(payload.storeId, payload.items, { ...payload.patch, ...(formalRoleName ? { formalRoleName } : {}), ...(formalRoleColor ? { formalRoleColor } : {}) }, auth.accountId, workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoles.ids, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees)))`。

### GET /api/roster/calendar

来源：[production-site/generated/vendor/routes.ts:341](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`rangeSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.calendar(query.storeId, query.from, query.to))`。

### GET /api/roster/roles

来源：[production-site/generated/vendor/routes.ts:345](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleListSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listRoles(query.storeId, includeInactive))`。

### GET /api/roster/roles/draft-usage

来源：[production-site/generated/vendor/routes.ts:351](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listDraftRoleUsage(storeId))`。

### POST /api/roster/roles

来源：[production-site/generated/vendor/routes.ts:355](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createRole({ ...payload, colorToken: evaluateJobColor(job.colorToken) ?? "#334155" }, jobs))`。

### PATCH /api/roster/roles/:roleId

来源：[production-site/generated/vendor/routes.ts:369](../production-site/generated/vendor/routes.ts)。

- path 参数：roleId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateRole(request.params.roleId, { ...payload, colorToken: evaluateJobColor(activatingJob?.colorToken) ?? formal.colors[request.params.roleId] ?? role?.colorToken ?? "#334155" }, jobs))` / `response.json(await roster.updateRole(request.params.roleId, { ...payload, colorToken: currentRole?.colorToken ?? "#334155" }))`。

### GET /api/roster/templates

来源：[production-site/generated/vendor/routes.ts:393](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listShiftTemplates(storeId))`。

### POST /api/roster/templates

来源：[production-site/generated/vendor/routes.ts:397](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`templateCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createShiftTemplate(payload))`。

### PATCH /api/roster/templates/:templateId

来源：[production-site/generated/vendor/routes.ts:402](../production-site/generated/vendor/routes.ts)。

- path 参数：templateId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`templateUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateShiftTemplate(request.params.templateId, payload))`。

### GET /api/roster/availability-templates

来源：[production-site/generated/vendor/routes.ts:407](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listAvailabilityTemplates(storeId))`。

### POST /api/roster/availability-templates

来源：[production-site/generated/vendor/routes.ts:411](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityTemplateCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createAvailabilityTemplate(payload))`。

### PATCH /api/roster/availability-templates/:templateId

来源：[production-site/generated/vendor/routes.ts:415](../production-site/generated/vendor/routes.ts)。

- path 参数：templateId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityTemplateUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateAvailabilityTemplate(request.params.templateId, payload))`。

### GET /api/roster/settings

来源：[production-site/generated/vendor/routes.ts:419](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ settings: await roster.getSettings(storeId) })`。

### PUT /api/roster/settings/:storeId

来源：[production-site/generated/vendor/routes.ts:423](../production-site/generated/vendor/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`settingsSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.saveSettings(payload))`。

### GET /api/roster/availability

来源：[production-site/generated/vendor/routes.ts:429](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listAvailability(query.storeId, query.from, query.to, query.employeeId))`。

### GET /api/roster/availability-script/shortcuts

来源：[production-site/generated/vendor/routes.ts:433](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ configuration: await roster.getPresetShortcuts(storeId) })`。

### PUT /api/roster/availability-script/shortcuts

来源：[production-site/generated/vendor/routes.ts:437](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetShortcutSaveSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.savePresetShortcuts({ ...payload, actorAccountId: auth.accountId }))`。

### POST /api/roster/availability-script/preview

来源：[production-site/generated/vendor/routes.ts:441](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetScriptPreviewSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ weekStart: parsed.weekStart, timezone, slots: preview.slots, issues: [...parsed.issues.filter((issue) => issue.code !== "DUPLICATE_DAY" || !preview.issues.some((previewIssue) => previewIssue.code === "DUPLICATE_DAY")), ...preview.issues], summary: preview.summary, slotStatusHash, previewHash: presetTimeSlotPreviewFingerprint(sourceHash, workforce.workforceRevision, parsed.slots, settings?.version ?? null, configuration.version, preview.summary.create, preview.summary.unchanged, s`。

### POST /api/roster/availability-script/commit

来源：[production-site/generated/vendor/routes.ts:481](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetScriptCommitSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.commitPresetTimeSlots({ storeId: payload.storeId, actorAccountId: auth.accountId, sourceHash, weekStart: parsed.weekStart, slots: parsed.slots, expectedShortcutsVersion: configuration.version, expectedSettingsVersion: settings?.version ?? null, expectedCreateCount: payload.expectedCreateCount, expectedUnchangedCount: payload.expectedUnchangedCount, expectedSlotStatusHash: payload.expectedSlotStatusHash }))`。

### PUT /api/roster/availability

来源：[production-site/generated/vendor/routes.ts:508](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilitySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.replaceAvailability(payload))`。

### POST /api/roster/shifts

来源：[production-site/generated/vendor/routes.ts:513](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createShift({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### POST /api/roster/shifts/with-period

来源：[production-site/generated/vendor/routes.ts:523](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftCreateWithPeriodSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(200).json(replay)` / `response.status(201).json(await roster.createShiftWithPeriod({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### POST /api/roster/shifts/draft-commit

来源：[production-site/generated/vendor/routes.ts:535](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`draftCommitSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId, payload.changes.filter((change) => change.kind === "delete"), auth.accountId))` / `response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId, changes, auth.accountId))`。

### GET /api/roster/shifts/:shiftId

来源：[production-site/generated/vendor/routes.ts:563](../production-site/generated/vendor/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getShift(storeId, request.params.shiftId))`。

### PATCH /api/roster/shifts/:shiftId

来源：[production-site/generated/vendor/routes.ts:567](../production-site/generated/vendor/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateShift(request.params.shiftId, { ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### PATCH /api/roster/shifts/:shiftId/reposition

来源：[production-site/generated/vendor/routes.ts:577](../production-site/generated/vendor/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftRepositionSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.repositionShift(request.params.shiftId, payload, auth.accountId, activeEmployees.map((employee) => employee.id), target ? { sourceEmployeeId: payload.sourceEmployeeId!, target: toAssignmentSnapshot(target) } : undefined, formalRoles.names, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors))`。

### DELETE /api/roster/shifts/:shiftId

来源：[production-site/generated/vendor/routes.ts:588](../production-site/generated/vendor/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftDeleteSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/roster/export.csv

来源：[production-site/generated/vendor/routes.ts:594](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`exportSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.send(\uFEFF${rosterCsv(result.shifts, query.audience, timezone, legacyTimezone)})`。

### GET /api/roster/print

来源：[production-site/generated/vendor/routes.ts:609](../production-site/generated/vendor/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`exportSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.send(rosterPrint(result.period, result.shifts, query.audience, timezone, legacyTimezone))`。

## Production Payroll (ADMIN middleware)

### GET /api/payroll/status

来源：[production-site/generated/vendor/payroll/routes.ts:46](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.status。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/connect

来源：[production-site/generated/vendor/payroll/routes.ts:47](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.header("cookie") ?? ""),`。
- 业务：service.connect。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/oauth/callback

来源：[production-site/generated/vendor/payroll/routes.ts:54](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.header("cookie") ?? "", input),`。
- 业务：service.callback。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/tenant

来源：[production-site/generated/vendor/payroll/routes.ts:71](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v.tenantId, v.expectedTenantId),`。
- 业务：service.select。
- 响应：`r.json( await locked(() => service.select(getAuth(q).accountId, v.tenantId, v.expectedTenantId), ), )`。

### POST /api/payroll/disconnect

来源：[production-site/generated/vendor/payroll/routes.ts:82](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId))),`。
- 业务：service.disconnect。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/references

来源：[production-site/generated/vendor/payroll/routes.ts:85](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.references。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/references/refresh

来源：[production-site/generated/vendor/payroll/routes.ts:88](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.references。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/mappings

来源：[production-site/generated/vendor/payroll/routes.ts:91](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.mappings。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### PUT /api/payroll/mappings

来源：[production-site/generated/vendor/payroll/routes.ts:92](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v)))`。
- 业务：service.saveMappings。
- 响应：`r.json(await locked(() => service.saveMappings(getAuth(q).accountId, v)))`。

### POST /api/payroll/previews

来源：[production-site/generated/vendor/payroll/routes.ts:108](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v.selections)),`。
- 业务：service.preview。
- 响应：`r.status(201).json( await locked(() => service.preview(getAuth(q).accountId, v.selections)), )`。

### GET /api/payroll/previews/:id

来源：[production-site/generated/vendor/payroll/routes.ts:117](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.getPreview。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/previews/:id/revisions

来源：[production-site/generated/vendor/payroll/routes.ts:120](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.revisions。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/previews/:id/revisions/:version

来源：[production-site/generated/vendor/payroll/routes.ts:123](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id, version。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.revisions。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### PUT /api/payroll/previews/:id

来源：[production-site/generated/vendor/payroll/routes.ts:131](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id, v),`。
- 业务：service.savePreview。
- 响应：`r.json( await locked(() => service.savePreview(getAuth(q).accountId, q.params.id, v), ), )`。

### POST /api/payroll/previews/:id/validate

来源：[production-site/generated/vendor/payroll/routes.ts:160](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.validate。
- 响应：`r.json( await locked(() => service.validate(q.params.id, true, v.mappingVersion)), )`。

### POST /api/payroll/previews/:id/confirm

来源：[production-site/generated/vendor/payroll/routes.ts:169](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId,`。
- 业务：service.confirm。
- 响应：`r.json( await locked(() => service.confirm( getAuth(q).accountId, q.params.id, v.version, v.adoptExistingDraft, v.mappingVersion, ), ), )`。

### POST /api/payroll/previews/:id/sync

来源：[production-site/generated/vendor/payroll/routes.ts:190](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id)),`。
- 业务：service.start。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/jobs/:id/retry

来源：[production-site/generated/vendor/payroll/routes.ts:195](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id)),`。
- 业务：service.retry。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/targets

来源：[production-site/generated/vendor/payroll/routes.ts:200](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.targets。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/targets/:id/reconcile

来源：[production-site/generated/vendor/payroll/routes.ts:201](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId,`。
- 业务：service.reconcileTarget。
- 响应：`r.json( await locked(() => service.reconcileTarget( getAuth(q).accountId, q.params.id, v.version, v.timesheetId, ), ), )`。

### GET /api/payroll/jobs

来源：[production-site/generated/vendor/payroll/routes.ts:221](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.history。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/jobs/:id

来源：[production-site/generated/vendor/payroll/routes.ts:222](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.job。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/jobs/:id/process

来源：[production-site/generated/vendor/payroll/routes.ts:225](../production-site/generated/vendor/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id, v.retryFailed),`。
- 业务：service.process。
- 响应：`r.json( await locked(() => service.process(getAuth(q).accountId, q.params.id, v.retryFailed), ), )`。

## Production Evaluate

### GET /api/evaluate/health

来源：[production-site/generated/evaluate/routes.ts:75](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ok: true })`。

### POST /api/evaluate/auth/login

来源：[production-site/generated/evaluate/routes.ts:79](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`loginSchema.parse(request.body)`。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(429).json({ message: "登录尝试过于频繁，请稍后再试。" })` / `response.json({ user: result.user })`。

### GET /api/evaluate/auth/me

来源：[production-site/generated/evaluate/routes.ts:100](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request) })`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ user: getAuthContext(request) })`。

### POST /api/evaluate/auth/logout

来源：[production-site/generated/evaluate/routes.ts:104](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ok: true })`。

### GET /api/evaluate/evaluations/periods

来源：[production-site/generated/evaluate/routes.ts:110](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.listPeriods。
- 响应：`response.json(await service.listPeriods())`。

### GET /api/evaluate/stores

来源：[production-site/generated/evaluate/routes.ts:114](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：service.listStores。
- 响应：`response.json(await service.listStores(getAccessibleStoreScope(auth)))`。

### GET /api/evaluate/stores/manage

来源：[production-site/generated/evaluate/routes.ts:119](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：includeArchived。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.listStoresWithCounts。
- 响应：`response.json(await storeService.listStoresWithCounts(undefined, includeArchived))`。

### GET /api/evaluate/admin/accounts

来源：[production-site/generated/evaluate/routes.ts:126](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountListQuerySchema.parse(request.query)`。
- 权限：`requireAdmin(getAuthContext(request))`。
- 业务：accountService.listAccounts。
- 响应：`response.json(await accountService.listAccounts(query.storeId))`。

### POST /api/evaluate/admin/accounts

来源：[production-site/generated/evaluate/routes.ts:132](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountCreateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.createAccount。
- 响应：`response.status(201).json(await accountService.createAccount(payload, auth.accountId))`。

### PATCH /api/evaluate/admin/accounts/:accountId

来源：[production-site/generated/evaluate/routes.ts:139](../production-site/generated/evaluate/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.updateAccount。
- 响应：`response.json(await accountService.updateAccount(request.params.accountId, payload, auth.accountId))`。

### DELETE /api/evaluate/admin/accounts/:accountId

来源：[production-site/generated/evaluate/routes.ts:146](../production-site/generated/evaluate/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.deleteAccount。
- 响应：`response.json(await accountService.deleteAccount(request.params.accountId, auth.accountId))`。

### POST /api/evaluate/admin/accounts/:accountId/reset-password

来源：[production-site/generated/evaluate/routes.ts:152](../production-site/generated/evaluate/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`resetPasswordSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.resetPassword。
- 响应：`response.json(await accountService.resetPassword(request.params.accountId, payload.password, auth.accountId))`。

### POST /api/evaluate/stores

来源：[production-site/generated/evaluate/routes.ts:159](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.createStore。
- 响应：`response.status(201).json(await storeService.createStore(payload))`。

### PUT /api/evaluate/stores/:storeId

来源：[production-site/generated/evaluate/routes.ts:166](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.updateStore。
- 响应：`response.json(await storeService.updateStore(request.params.storeId, payload))`。

### POST /api/evaluate/stores/:storeId/archive

来源：[production-site/generated/evaluate/routes.ts:173](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.archiveStore。
- 响应：`response.json(await storeService.archiveStore(request.params.storeId))`。

### POST /api/evaluate/stores/:storeId/reactivate

来源：[production-site/generated/evaluate/routes.ts:179](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.reactivateStore。
- 响应：`response.json(await storeService.reactivateStore(request.params.storeId))`。

### GET /api/evaluate/store-jobs

来源：[production-site/generated/evaluate/routes.ts:185](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId, includeInactive。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await storeJobService.list(getAccessibleStoreScope(auth), storeId, includeInactive))`。

### POST /api/evaluate/stores/:storeId/jobs

来源：[production-site/generated/evaluate/routes.ts:193](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeJobMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await storeJobService.create(request.params.storeId, payload))`。

### PATCH /api/evaluate/store-jobs/:jobId

来源：[production-site/generated/evaluate/routes.ts:201](../production-site/generated/evaluate/routes.ts)。

- path 参数：jobId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeJobUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, await storeJobService.getStoreId(request.params.jobId))`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await storeJobService.update(request.params.jobId, storeJobUpdateSchema.parse(request.body)))`。

### GET /api/evaluate/evaluations/dashboard

来源：[production-site/generated/evaluate/routes.ts:208](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await analyticsV1Service.getDashboard(getAccessibleStoreScope(auth), storeId, auth))`。

### GET /api/evaluate/stores/:storeId/evaluations

来源：[production-site/generated/evaluate/routes.ts:215](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeEvaluationListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.getStoreRoster(request.params.storeId, query, auth))`。

### GET /api/evaluate/employees

来源：[production-site/generated/evaluate/routes.ts:222](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：employeeService.listEmployees。
- 响应：`response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }))`。

### GET /api/evaluate/stores/:storeId/employees

来源：[production-site/generated/evaluate/routes.ts:230](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeListQuerySchema.parse({ ...request.query, storeId: request.params.storeId })`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：employeeService.listEmployees。
- 响应：`response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }))`。

### GET /api/evaluate/employees/:employeeId

来源：[production-site/generated/evaluate/routes.ts:238](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee。
- 响应：`response.json(employee)`。

### GET /api/evaluate/employees/:employeeId/profile

来源：[production-site/generated/evaluate/routes.ts:245](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：employeeService.getEmployeeProfile。
- 响应：`response.json(await employeeService.getEmployeeProfile(request.params.employeeId))`。

### GET /api/evaluate/employees/:employeeId/evaluation-summary

来源：[production-site/generated/evaluate/routes.ts:252](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee。
- 响应：`response.json( await employeeEvaluationSummaryService.getSummary( request.params.employeeId, getAccessibleStoreScope(auth), auth, ), )`。

### GET /api/evaluate/performance-notes

来源：[production-site/generated/evaluate/routes.ts:265](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：performanceNoteService.listPerformanceNotes。
- 响应：`response.json( await performanceNoteService.listPerformanceNotes({ ...query, ...(storeScope ? { accessibleStoreIds: storeScope } : {}), `。

### GET /api/evaluate/employees/:employeeId/performance-notes

来源：[production-site/generated/evaluate/routes.ts:278](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteListQuerySchema.parse({ ...request.query, employeeId: request.params.employeeId })`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId ?? employee.storeId)`。
- 业务：employeeService.getEmployee, performanceNoteService.getPerformanceNotesForEmployee。
- 响应：`response.json( await performanceNoteService.getPerformanceNotesForEmployee(request.params.employeeId, { ...query, ...(storeScope ? { accessibleStoreIds: storeScope } : {}), `。

### POST /api/evaluate/performance-notes

来源：[production-site/generated/evaluate/routes.ts:292](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：storeService.assertActiveStore, performanceNoteService.createPerformanceNote。
- 响应：`response.status(201).json(await performanceNoteService.createPerformanceNote(payload, auth.accountId))`。

### POST /api/evaluate/employees

来源：[production-site/generated/evaluate/routes.ts:300](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：storeService.assertActiveStore, employeeService.createEmployee。
- 响应：`response.status(201).json(await employeeService.createEmployee(payload, auth.accountId))`。

### GET /api/evaluate/employees/:employeeId/current-skills

来源：[production-site/generated/evaluate/routes.ts:309](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.list。
- 响应：`response.json({ skills: await currentSkillService.list(employee.id) })`。

### GET /api/evaluate/employees/:employeeId/current-skills/:skillDefinitionId/confirmations

来源：[production-site/generated/evaluate/routes.ts:316](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId, skillDefinitionId。
- query 字段（静态发现）：page, pageSize。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.listConfirmations。
- 响应：`response.json(await currentSkillService.listConfirmations(employee.id, request.params.skillDefinitionId, page, pageSize))`。

### PATCH /api/evaluate/employees/:employeeId/current-skills/:skillDefinitionId

来源：[production-site/generated/evaluate/routes.ts:326](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId, skillDefinitionId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`currentSkillConfirmationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.confirm。
- 响应：`response.json({ skills: await currentSkillService.confirm(employee.id, request.params.skillDefinitionId, input.status, input.expectedUpdatedAt, auth.accountId, input.reason) })`。

### PUT /api/evaluate/employees/:employeeId

来源：[production-site/generated/evaluate/routes.ts:335](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.updateEmployee。
- 响应：`response.json(await employeeService.updateEmployee(request.params.employeeId, payload, auth.accountId))`。

### POST /api/evaluate/employees/:employeeId/promote-to-regular

来源：[production-site/generated/evaluate/routes.ts:347](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, employeeService.promoteToRegular。
- 响应：`response.json(await employeeService.promoteToRegular(request.params.employeeId))`。

### POST /api/evaluate/employees/:employeeId/archive

来源：[production-site/generated/evaluate/routes.ts:355](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.archiveEmployee。
- 响应：`response.json(await employeeService.archiveEmployee(request.params.employeeId))`。

### POST /api/evaluate/employees/:employeeId/restore

来源：[production-site/generated/evaluate/routes.ts:364](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.restoreEmployee。
- 响应：`response.json(await employeeService.restoreEmployee(request.params.employeeId))`。

### GET /api/evaluate/evaluations/history

来源：[production-site/generated/evaluate/routes.ts:373](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.listCompletedHistory(storeId ? [storeId] : getAccessibleStoreScope(auth)))`。

### GET /api/evaluate/evaluation-rounds/history

来源：[production-site/generated/evaluate/routes.ts:380](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`evaluationHistoryQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.listClosedRoundHistory(query, getAccessibleStoreScope(auth), auth))`。

### GET /api/evaluate/evaluations/analytics

来源：[production-site/generated/evaluate/routes.ts:387](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`analyticsV1QuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await analyticsV1Service.getAnalytics( getAccessibleStoreScope(auth), query.storeId, query.employeeType, auth, ))`。

### GET /api/evaluate/roster-skill-board

来源：[production-site/generated/evaluate/routes.ts:399](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await rosterSkillBoardService.getBoard(getAccessibleStoreScope(auth), storeId, auth))`。

### GET /api/evaluate/roster-integration/contract-version

来源：[production-site/generated/evaluate/routes.ts:406](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：rosterIntegrationService.contractVersion。
- 响应：`response.json(rosterIntegrationService.contractVersion())`。

### GET /api/evaluate/roster-integration/stores

来源：[production-site/generated/evaluate/routes.ts:410](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.listStores。
- 响应：`response.json(await rosterIntegrationService.listStores(getAccessibleStoreScope(auth)))`。

### GET /api/evaluate/roster-integration/skill-definitions

来源：[production-site/generated/evaluate/routes.ts:415](../production-site/generated/evaluate/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.listSkillDefinitions。
- 响应：`response.json(await rosterIntegrationService.listSkillDefinitions())`。

### GET /api/evaluate/roster-integration/stores/:storeId/employees

来源：[production-site/generated/evaluate/routes.ts:420](../production-site/generated/evaluate/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：page, pageSize。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：rosterIntegrationService.listEmployees。
- 响应：`response.json(await rosterIntegrationService.listEmployees(request.params.storeId, getAccessibleStoreScope(auth), page, pageSize))`。

### GET /api/evaluate/roster-integration/employees/:employeeId

来源：[production-site/generated/evaluate/routes.ts:429](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.getEmployee。
- 响应：`response.status(404).json({ message: "未找到员工" })` / `response.json(result)`。

### GET /api/evaluate/employees/:employeeId/evaluation-rounds/current

来源：[production-site/generated/evaluate/routes.ts:439](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, evaluationRoundService.getCurrentRound。
- 响应：`response.json(await evaluationRoundService.getCurrentRound(employee.id, auth))`。

### POST /api/evaluate/employees/:employeeId/scoring-context

来源：[production-site/generated/evaluate/routes.ts:446](../production-site/generated/evaluate/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, evaluationV1Service.startLiveScoring。
- 响应：`response.status(200).json(await evaluationV1Service.startLiveScoring(employee.id, auth))`。

### GET /api/evaluate/evaluation-rounds/:roundId

来源：[production-site/generated/evaluate/routes.ts:454](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.getRound。
- 响应：`response.json(await evaluationRoundService.getRound(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluate/evaluation-rounds/:roundId/aggregate

来源：[production-site/generated/evaluate/routes.ts:458](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.getAggregate。
- 响应：`response.json(await evaluationRoundService.getAggregate(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluate/evaluation-rounds/:roundId/evaluations

来源：[production-site/generated/evaluate/routes.ts:462](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.listEvaluations。
- 响应：`response.json(await evaluationRoundService.listEvaluations(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluate/evaluation-rounds/:roundId/my-evaluation

来源：[production-site/generated/evaluate/routes.ts:466](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.getMyEvaluation。
- 响应：`response.json(await evaluationV1Service.getMyEvaluation(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluate/evaluation-rounds/:roundId/scoring-context

来源：[production-site/generated/evaluate/routes.ts:470](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.getLiveScoringContext。
- 响应：`response.json(await evaluationV1Service.getLiveScoringContext(request.params.roundId, getAuthContext(request)))`。

### POST /api/evaluate/evaluation-rounds/:roundId/preview-my-evaluation

来源：[production-site/generated/evaluate/routes.ts:474](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveEvaluationSubmissionSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.previewLiveSubmission。
- 响应：`response.json(await evaluationV1Service.previewLiveSubmission(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluate/evaluation-rounds/:roundId/preview-my-skills

来源：[production-site/generated/evaluate/routes.ts:479](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveSkillPreviewSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.previewLiveSkills。
- 响应：`response.json(await evaluationV1Service.previewLiveSkills(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluate/evaluation-rounds/:roundId/analyze-my-evaluation

来源：[production-site/generated/evaluate/routes.ts:484](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.analyzeLiveText。
- 响应：`response.json(await evaluationV1Service.analyzeLiveText(request.params.roundId, textFeedback, getAuthContext(request)))`。

### PUT /api/evaluate/evaluation-rounds/:roundId/my-evaluation

来源：[production-site/generated/evaluate/routes.ts:489](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveEvaluationSubmissionSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.submitLiveEvaluation。
- 响应：`response.json(await evaluationV1Service.submitLiveEvaluation(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluate/evaluation-rounds/:roundId/close

来源：[production-site/generated/evaluate/routes.ts:494](../production-site/generated/evaluate/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.closeRound。
- 响应：`response.json(await evaluationRoundService.closeRound(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluate/evaluations/v1/:evaluationId

来源：[production-site/generated/evaluate/routes.ts:498](../production-site/generated/evaluate/routes.ts)。

- path 参数：evaluationId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：evaluationV1Service.getStoreId, evaluationV1Service.getEvaluation。
- 响应：`response.status(404).json({ message: "评价不存在。" })` / `response.json(await evaluationV1Service.getEvaluation(request.params.evaluationId, auth))`。

## Development Roster

### POST /api/auth/login

来源：[local/roster/backend/src/routes.ts:148](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`loginSchema.parse(request.body)`。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(upstream.status).json(verifiedBody)`。

### GET /api/auth/me

来源：[local/roster/backend/src/routes.ts:161](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ user: await evaluate.me(request.header("cookie")) })`。

### POST /api/auth/logout

来源：[local/roster/backend/src/routes.ts:165](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(upstream.status).json(body)`。

### GET /api/session

来源：[local/roster/backend/src/routes.ts:214](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/workforce/contract-version

来源：[local/roster/backend/src/routes.ts:216](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await integrationBody(evaluate, "/contract-version", request.header("cookie")!))`。

### GET /api/workforce/stores

来源：[local/roster/backend/src/routes.ts:219](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ...stores, stores: stores.stores.filter((store) => auth.role === "ADMIN" || auth.storeIds.includes(store.id)) })`。

### GET /api/workforce/stores/:storeId/employees

来源：[local/roster/backend/src/routes.ts:224](../local/roster/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await workforceEmployees(evaluate, request.params.storeId, request.header("cookie")!))`。

### GET /api/workforce/skill-definitions

来源：[local/roster/backend/src/routes.ts:228](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ skills: catalog.skills })`。

### GET /api/workforce/stores/:storeId/jobs

来源：[local/roster/backend/src/routes.ts:233](../local/roster/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ jobs: jobs.filter((job) => job.isActive) })`。

### GET /api/workforce/employees/:employeeId

来源：[local/roster/backend/src/routes.ts:238](../local/roster/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(request)`; `requireStore(auth, payload.employee.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(payload)`。

### GET /api/roster/periods

来源：[local/roster/backend/src/routes.ts:247](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`rangeSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listPeriods(query.storeId, query.from, query.to))`。

### POST /api/roster/periods

来源：[local/roster/backend/src/routes.ts:251](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`periodSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createPeriod(payload, auth.accountId))`。

### GET /api/roster/periods/:periodId

来源：[local/roster/backend/src/routes.ts:255](../local/roster/backend/src/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getPeriod(storeId, request.params.periodId))`。

### GET /api/roster/periods/:periodId/summary

来源：[local/roster/backend/src/routes.ts:259](../local/roster/backend/src/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.periodSummary(storeId, request.params.periodId))`。

### POST /api/roster/periods/:periodId/publish

来源：[local/roster/backend/src/routes.ts:263](../local/roster/backend/src/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`versionBodySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.publishPeriod(payload.storeId, request.params.periodId, payload.version, { accountId: auth.accountId, displayName: auth.displayName }, store, currentEmployees, formalRoles.ids, formalRoles.names, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors))`。

### GET /api/roster/periods/:periodId/publications

来源：[local/roster/backend/src/routes.ts:272](../local/roster/backend/src/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`publicationQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listPublications(query.storeId, request.params.periodId))`。

### GET /api/roster/publications/:publicationId

来源：[local/roster/backend/src/routes.ts:276](../local/roster/backend/src/routes.ts)。

- path 参数：publicationId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`publicationDetailQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getPublication(query.storeId, request.params.publicationId, query.audience))`。

### POST /api/roster/periods/:periodId/reopen

来源：[local/roster/backend/src/routes.ts:281](../local/roster/backend/src/routes.ts)。

- path 参数：periodId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`versionBodySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.reopenPeriod(payload.storeId, request.params.periodId, payload.version))`。

### POST /api/roster/batch/copy

来源：[local/roster/backend/src/routes.ts:285](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.copyPeriod({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/copy/preview

来源：[local/roster/backend/src/routes.ts:293](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewCopyPeriod({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/copy-day/preview

来源：[local/roster/backend/src/routes.ts:300](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyDaySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewCopyDay({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/copy-day

来源：[local/roster/backend/src/routes.ts:307](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`copyDayExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.copyDay({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/repeat/preview

来源：[local/roster/backend/src/routes.ts:315](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`repeatSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.previewRepeatShift({ ...payload, activeEmployeeIds: workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoleIds: formalRoles.ids, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }))`。

### POST /api/roster/batch/repeat

来源：[local/roster/backend/src/routes.ts:322](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`repeatExecuteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.repeatShift({ ...payload, activeEmployeeIds: currentAssignments.map((employee) => employee.employeeId), currentAssignments, formalRoleIds: formalRoles.ids, formalRoleNames: formalRoles.names, formalRoleColors: formalRoles.colors, qualified: qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees) }, auth.accountId))`。

### POST /api/roster/batch/delete

来源：[local/roster/backend/src/routes.ts:330](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`batchDeleteSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.batchDelete(payload.storeId, payload.items))`。

### POST /api/roster/batch/update

来源：[local/roster/backend/src/routes.ts:331](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`batchUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.batchUpdate(payload.storeId, payload.items, { ...payload.patch, ...(formalRoleName ? { formalRoleName } : {}), ...(formalRoleColor ? { formalRoleColor } : {}) }, auth.accountId, workforce.employees.filter((employee) => employee.isActive).map((employee) => employee.id), formalRoles.ids, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees)))`。

### GET /api/roster/calendar

来源：[local/roster/backend/src/routes.ts:341](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`rangeSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.calendar(query.storeId, query.from, query.to))`。

### GET /api/roster/roles

来源：[local/roster/backend/src/routes.ts:345](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleListSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listRoles(query.storeId, includeInactive))`。

### GET /api/roster/roles/draft-usage

来源：[local/roster/backend/src/routes.ts:351](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listDraftRoleUsage(storeId))`。

### POST /api/roster/roles

来源：[local/roster/backend/src/routes.ts:355](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createRole({ ...payload, colorToken: evaluateJobColor(job.colorToken) ?? "#334155" }, jobs))`。

### PATCH /api/roster/roles/:roleId

来源：[local/roster/backend/src/routes.ts:369](../local/roster/backend/src/routes.ts)。

- path 参数：roleId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`roleUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateRole(request.params.roleId, { ...payload, colorToken: evaluateJobColor(activatingJob?.colorToken) ?? formal.colors[request.params.roleId] ?? role?.colorToken ?? "#334155" }, jobs))` / `response.json(await roster.updateRole(request.params.roleId, { ...payload, colorToken: currentRole?.colorToken ?? "#334155" }))`。

### GET /api/roster/templates

来源：[local/roster/backend/src/routes.ts:393](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listShiftTemplates(storeId))`。

### POST /api/roster/templates

来源：[local/roster/backend/src/routes.ts:397](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`templateCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createShiftTemplate(payload))`。

### PATCH /api/roster/templates/:templateId

来源：[local/roster/backend/src/routes.ts:402](../local/roster/backend/src/routes.ts)。

- path 参数：templateId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`templateUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateShiftTemplate(request.params.templateId, payload))`。

### GET /api/roster/availability-templates

来源：[local/roster/backend/src/routes.ts:407](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listAvailabilityTemplates(storeId))`。

### POST /api/roster/availability-templates

来源：[local/roster/backend/src/routes.ts:411](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityTemplateCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createAvailabilityTemplate(payload))`。

### PATCH /api/roster/availability-templates/:templateId

来源：[local/roster/backend/src/routes.ts:415](../local/roster/backend/src/routes.ts)。

- path 参数：templateId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityTemplateUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateAvailabilityTemplate(request.params.templateId, payload))`。

### GET /api/roster/settings

来源：[local/roster/backend/src/routes.ts:419](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ settings: await roster.getSettings(storeId) })`。

### PUT /api/roster/settings/:storeId

来源：[local/roster/backend/src/routes.ts:423](../local/roster/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`settingsSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.saveSettings(payload))`。

### GET /api/roster/availability

来源：[local/roster/backend/src/routes.ts:429](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilityQuerySchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.listAvailability(query.storeId, query.from, query.to, query.employeeId))`。

### GET /api/roster/availability-script/shortcuts

来源：[local/roster/backend/src/routes.ts:433](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ configuration: await roster.getPresetShortcuts(storeId) })`。

### PUT /api/roster/availability-script/shortcuts

来源：[local/roster/backend/src/routes.ts:437](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetShortcutSaveSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.savePresetShortcuts({ ...payload, actorAccountId: auth.accountId }))`。

### POST /api/roster/availability-script/preview

来源：[local/roster/backend/src/routes.ts:441](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetScriptPreviewSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ weekStart: parsed.weekStart, timezone, slots: preview.slots, issues: [...parsed.issues.filter((issue) => issue.code !== "DUPLICATE_DAY" || !preview.issues.some((previewIssue) => previewIssue.code === "DUPLICATE_DAY")), ...preview.issues], summary: preview.summary, slotStatusHash, previewHash: presetTimeSlotPreviewFingerprint(sourceHash, workforce.workforceRevision, parsed.slots, settings?.version ?? null, configuration.version, preview.summary.create, preview.summary.unchanged, s`。

### POST /api/roster/availability-script/commit

来源：[local/roster/backend/src/routes.ts:481](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`presetScriptCommitSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.commitPresetTimeSlots({ storeId: payload.storeId, actorAccountId: auth.accountId, sourceHash, weekStart: parsed.weekStart, slots: parsed.slots, expectedShortcutsVersion: configuration.version, expectedSettingsVersion: settings?.version ?? null, expectedCreateCount: payload.expectedCreateCount, expectedUnchangedCount: payload.expectedUnchangedCount, expectedSlotStatusHash: payload.expectedSlotStatusHash }))`。

### PUT /api/roster/availability

来源：[local/roster/backend/src/routes.ts:508](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`availabilitySchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.replaceAvailability(payload))`。

### POST /api/roster/shifts

来源：[local/roster/backend/src/routes.ts:513](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftCreateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await roster.createShift({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### POST /api/roster/shifts/with-period

来源：[local/roster/backend/src/routes.ts:523](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftCreateWithPeriodSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(200).json(replay)` / `response.status(201).json(await roster.createShiftWithPeriod({ ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### POST /api/roster/shifts/draft-commit

来源：[local/roster/backend/src/routes.ts:535](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`draftCommitSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId, payload.changes.filter((change) => change.kind === "delete"), auth.accountId))` / `response.json(await roster.commitDraftPeriod(payload.storeId, payload.rosterPeriodId, changes, auth.accountId))`。

### GET /api/roster/shifts/:shiftId

来源：[local/roster/backend/src/routes.ts:563](../local/roster/backend/src/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：storeId。
- 请求校验：`storeIdSchema.parse(request.query.storeId)`。
- 权限：`getAuth(request)`; `requireStore(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.getShift(storeId, request.params.shiftId))`。

### PATCH /api/roster/shifts/:shiftId

来源：[local/roster/backend/src/routes.ts:567](../local/roster/backend/src/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftUpdateSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.updateShift(request.params.shiftId, { ...shift, assignments, formalRoleName, formalRoleColor: formal.colors[payload.shiftRoleId] }, auth.accountId))`。

### PATCH /api/roster/shifts/:shiftId/reposition

来源：[local/roster/backend/src/routes.ts:577](../local/roster/backend/src/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftRepositionSchema.parse(request.body)`。
- 权限：`getAuth(request)`; `requireStore(auth, payload.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await roster.repositionShift(request.params.shiftId, payload, auth.accountId, activeEmployees.map((employee) => employee.id), target ? { sourceEmployeeId: payload.sourceEmployeeId!, target: toAssignmentSnapshot(target) } : undefined, formalRoles.names, qualifiedEmployeeIdsByRole(formalRoles.jobRoleIds, workforce.employees), formalRoles.colors))`。

### DELETE /api/roster/shifts/:shiftId

来源：[local/roster/backend/src/routes.ts:588](../local/roster/backend/src/routes.ts)。

- path 参数：shiftId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`shiftDeleteSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/roster/export.csv

来源：[local/roster/backend/src/routes.ts:594](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`exportSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.send(\uFEFF${rosterCsv(result.shifts, query.audience, timezone, legacyTimezone)})`。

### GET /api/roster/print

来源：[local/roster/backend/src/routes.ts:609](../local/roster/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`exportSchema.parse(request.query)`。
- 权限：`getAuth(request)`; `requireStore(auth, query.storeId)`; `requireAdmin(auth)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.send(rosterPrint(result.period, result.shifts, query.audience, timezone, legacyTimezone))`。

## Development Payroll (ADMIN middleware)

### GET /api/payroll/status

来源：[local/roster/backend/src/payroll/routes.ts:46](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.status。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/connect

来源：[local/roster/backend/src/payroll/routes.ts:47](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.header("cookie") ?? ""),`。
- 业务：service.connect。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/oauth/callback

来源：[local/roster/backend/src/payroll/routes.ts:54](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.header("cookie") ?? "", input),`。
- 业务：service.callback。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/tenant

来源：[local/roster/backend/src/payroll/routes.ts:71](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v.tenantId, v.expectedTenantId),`。
- 业务：service.select。
- 响应：`r.json( await locked(() => service.select(getAuth(q).accountId, v.tenantId, v.expectedTenantId), ), )`。

### POST /api/payroll/disconnect

来源：[local/roster/backend/src/payroll/routes.ts:82](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId))),`。
- 业务：service.disconnect。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/references

来源：[local/roster/backend/src/payroll/routes.ts:85](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.references。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/references/refresh

来源：[local/roster/backend/src/payroll/routes.ts:88](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.references。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/mappings

来源：[local/roster/backend/src/payroll/routes.ts:91](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.mappings。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### PUT /api/payroll/mappings

来源：[local/roster/backend/src/payroll/routes.ts:92](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v)))`。
- 业务：service.saveMappings。
- 响应：`r.json(await locked(() => service.saveMappings(getAuth(q).accountId, v)))`。

### POST /api/payroll/previews

来源：[local/roster/backend/src/payroll/routes.ts:108](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, v.selections)),`。
- 业务：service.preview。
- 响应：`r.status(201).json( await locked(() => service.preview(getAuth(q).accountId, v.selections)), )`。

### GET /api/payroll/previews/:id

来源：[local/roster/backend/src/payroll/routes.ts:117](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.getPreview。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/previews/:id/revisions

来源：[local/roster/backend/src/payroll/routes.ts:120](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.revisions。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/previews/:id/revisions/:version

来源：[local/roster/backend/src/payroll/routes.ts:123](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id, version。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.revisions。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### PUT /api/payroll/previews/:id

来源：[local/roster/backend/src/payroll/routes.ts:131](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id, v),`。
- 业务：service.savePreview。
- 响应：`r.json( await locked(() => service.savePreview(getAuth(q).accountId, q.params.id, v), ), )`。

### POST /api/payroll/previews/:id/validate

来源：[local/roster/backend/src/payroll/routes.ts:160](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.validate。
- 响应：`r.json( await locked(() => service.validate(q.params.id, true, v.mappingVersion)), )`。

### POST /api/payroll/previews/:id/confirm

来源：[local/roster/backend/src/payroll/routes.ts:169](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId,`。
- 业务：service.confirm。
- 响应：`r.json( await locked(() => service.confirm( getAuth(q).accountId, q.params.id, v.version, v.adoptExistingDraft, v.mappingVersion, ), ), )`。

### POST /api/payroll/previews/:id/sync

来源：[local/roster/backend/src/payroll/routes.ts:190](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id)),`。
- 业务：service.start。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/jobs/:id/retry

来源：[local/roster/backend/src/payroll/routes.ts:195](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id)),`。
- 业务：service.retry。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/targets

来源：[local/roster/backend/src/payroll/routes.ts:200](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.targets。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/targets/:id/reconcile

来源：[local/roster/backend/src/payroll/routes.ts:201](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId,`。
- 业务：service.reconcileTarget。
- 响应：`r.json( await locked(() => service.reconcileTarget( getAuth(q).accountId, q.params.id, v.version, v.timesheetId, ), ), )`。

### GET /api/payroll/jobs

来源：[local/roster/backend/src/payroll/routes.ts:221](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.history。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/payroll/jobs/:id

来源：[local/roster/backend/src/payroll/routes.ts:222](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.job。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/payroll/jobs/:id/process

来源：[local/roster/backend/src/payroll/routes.ts:225](../local/roster/backend/src/payroll/routes.ts)。

- path 参数：id。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(q).accountId, q.params.id, v.retryFailed),`。
- 业务：service.process。
- 响应：`r.json( await locked(() => service.process(getAuth(q).accountId, q.params.id, v.retryFailed), ), )`。

## Development mock only

### GET /api/employee-demo/accounts

来源：[local/roster/backend/src/employeeDemoRoutes.ts:110](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/employee-demo/login

来源：[local/roster/backend/src/employeeDemoRoutes.ts:111](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json({ account: accounts.find(a => a.id === accountId), demo: true })`。

### GET /api/employee-demo/me

来源：[local/roster/backend/src/employeeDemoRoutes.ts:120](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### POST /api/employee-demo/logout

来源：[local/roster/backend/src/employeeDemoRoutes.ts:121](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：完整表达式见所列 handler；未捕获实际响应，不编造 JSON。

### GET /api/employee-demo/week

来源：[local/roster/backend/src/employeeDemoRoutes.ts:126](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(view(user.id, week, await loadRules(week), await reports(), await loadShortcuts()))`。

### POST /api/employee-demo/preview

来源：[local/roster/backend/src/employeeDemoRoutes.ts:142](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json({ ...value, days: convert(user, input.week, input.script, rules, configuration) })`。

### PUT /api/employee-demo/week

来源：[local/roster/backend/src/employeeDemoRoutes.ts:150](../local/roster/backend/src/employeeDemoRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`reportSchema.parse(req.body)`。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await run)`。

## Development orchestration; inspect parent mount

### GET /api/multi-agent/health

来源：[local/roster/backend/src/multiAgentRoutes.ts:87](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(req)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream("/health", req.header("cookie")))`。

### GET /api/multi-agent/inputs

来源：[local/roster/backend/src/multiAgentRoutes.ts:91](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req), q.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream(/inputs?${query}, req.header("cookie")))`。

### GET /api/multi-agent/rules

来源：[local/roster/backend/src/multiAgentRoutes.ts:96](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req),q.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream(/rules?${new URLSearchParams({store_id:q.storeId,week_start:q.weekStart})},req.header('cookie')))`。

### POST /api/multi-agent/rules

来源：[local/roster/backend/src/multiAgentRoutes.ts:100](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req),p.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream('/rules',req.header('cookie'),{store_id:p.storeId,scope:p.scope,week_start:p.weekStart, expected_version:p.expectedVersion,base_rule_version:p.baseRuleVersion,weekly:p.weekly}))`。

### POST /api/multi-agent/runs

来源：[local/roster/backend/src/multiAgentRoutes.ts:105](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req), p.storeId)`; `getAuth(req).accountId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.status(202).json(result)`。

### POST /api/multi-agent/runs/:runId/apply

来源：[local/roster/backend/src/multiAgentRoutes.ts:115](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：runId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuth(req)`; `requireStore(auth,p.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(receipt)`。

### GET /api/multi-agent/latest

来源：[local/roster/backend/src/multiAgentRoutes.ts:122](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req), q.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream(/latest?store_id=${encodeURIComponent(q.storeId)}, req.header("cookie")))`。

### GET /api/multi-agent/recent-run

来源：[local/roster/backend/src/multiAgentRoutes.ts:126](../local/roster/backend/src/multiAgentRoutes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`requireStore(getAuth(req),q.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`res.json(await upstream(/runs-recent?store_id=${encodeURIComponent(q.storeId)},req.header('cookie')))`。

## Development Evaluate on separate origin

### GET /api/health

来源：[local/evaluate/backend/src/routes.ts:74](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ok: true })`。

### POST /api/auth/login

来源：[local/evaluate/backend/src/routes.ts:78](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`loginSchema.parse(request.body)`。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(429).json({ message: "登录尝试过于频繁，请稍后再试。" })` / `response.json({ user: result.user })`。

### GET /api/auth/me

来源：[local/evaluate/backend/src/routes.ts:99](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request) })`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ user: getAuthContext(request) })`。

### POST /api/auth/logout

来源：[local/evaluate/backend/src/routes.ts:103](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json({ ok: true })`。

### GET /api/evaluations/periods

来源：[local/evaluate/backend/src/routes.ts:109](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：service.listPeriods。
- 响应：`response.json(await service.listPeriods())`。

### GET /api/stores

来源：[local/evaluate/backend/src/routes.ts:113](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：service.listStores。
- 响应：`response.json(await service.listStores(getAccessibleStoreScope(auth)))`。

### GET /api/stores/manage

来源：[local/evaluate/backend/src/routes.ts:118](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：includeArchived。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.listStoresWithCounts。
- 响应：`response.json(await storeService.listStoresWithCounts(undefined, includeArchived))`。

### GET /api/admin/accounts

来源：[local/evaluate/backend/src/routes.ts:125](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountListQuerySchema.parse(request.query)`。
- 权限：`requireAdmin(getAuthContext(request))`。
- 业务：accountService.listAccounts。
- 响应：`response.json(await accountService.listAccounts(query.storeId))`。

### POST /api/admin/accounts

来源：[local/evaluate/backend/src/routes.ts:131](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountCreateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.createAccount。
- 响应：`response.status(201).json(await accountService.createAccount(payload, auth.accountId))`。

### PATCH /api/admin/accounts/:accountId

来源：[local/evaluate/backend/src/routes.ts:138](../local/evaluate/backend/src/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`accountUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.updateAccount。
- 响应：`response.json(await accountService.updateAccount(request.params.accountId, payload, auth.accountId))`。

### DELETE /api/admin/accounts/:accountId

来源：[local/evaluate/backend/src/routes.ts:145](../local/evaluate/backend/src/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.deleteAccount。
- 响应：`response.json(await accountService.deleteAccount(request.params.accountId, auth.accountId))`。

### POST /api/admin/accounts/:accountId/reset-password

来源：[local/evaluate/backend/src/routes.ts:151](../local/evaluate/backend/src/routes.ts)。

- path 参数：accountId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`resetPasswordSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：accountService.resetPassword。
- 响应：`response.json(await accountService.resetPassword(request.params.accountId, payload.password, auth.accountId))`。

### POST /api/stores

来源：[local/evaluate/backend/src/routes.ts:158](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.createStore。
- 响应：`response.status(201).json(await storeService.createStore(payload))`。

### PUT /api/stores/:storeId

来源：[local/evaluate/backend/src/routes.ts:165](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.updateStore。
- 响应：`response.json(await storeService.updateStore(request.params.storeId, payload))`。

### POST /api/stores/:storeId/archive

来源：[local/evaluate/backend/src/routes.ts:172](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.archiveStore。
- 响应：`response.json(await storeService.archiveStore(request.params.storeId))`。

### POST /api/stores/:storeId/reactivate

来源：[local/evaluate/backend/src/routes.ts:178](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：storeService.reactivateStore。
- 响应：`response.json(await storeService.reactivateStore(request.params.storeId))`。

### GET /api/store-jobs

来源：[local/evaluate/backend/src/routes.ts:184](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId, includeInactive。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await storeJobService.list(getAccessibleStoreScope(auth), storeId, includeInactive))`。

### POST /api/stores/:storeId/jobs

来源：[local/evaluate/backend/src/routes.ts:192](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeJobMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.status(201).json(await storeJobService.create(request.params.storeId, payload))`。

### PATCH /api/store-jobs/:jobId

来源：[local/evaluate/backend/src/routes.ts:200](../local/evaluate/backend/src/routes.ts)。

- path 参数：jobId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeJobUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, await storeJobService.getStoreId(request.params.jobId))`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await storeJobService.update(request.params.jobId, storeJobUpdateSchema.parse(request.body)))`。

### GET /api/evaluations/dashboard

来源：[local/evaluate/backend/src/routes.ts:207](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await analyticsV1Service.getDashboard(getAccessibleStoreScope(auth), storeId, auth))`。

### GET /api/stores/:storeId/evaluations

来源：[local/evaluate/backend/src/routes.ts:214](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`storeEvaluationListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.getStoreRoster(request.params.storeId, query, auth))`。

### GET /api/employees

来源：[local/evaluate/backend/src/routes.ts:221](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：employeeService.listEmployees。
- 响应：`response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }))`。

### GET /api/stores/:storeId/employees

来源：[local/evaluate/backend/src/routes.ts:229](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeListQuerySchema.parse({ ...request.query, storeId: request.params.storeId })`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：employeeService.listEmployees。
- 响应：`response.json(await employeeService.listEmployees({ ...query, evaluatorAccountId: auth.accountId, ...(storeScope ? { accessibleStoreIds: storeScope } : {}) }))`。

### GET /api/employees/:employeeId

来源：[local/evaluate/backend/src/routes.ts:237](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee。
- 响应：`response.json(employee)`。

### GET /api/employees/:employeeId/profile

来源：[local/evaluate/backend/src/routes.ts:244](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`。
- 业务：employeeService.getEmployeeProfile。
- 响应：`response.json(await employeeService.getEmployeeProfile(request.params.employeeId))`。

### GET /api/employees/:employeeId/evaluation-summary

来源：[local/evaluate/backend/src/routes.ts:251](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee。
- 响应：`response.json( await employeeEvaluationSummaryService.getSummary( request.params.employeeId, getAccessibleStoreScope(auth), auth, ), )`。

### GET /api/performance-notes

来源：[local/evaluate/backend/src/routes.ts:264](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteListQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：performanceNoteService.listPerformanceNotes。
- 响应：`response.json( await performanceNoteService.listPerformanceNotes({ ...query, ...(storeScope ? { accessibleStoreIds: storeScope } : {}), `。

### GET /api/employees/:employeeId/performance-notes

来源：[local/evaluate/backend/src/routes.ts:277](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteListQuerySchema.parse({ ...request.query, employeeId: request.params.employeeId })`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId ?? employee.storeId)`。
- 业务：employeeService.getEmployee, performanceNoteService.getPerformanceNotesForEmployee。
- 响应：`response.json( await performanceNoteService.getPerformanceNotesForEmployee(request.params.employeeId, { ...query, ...(storeScope ? { accessibleStoreIds: storeScope } : {}), `。

### POST /api/performance-notes

来源：[local/evaluate/backend/src/routes.ts:291](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`performanceNoteMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：storeService.assertActiveStore, performanceNoteService.createPerformanceNote。
- 响应：`response.status(201).json(await performanceNoteService.createPerformanceNote(payload, auth.accountId))`。

### POST /api/employees

来源：[local/evaluate/backend/src/routes.ts:299](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeMutationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：storeService.assertActiveStore, employeeService.createEmployee。
- 响应：`response.status(201).json(await employeeService.createEmployee(payload, auth.accountId))`。

### GET /api/employees/:employeeId/current-skills

来源：[local/evaluate/backend/src/routes.ts:308](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.list。
- 响应：`response.json({ skills: await currentSkillService.list(employee.id) })`。

### GET /api/employees/:employeeId/current-skills/:skillDefinitionId/confirmations

来源：[local/evaluate/backend/src/routes.ts:315](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId, skillDefinitionId。
- query 字段（静态发现）：page, pageSize。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.listConfirmations。
- 响应：`response.json(await currentSkillService.listConfirmations(employee.id, request.params.skillDefinitionId, page, pageSize))`。

### PATCH /api/employees/:employeeId/current-skills/:skillDefinitionId

来源：[local/evaluate/backend/src/routes.ts:325](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId, skillDefinitionId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`currentSkillConfirmationSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, currentSkillService.confirm。
- 响应：`response.json({ skills: await currentSkillService.confirm(employee.id, request.params.skillDefinitionId, input.status, input.expectedUpdatedAt, auth.accountId, input.reason) })`。

### PUT /api/employees/:employeeId

来源：[local/evaluate/backend/src/routes.ts:334](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`employeeUpdateSchema.parse(request.body)`。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`; `requireStoreAccess(auth, payload.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.updateEmployee。
- 响应：`response.json(await employeeService.updateEmployee(request.params.employeeId, payload, auth.accountId))`。

### POST /api/employees/:employeeId/promote-to-regular

来源：[local/evaluate/backend/src/routes.ts:346](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, employeeService.promoteToRegular。
- 响应：`response.json(await employeeService.promoteToRegular(request.params.employeeId))`。

### POST /api/employees/:employeeId/archive

来源：[local/evaluate/backend/src/routes.ts:354](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.archiveEmployee。
- 响应：`response.json(await employeeService.archiveEmployee(request.params.employeeId))`。

### POST /api/employees/:employeeId/restore

来源：[local/evaluate/backend/src/routes.ts:363](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireAdmin(auth)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, employeeService.restoreEmployee。
- 响应：`response.json(await employeeService.restoreEmployee(request.params.employeeId))`。

### GET /api/evaluations/history

来源：[local/evaluate/backend/src/routes.ts:372](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.listCompletedHistory(storeId ? [storeId] : getAccessibleStoreScope(auth)))`。

### GET /api/evaluation-rounds/history

来源：[local/evaluate/backend/src/routes.ts:379](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`evaluationHistoryQuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await evaluationReadService.listClosedRoundHistory(query, getAccessibleStoreScope(auth), auth))`。

### GET /api/evaluations/analytics

来源：[local/evaluate/backend/src/routes.ts:386](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`analyticsV1QuerySchema.parse(request.query)`。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, query.storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await analyticsV1Service.getAnalytics( getAccessibleStoreScope(auth), query.storeId, query.employeeType, auth, ))`。

### GET /api/roster-skill-board

来源：[local/evaluate/backend/src/routes.ts:398](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：storeId。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：路由内实现/转发；见源码。
- 响应：`response.json(await rosterSkillBoardService.getBoard(getAccessibleStoreScope(auth), storeId, auth))`。

### GET /api/roster-integration/contract-version

来源：[local/evaluate/backend/src/routes.ts:405](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：适用上述全局 middleware，另检查 service。
- 业务：rosterIntegrationService.contractVersion。
- 响应：`response.json(rosterIntegrationService.contractVersion())`。

### GET /api/roster-integration/stores

来源：[local/evaluate/backend/src/routes.ts:409](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.listStores。
- 响应：`response.json(await rosterIntegrationService.listStores(getAccessibleStoreScope(auth)))`。

### GET /api/roster-integration/skill-definitions

来源：[local/evaluate/backend/src/routes.ts:414](../local/evaluate/backend/src/routes.ts)。

- path 参数：无显式参数。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.listSkillDefinitions。
- 响应：`response.json(await rosterIntegrationService.listSkillDefinitions())`。

### GET /api/roster-integration/stores/:storeId/employees

来源：[local/evaluate/backend/src/routes.ts:419](../local/evaluate/backend/src/routes.ts)。

- path 参数：storeId。
- query 字段（静态发现）：page, pageSize。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, request.params.storeId)`。
- 业务：rosterIntegrationService.listEmployees。
- 响应：`response.json(await rosterIntegrationService.listEmployees(request.params.storeId, getAccessibleStoreScope(auth), page, pageSize))`。

### GET /api/roster-integration/employees/:employeeId

来源：[local/evaluate/backend/src/routes.ts:428](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`。
- 业务：rosterIntegrationService.getEmployee。
- 响应：`response.status(404).json({ message: "未找到员工" })` / `response.json(result)`。

### GET /api/employees/:employeeId/evaluation-rounds/current

来源：[local/evaluate/backend/src/routes.ts:438](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, evaluationRoundService.getCurrentRound。
- 响应：`response.json(await evaluationRoundService.getCurrentRound(employee.id, auth))`。

### POST /api/employees/:employeeId/scoring-context

来源：[local/evaluate/backend/src/routes.ts:445](../local/evaluate/backend/src/routes.ts)。

- path 参数：employeeId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, employee.storeId)`。
- 业务：employeeService.getEmployee, storeService.assertActiveStore, evaluationV1Service.startLiveScoring。
- 响应：`response.status(200).json(await evaluationV1Service.startLiveScoring(employee.id, auth))`。

### GET /api/evaluation-rounds/:roundId

来源：[local/evaluate/backend/src/routes.ts:453](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.getRound。
- 响应：`response.json(await evaluationRoundService.getRound(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluation-rounds/:roundId/aggregate

来源：[local/evaluate/backend/src/routes.ts:457](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.getAggregate。
- 响应：`response.json(await evaluationRoundService.getAggregate(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluation-rounds/:roundId/evaluations

来源：[local/evaluate/backend/src/routes.ts:461](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.listEvaluations。
- 响应：`response.json(await evaluationRoundService.listEvaluations(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluation-rounds/:roundId/my-evaluation

来源：[local/evaluate/backend/src/routes.ts:465](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.getMyEvaluation。
- 响应：`response.json(await evaluationV1Service.getMyEvaluation(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluation-rounds/:roundId/scoring-context

来源：[local/evaluate/backend/src/routes.ts:469](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.getLiveScoringContext。
- 响应：`response.json(await evaluationV1Service.getLiveScoringContext(request.params.roundId, getAuthContext(request)))`。

### POST /api/evaluation-rounds/:roundId/preview-my-evaluation

来源：[local/evaluate/backend/src/routes.ts:473](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveEvaluationSubmissionSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.previewLiveSubmission。
- 响应：`response.json(await evaluationV1Service.previewLiveSubmission(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluation-rounds/:roundId/preview-my-skills

来源：[local/evaluate/backend/src/routes.ts:478](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveSkillPreviewSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.previewLiveSkills。
- 响应：`response.json(await evaluationV1Service.previewLiveSkills(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluation-rounds/:roundId/analyze-my-evaluation

来源：[local/evaluate/backend/src/routes.ts:483](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.analyzeLiveText。
- 响应：`response.json(await evaluationV1Service.analyzeLiveText(request.params.roundId, textFeedback, getAuthContext(request)))`。

### PUT /api/evaluation-rounds/:roundId/my-evaluation

来源：[local/evaluate/backend/src/routes.ts:488](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：`liveEvaluationSubmissionSchema.parse(request.body)`。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationV1Service.submitLiveEvaluation。
- 响应：`response.json(await evaluationV1Service.submitLiveEvaluation(request.params.roundId, payload, getAuthContext(request)))`。

### POST /api/evaluation-rounds/:roundId/close

来源：[local/evaluate/backend/src/routes.ts:493](../local/evaluate/backend/src/routes.ts)。

- path 参数：roundId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)))`。
- 业务：evaluationRoundService.closeRound。
- 响应：`response.json(await evaluationRoundService.closeRound(request.params.roundId, getAuthContext(request)))`。

### GET /api/evaluations/v1/:evaluationId

来源：[local/evaluate/backend/src/routes.ts:497](../local/evaluate/backend/src/routes.ts)。

- path 参数：evaluationId。
- query 字段（静态发现）：未显式发现；见 handler/schema。
- 请求校验：inline schema 或 service 校验，完整 handler 在 JSON 索引。
- 权限：`getAuthContext(request)`; `requireStoreAccess(auth, storeId)`。
- 业务：evaluationV1Service.getStoreId, evaluationV1Service.getEvaluation。
- 响应：`response.status(404).json({ message: "评价不存在。" })` / `response.json(await evaluationV1Service.getEvaluation(request.params.evaluationId, auth))`。

## 非 Express / 包装路由

`production-site/server/worker.mjs` 另处理 `/api/health`、封闭的 `/api/migration/*`、Evaluate auth 的包装路由及静态 fallback；`server/demo.mjs` 是生产 mock 报班实现；`local/roster/scheduling-engine/api`、`local/roster/multi-agent-engine/api` 是开发 FastAPI，具体函数/装饰器见 FASTAPI_ROUTES。没有证实正式通知/确认或 Zii 接口。

注意：production /api/multi-agent/* 的实际实现是 503 stub，JSON 索引中的 development orchestration 路由不能视为 Sites 可用。
