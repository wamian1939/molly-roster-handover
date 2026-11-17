import type { CalendarShiftGroup } from "./calendarGrouping";
import { addCalendarDays, storeDateTime } from "./storeTime";

export type CalendarOverlapPlacement = {
  group: CalendarShiftGroup;
  clusterId: string;
  columnIndex: number;
  columnCount: number;
  columnSpan: number;
};

export function calendarOverlapInsets({ columnIndex, columnCount, columnSpan }: Pick<CalendarOverlapPlacement, "columnIndex" | "columnCount" | "columnSpan">) {
  return {
    left: `${(columnIndex / columnCount) * 100}%`,
    right: `${((columnCount - columnIndex - columnSpan) / columnCount) * 100}%`,
  };
}

export function layoutCalendarShiftGroupsByVisibleDay(groups: readonly CalendarShiftGroup[], from: string, to: string, timezone: string) {
  const placements = new Map<string, CalendarOverlapPlacement>();
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) {
    const start = storeDateTime(date, "00:00", timezone).getTime();
    const end = storeDateTime(addCalendarDays(date, 1), "00:00", timezone).getTime();
    const visible = groups.filter((group) => timestamp(group.startAt) < end && timestamp(group.endAt) > start)
      .map((group) => ({ ...group, date,
        startAt: new Date(Math.max(timestamp(group.startAt), start)).toISOString(),
        endAt: new Date(Math.min(timestamp(group.endAt), end)).toISOString(),
      }));
    for (const placement of layoutCalendarShiftGroups(visible)) {
      placements.set(`${date}:${placement.group.id}`, placement);
    }
  }
  return placements;
}

export function layoutCalendarShiftGroups(groups: readonly CalendarShiftGroup[]): CalendarOverlapPlacement[] {
  const byDate = new Map<string, CalendarShiftGroup[]>();
  for (const group of groups) {
    const dateGroups = byDate.get(group.date);
    if (dateGroups) dateGroups.push(group);
    else byDate.set(group.date, [group]);
  }

  const result: CalendarOverlapPlacement[] = [];
  for (const [date, dateGroups] of [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...dateGroups].sort(compareForLayout);
    let cluster: CalendarShiftGroup[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;
    let clusterIndex = 0;

    const flush = () => {
      if (!cluster.length) return;
      result.push(...placeCluster(cluster, `${date}:${clusterIndex}`));
      cluster = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
      clusterIndex += 1;
    };

    for (const group of sorted) {
      const start = timestamp(group.startAt);
      const end = timestamp(group.endAt);
      if (cluster.length && start >= clusterEnd) flush();
      cluster.push(group);
      clusterEnd = Math.max(clusterEnd, end);
    }
    flush();
  }

  return result;
}

function placeCluster(groups: CalendarShiftGroup[], clusterId: string): CalendarOverlapPlacement[] {
  const columnEnds: number[] = [];
  const provisional = groups.map((group) => {
    const start = timestamp(group.startAt);
    const end = timestamp(group.endAt);
    let columnIndex = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (columnIndex === -1) {
      columnIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[columnIndex] = end;
    }
    return { group, clusterId, columnIndex };
  });

  const columnCount = columnEnds.length;
  return provisional.map((placement) => {
    let columnSpan = 1;
    for (let column = placement.columnIndex + 1; column < columnCount; column += 1) {
      const blocked = provisional.some((candidate) => candidate.columnIndex === column && groupsOverlap(placement.group, candidate.group));
      if (blocked) break;
      columnSpan += 1;
    }
    return { ...placement, columnCount, columnSpan };
  });
}

function compareForLayout(left: CalendarShiftGroup, right: CalendarShiftGroup) {
  return timestamp(left.startAt) - timestamp(right.startAt)
    || timestamp(right.endAt) - timestamp(left.endAt)
    || left.role.name.localeCompare(right.role.name, "zh-CN")
    || left.breakMinutes - right.breakMinutes
    || left.groupKey.localeCompare(right.groupKey);
}

function groupsOverlap(left: CalendarShiftGroup, right: CalendarShiftGroup) {
  return timestamp(left.startAt) < timestamp(right.endAt) && timestamp(left.endAt) > timestamp(right.startAt);
}

function timestamp(value: string) {
  return new Date(value).getTime();
}
