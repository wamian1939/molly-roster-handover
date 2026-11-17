import type { EmployeeType, SkillPresentationStatus } from "../types/evaluation";

export const employeeTypePresentation: Record<EmployeeType, { label: string; shortLabel: string; description: string; evaluationLabel: string; standardLabel: string }> = {
  TRAINING: { label: "培训员工", shortLabel: "培训", description: "当前仍处于培训阶段的员工", evaluationLabel: "培训员工评价", standardLabel: "培训员工评分标准" },
  REGULAR: { label: "正式员工", shortLabel: "正式", description: "已完成培训并进入正式岗位的员工", evaluationLabel: "正式员工评价", standardLabel: "正式员工评分标准" },
};

export const skillStatusPresentation: Record<SkillPresentationStatus, {
  label: string;
  shortLabel: string;
  style: string;
  compactStyle: string;
}> = {
  Unknown: {
    label: "未确认",
    shortLabel: "?",
    style: "border-graphite-300 bg-white text-graphite-600",
    compactStyle: "bg-white text-graphite-600 ring-graphite-300",
  },
  NotTrained: {
    label: "未培训",
    shortLabel: "—",
    style: "border-graphite-300 bg-graphite-100 text-graphite-800",
    compactStyle: "bg-graphite-100 text-graphite-700 ring-graphite-200",
  },
  Training: {
    label: "培训中",
    shortLabel: "培训",
    style: "border-amber-300 bg-amber-50 text-amber-900",
    compactStyle: "bg-amber-50 text-amber-900 ring-amber-200",
  },
  Independent: {
    label: "可独立",
    shortLabel: "独立",
    style: "border-blue-300 bg-blue-50 text-blue-800",
    compactStyle: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  Proficient: {
    label: "熟练",
    shortLabel: "熟练",
    style: "border-emerald-300 bg-emerald-50 text-emerald-800",
    compactStyle: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  CannotDo: {
    label: "不会",
    shortLabel: "—",
    style: "border-graphite-300 bg-graphite-100 text-graphite-700",
    compactStyle: "bg-graphite-100 text-graphite-700 ring-graphite-200",
  },
  CanDo: {
    label: "会",
    shortLabel: "✓",
    style: "border-emerald-300 bg-emerald-50 text-emerald-800",
    compactStyle: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
};

export const categoryLabels: Record<string, string> = {
  BackKitchen: "后厨",
  "Back Kitchen": "后厨",
  Bar: "水吧",
  Front: "前场",
  Operations: "操作能力",
};

export function employmentTypeLabel(value: string) {
  if (value === "FullTime" || value === "Full-time") return "全职";
  if (value === "PartTime" || value === "Part-time") return "兼职";
  if (value === "Casual") return "Casual";
  return value;
}
