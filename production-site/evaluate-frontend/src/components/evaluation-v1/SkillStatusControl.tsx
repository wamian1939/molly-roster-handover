import { Check, CircleMinus, Clock3, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cx } from "../../lib/format";
import type { SkillModeV1, SkillPresentationStatus, SkillStatusV1 } from "../../types/evaluation";
import { skillStatusLabels } from "./skillPresentation";
import { motionSpring } from "../motion/motionConfig";

const options: Array<{ value: SkillStatusV1; label: string }> = [
  { value: "NotTrained", label: skillStatusLabels.NotTrained },
  { value: "Training", label: skillStatusLabels.Training },
  { value: "Independent", label: skillStatusLabels.Independent },
  { value: "Proficient", label: skillStatusLabels.Proficient },
];
const binaryOptions: Array<{ value: SkillPresentationStatus; label: string }> = [
  { value: "Unknown", label: "未确认" },
  { value: "CannotDo", label: "不会" },
  { value: "CanDo", label: "会" },
];

const selectedStatusStyles: Record<SkillPresentationStatus, string> = {
  Unknown: "border-amber-600 bg-amber-50 text-amber-900",
  NotTrained: "border-graphite-700 bg-graphite-700 text-white",
  Training: "border-amber-700 bg-amber-700 text-white",
  Independent: "border-blue-700 bg-blue-700 text-white",
  Proficient: "border-emerald-700 bg-emerald-700 text-white",
  CannotDo: "border-graphite-700 bg-graphite-700 text-white",
  CanDo: "border-emerald-700 bg-emerald-700 text-white",
};

type SkillStatusControlProps = {
  label: string;
  value: SkillPresentationStatus;
  disabled: boolean;
  skillMode?: SkillModeV1;
  onChange: (value: SkillPresentationStatus) => void;
};

export function SkillStatusControl({ label, value, disabled, skillMode = "PROGRESSIVE", onChange }: SkillStatusControlProps) {
  const reduce = useReducedMotion();
  const visibleOptions = skillMode === "BINARY" ? binaryOptions : options;
  return (
    <div className={cx("grid gap-1.5", skillMode === "BINARY" ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")} role="radiogroup" aria-label={`${label}技能状态`}>
        {visibleOptions.map((option) => {
          const selected = value === option.value;
          return (
            <motion.button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              whileHover={!reduce && !disabled ? { y: -1, scale: 1.018 } : undefined}
              whileTap={!reduce && !disabled ? { scale: 0.965 } : undefined}
              animate={{
                boxShadow: selected && (option.value === "Independent" || option.value === "Proficient") && !reduce
                  ? "0 0 16px rgba(16,185,129,.12)"
                  : "0 0 0 rgba(16,185,129,0)",
              }}
              transition={{ ...motionSpring, boxShadow: { duration: 0.25, ease: "easeOut" } }}
              className={cx(
                "relative flex min-h-11 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-lg border px-2 text-xs font-semibold transition-colors",
                selected && selectedStatusStyles[option.value],
                !selected && "border-transparent bg-graphite-50 text-graphite-500 hover:border-graphite-200 hover:text-graphite-800",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {selected ? <motion.span layoutId={`skill-selection-${label}`} className="pointer-events-none absolute inset-0 z-0 rounded-lg ring-2 ring-inset ring-white/35" transition={motionSpring} /> : null}
              <AnimatePresence mode="wait" initial={false}>
                {selected ? <motion.span key={option.value} initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={motionSpring} className="relative z-[1]">{statusIcon(option.value)}</motion.span> : null}
              </AnimatePresence>
              <span className="relative z-[1] min-w-0 break-words">{option.label}</span>
            </motion.button>
          );
        })}
    </div>
  );
}

function statusIcon(status: SkillPresentationStatus) {
  if (status === "Training") return <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (status === "Independent") return <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (status === "Proficient") return <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (status === "CanDo") return <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  return <CircleMinus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}
