import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/format";
import { GsapScore } from "../motion/GsapScore";
import { MotionCard } from "../motion/MotionCard";

type ScoreCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: "neutral" | "blue" | "teal" | "amber" | "red";
  footer?: ReactNode;
};

const toneStyles = {
  neutral: "bg-white text-graphite-700",
  blue: "bg-blue-50 text-blue-700",
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
};

export function ScoreCard({ label, value, detail, icon: Icon, tone = "neutral", footer }: ScoreCardProps) {
  const animated = parseAnimatedMetric(value);
  return (
    <MotionCard className="group h-full p-5 transition-shadow duration-300 hover:shadow-lift">
      <div className="flex h-full min-h-[8.25rem] flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-graphite-600">{label}</p>
            <p className="mt-2.5 text-3xl font-semibold tracking-[-0.04em] text-graphite-950 tabular-nums">
              {animated ? <><GsapScore value={animated.number} formatter={animated.formatter} /><span>{animated.suffix}</span></> : value}
            </p>
          </div>
          <div className={cx("flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-current/10 transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-105", toneStyles[tone])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        {detail ? <p className="mt-auto pt-3 text-sm text-graphite-500">{detail}</p> : null}
        {footer ? <div className="mt-2.5">{footer}</div> : null}
      </div>
    </MotionCard>
  );
}

function parseAnimatedMetric(value: string | number) {
  if (typeof value === "number") return { number: value, suffix: "", formatter: (current: number) => Number.isInteger(value) ? String(Math.round(current)) : current.toFixed(1) };
  const match = value.match(/^(-?\d+(?:\.\d+)?)(%)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  return {
    number,
    suffix: match[2] ?? "",
    formatter: (current: number) => match[1].includes(".") ? current.toFixed(1) : String(Math.round(current)),
  };
}
