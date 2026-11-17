import { calendarMonthDates, scheduledShiftOccupiedDates } from "../src/lib/scheduledShiftSummary";

const dates = calendarMonthDates("2026-10-21");
for (const count of [500, 1_000, 5_000]) {
  const shifts = Array.from({ length: count }, (_, index) => ({
    startAt: index % 2 ? "2026-10-31T11:00:00Z" : "2026-10-09T03:00:00Z",
    endAt: index % 2 ? "2026-10-31T15:00:00Z" : "2026-10-09T07:00:00Z",
  }));
  for (let index = 0; index < 5; index += 1) scheduledShiftOccupiedDates(shifts, dates, "Australia/Sydney");
  const samples = Array.from({ length: 20 }, () => {
    const start = performance.now();
    scheduledShiftOccupiedDates(shifts, dates, "Australia/Sydney");
    return performance.now() - start;
  }).sort((a, b) => a - b);
  console.log(JSON.stringify({ shifts: count, dates: dates.length, medianMs: Number(((samples[9]! + samples[10]!) / 2).toFixed(2)) }));
}
