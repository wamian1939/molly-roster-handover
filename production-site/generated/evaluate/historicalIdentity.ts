export type HistoricalIdentitySource = "ROUND_CLOSE_SNAPSHOT" | "EVALUATION_SNAPSHOT" | "CURRENT_PROFILE_FALLBACK";

type EvaluationLabels = { employeeNameSnapshot: string | null; storeNameSnapshot: string | null };

export function resolveHistoricalIdentity(
  round: { employeeDisplayNameSnapshot: string | null; storeNameSnapshot: string | null; employee: { displayName: string }; store: { name: string }; evaluations: EvaluationLabels[] },
) {
  const employee = resolveLabel(round.employeeDisplayNameSnapshot, round.evaluations.map((evaluation) => evaluation.employeeNameSnapshot), round.employee.displayName);
  const store = resolveLabel(round.storeNameSnapshot, round.evaluations.map((evaluation) => evaluation.storeNameSnapshot), round.store.name);
  return {
    employeeName: employee.value,
    storeName: store.value,
    identitySources: { employeeName: employee.source, storeName: store.source },
  };
}

function resolveLabel(closeSnapshot: string | null, evaluationSnapshots: Array<string | null>, current: string): { value: string; source: HistoricalIdentitySource } {
  if (closeSnapshot?.trim()) return { value: closeSnapshot, source: "ROUND_CLOSE_SNAPSHOT" };
  const distinct = [...new Set(evaluationSnapshots.filter((value): value is string => Boolean(value?.trim())))];
  if (distinct.length === 1) return { value: distinct[0]!, source: "EVALUATION_SNAPSHOT" };
  return { value: current, source: "CURRENT_PROFILE_FALLBACK" };
}
