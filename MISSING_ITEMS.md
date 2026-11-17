# 缺失与有意排除的资料

| 项目 | 原因 / 对运行的影响 | 获取方式 |
|---|---|---|
| 原项目完整旧 Git 历史 | 未经审查不能上传；本包只新建干净交接历史 | 源提交号见 PROVENANCE，原仓库保持原样；如要旧历史另行逐对象审查 |
| 真 .env、数据库密码、API keys、cookie、密码/token hash、OAuth refresh token、Sites 写入凭据 | 安全排除，不能从 ZIP 恢复生产登录 | 经原管理员或 Secret Store 安全发放；本地使用 .env.example 和自行设置的密码 |
| 真实 PostgreSQL/D1 dump、迁移数据文件、私有 .local 导出、人员截图/工资文件 | 本任务明确禁止真实个人数据交付 | 使用合成数据；合法迁移需另行授权和安全传输，不属于本次 |
| Sites 原 active hosting.json 与环境配置 | 有意替换成不含现有 project ID 的惰性构建示例 | 受权管理员从当前 Site 读取并在新环境重新绑定；本次不获取写凭据 |
| Staff 员工中心后端、数据库 schema、OIDC/SSO 契约与管理员账号 | 当前目录不可取得 | 请员工中心维护者提供只读源码/接口契约/测试环境，先确认协议再整合 |
| 已部署外接 OR-Tools 求解器 | 当前没有部署地址/访问资料 | 未来独立托管项目，保留快照接口与确定性验证；此包有本地完整引擎源码 |
| Xero Developer App Client ID/Secret 与 Demo tenant OAuth | 外部配置未提供，真实集成未验证 | 管理员配置 Web OAuth App 并人工同意；不要上传生产密钥 |
| 依赖生成文件 node_modules / Prisma client / dist / Python venv | 可重建且不适合交付二进制运行目录 | npm ci、prisma generate、pip requirements；锁文件和 Prisma schema 保留 |
| 原项目 unused logo JPG、原始参考图片/截图、Apple metadata、PDF/Excel/ZIP 等二进制附件 | 隐私/非运行依赖筛除；实际构建引用的 clover PNG 保留 | 非关键品牌参考素材如需要可从设计负责人另取，当前构建已验证 |
| 私有 fixture E2E 的 .local/roster-export.json、evaluate-export.json | 是真实记录，不能打包 | 原脚本保留并注明不可直接运行；本包另外提供纯合成 handover-local 检查，不伪装成旧 fixture |

精确文件排除记录见 docs/EXCLUDED_FILES.json；忽略目录（.git、node_modules、.local、.data、日志、备份、venv、outputs 等）按类别记录，不逐个导出真实文件名。未发现可交接 .NET/EF Core 项目，不创建空 Controller 或伪造迁移充数。
