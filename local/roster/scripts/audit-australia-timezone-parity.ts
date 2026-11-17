import { storeDateTimeCandidates } from "../src/lib/storeTime";
import { zonedClockToDate } from "../backend/src/zonedCopy";

const zones = ["Australia/Sydney", "Australia/Melbourne", "Australia/Adelaide"];
const dates = ["2026-01-15", "2026-04-04", "2026-04-05", "2026-04-06", "2026-10-03", "2026-10-04", "2026-10-05", "2027-04-03", "2027-04-04", "2027-10-03"];
let cases = 0;
let nonexistent = 0;
for (const zone of zones) for (const date of dates) for (let hour = 0; hour < 24; hour += 1) for (const minute of [0, 15, 30, 45]) {
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  let frontend: Date | null = null;
  let backend: Date | null = null;
  try { frontend = storeDateTimeCandidates(date, time, zone)[0] ?? null; } catch { /* nonexistent local clock */ }
  try { backend = zonedClockToDate(date, time, zone); } catch { /* nonexistent local clock */ }
  if (frontend?.toISOString() !== backend?.toISOString()) {
    throw new Error(`${zone} ${date} ${time}: frontend=${frontend?.toISOString() ?? "invalid"}, backend=${backend?.toISOString() ?? "invalid"}`);
  }
  cases += 1;
  if (!frontend) nonexistent += 1;
}
console.log(JSON.stringify({ verified: true, cases, nonexistent, zones, dates }));
