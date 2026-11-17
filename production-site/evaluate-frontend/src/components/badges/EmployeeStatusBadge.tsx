import { Archive, CheckCircle2 } from "lucide-react";
import { cx } from "../../lib/format";
import type { EmployeeStatus } from "../../types/evaluation";

const tone: Record<EmployeeStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Archived: "bg-graphite-100 text-graphite-600 ring-graphite-200",
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const Icon = status === "Active" ? CheckCircle2 : Archive;

  return (
    <span className={cx("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ring-1", tone[status])}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {status === "Active" ? "在职" : "已归档"}
    </span>
  );
}
