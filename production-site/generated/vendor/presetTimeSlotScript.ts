import { isCalendarDate } from "./validation.js";
import { zonedClockCandidates } from "./zonedCopy.js";

// Molly accepts a name before the weekday/shortcut expression. Its backend
// resolves the current Evaluate canonical ID; a same-name ambiguity requires
// an explicit one-import employee choice. The parser
// never evaluates script text as JavaScript.
export type PresetShortcut = { code: string; startTime: string; endTime: string };
export type ScriptEmployee = { id: string; displayName: string; storeId: string; isActive: boolean };
export type ScriptSlot = { employeeId: string; employeeName: string; date: string; startAt: string; endAt: string; shortcut: string; line: number };
export type ScriptIssue = { line: number; code: string; message: string; nickname?: string };

export function parsePresetTimeSlotScript(input: {
  script: string;
  shortcuts: PresetShortcut[];
  employees: ScriptEmployee[];
  employeeMappings?: Array<{ nickname: string; employeeId: string }>;
  storeId: string;
  today: string;
  week: "CURRENT" | "NEXT";
  timezone: string;
}): { slots: ScriptSlot[]; issues: ScriptIssue[]; weekStart: string } {
  if (!isCalendarDate(input.today)) throw new Error("Invalid store-local current date");
  const todayUtc = new Date(`${input.today}T00:00:00.000Z`);
  const weekday = (todayUtc.getUTCDay() + 6) % 7;
  todayUtc.setUTCDate(todayUtc.getUTCDate() - weekday + (input.week === "NEXT" ? 7 : 0));
  const weekStart = todayUtc.toISOString().slice(0, 10);
  const issues: ScriptIssue[] = [];
  const slots: ScriptSlot[] = [];
  const fail = (line: number, code: string, message: string) => issues.push({ line, code, message });
  const shortcutMap = new Map<string, PresetShortcut>();
  for (const shortcut of input.shortcuts) {
    const code = shortcut.code.trim().toUpperCase();
    if (!/^[A-Z]{1,20}$/.test(code) || shortcutMap.has(code)
      || !isClock(shortcut.startTime) || !isClock(shortcut.endTime)
      || shortcut.startTime === shortcut.endTime) {
      fail(0, "INVALID_SHORTCUT", `快捷码 ${code || "(空)"} 的时间或名称无效`);
    } else shortcutMap.set(code, shortcut);
  }
  if (input.script.length > 20_000) fail(0, "SCRIPT_TOO_LARGE", "脚本最长 20,000 个字符");
  const lines = input.script.replace(/\r\n?/g, "\n").split("\n");
  if (lines.filter((line) => line.trim()).length > 100) fail(0, "TOO_MANY_LINES", "脚本最多 100 行");
  if (issues.length) return { slots, issues, weekStart };
  const byName = new Map<string, ScriptEmployee[]>();
  const byId = new Map(input.employees.map((employee) => [employee.id, employee]));
  for (const employee of input.employees) {
    const key = normalizedName(employee.displayName);
    byName.set(key, [...(byName.get(key) ?? []), employee]);
  }
  const mappings = new Map<string, string>();
  for (const mapping of input.employeeMappings ?? []) {
    const key = normalizedName(mapping.nickname);
    if (mappings.has(key)) fail(0, "DUPLICATE_MAPPING", `员工姓名映射重复：${mapping.nickname}`);
    else mappings.set(key, mapping.employeeId);
  }
  if (issues.length) return { slots, issues, weekStart };
  const seen = new Set<string>();
  let parsedLines = 0;
  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const line = index + 1;
    parsedLines += 1;
    // Employee names come from Evaluate and may include punctuation. Tab is
    // the only structural separator; the token parser validates the code.
    if (raw.length > 500 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(raw.replace(/\t/g, ""))) {
      fail(line, "INVALID_CHARACTERS", "该行包含不支持的字符或过长"); continue;
    }
    const cells = splitScriptRow(raw, new Set([...byName.keys(), ...mappings.keys()]));
    if (cells === "AMBIGUOUS_NAME_BOUNDARY") {
      fail(line, "AMBIGUOUS_NAME_BOUNDARY", "员工姓名与代码分界不明确，请用 Tab 分隔姓名和代码"); continue;
    }
    if (!cells) {
      fail(line, "INVALID_ROW", "每行应为员工姓名后接星期与快捷码；无法唯一识别时请用 Tab 分隔"); continue;
    }
    const nickname = cells.name;
    const candidates = byName.get(normalizedName(nickname)) ?? [];
    const mappedId = mappings.get(normalizedName(nickname));
    const mappedEmployee = mappedId ? byId.get(mappedId) : undefined;
    if (mappedId && !mappedEmployee) {
      issues.push({ line, code: "MAPPED_EMPLOYEE_MISSING", message: `映射的员工已不在当前 Evaluate 门店目录：${nickname}`, nickname }); continue;
    }
    if (!mappedId && !candidates.length) {
      issues.push({ line, code: "UNKNOWN_EMPLOYEE", message: `找不到员工姓名：${nickname}`, nickname }); continue;
    }
    if (!mappedId && candidates.length !== 1) {
      issues.push({ line, code: "AMBIGUOUS_EMPLOYEE", message: `员工昵称不唯一：${nickname}`, nickname }); continue;
    }
    if (mappedId && candidates.length && !candidates.some((candidate) => candidate.id === mappedId)) {
      issues.push({ line, code: "MAPPING_CONFLICT", message: `员工姓名 ${nickname} 已对应另一名员工，请核对脚本姓名`, nickname }); continue;
    }
    const employee = mappedEmployee ?? candidates[0]!;
    if (!employee.isActive || employee.storeId !== input.storeId) {
      issues.push({ line, code: "EMPLOYEE_OUT_OF_SCOPE", message: `员工已停用或不在当前门店：${nickname}`, nickname }); continue;
    }
    const tokens = tokenizeScriptExpression(cells.expression);
    if (!tokens) { fail(line, "INVALID_TOKEN", `无法识别：${cells.expression}`); continue; }
    if (tokens.length > 14) { fail(line, "TOO_MANY_SLOTS", "一行最多 14 个星期/快捷码组合"); continue; }
    for (const token of tokens) {
      const match = /^([1-7](?:-[1-7]|[1-7]*)?)([A-Za-z]{1,20})$/.exec(token);
      if (!match) { fail(line, "INVALID_TOKEN", `无法识别：${token}`); continue; }
      const shortcut = shortcutMap.get(match[2]!.toUpperCase());
      if (!shortcut) { fail(line, "UNKNOWN_SHORTCUT", `未定义快捷码：${match[2]}`); continue; }
      const dayExpression = match[1]!;
      const [rangeStart, rangeEnd] = dayExpression.split("-");
      const days = rangeEnd
        ? Number(rangeStart) <= Number(rangeEnd) ? Array.from({ length: Number(rangeEnd) - Number(rangeStart) + 1 }, (_, offset) => Number(rangeStart) + offset) : []
        : [...dayExpression].map(Number);
      if (!days.length) { fail(line, "INVALID_DAY_RANGE", `星期范围无效：${dayExpression}`); continue; }
      for (const day of days) {
        const dateUtc = new Date(`${weekStart}T00:00:00.000Z`);
        dateUtc.setUTCDate(dateUtc.getUTCDate() + day - 1);
        const date = dateUtc.toISOString().slice(0, 10);
        const key = `${employee.id}:${date}`;
        try {
          const endDate = new Date(`${date}T00:00:00.000Z`);
          if (shortcut.endTime < shortcut.startTime) endDate.setUTCDate(endDate.getUTCDate() + 1);
          const starts = zonedClockCandidates(date, shortcut.startTime, input.timezone);
          const ends = zonedClockCandidates(endDate.toISOString().slice(0, 10), shortcut.endTime, input.timezone);
          if (starts.length !== 1 || ends.length !== 1) { fail(line, "AMBIGUOUS_LOCAL_TIME", `${date} 的时间在夏令时回拨日重复，请使用单人表单明确选择`); continue; }
          if (!(starts[0]! < ends[0]!) || ends[0]!.getTime() - starts[0]!.getTime() > 86_400_000) {
            fail(line, "INVALID_TIME_RANGE", `${date} 的可用时间必须为正且不超过 24 小时`); continue;
          }
          if (seen.has(key)) fail(line, "DUPLICATE_DAY", `${nickname} 的星期 ${day} 重复`);
          else seen.add(key);
          slots.push({ employeeId: employee.id, employeeName: employee.displayName, date,
            startAt: starts[0]!.toISOString(), endAt: ends[0]!.toISOString(), shortcut: match[2]!.toUpperCase(), line });
        } catch { fail(line, "INVALID_LOCAL_TIME", `${date} 的时间在 ${input.timezone} 不存在`); }
      }
    }
  }
  if (!parsedLines) fail(0, "EMPTY_SCRIPT", "请粘贴至少一行员工脚本");
  return { slots, issues, weekStart };
}

function normalizedName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU"); }
function isClock(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }

function splitScriptRow(raw: string, knownNames: Set<string>): { name: string; expression: string } | "AMBIGUOUS_NAME_BOUNDARY" | null {
  const tabCells = raw.split("\t");
  if (tabCells.length === 2) {
    const name = tabCells[0]!.trim();
    const expression = tabCells[1]!.trim();
    return name && expression ? { name, expression } : null;
  }
  if (tabCells.length !== 1) return null;
  const possible: Array<{ name: string; expression: string }> = [];
  for (const space of raw.matchAll(/\s+/g)) {
    const name = raw.slice(0, space.index).trim();
    const expression = raw.slice(space.index + space[0].length).trim();
    if (name && tokenizeScriptExpression(expression)) possible.push({ name, expression });
  }
  // A pasted name may touch the first weekday digit. Only recognize this
  // boundary when the complete prefix is a current employee name or an
  // explicit mapping; arbitrary digit-bearing names must not be guessed.
  for (const digit of raw.matchAll(/[1-7]/g)) {
    const name = raw.slice(0, digit.index).trim();
    const expression = raw.slice(digit.index).trim();
    if (knownNames.has(normalizedName(name)) && tokenizeScriptExpression(expression)
      && !possible.some((candidate) => normalizedName(candidate.name) === normalizedName(name) && candidate.expression === expression)) {
      possible.push({ name, expression });
    }
  }
  const recognized = possible.filter((candidate) => knownNames.has(normalizedName(candidate.name)));
  if (recognized.length > 1) return "AMBIGUOUS_NAME_BOUNDARY";
  if (recognized.length === 1) return recognized[0]!;
  // An unknown, text-only nickname still needs to reach the explicit
  // employee-mapping step when the first code is joined directly to it.
  // A digit in the nickname makes the boundary unknowable without a Tab.
  const unknownJoined: Array<{ name: string; expression: string }> = [];
  let digitNameBoundary = false;
  for (const digit of raw.matchAll(/[1-7]/g)) {
    const name = raw.slice(0, digit.index).trim();
    const expression = raw.slice(digit.index).trim();
    if (!name || !tokenizeScriptExpression(expression)) continue;
    if (/\d/.test(name)) { digitNameBoundary = true; continue; }
    // Nicknames can end in ordinary punctuation (for example a closing
    // parenthesis); the weekday digit still supplies the code boundary.
    if (/[\p{L}\p{P}\p{S}]$/u.test(name)) unknownJoined.push({ name, expression });
  }
  if (unknownJoined.length > 1) return "AMBIGUOUS_NAME_BOUNDARY";
  if (unknownJoined.length === 1) return possible[0] ?? unknownJoined[0]!;
  if (digitNameBoundary) return "AMBIGUOUS_NAME_BOUNDARY";
  return possible[0] ?? null;
}

function tokenizeScriptExpression(expression: string): string[] | null {
  const tokens: string[] = [];
  let remaining = expression.trim();
  while (remaining) {
    remaining = remaining.trimStart();
    if (!remaining) break;
    const match = /^([1-7](?:-[1-7]|[1-7]*)?)([A-Za-z]{1,20})/.exec(remaining);
    if (!match) return null;
    tokens.push(match[0]);
    remaining = remaining.slice(match[0].length);
  }
  return tokens.length ? tokens : null;
}
