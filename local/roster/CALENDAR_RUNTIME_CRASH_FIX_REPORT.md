# Calendar Runtime Crash Fix Report

Date: 2026-09-07 (Australia/Sydney)

## Root cause

The crash was reproduced by dragging 09:00–10:00 in Day View. FullCalendar rendered a temporary selection-mirror event because `selectMirror` is enabled. That temporary event correctly has no roster `extendedProps.shiftGroup`, but the shared `eventContent` callback treated every FullCalendar event as a persisted roster event and passed `undefined` to `ShiftEventCard`. `ShiftEventCard` then read `group.assignments`.

The undefined value was the entire calendar group, not an `assignments` field returned by the backend. The fault was introduced by the grouping renderer refactor. It was not caused by a raw-shift ID lookup, a database deletion, an application optimistic update, or a save/edit/delete refetch race.

## Final data contract

The render path is now:

`Backend Shift DTO → groupShiftsForCalendar normalization → CalendarShiftGroup → FullCalendar extendedProps.shiftGroup → CalendarEventContent → ShiftEventCard`

`CalendarShiftGroup` has one stable shape:

- collision-free composite group ID derived from the complete group key;
- separate `shiftIds` and normalized `sourceShifts` for real-record operations;
- date, start, end and break values validated before an event is created;
- a required role object with id, name and color;
- `assignments` always present as an array, including `[]` for an unassigned shift.

Grouping remains restricted to equal date, normalized start instant, normalized end instant, role id and break minutes. Different role, time, date or break values remain separate.

## FullCalendar event boundaries

- Persisted roster events carry `extendedProps.shiftGroup` directly. No grouped event ID is used to look up a raw Shift.
- Selection mirrors render through a dedicated `ShiftSelectionMirror` branch and never enter `ShiftEventCard`.
- Invalid or stale event props render one compact `班次数据暂不可用` placeholder and log a development warning instead of taking down the full Calendar page.
- Event click, batch selection and drag/resize handlers all validate `shiftGroup` before using it.
- The application does not construct optimistic Shift objects after save. Create/update/delete await the repository operation and then refetch the calendar. Incomplete optimistic-shaped inputs are rejected by normalization tests.

## Error boundary copy

The global error message no longer promises that data was definitely unaffected. It now asks the user to reload the latest roster and contact an administrator if the problem persists. Technical stacks remain in development logging only.

## Automated verification

- Frontend: 7 files / 42 tests passed.
- TypeScript and Vite production build passed.
- ESLint passed.
- Live backend health reported database=true and evaluateMolly=true.

New coverage includes:

- one, multiple, empty and long-name assignment rendering;
- missing score/Tier fields;
- exact grouping and non-grouping cases;
- normalized missing assignments;
- stable composite group IDs;
- incomplete temporary inputs;
- selection mirrors without group data;
- missing, stale and malformed event props contained to one placeholder event.

## Browser verification

- Reproduced the original exception with a real Day View 09:00–10:00 drag before the fix.
- Repeated the identical drag after the fix: create dialog opened, Error Boundary count remained zero, and a fresh browser tab logged no errors.
- Created two complete, separate same-condition shifts; they merged into one visual event with both names.
- Edited one grouped record's break; the visual group split correctly after refetch.
- Deleted both temporary records; the calendar remained usable and the original data set remained.
- Week rendered overlapping and multi-employee events without an invalid placeholder.
- Month rendered all event chips, and clicking the September 7 date entered Day View.
- 1920×1080 Week and 1366×768 Month had no page/card overflow, invalid-event placeholder or Error Boundary.

All temporary HandoverEmployee007 and HandoverEmployee005 shifts were deleted after verification.

## Remaining risks

- A truly malformed backend record is intentionally omitted during normalization; development logging/monitoring should be used to identify the upstream DTO violation. It will not crash the Calendar.
- FullCalendar upgrades should retain the selection-mirror regression test and real drag smoke test because temporary event semantics are library-controlled.
