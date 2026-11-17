# 部署来源与后续操作边界

线上 Roster 与 Evaluate 在同一 Sites version 5，来源 main@1029bad20c64e48cc937b5acec12a6e33e650b89。当前线上 URL、部署 id、时间、可核实来源见 PROVENANCE.json。Sites metadata 的 public/site access 与应用 auth 分层，本次没有修改任何访问范围。

`production-site/build/build.mjs` 的产物是 `dist/server/index.js` 加静态资源，D1 binding DB；SQL 在 `production-site/drizzle`。原生产源码的 prepare 脚本会尝试从固定相对路径复制本机项目；交接副本禁用此自动发现，始终使用已打包的 frontend/generated，以保证独立构建不会误用另一版本。

交接副本 `.openai/hosting.json` 仅保留惰性 DB binding 示例，不含原 Site 绑定。没有生产 secrets、迁移数据、部署写入 token。这里描述的是现有机制，不是本次执行部署的授权或脚本；不要直接推送/发布交接 production 分支来覆盖当前站点。

未来在独立测试 Site 上：安装锁定依赖 → build → 明确新项目绑定与新 D1 → 审查并执行新库初始化 → 仅导入合成数据 → 验证登录/权限/发布/导出/回滚 → 经独立审批再考虑生产。旧 `/api/migration/*` 已由生产 Worker 硬关闭，即使 secret 残留也不能用来再次导入。不能打开旧迁移口绕过数据保护。

本地原项目还保留 render.yaml/容器等历史配置；这是历史部署方案，不能据此认定 Render/Supabase 当前仍运行。原 PostgreSQL 没有被此任务写入或备份导出。回滚路径是现有 Sites 历史版本与原始本地仓库/原管理员备份；本次未创建生产备份、没有改变现有回滚资产。新交接包不能代替真实数据库恢复备份。

生产版本与本地差异：production-site 是已核实 clean Sites main；local/roster 与 local/evaluate 是单独脏工作树。D1 适配、同域鉴权、自动求解禁用、Evaluate 路由前缀及前端 basePath 均是 Sites 特定层，不能把两个目录互相覆盖后假设等价。
