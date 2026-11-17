import { addCalendarDays } from "./storeTime";

export function repeatTargetDates(sourceDate: string, untilDate: string, weekdays: number[], maximum = 42) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(untilDate) || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("请选择有效的重复日期和星期");
  }
  if (untilDate <= sourceDate) throw new Error("重复结束日期必须晚于来源班次");
  if (!weekdays.length) throw new Error("请至少选择一个星期");
  const selected = new Set(weekdays);
  const dates: string[] = [];
  for (let offset = 1; offset <= 366; offset += 1) {
    const date = addCalendarDays(sourceDate, offset);
    if (date > untilDate) break;
    if (!selected.has(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    dates.push(date);
    if (dates.length > maximum) throw new Error(`一次最多重复 ${maximum} 个班次，请缩短日期范围`);
  }
  if (!dates.length) throw new Error("所选日期范围内没有符合星期条件的班次");
  return dates;
}
