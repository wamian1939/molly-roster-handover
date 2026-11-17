# Dead Code Candidates

本轮只列候选，未删除文件或依赖。候选需在建立 Git 基线及 e2e coverage 后再处理。

| Candidate | Evidence | 判断 / 风险 |
|---|---|---|
| `src/pages/FoundationPage.tsx` | 全仓仅定义处命中 | 未被 route/import 使用；高可信 dead page |
| `src/components/states/LoadingState.tsx` | 全仓仅定义处命中 | 未使用的 loading component |
| `scoreLabel()` | `src/lib/scheduling.ts:58`；仅 test import | production 页面内联相同格式；重复 helper 候选 |
| `dateBelongsToRange()` | `src/lib/scheduling.ts:59`；仅 test import | production 无 caller |
| `GET /api/session` | `backend/src/routes.ts:89`；frontend 无 caller | 返回固定 `{ok:true}`，且 health/auth 已有专用端点 |
| `AvailabilitySource.TEMPLATE` | schema 支持，Staff 套模板保存仍写 `source: "MANUAL"` (`StaffPage.tsx:93-100`) | 语义未落地；不是立即删除，应先决定来源审计需求 |
| write-only `RosterPublication.snapshot` read path | 仅 publish 在 `rosterService.ts:307-311` 写入；无读引用 | 不是可删除数据；是缺失产品读取能力，见 HIST-01 |

## 未发现的候选

- 未发现第二套 Calendar implementation 或第二个 calendar/date library。
- frontend/backend package dependencies 均存在 production 或 build/test 引用；本轮不建议为“看起来旧”而升级。
- Prisma package.json `prisma.seed` 配置产生 deprecation warning，但当前仍工作；属于 tooling migration，不是立即删除项。
