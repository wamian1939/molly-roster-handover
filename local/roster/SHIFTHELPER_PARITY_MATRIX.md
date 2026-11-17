# ShiftHelper parity matrix

| Domain | ShiftHelper observed behaviour | Molly before this refactor | Problem | Local change |
|---|---|---|---|---|
| Role source | Reference site's own jobs | DB API for Calendar/Dialog; absent on Staff | Staff was disconnected; Settings could not see inactive | Keep Molly DB authoritative; add Staff integration and Settings-only inactive query |
| Role colour | Stable colour families in Calendar/Dialog | Raw hex snapshot/component styles | No shared validation/fallback or legend | Shared deterministic colour helper and DB-driven legend |
| Month density | One-line, ~29 px event rows | Four-line, minimum 60 px card | Too tall for dense month | Dedicated compact month card |
| Day card hierarchy | Strong Role/Time/Staff hierarchy | 12/10.5/10/10.5 px top stack | Large empty body, tiny text | Header + flexible assignment body; duration classes |
| Employee name | Prominent in Day/Week; tooltip in Month | Small, capped near header | Poor use of long-event area | Larger centred body text; `+N` summary when constrained |
| Break | Visible beneath time | Visible but visually weak | Too small at overlap widths | Full and compact localised Break labels |
| Grouping | Exact-equivalent events consolidated | Five-field grouping already implemented | Role code omitted from display contract | Preserve grouping; strengthen normalised model |
| Overlap | Stable side-by-side lanes with reuse | Stable preprocessing already implemented | Needs regression coverage after card changes | Retain algorithm and expand layout tests |
| Role filter | Job and staff filters are distinct | Already distinct role selector and staff multi-filter | Colour helper duplicated | Keep semantics; use shared colours and clearer summaries |
| Staff page | Search, Job/Level/Work Week filters, dense paging | Search plus employee list only | No type/tier/role matching or cycle hours | Add compact DB-role/type/tier filters and cycle metrics |
| Availability | Visible in staffing workflow | Editable per employee/cycle | Discovery list lacked availability summary | Add compact availability state in list/detail without duplicating employee master data |
| Score/Tier | Staff selection and table expose level | Available in Molly list/dialog | Staff filters missing | Add Tier filter and retain official CLOSED-round score source |

