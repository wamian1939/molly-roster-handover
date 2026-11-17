# 交接仓库协作

`production` 与 `production-sites-v5-1029bad-sanitized` 标记已核实 Sites v5 的脱敏快照；原生产提交号仍是 PROVENANCE.json 中的 1029bad…，不能把交接提交号冒充为线上部署版本。`development` 保留另外两个本地未提交工作树的脱敏源码。

从 development 建 `feature/<说明>` 或 `fix/<说明>` 分支。提交前执行相关 build/test，说明哪些需要外部凭据或隔离测试库。通过 Pull Request 展示问题、最终行为、验证结果和风险。请维护者审查后合并；没有自动部署工作流，也没有自动邀请人员、设置保护规则或扩大权限。

不要将未审查旧 Git 历史、.env、真实数据库记录、截图、员工个人字段、会话或 Xero token 加入提交。新增员工身份/门店同步代码前先阅读 STAFF_INTEGRATION 和 PERMISSIONS，分别处理 home store 与 management scope。需要访问权限由仓库所有者另行人工授予。

接手开发者应首先复现 TEST_REPORT 的四项模板失败，再单独修复；不要把现有失败全部跳过后宣称功能完成。Xero/SSO/求解器上线另建任务，未经授权不向生产公司/数据库写测试记录。
