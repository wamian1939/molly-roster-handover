# 登录、账号与身份

当前实际账号来源为 Evaluate Molly：`UserAccount`、`AuthSession`、`UserAccountStoreAccess`。`local/evaluate/backend/src/auth.ts` 对用户名归一化，验证 Argon2（兼容 bcrypt），生成随机会话 token，只持久化 token 哈希；会话天数由 AUTH_SESSION_DAYS 控制，默认 7 天。真实凭据、密码哈希和会话记录不在交接包中。

Sites `server/evaluate.mjs` 使用 `sites_accounts` 校验缓存，`sites_sessions` 保存 token_hash / account_id / expires_at，登录限流为账号维度 5 分钟窗口；公开资料中不能确认其足以覆盖分布式 IP 攻击，需进一步安全验收。`server/evaluate-auth.mjs` 将 Evaluate 服务认证接到同一会话。

Cookie 为 `evaluate_molly_session`，HttpOnly / Secure / SameSite=Lax / Path=/，两套同域 UI 共用；登出撤销会话。读取时检查到期、账号激活/删除状态及门店范围。这里没有 OAuth access/refresh token 式员工登录；Xero refresh token 属于独立集成，不能当成用户登录刷新机制。账号更改后的会话撤销及缓存同步见 `server/evaluate-db.mjs` 与 `generated/evaluate/accountService.ts`。

生产 Worker 对非 GET/HEAD/OPTIONS 检查 Origin 等于站点 origin；Pay­roll 还有配置回调 origin 校验。跨站 SSO 必须另设计协议，不能靠把 Cookie 复制到 Staff 域名。平台站点访问控制与应用内角色权限是两层，公网站点不意味着所有 API 匿名可写。

账号角色只有 `ADMIN` / `STORE_EVALUATOR`。`UserAccount` 没有指向 canonical Employee 的可靠关联字段；目前不能把某个账号用户名或 displayName 当成员工 ID。实际员工 self-service 页面依然是模拟账号，`server/demo.mjs` 的 `molly_employee_demo` Cookie 和 `sites_demo_*` 记录与正式 Evaluate 会话分离。

`Employee.storeId` 是员工归属门店；管理门店集合来自 `UserAccountStoreAccess`，ADMIN 可管理全店。这两者已分离，但普通员工身份绑定、员工自身记录 owner 授权、区域管理员角色均尚需设计。前端 AuthContext/StoreContext 用于导航和展示，后端 `requireAdmin` / `requireStoreAccess` / `requireStore` 逐请求执行授权。

重置/初始化本地账号只能针对隔离的本地库。推荐使用 handover-local 工具创建仅内存的合成账号。正式账号应由现任系统管理员通过既有安全流程提供，不通过 ZIP、GitHub 或聊天发送。
