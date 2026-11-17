import type { PresetScriptInput } from "../services/rosterRepository";

export type ScriptEmployeeTarget = { id: string; displayName: string };

export function buildPresetScriptInput(storeId: string, week: "CURRENT" | "NEXT", script: string,
  employeeMappings: Record<string, string>, employeeTarget: ScriptEmployeeTarget | null): PresetScriptInput {
  if (employeeTarget) return {
    storeId, week, script: `${employeeTarget.displayName}\t${script.trim()}`,
    employeeMappings: [{ nickname: employeeTarget.displayName, employeeId: employeeTarget.id }],
  };
  return { storeId, week, script,
    employeeMappings: Object.entries(employeeMappings).filter(([, employeeId]) => employeeId)
      .map(([nickname, employeeId]) => ({ nickname, employeeId })) };
}
