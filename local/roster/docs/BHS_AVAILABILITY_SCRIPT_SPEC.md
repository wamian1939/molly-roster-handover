# BHS Preset Time Slot Script: observed contract and Molly implementation boundary

## 2026-10-21 duplicate local day in an unsaved conversion

In signed-in BHS Time Slot Script, `HandoverEmployee006<Tab>1AA1BB` converted into two Monday 26 October rows: AA 10:00–22:00 and BB 10:00–17:00. Submit was enabled, while the visible Rules say a duplicate day gets a warning and only one work script is allowed per day. **BHS Submit/overwrite behavior remains NOT VERIFIED.** Cancel closed the draft and made no BHS data change. Molly now shows both candidate windows but marks both `CONFLICT`, gives one clear duplicate-day issue and disables Commit. This is an intentional safety difference until the reference server behavior is known; it prevents ambiguous same-day Availability writes. A direct Roster service caller receives 422 too.

A second read-only BHS Convert used `HandoverEmployee006<Tab>12AA 2BB`: the preview showed a valid Monday AA row plus two Tuesday AA/BB rows, yet Submit was enabled. The duplicate-day rule text remained visible; no inline warning appeared in the accessible preview or inspected row markup. Cancel closed the unsaved draft. This does not prove what Submit would persist. Molly showed the same three candidate rows, marked Tuesday's two as conflicts, and blocked the **whole** import. Its current UI labels Monday as a candidate and explicitly says that a conflicted paste writes nothing.

For contrast, selecting **This Week** and converting `HandoverEmployee006<Tab>3AA` targeted Wednesday 21 October, already shown in BHS Staff's Recorded Date column. The preview rendered one red 10:00–22:00 row with a warning icon; opening the icon displayed `Duplicate recording.` and Submit was disabled. Cancel closed it without a write. Thus an already recorded target date has observed client-side blocking in BHS, while same-paste duplicate days have only an enabled Submit in the observed pre-submit state. BHS server behavior after Submit is still unknown.

## 2026-10-21 populated conversion visibility

Signed-in BHS Time Slot Script converted an unsaved `HandoverEmployee006<Tab>1AA2AA34567AA` into seven AA preview rows for the next week; Cancel closed the dialog and Submit was not pressed. At the same CSS viewport, Molly's expanded shortcut rules covered much of its converted preview. Molly now collapses the rules after a successful Preview and fits all seven local rows in the result panel. This is a local visibility fix; it does not establish BHS server Submit semantics or write any Availability.

## 2026-10-21 advertised 20-letter shortcut boundary

The signed-in BHS Staff → Edit Preset Time Slot Script → Edit Script tab displays three saved AA/BB/CC rows. Each shortcut textbox advertises `Max 20 English characters`, with separate required Start Time and End Time inputs. The DOM does **not** set a native `maxlength`, and BHS Submit was not pressed, so server acceptance of a 20-letter code remains unverified. The reference dialog was cancelled without a BHS write.

Molly previously limited codes to 12 letters in its API schema, persistence normalizer and script parser. It now consistently accepts 1–20 ASCII letters, uppercases saved codes and rejects a 21st letter. This follows the visible BHS editor contract while keeping the existing duplicate-code, clock and permission checks. The Molly editor's native 20-character limit and title expose the boundary before Save. Focused parser/API tests, an isolated PostgreSQL persistence test and normal local browser input/Cancel checks passed. The real Hurstville shortcut version and SHA-256 digest, Availability digest, import count, Shift count and publication count stayed unchanged after the unsaved browser trial. This is Molly acceptance evidence, not proof of BHS Submit behavior.

## 2026-10-21 This Week / Next Week control

The signed-in BHS Time Slot Script dialog was inspected read-only on Staff. Its week selector is a 53×29 px switch between This Week and Next Week; Next Week is checked on opening, with a 25 px white thumb. The surrounding labels indicate the selected side. The dialog was cancelled without Submit or a BHS data write. Molly previously exposed the same state as two radio buttons. Its current-source dialog now uses an accessible switch with the measured track/thumb dimensions and Molly brand color, retaining Next Week as the default when the dialog opens. The existing preview invalidation runs on a switch change.

A later signed-in BHS Staff check selected This Week in the unsaved New tab, switched to Time and returned to New. The switch remained on This Week across both tab changes; Cancel closed the dialog without Submit. Molly previously reset to Next Week on every tab switch, risking a preview for the wrong week. It now retains the week selection within the open dialog while clearing the tab-specific script and preview. Current-source Hurstville Chrome verified Time → New → Time preserves This Week; Cancel left the guarded Shift, period, publication, Availability and shortcut digests unchanged. BHS Submit semantics remain unverified.

The reference editor also retained This Week after Cancel and reopening it on the same Staff page, but a Staff page reload restored the documented Next Week default. Molly now keeps the choice in Staff page state for that store, including reopening after Cancel, and resets on page reload. Normal Hurstville Chrome observed Next → This → Cancel → reopen This, then reload → Next. The choice is scoped per store locally to prevent a switch of store from inheriting a target week silently. No reference or local business data was saved during these checks.

Normal local Hurstville Chrome previewed `Berlin1AA2AA34567AA` with This Week selected as 19–25 October 2026, then switched to Next Week: the first preview disappeared and the new preview covered 26 October–1 November. Both yielded seven proposed 10:00–22:00 AA windows. Cancel left the guarded Availability SHA-256, 14 rows, zero import audits, 13 Shifts and two publications unchanged. This verifies Molly's week selection and zero-write preview path; BHS Submit effects remain unverified.

## 2026-10-21 Molly shortcut acknowledgement interaction

Checking the local Staff dialog's `我已核对本门店快捷码与时间` used to close its own Rules disclosure immediately. A real browser checkbox action then lost its target, although the checkbox had changed state and Preview was enabled. Molly now leaves Rules open after acknowledgement and lets the user collapse it explicitly. Current-source Chrome kept the checked control visible, successfully previewed the joined code form, then cancelled with an unchanged Hurstville Availability digest and zero import audits. This is a local interaction reliability fix; no BHS behavior or Submit effect is inferred.

## 2026-10-21 normal Hurstville name-first preview without Commit

The running local Hurstville Staff dialog parsed both a unique current employee name directly followed by `1234567AA` and the same name followed by `1AA2AA34567AA`. Each Preview produced the same seven AA 10:00-22:00 windows for 26 October-1 November, with seven CREATE and zero conflicts; both drafts were cancelled. A read-only Prisma before/after audit found identical Availability count/digest, zero import audits and unchanged Shift/publication counts. This is evidence that the user-requested joined-name forms work in the normal local preview path. Actual Commit persistence was previously verified only on paired disposable Evaluate/Roster PostgreSQL. BHS's Tab-separated reference behavior and untested Submit semantics remain separate.

## 2026-10-21 Molly punctuation-name boundary

The local personal Script path now uses Evaluate's actual display name, so Molly's parser must accept ordinary name punctuation. It now permits names such as `Anne (Tea) & Co` with a Tab separator or a uniquely recognized directly joined code; control, format and unpaired surrogate characters remain invalid. The weekday/shortcut tokenizer still accepts only its defined numeric day and configured alphabetic code syntax. Read-only Evaluate count found 29 current employees and none outside the older name-character set, so this fixes a future-valid-name case rather than a currently observed employee failure. Synthetic Chromium/PostgreSQL saved one canonical Availability and left prior Shifts/publication intact. BHS punctuation-name input and Submit persistence are **NOT VERIFIED**.

## 2026-10-21 Molly personal-entry name binding

Molly's one-employee `Script Record Time` now builds the same name-first row used by bulk entry: the selected current Evaluate display name, a Tab, and weekday/shortcut codes. Its one-import mapping still binds that name to the selected canonical ID. Previously the frontend always sent `SelectedEmployee`, which could collide with an actual employee of that name and cause the backend's correct `MAPPING_CONFLICT` refusal. A disposable browser/PostgreSQL fixture with that literal employee name verified HandoverEmployee006's personal preview, one Commit and unchanged repeat Preview. This is a Molly correctness fix under the user's name-first rule; BHS personal Script Submit semantics remain unverified.

## 2026-10-21 space vs Tab boundary, read-only

In the same signed-in Hurstville Time Slot Script tab, `HandoverEmployee006 1AA2AA34567AA` with one ordinary space between name and code produced no append rows and kept Submit disabled after Convert. The unsaved editor was cancelled and verified closed. Together with the earlier direct-name and Tab trials, this narrows the observed BHS input boundary for this employee/code: **Tab works; a single space and no separator do not**. The Rules text says blank spaces are allowed for reading, but the live trial does not support treating an ordinary space as a name/code separator. Molly continues accepting Tab, space and joined name/code forms under the user's explicit input preference. BHS saved Submit behavior remains unverified.

## 2026-10-21 direct name-code reference check, read-only

In the signed-in Hurstville **Time Slot Script** tab, the unsaved input `Berlin1AA2AA34567AA` produced no Time Slot - Append rows and left Submit disabled after Convert. The same nickname and joined weekday/shortcut groups with a **Tab between name and first digit**, `HandoverEmployee006<Tab>1AA2AA34567AA`, previewed seven AA 10:00–22:00 rows dated 26 October–1 November and enabled Submit. Cancel closed the dialog; no BHS Submit or data mutation occurred. Thus BHS-observed *joined code groups* still require the documented name/code Tab boundary in this tested case. Molly's directly joined name-first input remains the user's intentional extension. BHS persistence and duplicate handling are still unverified.

## 2026-10-21 Molly joined unknown-nickname mapping

Molly's user-requested name-first import now sends a text-only unknown nickname touching the first weekday digit, such as `Tea Nickname1AA2AA34567AA`, to `UNKNOWN_EMPLOYEE` and the explicit current-store Evaluate employee chooser. It never silently assigns the nickname. Known employee names with more than one valid name/code boundary still block; unknown digit-bearing nicknames with unclear boundaries require a Tab. Fresh synthetic Chromium/PostgreSQL submitted a joined unknown nickname only after choosing HandoverEmployee006 and verified its seven canonical Availability rows plus seven for Cindy, one import audit and unchanged baseline Shifts/publication. BHS New uses a SID in the observed reference; Molly's name-first rule is an intentional difference, and BHS Submit semantics remain unverified.

## 2026-10-21 Molly proposed-window overlap safety

Two individually valid name-code entries can overlap after local-to-UTC conversion, such as `Berlin1NN2AA` when NN is Monday 22:00–Tuesday 02:00 and AA is Tuesday 01:00–04:00. Molly now marks both proposed rows as conflicts in read-only Preview and rejects a direct Commit with HTTP 422. An exact 02:00 boundary touch remains valid. Current-source synthetic evaluator Chromium and guarded PostgreSQL confirmed disabled Commit and zero rows/audits; [screenshot](evidence/molly-script-overlap-blocked-2026-10-21.png). BHS's behavior for this specific overlap and Submit has not been observed; this is Molly data-integrity handling.

## 2026-10-21 Molly direct name-code paste

Molly now accepts `Example Worker1234567AA` and `Example Worker1AA2AA34567AA` in addition to the previously supported Tab/space boundary. An exact current Evaluate name resolves internally; an unknown text-only nickname is offered for explicit one-import mapping. Multiple known name/code boundaries return `AMBIGUOUS_NAME_BOUNDARY`; duplicate employee names still require explicit disambiguation, and unclear digit-bearing nicknames require a Tab. IDs are not accepted as automatic employee names. This is a Molly paste convenience and an **intentional BHS difference**: BHS Rules explicitly show a Tab between nickname and codes, and the read-only direct-name trial above produced no preview.

Red/green parser tests passed 16/16. Current-source Chromium on paired disposable Evaluate/Roster PostgreSQL first previewed and **committed the direct form** `Berlin1AA2AA34567AA` once. Seven equivalent forms, including `Berlin1234567AA` and all Tab/space variants, then showed zero new, seven unchanged and a disabled Commit. Database readback found seven Availability rows, one import audit, three original Shifts and one publication; zero browser errors. Full backend suite on a separate migrated disposable PostgreSQL schema passed 29 files/219 tests. All temporary schemas and listeners were removed. No BHS, normal-store or Evaluate master data was changed.

2026-10-21 live read-only recheck: the signed-in BHS Staff editor's Rules explicitly say each Time Slot Script row uses **nickname + Tab + day range/shortcut**, one staff per line, case-insensitive shortcut letters, with optional blank spaces for readability. The editor was left untouched and Cancel was used; Calendar was restored to October Month. This strengthens the observed Tab boundary. Molly's additional ordinary-space name boundary is an intentional convenience guarded by ambiguous-name rejection, not a claim that BHS accepts that boundary. BHS Submit persistence remains unverified.

## 2026-10-21 confirmed joined Time Slot Script notation

In the signed-in BHS **Time Slot Script** tab, three unsaved conversions were performed with the same existing nickname and a Tab before the code suffix: `1234567AA`, `1AA2AA34567AA`, and `1AA 2AA 34567AA`. Each produced the same seven **Time Slot - Append** preview dates, Monday 2026-10-26 through Sunday 2026-11-01, each 10:00–22:00 from the observed AA shortcut. Submit became enabled, but was **never pressed**. Each draft was cancelled/discarded, and the reference browser returned to Calendar. The actual nickname and staff SID are omitted here to avoid copying employee identifiers into tracked evidence.

This directly confirms BHS Time-tab parsing of both joined forms requested by the user; the earlier description of joined input as only a Molly extension is superseded for this tab. BHS's **New** tab still expects its own staff SID, while Molly intentionally accepts Evaluate employee **names** in both tabs under the user's later rule. BHS Submit persistence, overwrite behavior, and exact Availability enforcement remain unverified. Molly's current parser regression now checks all three Tab-separated reference expressions yield identical canonical employee/date/UTC-time rows; the ordinary space-separated name variants remain a Molly convenience.

Follow-up current-source Molly browser/PostgreSQL regression: after a single `HandoverEmployee006<Tab>1AA2AA34567AA` Append, five equivalent expressions were previewed, including ordinary-space `HandoverEmployee006 1234567AA`, `HandoverEmployee006 1AA2AA34567AA` and `HandoverEmployee006 1AA 2AA 34567AA`. Each showed 0 new, 7 unchanged and 0 conflict; only the first Commit occurred. The disposable database held 7 Availability rows and 1 audit while 3 Shifts and 1 publication stayed unchanged. The exact QA stack was cleaned. BHS Submit was not used.


Fresh current-source Molly Chrome with paired disposable Evaluate/Roster PostgreSQL also pasted each of the three Tab-separated expressions into **Time Slot Script**. After saving the AA/BB/CC shortcut configuration only in that disposable store, every Preview displayed **新增 7 · 不变 0 · 冲突 0** and the same seven AA 10:00–22:00 rows; editing the input immediately cleared the previous preview. [Synthetic preview screenshot](evidence/molly-bhs-joined-script-preview-2026-10-21.png). Cancel left **0 Availability / 0 import audits**, 3 fixture Shifts and 1 publication; exact QA schemas and listeners were removed. No Molly import Commit or BHS Submit occurred in this comparison.

## 2026-10-21 separate Shift preset observation

BHS Hurstville's Day Add **Shift preset** menu includes AA/BB/CC with the same clocks as its Time Slot Script shortcuts plus 60/30/0-minute breaks. Selecting AA in an unsaved Add draft changed both clocks and Break; Cancel made no reference write. Molly's local Hurstville already had the three code/time Availability shortcuts. Three matching role-null **Shift templates** were added from this observed reference, with a guarded backup and browser check. This does not add Break to Availability or imply that BHS synchronizes changes between its Shift preset and Script shortcut editors; that Submit behavior remains unverified.

## 2026-10-21 name/code boundary safety

When two current Evaluate employees could both match a whitespace-only row, for example `HandoverEmployee006` and `HandoverEmployee006 1AA` with script `HandoverEmployee006 1AA 2BB`, Molly now rejects the row with `AMBIGUOUS_NAME_BOUNDARY` instead of assigning availability to the shorter name. Use `HandoverEmployee006<Tab>1AA 2BB` or `HandoverEmployee006 1AA<Tab>2BB` to choose explicitly. Joined and spaced code groups still work. A red parser regression reproduced the prior wrong canonical employee; isolated Chrome showed the blocking line error, both explicit Tab previews, and zero Availability/import writes after Cancel. This is a Molly identity-safety rule, not an observed BHS conversion rule.

## 2026-10-21 Molly overnight shortcut extension

Molly now accepts a store shortcut ending earlier than it starts as a next-local-day Availability window (including a midnight end), never as a negative or same-day interval. Equal clocks are rejected; actual elapsed time must be positive and at most 24 hours. The parser rejects nonexistent and repeated wall clocks at either endpoint rather than silently selecting a DST occurrence. This overnight meaning has **not** been observed in BHS; the BHS Hurstville AA/BB/CC examples all end on the same day. Existing name-first and joined-code input remains unchanged.

Disposable browser evidence: `HandoverEmployee006 7NN` with `NN 22:00–02:00` previewed Sunday 2026-11-01 22:00 to Monday 2026-11-02 02:00. Cancel wrote no Availability or audit. The later explicit Commit wrote one SCRIPT row linked to Evaluate canonical `browser-HandoverEmployee006` and one audit; identical repeat Preview showed one unchanged row and disabled Commit. Calendar Week employee rows showed the Sunday and Monday segments. [Unobscured preview screenshot](evidence/molly-script-overnight-preview-2026-10-21.png). PostgreSQL service tests also cover next-day assignment conflicts and week-boundary replay. BHS received no write.

## 2026-10-20 Molly name-mapping guard

Molly resolves the script's employee name against current Evaluate data. A supplied mapping may disambiguate a duplicate name only to an employee with that normalized name; a previously unknown alias may be explicitly mapped to an active employee in the store. A mapping that redirects an already matched name to a different employee returns `MAPPING_CONFLICT` before Preview can be committed. The Staff picker now limits duplicate-name choices to the matching employees. Parser, API and component regressions passed; this is a Molly data-integrity rule, not an observed BHS Submit behavior. No BHS data was changed.

## 2026-10-20 Molly user override: names and joined groups

The user requires Molly script rows to start with an employee **name**, not an entered employee ID. This supersedes the canonical-ID Molly New implementation described in the historical section below. Both Molly Time and New resolve the current Evaluate name; an unknown or ambiguous name can be explicitly mapped to a canonical employee for that import. The code suffix supports `1234567AA` and `1AA2AA34567AA`, with whitespace or tabs also accepted. BHS New's SID expectation remains a read-only reference observation, not Molly's input policy. Fresh disposable browser/PostgreSQL verification committed 14 Availability rows for two named synthetic employees and preserved existing Shifts and publication; BHS received no write.

## 2026-10-20 reference identifier discovery (read only)

In the signed-in BHS **New: Time Slot Script** tab, a synthetic `HandoverEmployee006<TAB>1AA` conversion left the preview empty and Submit disabled; the browser console reported `No staff found for sid: HandoverEmployee006`. The same unsaved form converted a page-visible BHS staff SID plus `<TAB>1AA` into HandoverEmployee006, Monday 2026-10-26, 10:00-22:00 and enabled Submit. **Cancel** closed the dialog. No BHS Submit or data write was made. This establishes that New resolves a staff SID, whereas the first tab accepts a nickname. The effect of New's Submit remains unverified.

Molly New now resolves an **Evaluate canonical employee ID**; it does not silently treat a BHS SID as canonical. An unknown BHS SID needs an explicit one-import mapping to an active employee in the current Evaluate store. The ordinary Time tab continues to resolve names. Current-source isolated Chromium and PostgreSQL verified one New-tab append from canonical `browser-HandoverEmployee006` and unchanged existing Shifts/publication. The BHS session later expired during Calendar navigation, so no fresh BHS gesture conclusion was drawn.

## 2026-10-20 Molly three-tab implementation and limit

The bulk Staff dialog now has the three BHS-observed tab labels. Time Slot Script and New: Time Slot Script each begin with a transient draft; switching tabs clears an unsaved draft as observed in BHS. Edit Script exposes editable store shortcut code/start/end rows and a dedicated Save. In Molly, both Time and New use the existing explicit Preview → Confirm Append workflow. **BHS New/Submit persistence semantics were not observed and are not claimed as matched.** This UI does not change the one-employee Script Record Time flow.

Isolated Chromium at the 3093×1670 reference viewport verified all three tabs, draft reset, shortcut save, Preview and Cancel. The dialog measured 1300×826 px and the textarea 353×504 px. Guarded PostgreSQL confirmed that Cancel wrote no Availability or import audit, and the three fixture Shifts and one publication remained unchanged. Screenshots are `docs/evidence/molly-script-tabs-time-2026-10-20.png` and `docs/evidence/molly-script-tabs-edit-2026-10-20.png`.

## 2026-10-20 Molly exact reviewed row set

Molly's Script Preview and Commit now bind every parsed employee/date/time slot's reviewed CREATE/UNCHANGED status, plus the ID/version of an existing unchanged Availability row. A same-count swap across slots now returns 409 inside the locked Roster transaction before Availability or import-audit writes. Re-preview lets the manager inspect and commit the new write set. An isolated browser/PostgreSQL test verified stale rejection and recovery, with Availability visible in the Week employee-row Calendar. This is a Molly concurrency guarantee; BHS's own Submit behavior was not observed because the reference tabs remain at login.

## 2026-10-20 Molly shortcut-read recovery

The Staff import dialog now treats a failed initial shortcut GET as an unknown store configuration. The BHS Hurstville example shortcuts stay visible only as a labeled reference; inputs, Save, Convert and Commit are disabled until an in-place Retry successfully reads the current store configuration. Retry resets the confirmation and loads its saved version. Isolated Chromium reproduced the pre-fix failure and verified recovery to a different saved `AA 11:00–21:00`, followed by Preview/Cancel with no Availability or audit write. This improves Molly's safety; BHS behavior for a failed shortcut load was not observed.

## 2026-10-20 Molly replay feedback

The Roster import transaction intentionally returns the original import ID and historical created count for an exact-source idempotent replay. Staff previously presented that count as a new write. It now uses the returned `alreadyImported` flag to say the script was imported earlier and **no records were added by this Commit**. Two independent Chromium pages previewed the same two-row script; first Commit created two rows, second replay showed the corrected message, and guarded PostgreSQL found one import audit. This is a Molly concurrency/feedback correction; BHS duplicate Submit semantics remain **NOT VERIFIED**.

## 2026-10-20 pasted blank rows in Molly

Molly's 100-employee-row limit now counts only populated script rows. Excel-style trailing blank lines no longer consume the row budget; 101 populated rows still fail, and the 20,000-character input bound remains. A red parser regression, 198 backend tests on disposable PostgreSQL, and current-source Staff Chromium Preview/Cancel established this Molly behavior with no Availability or import-audit write. BHS's own row limit has not been observed, so this is an import robustness correction rather than a parity claim.

## 2026-10-20 Molly reviewed import counts

Molly now treats the Preview CREATE/UNCHANGED counts as part of the manager's confirmation. Commit includes both in the review digest, then compares them with current Roster Availability under store/employee locks. If another administrator inserts an identical row after Preview, the old confirmation returns 409 without an import audit; Staff retains the script for re-preview. Exact-source retries remain idempotent. This is a Molly data-consistency rule verified in disposable PostgreSQL and Chromium/API. BHS's own concurrent Submit behavior remains unobserved.

## 2026-10-20 Molly shortcut and store-settings review identity

Molly's script Preview now binds both the saved shortcut version and store-settings version in its review hash, in addition to the workforce revision and resolved employees. An intervening Roster configuration update invalidates an old Commit even when the imported dates and times are unchanged. The Staff editor also checks the saved shortcut version before converting; if another administrator updated it, the dialog shows the current list and requires renewed confirmation. A version sent by the editor is checked again in the Preview route to close the fetch-to-preview race. The import's stable content-based source hash is separate. Isolated Chromium/PostgreSQL confirmed no extra import on the stale Commit. These are Molly consistency rules; BHS's corresponding behavior remains unobserved.

## 2026-10-20 Molly preview invalidation on Evaluate change

Molly now binds a script preview to the verified current Evaluate Workforce Revision and the names of resolved employees. On Commit it refreshes Evaluate and rejects a stale preview with HTTP 409 before entering the Roster append transaction; the import's idempotent source hash remains independent of the workforce revision. Isolated HTTP and Chromium/PostgreSQL QA covered both a changed 1.4 revision with unchanged Cindy slots and a legacy 1.3 mapped-name change. The 1.4 browser case left two earlier imported rows and one audit unchanged. This strengthens Molly's safe workflow; BHS's own Submit handling is still unverified.

## 2026-10-20 Molly commit consistency update

The Roster commit route re-parses against the current Evaluate workforce and saved store shortcuts, then passes the shortcut and store-settings versions it read to the import service. After the service takes the store advisory lock, it rechecks those versions before writing Availability or the import audit. A stale version returns HTTP 409 and requires a fresh preview. Isolated PostgreSQL reproduced the pre-fix race (one unexpected committed row), then verified both stale shortcut and stale settings cases return 409 with no target write; ordinary Staff browser imports still save and replay as unchanged. This protects Roster-local configuration consistency. Evaluate can change in its independent database between its read and the Roster transaction, so a cross-system atomic guarantee is still unavailable.

## 2026-10-20 Molly single-employee entry

Molly Staff now offers a selected-employee `Script Record Time` action alongside the existing bulk toolbar import. It accepts weekday/shortcut tokens in one field and sends the observed two-column format to the existing preview/append service using a fixed internal alias explicitly mapped to the selected Evaluate canonical employee ID. Preview refuses another employee ID; commit still refreshes Evaluate membership and validates the store. The shortcut confirmation is visible by default. Isolated browser/PostgreSQL saved HandoverEmployee006 and Cindy separately, then repeat-previewed both as unchanged; direct database verification found two rows and two audits. This implements the known one-person workflow without claiming that Molly's selected-panel placement, dialog geometry or BHS Submit semantics are identical to BHS's row-menu implementation.

## Direct reference observations, 2026-10-20

The actual Staff toolbar label is **Edit Preset Time Slot Script**. A staff row's three dot menu also has **Script Record Time**, opening a one employee dialog. BHS Help calls the workflow *Script Record Time*. These labels refer to closely related entry points; the new objective's word “Present” is not the visible product spelling.

The toolbar dialog has Time Slot Script, New: Time Slot Script and Edit Script tabs; Shortcut and Rules panels; an ordinary multiline Script textarea; a This Week / Next Week switch; convert and clear buttons; a right hand Time Slot - Append preview; Cancel and Submit. No line numbers or syntax highlighting were visible. Hurstville's visible shortcuts were AA 10:00–22:00, BB 10:00–17:00, CC 16:00–22:00. A synthetic `HandoverEmployee006<TAB>1AA<newline>` was decoded in the first tab to Monday 2026-10-26 10:00–22:00 with a BHS staff ID. Submit became enabled; **Cancel** was clicked, and no BHS write was made. A later read-only inspection opened **Edit Script**: it shows editable Shortcut, Start Time and End Time for each of the three current codes, row remove controls, an **Append** control, Cancel and Submit. **New: Time Slot Script** visibly retains the Shortcuts/Rules/Script/preview structure; its distinct save semantics remain **NOT VERIFIED**. Neither Edit Script nor New tab was submitted.

BHS Help documents:

- Two Excel columns: nickname and script; paste without header. One nickname + Tab + day/shortcut expression per line, newline between employees.
- Examples `Frank 12SC`, `Frank 12SC 3QT`, `Frank 1-5SC 3QT`, `Frank 1-3SC 4QT 5-7SC`.
- Weekday digits 1–7 mean Monday–Sunday; case insensitive; spaces permitted; default conversion is next week, starting Monday, with a current week option.
- Duplicate day and already recorded date warnings; only one work script per day.
- The script shortcut codes are letters. The Help text “Script MUST only include letters” is inconsistent with its own weekday digit examples, so it is interpreted as applying to shortcut codes, not the entire input.

The phrase “Time Slot - Append” is visible, but BHS Submit's precise transaction, overwrite and duplicate behavior was not tested on real data. Molly's import will default to **no overwrite** and must explicitly flag existing dates. BHS “recorded work time” is treated as available time for Molly only after validation; whether BHS uses a hard or advisory scheduling rule still needs reference verification.

## Safe Molly processing contract

Raw text → bounded static parser → unique Evaluate employee resolution → store timezone clock validation → read-only preview against current Availability and assigned Shifts → explicit commit → one Roster transaction. No script execution. Ambiguous, missing, inactive or other-store employees block automatic mapping. The parser, preview and transactional commit exist in `backend/src/presetTimeSlotScript.ts`, `backend/src/presetTimeSlotPreview.ts`, and `backend/src/rosterService.ts`; Staff has a script dialog. BHS employee IDs are never used as Evaluate canonical IDs. Shortcut definitions are now persisted per Roster store with a version and server-side validation; preview and commit load the saved version from the server and reject an unconfigured store. Hurstville's observed AA/BB/CC are shown as a reference only until a manager explicitly saves them for the current store. Existing Shift coverage is checked during dry-run and repeated in the commit transaction. Browser QA proved append, no-write Cancel, duplicate and existing-Availability conflict on paired disposable PostgreSQL schemas; assigned-Shift conflict has backend API and real-PostgreSQL coverage. Editing a saved shortcut clears the old preview and confirmation; after saving a changed AA end time, the existing day appeared as a conflict and commit stayed disabled. This is a partial implementation, not full BHS parity.

## Open validation decisions

- BHS may allow a previously recorded day in its preview with a warning, but whether Submit appends, merges, skips or overwrites is **NOT VERIFIED**. Molly must show the collision and block default append.
- BHS's time model for 23:59, overnight windows and DST is **NOT VERIFIED**. Molly uses store IANA timezone conversion and rejects invalid DST wall times; overnight shortcut support must still be checked against the current parser and Roster date model.
- A BHS nickname may differ from Evaluate displayName. Molly now offers an explicit per-import employee choice; whether a persistent, approved alias directory is needed remains a business decision. Silent approximate matching remains prohibited.

## 2026-10-20 nickname mapping and tab observation

Molly now permits an **explicit per-import** nickname → current Evaluate canonical Employee ID selection when a script nickname is unknown or ambiguous. Preview returns the unresolved nickname; Staff shows only current-store active Evaluate employees, clears the old preview after selection, and requires another Convert. Commit independently refreshes Evaluate and refuses a missing, inactive or transferred mapping. The mapping is not persisted as new employee master data. In a disposable browser/PostgreSQL run, `BHS Alias<TAB>1AA` resolved to synthetic `browser-HandoverEmployee006`, created one `SCRIPT` Availability row and one audit, appeared in Staff/Calendar after reload, and a repeat preview was UNCHANGED without another write. Exact BHS nickname identity semantics still need confirmation.

In the signed-in BHS dialog, the three tabs were observed again without saving: **New: Time Slot Script** began with a blank textarea even after an unsaved synthetic draft was entered on **Time Slot Script**; returning to the first tab showed the draft cleared. This only establishes transient tab behavior. It does not establish the respective Submit operations or authorize copying that behavior blindly.

The New tab was reopened read only after the Molly layout change. It visibly presents the same week switch, Script textarea, convert/clear buttons, append preview and disabled Submit in an empty state. A synthetic `HandoverEmployee006<TAB>1AA` produced no preview because New expects a staff SID; the browser console stated this directly. A page-visible SID did produce an unsaved preview. Both trials ended with Cancel and no BHS data write. Molly's explicit append flow remains a **partial** match because BHS Submit persistence was not observed.
