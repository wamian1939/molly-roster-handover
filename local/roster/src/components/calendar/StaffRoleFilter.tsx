import { Check, UsersRound } from "lucide-react";
import { useId } from "react";
import { roleColorStyle } from "../../lib/roleColor";
import type { ShiftRole } from "../../types/roster";

export function StaffRoleFilter({ roles, values, onChange }: { roles: ShiftRole[]; values: string[]; onChange: (roleIds: string[]) => void }) {
  const helpId = useId();
  const selected = new Set(values);

  function toggle(roleId: string) {
    onChange(selected.has(roleId) ? values.filter((id) => id !== roleId) : [...values, roleId]);
  }

  return (
    <fieldset className="staff-role-filter" aria-describedby={helpId}>
      <legend className="staff-role-filter-legend">按班次技能需求筛选</legend>
      <p id={helpId} className="staff-role-filter-help">多选 · 依据当前技能匹配任一所选班次角色；正式岗位资格需单独核对，筛选不会改变上方班次角色。</p>
      <div className="staff-role-filter-list">
        <button type="button" className={`staff-role-filter-all${values.length ? "" : " is-selected"}`} aria-pressed={!values.length} onClick={() => onChange([])}>
          <UsersRound className="h-4 w-4" aria-hidden="true" />全部员工
        </button>
        {roles.map((role) => {
          const checked = selected.has(role.id);
          return (
            <label key={role.id} className={`staff-role-filter-chip${checked ? " is-selected" : ""}`} style={roleColorStyle(role)}>
              <input className="sr-only" type="checkbox" checked={checked} onChange={() => toggle(role.id)} />
              <span className="staff-role-filter-dot" aria-hidden="true" />
              <span>{role.nameZh}</span>
              <span className="staff-role-filter-check" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
