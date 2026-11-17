import type {AgentCalendarPreview} from '../services/multiAgentRepository';
import type {Shift} from '../types/roster';

export function calendarWithAgentPreview(saved:Shift[],preview:AgentCalendarPreview|null,visible:boolean):Shift[]{
  if(!preview||!visible)return saved;
  const kept=new Set(preview.preserved_shift_ids??[]);
  const existing=preview.preserve_existing?saved:saved.filter(s=>s.date<preview.from||s.date>preview.to||kept.has(s.id));
  return [...existing,...preview.shifts];
}
