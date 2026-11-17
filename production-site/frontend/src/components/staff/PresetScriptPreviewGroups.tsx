import type { PresetScriptPreview } from "../../services/rosterRepository";
import { storeParts } from "../../lib/storeTime";

type Slot = PresetScriptPreview["slots"][number];
const statuses = { CREATE: "新增", UNCHANGED: "不变", CONFLICT: "冲突" };
const weekday = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" });

export function PresetScriptPreviewGroups({ slots, timezone }: { slots: Slot[]; timezone: string }) {
  const employees = new Map<string, { name: string; slots: Slot[] }>();
  for (const slot of slots) {
    const group = employees.get(slot.employeeId) ?? { name: slot.employeeName, slots: [] };
    group.slots.push(slot);
    employees.set(slot.employeeId, group);
  }
  return <>{[...employees].map(([employeeId, employee]) => {
    const duplicateName = [...employees.values()].filter(group => group.name === employee.name).length > 1;
    const sorted = [...employee.slots].sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt));
    return <section className="preset-script-employee" key={employeeId} aria-label={`${employee.name} 的报班预览`}>
      <header className="preset-script-employee-heading"><h4>{employee.name}</h4>{duplicateName ? <span>{employeeId}</span> : null}</header>
      <ul className="preset-script-day-grid">
        {sorted.map((slot, index) => {
          const start = storeParts(slot.startAt, timezone);
          const end = storeParts(slot.endAt, timezone);
          return <li key={`${slot.date}-${slot.startAt}-${index}`} className="preset-script-day-tile" data-status={slot.status}>
            <time className="preset-script-tile-date" dateTime={slot.date}>{weekday.format(new Date(`${slot.date}T12:00:00Z`))} <span>({slot.date})</span></time>
            <p className="preset-script-tile-time">{start.time} ~ {end.time}</p>
            {end.date !== slot.date ? <p className="preset-script-tile-overnight">结束于 {end.date}（跨日）</p> : null}
            <div className="preset-script-tile-meta"><span>{slot.shortcut}</span><strong>{statuses[slot.status]}</strong></div>
          </li>;
        })}
      </ul>
    </section>;
  })}</>;
}
