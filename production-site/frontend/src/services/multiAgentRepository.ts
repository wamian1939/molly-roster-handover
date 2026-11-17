import { apiRequest } from "../lib/apiClient";
import type {Shift} from '../types/roster';
export type AgentCalendarPreview={preserved_shift_ids?:string[];run_id:string;from:string;to:string;preserve_existing:boolean;version:number;accepted_dates:string[];shifts:Shift[];saved:false};

export type AgentShift = { id: string; employee_id: string; date: string; pattern_name: string; role_code: string; start: string; end: string; reason: string; fixed: boolean };
export type AgentSlot = { date: string; start: string; end: string; required: number; scheduled: number; difference: number; employee_ids: string[] };
export type TargetRow = { employee_id: string; employee_name: string; rating: number | null; available_minutes: number; target_fraction: number | null; target_scheduled_minutes: number | null; target_assigned_minutes?: number; actual_fraction?: number | null };
export type AgentLedger = { version: number; employees: Array<{ employee_id: string; rating: number | null; shift_count: number; total_scheduled_minutes: number }> };
export type AgentEvent = { coverage?:AgentSlot[];attempt?:number;step?:number;employee_name?:string;pattern?:string;errors?:Array<{code?:string;message?:string}>;report?:{valid:boolean;errors:Array<{code?:string;message:string}>}; kind: string; agent?: string; date?: string; time: string; ledger?: AgentLedger; assignments?: AgentShift[] };
export type AgentContext = { days: Array<{ date: string }>; employees: Array<{ id: string; name: string; score: number | null }>; rating_hour_targets: TargetRow[] };
export type BusinessReport = { rows: TargetRow[]; mandatory_coverage: Array<{ date: string; employee_name: string; start: string; end: string; satisfied: boolean }> };
export type AgentResult = { incomplete_dates?:string[];run_id: string; status: string; context: AgentContext | null; assignments: AgentShift[]; ledger: AgentLedger; business_rule_report: BusinessReport | null; validation: { valid: boolean; coverage: AgentSlot[]; errors: Array<{ code: string; message: string; date?: string }> }; failed_days: Array<{ date: string; reason?:string;errors?:DiagnosticConflict[];coverage?:AgentSlot[] }>; calendar: unknown; publishable: false };
export type AgentRun = { calendar_preview?:AgentCalendarPreview; calendar_write?:{status:'PENDING'|'APPLIED'|'FAILED';message?:string;receipt?:{created:number;deleted:number}}|null; status: string; result: AgentResult | null; events: AgentEvent[]; history: Array<{ date: string; ledger: AgentLedger }>; error?: string; timezone?: string; preview_coverage?: AgentSlot[]; employees?: Array<{ id: string; name: string; score: number | null }>; allocation_report?: BusinessReport; start_date?: string; end_date?: string };
export type DiagnosticConflict = { code: string; start?: string; end?: string; required?: number; eligible_employee_ids?: string[]; fixed_employee_ids?: string[]; available_employee_ids?: string[]; message?: string; periods?: string[]; required_period_coverage?: number; maximum_period_coverage?: number; slot_count?: number };
export type AgentPreview = { rules: { version: string; timezone: string }; context: AgentContext; snapshot_version: string; employees: Array<{ id: string; name: string; score: number | null }>; availability_count: number; existing_shift_count: number; detached_existing_count: number; preserve_existing: boolean; rating_source: string; source_diagnostics: Array<{ date: string; proven_slot_conflicts: DiagnosticConflict[]; conflict_groups?: DiagnosticConflict[] }> };
const base = "/multi-agent";
export type AgentRuleWeek=Record<string,Array<{start:string;end:string;staff:number}>>;
export type AgentRuleSettings={needs_review?:boolean;store_id:string;week_start:string;timezone:string;base_rule_version:string;effective_rule_version:string;default_version:number;week_version:number;effective_scope:'DEFAULT'|'WEEK';weekly:AgentRuleWeek;default_weekly:AgentRuleWeek;week_weekly:AgentRuleWeek|null;business_rules:{rating_hours:unknown;mandatory_coverage:Array<{label:string}>}|null};
export const multiAgentRepository = {
  health: () => apiRequest<{ ok: boolean; provider_configured: boolean }>(`${base}/health`),
  inputs: (storeId: string, startDate: string, endDate: string, preserveExisting: boolean) => apiRequest<AgentPreview>(`${base}/inputs?${new URLSearchParams({ storeId, startDate, endDate, preserveExisting: String(preserveExisting) })}`),
  start: (storeId: string, startDate: string, endDate: string, preserveExisting: boolean, preview: AgentPreview,writeToCalendar=false) => apiRequest<{ run_id: string; status: string }>(`${base}/runs`, { method: "POST", body: JSON.stringify({ storeId, startDate, endDate, preserveExisting, expectedRuleVersion: preview.rules.version, expectedSnapshotVersion: preview.snapshot_version,writeToCalendar }) }),
  rules:(storeId:string,weekStart:string)=>apiRequest<AgentRuleSettings>(`${base}/rules?${new URLSearchParams({storeId,weekStart})}`),
  saveRules:(body:{storeId:string;scope:'DEFAULT'|'WEEK';weekStart:string|null;expectedVersion:number;baseRuleVersion:string;weekly:AgentRuleWeek})=>apiRequest<{saved:true;version:number;scope:'DEFAULT'|'WEEK';store_id:string}>(`${base}/rules`,{method:'POST',body:JSON.stringify(body)}),
  apply:(storeId:string,id:string)=>apiRequest<{applied:true;created:number;deleted:number}>(`${base}/runs/${id}/apply`,{method:'POST',body:JSON.stringify({storeId})}),
  recentRun:(storeId:string)=>apiRequest<{run:{run_id:string;start_date:string;end_date:string}|null}>(`${base}/recent-run?${new URLSearchParams({storeId})}`),
  status: (storeId: string, id: string) => apiRequest<AgentRun>(`${base}/runs/${encodeURIComponent(id)}?${new URLSearchParams({ storeId })}`),
  latest: (storeId: string) => apiRequest<AgentRun>(`${base}/latest?${new URLSearchParams({ storeId })}`),
  export: (storeId: string, id: string) => apiRequest<AgentResult>(`${base}/runs/${encodeURIComponent(id)}/export?${new URLSearchParams({ storeId })}`),
};
