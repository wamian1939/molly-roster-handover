# Hurstville real-candidate rule review

Scope: local Lab pilot for 2026-10-26 through 2026-11-01 (Australia/Sydney). This is an input record for manager review. It is not a saved Hurstville Lab rule, an employment-policy determination, or permission to alter the formal Roster.

Current read-only week preflight under engine `0.1.21` returned 25 active employees, 75 effective availability windows and 41 surrounding assignments, with scoped source version `evaluate:f40e5470d3fdbc2d0300c54321c0d39d|source:533fda477e70d266d1e0`. The previous week fingerprint in the historical table below is no longer the current solve token. A separate restricted-login audit still found identical counts and SHA-256 digests in its seven readable Roster tables compared with the 2026-10-26 one-day run; this does not establish that every upstream field is unchanged. No week candidate was run because saved rule `hurstville:v3` applies only to 2026-10-26.

## 请确认以下输入

1. 请逐日确认周一至周日的「开早人数 / 早班完整班次数 / 晚班完整班次数」，以及是否需要全天班最低数量。你给出的 3 / 4 / 4 和「周一至周三一组、周四至周日可不同」说明了希望支持的配置方式；这三个数值的确切含义和适用日期仍待确认。
2. 已确认每天 10:00 开始准备、11:00 开门。还需逐日确认关门及员工结束时间、各连续时段最低**实际在岗**人数，以及准备期间至少需要几名具备独立开店资格的员工。
3. 允许的完整班型：正式岗位、每种开始与结束时间、休息次数和分钟数、是否有休息时间范围限制、是否带薪；另需确认每日/每周净工时上限和班间休息等适用限制。无需指定每个人实际几点休息；如无门店额外时间限制，可将可选范围设为整段班次，但仍须核对适用的工作休息规定。现有模板和人工班次可能互相不一致，不能直接当作规则。
4. 2026-10-26 至 2026-11-01 的已批准请假是否已全部核对；如有请假，提供员工及带时区的起止时间。未核对请明确写「未核对」，系统会继续阻止真实求解。

已发布 10:00–22:00 班次的 60 分钟休息**没有固定时刻**，此项已经记录，不需要补一个虚构的起止时间。候选排班中引擎选择的时段仅用于模拟在岗覆盖，不会改变该历史班次的时长记录。

Lab 的休息规则还可以设置休息前、休息后及两次休息之间最少工作几个排班时段。旧规则默认各留一个时段，以保留历史模拟结果的含义；若确认没有这些额外限制，新规则可明确设为 0。此设置不等于给已发布班次补填一个实际休息时刻。

## Confirmed input and observed source

| Item | Current evidence | How the Lab treats it |
| --- | --- | --- |
| Preparation and public opening | Manager confirmed preparation starts at 10:00 and the store opens to customers at 11:00. The formal Roster setting still shows 09:00 and is stale for this purpose. | The Lab rule should start its work and demand timeline at 10:00 and enforce the opening headcount across the full 10:00–11:00 preparation interval. Do not infer a 09:00 staffing need or change formal Settings from this review record. |
| Weekday staffing | User supplied 3/4/4 and requested independently editable days, giving Monday–Wednesday and Thursday–Sunday as an example grouping. | The saved one-day Lab simulation interprets these as opening headcount 3, Early complete shifts 4 and Late complete shifts 4. This interpretation and the weekdays to which it applies are not manager-approved staffing rules. |
| Published Full shift break | User confirmed the 2026-10-26 全岗 10:00–22:00 shift has a 60-minute break with no fixed start/end time. The 2026-10-27 全岗 10:00–22:00 source row also records 60 untimed minutes; its policy has not been separately confirmed. | Keep each recorded duration; candidate coverage may propose a placement within an approved window. Never label that placement a historical fact or write it to the formal shift. |
| 2026-10-26 published groups | Read-only preview: 莉小白 10:00–17:00 ×5 with no recorded break; 全岗 10:00–22:00 ×1 with 60 minutes untimed break; 莉小白 17:00–22:00 ×7 with no recorded break. | Manual reference for comparison, not approved minimum demand or permitted patterns. |
| 2026-10-26 through 2026-11-01 source refresh | Signed-in read-only week preview on 2026-10-25: 25 employees, 75 availability windows, 41 relevant assignments; latest fingerprint `evaluate:f40e5470d3fdbc2d0300c54321c0d39d|source:533fda477e70d266d1e0`. Published target assignments appear on Monday–Thursday only; Friday–Sunday have no published coverage record in this read. | The source version is scoped to the week and differs from the one-day fingerprint by design. No published record does not mean no staffing need. Reload immediately before any real solve. |
| Additional long published shifts | Tuesday has 莉小白 10:00–22:00 ×4 with zero recorded break and 全岗 10:00–22:00 ×1 with 60 untimed minutes; Wednesday has 全岗 10:00–22:00 ×1 with zero; Thursday has 莉小白 10:00–22:00 ×5 with zero. Monday's 全岗 10:00–22:00 ×1 also records 60 untimed minutes. | Ask whether zero means a permitted no-break pattern or missing break data, and whether the Tuesday 60-minute break follows the same policy as Monday's. Do not infer a shared policy from these conflicting observations. |
| Current source size | Read-only preview on 2026-10-25: 25 employees, 22 availability windows for 2026-10-26, and 41 surrounding assignments. | Reload before any real solve; these counts and the source fingerprint may change. |
| Published-group opening qualification preflight | On the latest 2026-10-26 read, formal-job/full-availability pools were 6, 1 and 8 for the published 10:00–17:00 莉小白, 10:00–22:00 全岗 and 17:00–22:00 莉小白 groups; opening-qualified subsets were 2, 1 and 2. Removing known overlapping other-store assignments left the same 6/1/8 and 2/1/2 pools. | These are overlapping, group-specific pools, not additive eligible headcounts. Approved leave, minimum rest and work policy remain unchecked. |
| Existing setting and templates | Roster setting shows 09:00–22:00. Active templates include AA 10:00–22:00/60 minutes, BB 10:00–17:00/30 minutes and CC 16:00–22:00/no break. | Review hints only. BB and CC do not match two published groups by time and break duration. |

## Staffing to confirm

Opening is the minimum number actually on duty during preparation; an employee on a complete Early shift can count toward it. Early and Late are minimum counts of complete shifts. These numbers do not add together automatically. Enter each weekday independently, even if several happen to match.

| Day | Opening minimum | Early complete shifts | Late complete shifts | Full complete shifts, if required | Opening qualified minimum | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Monday | — | — | — | — | — | 3/4/4 used in one-day Lab simulation; meaning and approval pending |
| Tuesday | — | — | — | — | — | Unconfirmed; example grouping is not a confirmed rule |
| Wednesday | — | — | — | — | — | Unconfirmed; example grouping is not a confirmed rule |
| Thursday | — | — | — | — | — | Unconfirmed |
| Friday | — | — | — | — | — | Unconfirmed |
| Saturday | — | — | — | — | — | Unconfirmed |
| Sunday | — | — | — | — | — | Unconfirmed |

The separate **effective on-duty demand timeline** remains unconfirmed for every day: preparation start, public opening, closing, employee finish, and minimum effective staff for every continuous segment. A saved rule must cover the entire configured work interval; a missing segment cannot silently mean zero demand. Public holidays or special events need a date override if their hours or demand differ.

## Complete shift and break policy to confirm

For each allowed pattern and formal job, supply all allowed start/end combinations, whether a late start may be moved earlier, and whether the pattern is preferred. For each pattern needing a break, supply count, duration, any restriction on the allowed placement range, and whether the break is paid. A broad range can express that there is no additional store time restriction; no employee's exact historical break time is needed. The recorded 60-minute duration does not establish paid status or applicable work/break policy. The following observations are **not** approved patterns:

| Observed start–end | Recorded break | Formal job in published reference | Review question |
| --- | ---: | --- | --- |
| 10:00–17:00 | 0 min | 莉小白 | Is this complete shift permitted despite the active BB template's 30-minute break? |
| 10:00–22:00 | 60 min, untimed | 全岗 | What break window and paid/unpaid rule apply? |
| 17:00–22:00 | 0 min | 莉小白 | Is this permitted despite active CC starting at 16:00? |

The whole-week read adds 10:00–22:00 groups with **zero recorded break** on 2026-10-27, 2026-10-28 and 2026-10-29. Their actual rest policy has not been confirmed. The Lab must not silently treat those records as the same policy as Monday's 60-minute Full shift, or assume the zero is legally correct.

Also confirm the applicable minimum and maximum shift duration, daily and weekly **net-work** limits, minimum rest between shifts, maximum shifts per day, and when a break becomes mandatory. Current Roster daily/weekly warning values are not certified employment-policy limits. The Lab's start-date accounting for a cross-midnight shift must be reviewed if overnight work is permitted.

## Approved leave and candidate acceptance

The current source does not expose an authoritative approved-leave table. A current read-only Roster schema query through the Lab's restricted database account found no visible public table whose name contains `leave`, `time_off`, or `absence`; the current Evaluate backend schema and routes also expose no approved-leave model or API. This checks source availability, not whether any employee has leave. Before a real candidate run, review all approved leave overlapping 2026-10-26 through 2026-11-01 and provide employee IDs with time-zoned start/end intervals, or explicitly confirm there are none. A blank list without that review is not a confirmation.

After these inputs are confirmed, save a versioned Hurstville rule **only in the Lab**, load a fresh read-only Evaluate/Roster snapshot, and run STRICT plus, if necessary, BEST_EFFORT. Compare effective coverage, formal jobs, break proposals, complete shift lengths, staff hours, external-store conflicts and unnecessary extra work against the published reference. Record the rule and source versions, independent validation results and any remaining uncertainty. Phase 6 integration readiness can be finalized only after this real candidate review; no formal Roster apply or publish action is part of the Lab.
