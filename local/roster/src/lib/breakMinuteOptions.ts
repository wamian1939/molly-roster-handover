const standardBreakMinutes = Array.from({ length: 9 }, (_, index) => index * 15);

/** BHS exposes quarter-hour break choices through two hours. Keep a saved legacy value visible. */
export function breakMinuteOptions(current: number): number[] {
  return standardBreakMinutes.includes(current)
    ? standardBreakMinutes
    : [...standardBreakMinutes, current].sort((left, right) => left - right);
}
