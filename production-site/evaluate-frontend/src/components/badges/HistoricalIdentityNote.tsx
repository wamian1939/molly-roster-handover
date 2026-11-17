import { Info } from "lucide-react";
import type { HistoricalIdentitySources } from "../../types/evaluation";

export function HistoricalIdentityNote({ sources, className = "" }: { sources?: HistoricalIdentitySources | null; className?: string }) {
  if (!sources || Object.values(sources).every((source) => source === "ROUND_CLOSE_SNAPSHOT")) return null;
  const employee = describeSource("员工姓名", sources.employeeName);
  const store = describeSource("门店名称", sources.storeName);
  return <p className={`flex items-start gap-1.5 text-xs leading-5 text-amber-900 ${className}`}>
    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span>旧轮次名称来源：{[employee, store].filter(Boolean).join("；")}。</span>
  </p>;
}

function describeSource(label: string, source: HistoricalIdentitySources["employeeName"]) {
  if (source === "EVALUATION_SNAPSHOT") return `${label}取自个人评价记录`;
  if (source === "CURRENT_PROFILE_FALLBACK") return `${label}暂用当前资料，历史名称未确认`;
  return "";
}
