import type { Location } from "react-router-dom";
import type { EmployeeType } from "../types/evaluation";

export type EvaluationNavigationSource = "employee-list" | "employee-management" | "round-detail" | "employee-detail" | "evaluation-history";

export type EvaluationNavigationState = {
  source?: EvaluationNavigationSource;
  returnTo?: string;
};

export type EvaluationBackTarget = {
  path: string;
  label: string;
};

export function withEvaluationNavigation(
  target: string,
  location: Pick<Location, "pathname" | "search">,
  source: EvaluationNavigationSource,
) {
  const returnTo = `${location.pathname}${location.search}`;
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  params.set("source", source);
  return {
    to: `${target}?${params.toString()}`,
    state: { returnTo, source } satisfies EvaluationNavigationState,
  };
}

export function forwardEvaluationNavigation(
  target: string,
  search: string,
  state: unknown,
) {
  const context = readNavigationContext(search, state);
  const params = new URLSearchParams();
  if (context.returnTo) params.set("returnTo", context.returnTo);
  if (context.source) params.set("source", context.source);
  const query = params.toString();
  return {
    to: query ? `${target}?${query}` : target,
    state: context,
  };
}

export function resolveEvaluationBackTarget(options: {
  search: string;
  state: unknown;
  storeId: string;
  employeeType: EmployeeType;
}) : EvaluationBackTarget {
  const context = readNavigationContext(options.search, options.state);
  const path = context.returnTo ?? employeeListPath(options.storeId, options.employeeType);
  return { path, label: returnLabel(path, context.source, options.employeeType) };
}

export function isSafeInternalReturnPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "https://evaluate-molly.local");
    return parsed.origin === "https://evaluate-molly.local" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

function readNavigationContext(search: string, state: unknown): EvaluationNavigationState {
  const candidate = typeof state === "object" && state !== null ? state as Record<string, unknown> : {};
  const params = new URLSearchParams(search);
  const stateReturnTo = isSafeInternalReturnPath(candidate.returnTo) ? candidate.returnTo : undefined;
  const queryReturnTo = isSafeInternalReturnPath(params.get("returnTo")) ? params.get("returnTo")! : undefined;
  const stateSource = isNavigationSource(candidate.source) ? candidate.source : undefined;
  const querySource = isNavigationSource(params.get("source")) ? params.get("source") as EvaluationNavigationSource : undefined;
  return { returnTo: stateReturnTo ?? queryReturnTo, source: stateSource ?? querySource };
}

function isNavigationSource(value: unknown): value is EvaluationNavigationSource {
  return value === "employee-list" || value === "employee-management" || value === "round-detail" || value === "employee-detail" || value === "evaluation-history";
}

function employeeListPath(storeId: string, employeeType: EmployeeType) {
  return `/evaluations/stores/${encodeURIComponent(storeId)}/employees/${employeeType.toLowerCase()}`;
}

function returnLabel(path: string, source: EvaluationNavigationSource | undefined, employeeType: EmployeeType) {
  if (source === "round-detail" || /^\/evaluation-rounds\/[^/]+/.test(path)) return "返回本轮汇总";
  if (source === "employee-management" || path === "/employees" || path.startsWith("/employees?")) return "返回员工管理";
  if (source === "employee-detail" || /^\/employees\/[^/]+/.test(path)) return "返回员工档案";
  if (source === "evaluation-history" || path.startsWith("/evaluations/history")) return "返回评价历史";
  if (/\/employees\/training(?:[/?#]|$)/.test(path)) return "返回培训员工";
  if (/\/employees\/regular(?:[/?#]|$)/.test(path)) return "返回正式员工";
  return employeeType === "TRAINING" ? "返回培训员工" : "返回正式员工";
}
