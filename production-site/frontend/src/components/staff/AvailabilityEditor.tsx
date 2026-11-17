import { Plus, Trash2 } from "lucide-react";
import { AppSelect } from "../ui/AppSelect";
import { addCalendarDays } from "../../lib/storeTime";
import { availabilityOccurrences, createAvailabilitySlot, type AvailabilityDayDraft, type AvailabilitySlotDraft } from "../../lib/availability";

export function AvailabilityEditor({ days, errors, timezone, onChange }: {
  days: AvailabilityDayDraft[];
  errors: Map<string, string>;
  timezone: string;
  onChange: (days: AvailabilityDayDraft[]) => void;
}) {
  function patchDay(dayIndex: number, update: (day: AvailabilityDayDraft) => AvailabilityDayDraft) {
    onChange(days.map((day, index) => index === dayIndex ? update(day) : day));
  }
  function patchSlot(dayIndex: number, slotIndex: number, patch: Partial<AvailabilitySlotDraft>) {
    patchDay(dayIndex, (day) => ({ ...day, slots: day.slots.map((slot, index) => index === slotIndex ? { ...slot, ...patch, source: "MANUAL" } : slot) }));
  }

  return <div className="availability-editor" aria-label="员工可用时间">
    {days.map((day, dayIndex) => <section key={day.date} className="availability-day-card">
      <div className="availability-day-header">
        <div><h3>{formatDay(day.date)}</h3><p>{day.slots.length ? `${day.slots.length} 个时段` : "未提交，选择员工时显示未知"}</p></div>
        <button type="button" className="calendar-text-button" onClick={() => patchDay(dayIndex, (current) => ({ ...current, slots: [...current.slots, createAvailabilitySlot()] }))}><Plus className="h-4 w-4" />添加时间段</button>
      </div>
      <div className="availability-slot-list">
        {day.slots.map((slot, slotIndex) => {
          const startOptions = availabilityOccurrences(day.date, slot.startTime, timezone);
          const endDate = slot.endNextDay ? addCalendarDays(day.date, 1) : day.date;
          const endOptions = availabilityOccurrences(endDate, slot.endTime, timezone);
          return <div key={slot.id} className="availability-slot-row">
            <div className="availability-slot-status"><AppSelect ariaLabel={`${day.date} 第 ${slotIndex + 1} 个时段状态`} value={slot.status} onValueChange={(value) => patchSlot(dayIndex, slotIndex, { status: value as AvailabilitySlotDraft["status"] })} options={[{ value: "AVAILABLE", label: "可用" }, { value: "UNAVAILABLE", label: "不可用" }]} /></div>
            <div><label><span>开始</span><input aria-label={`${day.date} 第 ${slotIndex + 1} 个时段开始时间`} type="time" className="native-input" value={slot.startTime} onChange={(event) => patchSlot(dayIndex, slotIndex, { startTime: event.target.value, startOccurrence: 0 })} /></label>{startOptions.length > 1 ? <AppSelect ariaLabel={`${day.date} 第 ${slotIndex + 1} 个时段开始时间次数`} value={String(slot.startOccurrence)} onValueChange={(value) => patchSlot(dayIndex, slotIndex, { startOccurrence: Number(value) })} options={startOptions} /> : null}</div>
            <div className="availability-end-field"><label><span>结束{slot.endNextDay ? "（次日）" : ""}</span><input aria-label={`${day.date} 第 ${slotIndex + 1} 个时段结束时间`} type="time" className="native-input" value={slot.endTime} onChange={(event) => patchSlot(dayIndex, slotIndex, { endTime: event.target.value, endOccurrence: 0 })} /></label>{endOptions.length > 1 ? <AppSelect ariaLabel={`${day.date} 第 ${slotIndex + 1} 个时段结束时间次数`} value={String(slot.endOccurrence)} onValueChange={(value) => patchSlot(dayIndex, slotIndex, { endOccurrence: Number(value) })} options={endOptions} /> : null}</div>
            <label className="availability-slot-note"><span>备注</span><input aria-label={`${day.date} 第 ${slotIndex + 1} 个时段备注`} className="native-input" value={slot.note} maxLength={500} onChange={(event) => patchSlot(dayIndex, slotIndex, { note: event.target.value })} /></label>
            <button type="button" className="availability-remove-button" aria-label={`删除 ${day.date} 第 ${slotIndex + 1} 个时间段`} onClick={() => patchDay(dayIndex, (current) => ({ ...current, slots: current.slots.filter((_, index) => index !== slotIndex) }))}><Trash2 className="h-4 w-4" /></button>
          </div>;
        })}
        {!day.slots.length ? <button type="button" className="availability-empty-button" onClick={() => patchDay(dayIndex, (current) => ({ ...current, slots: [createAvailabilitySlot()] }))}><Plus className="h-4 w-4" />添加第一个时间段</button> : null}
      </div>
      {errors.get(day.date) ? <p className="availability-day-error" role="alert">{errors.get(day.date)}</p> : null}
    </section>)}
  </div>;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));
}
