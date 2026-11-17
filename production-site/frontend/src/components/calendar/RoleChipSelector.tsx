import { Check } from "lucide-react";
import { useId } from "react";
import { roleColor, roleColorStyle } from "../../lib/roleColor";
import type { ShiftRole } from "../../types/roster";

export function RoleChipSelector({ roles, value, onChange }: { roles: ShiftRole[]; value: string; onChange: (roleId: string) => void }) {
  const helpId = useId();

  return (
    <fieldset className="role-chip-fieldset" aria-describedby={helpId}>
      <legend className="role-chip-legend">班次岗位</legend>
      <p id={helpId} className="role-chip-help">选哪个岗位，就按哪个岗位筛人并保存班次；员工的其他岗位不影响本次排班。</p>
      {!roles.length ? <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">当前门店没有已核对的可排班岗位。请核对 Evaluate 正式岗位及本店 Roster 岗位设置。</p> : null}
      <div className="role-chip-list">
        {roles.map((role) => {
          const selected = role.id === value;
          return (
            <label
              key={role.id}
              className={`role-chip${selected ? " role-chip--selected" : ""}`}
              style={roleColorStyle(role)}
            >
              <input
                className="sr-only"
                type="radio"
                name="shift-role"
                value={role.id}
                checked={selected}
                onChange={() => onChange(role.id)}
                aria-label={role.nameZh}
              />
              <span className="role-chip-swatch" style={{ backgroundColor: roleColor(role) }} aria-hidden="true" />
              <span className="role-chip-copy">
                <strong>{role.nameZh}</strong>
                <small aria-hidden="true">{selected ? "当前岗位" : "选择岗位"}</small>
              </span>
              <span className="role-chip-check-shell" aria-hidden="true">
                <Check className="role-chip-check" />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
