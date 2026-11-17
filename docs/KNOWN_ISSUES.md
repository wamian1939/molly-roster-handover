# 已知问题与技术债

1. Sites 使用快照兼容层而非完整 ORM，业务数据较大时每请求加载/重试成本增加。Worker 对 Roster / Evaluate 每模型合计行数大于 20,000 主动拒绝；容量评估必须使用脱敏规模数据，不能声称无限扩容。
2. 普通员工没有可靠账号绑定。mock 报班不能用于生产员工自助授权；接 Staff 前先做 issuer+subject 和 EmployeeID 映射。
3. Sites 自动求解器入口为 503。原生 OR-Tools 仍在本地，未部署独立 HTTPS 求解器；手工排班不应依赖它。
4. Xero 实际 OAuth/tenant/真实员工与日历/Rate、Draft 更新、远端核对和限流尚需 Demo Organization 验收；生产测试未经授权不可写。自动调度不存在；仅支持可可靠计算的 Weekly/Fortnightly/FourWeekly，其他周期明确阻断；不是 Award 工资计算引擎。
5. 新增源代码目录并不保证 Node 兼容。Worker Express/Prisma/crypto 适配有限，增加查询或库前必须验证 esbuild/运行时/事务兼容。
6. 本地开发副本有未提交与实验状态。模板页面测试存在“保存成功但后续刷新失败/切店返回”相关失败，见 TEST_REPORT；不能据此未经证据断言线上也有同一问题。此次交接未修改业务代码来隐藏失败。
7. npm 安装审计报告存在中/高危依赖。交接保留锁文件，没有运行 audit fix/force；详见 DEPENDENCY_AUDIT，需后续单独升级与回归审查。
8. 历史 docs/截图路径中有已排除真实数据和截图引用；缺失有清单，不能把它们当可运行验收证据。旧报告中的“完成/已上线”需与本次生产来源、feature 状态核对。
9. Staff 后端 session、OAuth/OIDC、数据唯一ID与 API 权限不能从前端判断。B130/MBL/CH-CW 显示映射已证实，Roster 只有两个不同形式的店ID；不能按显示名自动归并。
10. 本地旧 start-dev / docker compose / seed / migrate 脚本面向原机器目录和端口。交接只把它们保留为源码；请用推荐内存工具或新建 handover 数据库，不运行旧脚本触碰既有服务。
11. 根交接文档为当前审计结论；源副本原 README 和历史报告保留便于理解演变，可能过时。没有取得 Staff 后端与生产托管平台私有配置；不伪造这些资料。
