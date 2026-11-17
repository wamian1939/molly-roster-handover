# 本地开发差异

production-site 来自独立 clean Sites checkout；下面是交接时未上线的本地来源，不能直接称为生产版本。

## Roster

Git 状态项 962；按顶级目录计数：

```json
{
  ".env.example": 1,
  ".gitignore": 1,
  "FINAL_MOLLY_ROSTER_REPORT.md": 1,
  "GOAL_MODE_PROGRESS.md": 1,
  "README.md": 1,
  "ROSTER_DEPLOYMENT_READINESS.md": 1,
  "backend": 165,
  "docs": 83,
  "eslint.config.js": 1,
  "package-lock.json": 1,
  "package.json": 1,
  "scripts": 355,
  "src": 166,
  "vite.config.ts": 1,
  "vitest.config.ts": 1,
  ".github": 1,
  "CALENDAR_AUTONOMOUS_COMPLETION_REPORT.md": 1,
  "CURRENT_STATUS_2026-10-20.md": 1,
  "CURRENT_STATUS_2026-10-21.md": 1,
  "SHIFTHELPER_BEHAVIOUR_MAP_2026-10-07.md": 1,
  "SHIFTHELPER_PARITY_FINAL_REPORT.md": 1,
  "VALIDATION_AND_INTERACTION_HARDENING_REPORT.md": 1,
  "multi-agent-engine": 51,
  "scheduling-engine": 123,
  "sites": 1
}
```

完整工作树的脱敏源码在 local/roster；未逐项推断未提交代码是否完成或已部署。Git 比较需以对应原提交和 SOURCE_FILES 的逐文件哈希为准。

## Evaluate

Git 状态项 188；按顶级目录计数：

```json
{
  "DEPLOYMENT.md": 1,
  "FILE_AUDIT_MATRIX.md": 1,
  "GOAL_MODE_PROGRESS.md": 1,
  "backend": 83,
  "eslint.config.js": 1,
  "package-lock.json": 1,
  "render.yaml": 1,
  "scripts": 1,
  "src": 35,
  ".github": 1,
  "AUDIT_BASELINE.md": 1,
  "DEAD_CODE_CANDIDATES.md": 1,
  "FINAL_EVALUATE_DATABASE_REPORT.md": 1,
  "FULL_CODE_AUDIT_REPORT.md": 1,
  "MULTI_STORE_AUTH_INTEGRATION.md": 1,
  "RISK_REGISTER.md": 1,
  "TEST_COVERAGE_GAP_MATRIX.md": 1,
  "csp-smoke-dist": 48,
  "\"csp-smoke-dist": 1,
  "docs": 5,
  "\"need to do.md\"": 1
}
```

完整工作树的脱敏源码在 local/evaluate；未逐项推断未提交代码是否完成或已部署。Git 比较需以对应原提交和 SOURCE_FILES 的逐文件哈希为准。

统计口径：简略 `git status --short` 为 Roster547 / Evaluate140；展开所有未跟踪文件 `--untracked-files=all` 为 Roster962 / Evaluate188。两者是相同工作树的不同计数口径。
