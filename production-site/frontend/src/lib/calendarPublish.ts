import type { Shift, ShiftRole } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";

/** Visible preflight for conditions that the publish API will always reject. */
export function calendarPublishBlockers(
  shifts: Shift[],
  roles: ShiftRole[],
  employees: RosterEmployee[],
  storeId: string,
): string[] {
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const blockers: string[] = [];

  for (const shift of shifts) {
    const role = roleById.get(shift.shiftRoleId);
    if (!role || role.isActive === false || (role.storeId !== null && role.storeId !== storeId)) {
      blockers.push(`${shift.date} · 岗位「${shift.roleNameSnapshot}」不在当前门店正式岗位清单中，请编辑班次更换岗位`);
    }
    if (!shift.assignments.length) {
      blockers.push(`${shift.date} · 存在未分配员工的班次，请编辑班次`);
    }
    for (const assignment of shift.assignments) {
      const employee = employeeById.get(assignment.employeeId);
      if (!employee || !employee.isActive || employee.storeId !== storeId) {
        blockers.push(`${shift.date} · ${assignment.employeeNameSnapshot} 已不在当前门店在职名单，请编辑班次调整员工`);
      }
    }
  }

  return [...new Set(blockers)];
}
