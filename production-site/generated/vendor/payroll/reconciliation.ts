// An employee removed from a roster must not silently retain their old pay.
// Surface an explicit zero-minute adjustment for human confirmation instead.
export function removedRows(
  sources: any[],
  rows: any[],
  targets: any[],
  maps: any,
) {
  for (const target of targets) {
    const parts = target.targetKey.split(":"),
      start = parts[2],
      end = parts[3];
    if (
      rows.some(
        (r) =>
          r.employeeId === target.employeeId &&
          r.date >= start &&
          r.date <= end,
      )
    )
      continue;
    for (const source of sources) {
      const previous = (
        target.plannedContributions ?? target.contributions
      )?.find((r: any) => r.sourceKey === source.sourceKey && r.minutes > 0);
      if (!previous) continue;
      rows.push({
        id: "removed:" + target.id + ":" + source.sourceKey,
        employeeId: target.employeeId,
        employeeName: target.employeeName ?? target.employeeId,
        storeId: source.storeId,
        sourceKey: source.sourceKey,
        timezone: source.timezone,
        date: previous.date,
        startAt: previous.date + "T00:00:00Z",
        endAt: previous.date + "T00:00:00Z",
        scheduledMinutes: 0,
        unpaidBreakMinutes: 0,
        paidMinutes: 0,
        category:
          Object.entries(maps.rates).find(
            ([, id]) => id === previous.earningsRateID,
          )?.[0] ?? "",
        confirmed: false,
        reason: "",
        removedFromRoster: true,
      });
    }
  }
  return rows;
}
