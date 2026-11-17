import { digest } from "./crypto.js";
import { day } from "./preparation.js";
import { PayrollError, PayrollStore } from "./store.js";
import { XeroClient } from "./xero.js";
const cleanLine = (l: any) => ({
  date: day(l.date),
  earningsRateID: l.earningsRateID,
  trackingItemID: l.trackingItemID ?? null,
  numberOfUnits: Number(l.numberOfUnits),
});
const lineKey = (l: any) =>
  [day(l.date), l.earningsRateID, l.trackingItemID ?? ""].join(":");
export function canonicalSheet(s: any) {
  return {
    employeeID: s.employeeID,
    payrollCalendarID: s.payrollCalendarID,
    startDate: day(s.startDate),
    endDate: day(s.endDate),
    status: s.status,
    lines: (s.timesheetLines ?? [])
      .map(cleanLine)
      .sort(
        (a: any, b: any) =>
          lineKey(a).localeCompare(lineKey(b)) ||
          a.numberOfUnits - b.numberOfUnits,
      ),
  };
}
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function checkSheet(s: any, g: any) {
  if (
    s.employeeID !== g.employeeID ||
    s.payrollCalendarID !== g.payrollCalendarID ||
    day(s.startDate) !== g.startDate ||
    day(s.endDate) !== g.endDate
  )
    throw new PayrollError(
      409,
      "Xero 返回的员工或 Payroll Period 与目标不一致",
    );
  if (s.status !== "Draft")
    throw new PayrollError(
      409,
      `工时表 ${s.timesheetID} 状态为 ${s.status ?? "未知"}，禁止自动覆盖`,
    );
  if (
    !Array.isArray(s.timesheetLines) ||
    s.timesheetLines.some(
      (l: any) => !l.timesheetLineID || !Number.isFinite(l.numberOfUnits),
    )
  )
    throw new PayrollError(502, "Xero 工时表明细格式无效");
  const sum = s.timesheetLines.reduce(
    (n: number, l: any) => n + l.numberOfUnits,
    0,
  );
  if (
    typeof s.totalHours !== "number" ||
    Math.abs(sum - s.totalHours) > 0.00011
  )
    throw new PayrollError(502, "Xero 总工时与明细不一致");
}
export async function remoteTarget(client: XeroClient, g: any, tenant: string) {
  const all = await client.timesheets(g, tenant);
  const exact = all.filter(
    (s) =>
      s.employeeID === g.employeeID &&
      s.payrollCalendarID === g.payrollCalendarID &&
      day(s.startDate) === g.startDate &&
      day(s.endDate) === g.endDate,
  );
  if (exact.length > 1)
    throw new PayrollError(
      409,
      "Xero 同一员工周期存在多张工时表，需要人工处理",
    );
  if (!exact.length) {
    if (all.some((s) => day(s.endDate) >= g.startDate))
      throw new PayrollError(
        409,
        "Xero 不允许创建早于员工已有工时表结束日的历史/重叠 Timesheet",
      );
    return null;
  }
  const sheet = await client.sheet(exact[0].timesheetID, tenant);
  checkSheet(sheet, g);
  return sheet;
}
export async function syncGroup(
  store: PayrollStore,
  client: XeroClient,
  tenant: string,
  g: any,
  baseline: any,
  adopt: boolean,
) {
  const id =
    "target:" +
    (await digest([
      tenant,
      g.employeeID,
      g.payrollCalendarID,
      g.startDate,
      g.endDate,
    ]));
  let record = await store.get(id);
  let remote = await remoteTarget(client, g, tenant);
  if (record?.pending) {
    const actual = remote ? canonicalSheet(remote) : null;
    if (same(actual, record.pending.after)) {
      record.ownedLineIds = [
        ...new Set([
          ...(record.ownedLineIds ?? []),
          ...(remote?.timesheetLines ?? [])
            .filter((l: any) => record.pending.claimKeys?.includes(lineKey(l)))
            .map((l: any) => l.timesheetLineID),
        ]),
      ];
      record.remoteBaseline = actual;
      record.pending = null;
      await store.put(id, "target", record);
    } else if (!same(actual, record.pending.before))
      throw new PayrollError(
        409,
        "上次写入结果未知且远端存在其他变化，请重新预览并人工核对",
      );
  }
  const expected = record?.jobId === g.jobId ? record.remoteBaseline : baseline;
  if (!same(remote ? canonicalSheet(remote) : null, expected ?? null))
    throw new PayrollError(409, "Xero 工时表在预览后已变化，请重新预览确认");
  const old = record?.contributions ?? [],
    incoming = g.contributions;
  const contributions = [
    ...old.filter((r: any) => !g.sourceKeys.includes(r.sourceKey)),
    ...incoming,
  ];
  const desiredMap = new Map<string, any>();
  for (const row of contributions) {
    const key = lineKey(row),
      line = desiredMap.get(key) ?? { ...cleanLine(row), minutes: 0 };
    line.minutes += row.minutes;
    line.numberOfUnits = Number((line.minutes / 60).toFixed(4));
    desiredMap.set(key, line);
  }
  const daily = new Map<string, number>();
  for (const row of contributions)
    daily.set(row.date, (daily.get(row.date) ?? 0) + row.minutes);
  if ([...daily.values()].some((m) => m > 1440))
    throw new PayrollError(
      400,
      "Merged employee contributions exceed 24 hours per day",
    );
  const desired = [...desiredMap.values()]
    .filter((l) => l.numberOfUnits > 0)
    .map(cleanLine);
  const previousKeys = new Set((record?.contributions ?? []).map(lineKey));
  let expectedLines = (remote?.timesheetLines ?? []).map((l: any) => ({
    ...l,
  }));
  const managed = new Set<string>(record?.ownedLineIds ?? []);
  for (const l of expectedLines) {
    if (
      previousKeys.has(lineKey(l)) &&
      !desired.some((d) => lineKey(d) === lineKey(l)) &&
      !managed.has(l.timesheetLineID)
    )
      throw new PayrollError(409, "历史集成行归属不明确，需要人工核对");
  }
  for (const line of desired) {
    const matches = expectedLines.filter(
      (l: any) => lineKey(l) === lineKey(line),
    );
    if (matches.length > 1)
      throw new PayrollError(
        409,
        "Xero 同日同 Rate/Tracking 有重复行，禁止自动合并",
      );
    const existing = matches[0];
    if (
      existing &&
      !managed.has(existing.timesheetLineID) &&
      !adopt &&
      !same(cleanLine(existing), line)
    )
      throw new PayrollError(
        409,
        "已有 Draft 包含人工工时；请在预览明确允许采用并更新匹配行",
      );
  }
  record ??= {
    id,
    tenantId: tenant,
    employeeId: g.employeeId,
    targetKey: g.key,
    contributions: [],
    ownedLineIds: [],
  };
  record.employeeName = g.employeeName;
  record.plannedContributions = contributions;
  record.jobId = g.jobId;
  record.remoteBaseline = remote ? canonicalSheet(remote) : null;
  await store.put(id, "target", record);
  let writes = 0;
  const correlations: string[] = [];
  const perform = async (
    method: string,
    path: string,
    body: any,
    afterLines: any[],
  ) => {
    const after = canonicalSheet({
      ...g,
      status: "Draft",
      timesheetLines: afterLines,
    });
    record.pending = {
      before: remote ? canonicalSheet(remote) : null,
      after,
      claimKeys: body?.timesheetLines
        ? body.timesheetLines.map(lineKey)
        : body && adopt
          ? [lineKey(body)]
          : method === "POST" && body
            ? [lineKey(body)]
            : [],
    };
    await store.put(id, "target", record);
    let failure: any;
    try {
      const r = await client.request(path, {
        method,
        body,
        tenant,
        idempotencyKey: await digest([tenant, g.jobId, path, body]),
      });
      if (r.correlation) correlations.push(r.correlation);
    } catch (e) {
      failure = e;
    }
    const actual = remote
      ? await client.sheet(remote.timesheetID, tenant)
      : await remoteTarget(client, g, tenant);
    if (!actual) {
      if (failure) throw failure;
      throw new PayrollError(502, "Xero 没有返回可核对的工时表");
    }
    checkSheet(actual, g);
    if (!same(canonicalSheet(actual), after)) {
      if (failure) throw failure;
      throw new PayrollError(
        502,
        "Xero 写入后工时不一致；已保留待核对状态，禁止盲目重试",
      );
    }
    remote = actual;
    for (const l of actual.timesheetLines)
      if (record.pending.claimKeys?.includes(lineKey(l)))
        managed.add(l.timesheetLineID);
    record.ownedLineIds = [...managed].filter((id) =>
      actual.timesheetLines.some((l: any) => l.timesheetLineID === id),
    );
    record.remoteBaseline = canonicalSheet(remote);
    record.pending = null;
    await store.put(id, "target", record);
    writes++;
  };
  if (!remote) {
    if (!desired.length) throw new PayrollError(400, "没有正数工时可创建");
    await perform(
      "POST",
      "/payroll.xro/2.0/Timesheets",
      {
        employeeID: g.employeeID,
        payrollCalendarID: g.payrollCalendarID,
        startDate: g.startDate,
        endDate: g.endDate,
        timesheetLines: desired,
      },
      desired,
    );
    expectedLines = remote!.timesheetLines.map((l: any) => ({ ...l }));
    for (const l of expectedLines) managed.add(l.timesheetLineID);
  } else {
    for (const line of desired) {
      const current = remote!.timesheetLines.find(
        (l: any) => lineKey(l) === lineKey(line),
      );
      if (current) {
        if (!same(cleanLine(current), line)) {
          const after = remote!.timesheetLines.map((l: any) =>
            l.timesheetLineID === current.timesheetLineID
              ? { ...line, timesheetLineID: l.timesheetLineID }
              : l,
          );
          await perform(
            "PUT",
            `/payroll.xro/2.0/Timesheets/${remote!.timesheetID}/Lines/${current.timesheetLineID}`,
            line,
            after,
          );
        }
        if (managed.has(current.timesheetLineID) || adopt)
          managed.add(current.timesheetLineID);
      } else {
        await perform(
          "POST",
          `/payroll.xro/2.0/Timesheets/${remote!.timesheetID}/Lines`,
          line,
          [...remote!.timesheetLines, line],
        );
        const created = remote!.timesheetLines.find(
          (l: any) => lineKey(l) === lineKey(line),
        );
        managed.add(created.timesheetLineID);
      }
    }
    for (const line of [...remote!.timesheetLines])
      if (
        managed.has(line.timesheetLineID) &&
        !desired.some((d) => lineKey(d) === lineKey(line))
      ) {
        await perform(
          "DELETE",
          `/payroll.xro/2.0/Timesheets/${remote!.timesheetID}/Lines/${line.timesheetLineID}`,
          undefined,
          remote!.timesheetLines.filter(
            (l: any) => l.timesheetLineID !== line.timesheetLineID,
          ),
        );
        managed.delete(line.timesheetLineID);
      }
  }
  checkSheet(remote, g);
  record.contributions = contributions;
  record.plannedContributions = null;
  record.ownedLineIds = [...managed];
  record.timesheetId = remote.timesheetID;
  record.lastSyncedAt = new Date().toISOString();
  record.remoteBaseline = canonicalSheet(remote);
  await store.put(id, "target", record);
  return {
    status: writes ? "Success" : "Skipped",
    timesheetId: remote.timesheetID,
    hours: g.lines.reduce((n: number, l: any) => n + l.numberOfUnits, 0),
    correlationIds: correlations,
  };
}
