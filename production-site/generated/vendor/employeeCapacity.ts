export type CapacitySignal = "GREEN" | "YELLOW" | "RED";
export type ReportedSlot = { start: string; end: string };

export function capacitySignal(required: number, reported: number): CapacitySignal {
  if (!Number.isInteger(required) || required < 0 || !Number.isInteger(reported) || reported < 0) throw new Error("Invalid headcount");
  // Integer arithmetic keeps the exact 120% boundary stable for small capacities.
  if (required === 0 || reported * 5 >= required * 6) return "RED";
  return reported >= required ? "YELLOW" : "GREEN";
}

export function clockMinutes(clock: string) {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + minute;
}

// Each account contributes at most once, including adjacent submitted intervals.
export function reportingHeadcount(employees: ReportedSlot[][], start: string, end: string) {
  const from = clockMinutes(start), to = clockMinutes(end);
  return employees.filter((slots) => {
    let covered = from;
    for (const slot of [...slots].sort((a, b) => clockMinutes(a.start) - clockMinutes(b.start))) {
      if (clockMinutes(slot.start) > covered) break;
      covered = Math.max(covered, clockMinutes(slot.end));
      if (covered >= to) return true;
    }
    return false;
  }).length;
}
