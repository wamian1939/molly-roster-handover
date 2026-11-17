import type { CalendarView } from "../../types/roster";

const options: Array<{ value: CalendarView; label: string; fullLabel: string }> = [
  { value: "dayGridMonth", label: "月", fullLabel: "月视图" },
  { value: "timeGridWeek", label: "周", fullLabel: "周视图" },
  { value: "timeGridDay", label: "日", fullLabel: "日视图" },
];

export function CalendarViewSwitch({ value, onChange, disabled = false }: { value: CalendarView; onChange: (view: CalendarView) => void; disabled?: boolean }) {
  return (
    <div className="calendar-view-switch" role="group" aria-label="日历视图">
      {options.map((option) => (
        <button key={option.value} type="button" className="calendar-view-option" aria-label={option.fullLabel} aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
