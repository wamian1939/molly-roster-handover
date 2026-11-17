# 门店编码核对（2026-11-17，只读）

| Staff 内部编码 | 对外显示 | 核实依据 | Roster / Evaluate 记录 |
|---|---|---|---|
| B130 | bw 130 | 在线 `/store-scope.js` 明确映射 | 当前两库门店记录中未找到 |
| MBL | baking lab | 同上 | 当前两库门店记录中未找到 |
| CH | CW | 同上；保留内部 CH 语义 | 当前两库门店记录中未找到 |
| HV | 尚未建立跨系统主键映射 | Staff 支持的代码列表 | `hurstville` / Hurstville 是候选，未最终确认 |
| GS | 尚未建立跨系统主键映射 | Staff 支持的代码列表 | `greensquare` / Green Square 是候选，未最终确认 |

在线 Staff `store-scope.js` 还包含 DS/BW/HV/TH/GS/ADL/CH/B130/MBL，依据 context 的 `stores`、`storeScope`、`role` 对界面选项做范围过滤。它表示管理 scope，不足以证明员工 home store，也不足以证明服务器所有接口已正确鉴权。

源证据 URL：`https://staff.mollytea.com.au/store-scope.js`，SHA-256 `b0d0b8ac663e77d14dc8fe477bb05d686d5fb9550286615fd1bfb8eee85a05c5`。只读取公开静态资源，没有修改页面或门店数据。当前源码中 B130/MBL/CH/CW 没有作为已实现门店匹配规则出现。

本次用只读 SQL 核实本地 Evaluate stores；用 Sites 表结构/有限分页仅读取两条 store 归档记录，线上也是 greensquare、hurstville。没有导出员工个人记录、全库数据或真实数据库备份。

因此不能自动把 B130 当 BW，也不能将 CH 写成 CW 主键。建议未来建立独立外部映射 `(system, externalStoreCode) -> canonicalEvaluateStoreId`，加入唯一约束、有效期和审计；后台人工确认后启用。上线前覆盖 Staff → API → scope → 员工归属 → Availability → 发布历史的完整链路；本阶段未创建或改写映射。
