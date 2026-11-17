import { randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type Request } from "express";
import { z } from "zod";
import { capacitySignal, clockMinutes, reportingHeadcount } from "./employeeCapacity.js";
import { dateString } from "./validation.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { parsePresetTimeSlotScript } from "./presetTimeSlotScript.js";
import { zonedLocalParts } from "./zonedCopy.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const accounts = [
  { id: "demo-1", name: "演示员工 A", storeId: "hurstville", storeName: "Hurstville" },
  { id: "demo-2", name: "演示员工 B", storeId: "hurstville", storeName: "Hurstville" },
  { id: "demo-3", name: "演示员工 C", storeId: "hurstville", storeName: "Hurstville" },
];
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/, "开始和结束时间须使用当天的半小时时间");
const slot = z.object({ start: clock, end: clock }).strict().refine((s) => s.start < s.end, "结束时间必须晚于开始时间");
const day = z.object({ date: dateString, status: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]), shortcut: z.string().optional(), slots: z.array(slot).max(12) }).strict()
  .superRefine((d, ctx) => {
    if ((d.status === "AVAILABLE") !== Boolean(d.slots.length)) ctx.addIssue({ code: "custom", message: "可报班日期需要填写时段，其他状态不能填写时段" });
    const ordered = [...d.slots].sort((a, b) => a.start.localeCompare(b.start));
    if (ordered.some((s, i) => i > 0 && s.start < ordered[i - 1].end)) ctx.addIssue({ code: "custom", message: "同一天的时段不能重叠" });
  });
const weekSchema = dateString.refine((v) => new Date(`${v}T00:00:00Z`).getUTCDay() === 1, "请选择周一开始的报班周");
const weekQuery = z.object({ week: weekSchema }).strict();
const reportSchema = z.object({ expectedAccountId: z.string(), week: weekSchema, expectedRevision: z.number().int().nonnegative(), ruleVersion: z.string().min(1), days: z.array(day).length(7) }).strict();
type Day = z.infer<typeof day>;
type Report = { revision: number; updatedAt: string; days: Day[] };
const storedSchema = z.record(z.string(), z.object({ revision: z.number().int().positive(), updatedAt: z.string(), days: z.array(day).length(7) }));
const bandSchema = z.object({ start: clock, end: clock, staff: z.number().int().nonnegative() }).refine(b => b.start < b.end);
const rulesSchema = z.object({ storeId: z.literal("hurstville"), timezone: z.string(), version: z.string(), scope: z.enum(["DEFAULT", "WEEK"]), weekly: z.record(z.string(), z.array(bandSchema)) });
type Rules = z.infer<typeof rulesSchema>;
const shortcutsSchema = z.object({ version: z.number().int().positive(), shortcuts: z.array(z.object({ code: z.string().regex(/^[A-Z]{1,20}$/), startTime: clock, endTime: clock }).strict()).min(1) });
type Shortcuts = z.infer<typeof shortcutsSchema>;
async function readShortcuts(): Promise<Shortcuts> {
  const configuration = await prisma.availabilityScriptShortcuts.findUnique({ where: { storeId: "hurstville" } });
  const result = shortcutsSchema.safeParse(configuration);
  if (!result.success) throw new HttpError(503, "门店报班代码尚未配置，请在设置中核对并保存快捷码");
  if (result.data.shortcuts.some(s => s.startTime >= s.endTime)) throw new HttpError(503, "当前员工演示页面暂不支持跨日快捷码，请联系门店负责人");
  return result.data;
}
const execute = promisify(execFile);

export async function readEmployeeDemoRules(week: string): Promise<Rules> {
  try {
    const { stdout } = await execute(resolve(root, "scheduling-engine/.venv-isolated/Scripts/python.exe"),
      [resolve(root, "scripts/read-employee-capacity-rules.py"), "hurstville", week], { timeout: 10_000, windowsHide: true });
    return rulesSchema.parse(JSON.parse(stdout));
  } catch { throw new HttpError(503, "当前报班周的容量规则尚未确认，请联系门店负责人核对规则"); }
}

function datesFor(week: string) {
  return Array.from({ length: 7 }, (_, index) => new Date(Date.parse(`${week}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10));
}

export function createEmployeeDemoRouter(options: { file?: string; rules?: typeof readEmployeeDemoRules; shortcuts?: () => Promise<Shortcuts> } = {}) {
  const router = Router();
  const file = options.file ?? resolve(root, "backend/.data/employee-demo-reports.json");
  const loadRules = options.rules ?? readEmployeeDemoRules;
  const loadShortcuts = options.shortcuts ?? readShortcuts;
  const sessions = new Map<string, { accountId: string; expires: number }>();
  let queue: Promise<unknown> = Promise.resolve();
  async function reports(): Promise<Record<string, Report>> {
    try { return storedSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new HttpError(503, "演示报班记录暂时无法读取，请稍后重试"); }
  }
  function account(request: Request) {
    const cookie = request.header("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("molly_employee_demo="))?.split("=")[1];
    const session = cookie ? sessions.get(cookie) : undefined;
    if (!session || session.expires < Date.now()) throw new HttpError(401, "请先选择演示员工账号");
    return accounts.find(a => a.id === session.accountId)!;
  }
  function view(accountId: string, week: string, rules: Rules, all: Record<string, Report>, configuration: Shortcuts) {
    const dates = datesFor(week);
    const mine = all[`${accountId}:${week}`];
    const days: Day[] = (mine?.days ?? dates.map(date => ({ date, status: "UNKNOWN" as const, slots: [] }))).map(d => ({ ...d,
      shortcut: d.status === "AVAILABLE" ? d.shortcut ?? (d.slots.length === 1 ? configuration.shortcuts.find(s => s.startTime === d.slots[0].start && s.endTime === d.slots[0].end)?.code : undefined) : undefined }));
    const capacity = dates.map((date, index) => {
      const bands = rules.weekly[String(index)];
      if (!bands?.length) throw new HttpError(503, "本周规则未覆盖全部日期，请联系门店负责人");
      const cells = bands.flatMap(band => {
        const result: Array<{ start: string; end: string; signal: string }> = [];
        const format = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
        for (let minute = clockMinutes(band.start); minute < clockMinutes(band.end); minute += 30) {
          const start = format(minute), end = format(minute + 30);
          const count = reportingHeadcount(accounts.map(a => all[`${a.id}:${week}`]?.days.find(d => d.date === date && d.status === "AVAILABLE")?.slots ?? []), start, end);
          result.push({ start, end, signal: capacitySignal(band.staff, count) });
        }
        return result;
      });
      // Merge adjacent cells with identical status, without disclosing demand or counts.
      const merged: typeof cells = [];
      for (const cell of cells) {
        const previous = merged.at(-1);
        if (previous?.end === cell.start && previous.signal === cell.signal) previous.end = cell.end;
        else merged.push({ ...cell });
      }
      return { date, bands: merged };
    });
    return { accountId, week, timezone: rules.timezone, ruleVersion: createHash("sha256").update(JSON.stringify({ rules, configuration })).digest("hex"), ruleScope: rules.scope,
      shortcuts: configuration.shortcuts, shortcutsVersion: configuration.version,
      revision: mine?.revision ?? 0, updatedAt: mine?.updatedAt ?? null, days, capacity };
  }
  router.get("/accounts", (_req, res) => res.json({ accounts, demo: true }));
  router.post("/login", (req, res) => {
    const { accountId } = z.object({ accountId: z.enum(["demo-1", "demo-2", "demo-3"]) }).strict().parse(req.body);
    for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
    if (sessions.size >= 1000) throw new HttpError(429, "演示会话过多，请稍后重试");
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { accountId, expires: Date.now() + 8 * 3_600_000 });
    res.cookie("molly_employee_demo", token, { httpOnly: true, sameSite: "strict", path: "/api/employee-demo", maxAge: 8 * 3_600_000 });
    res.json({ account: accounts.find(a => a.id === accountId), demo: true });
  });
  router.get("/me", (req, res) => res.json({ account: account(req), demo: true }));
  router.post("/logout", (_req, res) => {
    const token = _req.header("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("molly_employee_demo="))?.split("=")[1];
    if (token) sessions.delete(token);
    res.clearCookie("molly_employee_demo", { path: "/api/employee-demo" }).json({ ok: true });
  });
  router.get("/week", async (req, res) => {
    const user = account(req), { week } = weekQuery.parse(req.query);
    res.json(view(user.id, week, await loadRules(week), await reports(), await loadShortcuts()));
  });
  function convert(user: typeof accounts[number], week: string, expression: string, rules: Rules, configuration: Shortcuts): Day[] {
    const result = parsePresetTimeSlotScript({ script: `${user.name}\t${expression.trim()}`, shortcuts: configuration.shortcuts,
      employees: [{ id: user.id, displayName: user.name, storeId: user.storeId, isActive: true }], storeId: user.storeId,
      today: week, week: "CURRENT", timezone: rules.timezone });
    if (result.issues.length) throw new HttpError(400, result.issues.map(i => i.message).join("；"));
    return datesFor(week).map(date => {
      const parsed = result.slots.find(s => s.date === date);
      return parsed ? { date, status: "AVAILABLE", shortcut: parsed.shortcut,
        slots: [{ start: zonedLocalParts(new Date(parsed.startAt), rules.timezone).time, end: zonedLocalParts(new Date(parsed.endAt), rules.timezone).time }] }
        : { date, status: "UNKNOWN", slots: [] };
    });
  }
  router.post("/preview", async (req, res) => {
    const user = account(req);
    const input = z.object({ expectedAccountId: z.string(), week: weekSchema, script: z.string().trim().min(1).max(500) }).strict().parse(req.body);
    if (input.expectedAccountId !== user.id) throw new HttpError(409, "当前员工账号已切换，请重新登录后核对");
    const rules = await loadRules(input.week), configuration = await loadShortcuts();
    const value = view(user.id, input.week, rules, await reports(), configuration);
    res.json({ ...value, days: convert(user, input.week, input.script, rules, configuration) });
  });
  router.put("/week", async (req, res) => {
    const user = account(req), input = reportSchema.parse(req.body);
    if (input.expectedAccountId !== user.id) throw new HttpError(409, "当前员工账号已切换，请重新登录后核对");
    const dates = datesFor(input.week);
    if (new Set(input.days.map(d => d.date)).size !== 7 || input.days.some(d => !dates.includes(d.date))) throw new HttpError(400, "请提交所选报班周内的七天记录");
    const run = queue.then(async () => {
      const rules = await loadRules(input.week), all = await reports(), configuration = await loadShortcuts();
      const current = view(user.id, input.week, rules, all, configuration);
      if (current.revision !== input.expectedRevision) throw new HttpError(409, "这周的报班已在其他页面修改，请重新读取后核对");
      if (current.ruleVersion !== input.ruleVersion) throw new HttpError(409, "容量规则已更新，请重新读取后核对");
      const selected = input.days.filter(d => d.status === "AVAILABLE");
      if (selected.some(d => !d.shortcut)) throw new HttpError(400, "请为每个可报班日期选择门店代码，例如 AA、BB、CC");
      if (input.days.some(d => d.status !== "AVAILABLE" && d.shortcut)) throw new HttpError(400, "不可报班或未填写的日期不能包含报班代码");
      const parsedDays = selected.length ? convert(user, input.week, selected.map(d => `${dates.indexOf(d.date) + 1}${d.shortcut}`).join(" "), rules, configuration) : [];
      for (const d of selected) {
        const expected = parsedDays.find(p => p.date === d.date)!;
        if (d.shortcut !== expected.shortcut || JSON.stringify(d.slots) !== JSON.stringify(expected.slots)) throw new HttpError(400, "报班时段与门店代码不一致，请重新选择代码");
      }
      all[`${user.id}:${input.week}`] = { revision: current.revision + 1, updatedAt: new Date().toISOString(), days: input.days };
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(temporary, JSON.stringify(all), { mode: 0o600 });
      await rename(temporary, file);
      return view(user.id, input.week, rules, all, configuration);
    });
    queue = run.catch(() => undefined);
    res.json(await run);
  });
  return router;
}
