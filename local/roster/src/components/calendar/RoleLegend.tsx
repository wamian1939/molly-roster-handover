import { roleColorStyle } from "../../lib/roleColor";
import type { ShiftRole } from "../../types/roster";

export function RoleLegend({ roles }: { roles: ShiftRole[] }) {
  if (!roles.length) return null;
  return (
    <section className="role-legend" aria-label={`当前门店启用岗位，共 ${roles.length} 个`}>
      <span className="role-legend-title">岗位颜色</span>
      <div className="role-legend-list">
        {roles.map((role) => (
          <span key={role.id} className="role-legend-item" style={roleColorStyle(role)}>
            <span className="role-legend-dot" aria-hidden="true" />
            {role.nameZh}
          </span>
        ))}
      </div>
    </section>
  );
}
