import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cx } from "../../lib/format";
import { GsapScore } from "./GsapScore";
import { motionEase, motionSpring, softSpring } from "./motionConfig";

type ScoreOrbProps = {
  score: number | null;
  tier?: string | null;
  label?: string;
  size?: "md" | "lg";
  completed?: boolean;
  className?: string;
};

const tierTone: Record<string, { stroke: string; glow: string; badge: string }> = {
  T1: { stroke: "#10b981", glow: "rgba(16,185,129,.22)", badge: "bg-emerald-400/15 text-emerald-100 ring-emerald-300/25" },
  T2: { stroke: "#38bdf8", glow: "rgba(56,189,248,.2)", badge: "bg-sky-400/15 text-sky-100 ring-sky-300/25" },
  T3: { stroke: "#f59e0b", glow: "rgba(245,158,11,.18)", badge: "bg-amber-400/15 text-amber-100 ring-amber-300/25" },
  T4: { stroke: "#fb7185", glow: "rgba(251,113,133,.16)", badge: "bg-rose-400/15 text-rose-100 ring-rose-300/25" },
  T5: { stroke: "#94a3b8", glow: "rgba(148,163,184,.15)", badge: "bg-slate-400/15 text-slate-100 ring-slate-300/25" },
};

export function ScoreOrb({ score, tier, label = "综合评分", size = "lg", completed = false, className }: ScoreOrbProps) {
  const reduce = useReducedMotion();
  const normalized = score == null ? 0 : Math.max(0, Math.min(100, score));
  const tone = tierTone[tier ?? ""] ?? { stroke: "#5eead4", glow: "rgba(45,212,191,.18)", badge: "bg-white/10 text-white ring-white/15" };
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <motion.div
      animate={completed && !reduce ? { boxShadow: [`0 0 0 ${tone.glow}`, `0 0 42px ${tone.glow}`, `0 0 0 ${tone.glow}`] } : undefined}
      transition={{ duration: 0.7, ease: motionEase }}
      className={cx("relative isolate flex shrink-0 items-center justify-center rounded-full", size === "lg" ? "h-44 w-44" : "h-36 w-36", className)}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="7" />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduce ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - normalized / 100) }}
          transition={reduce ? { duration: 0 } : softSpring}
          style={{ filter: `drop-shadow(0 0 7px ${tone.glow})` }}
        />
      </svg>
      <div className="relative z-10 text-center tabular-nums">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-graphite-300">{label}</p>
        <p className={cx("mt-1 font-semibold leading-none tracking-[-0.04em] text-white", size === "lg" ? "text-4xl" : "text-3xl")}>
          {score == null ? "-" : <GsapScore value={score} formatter={(value) => value.toFixed(1)} />}
        </p>
        <AnimatePresence mode="wait" initial={false}>
          {tier ? (
            <motion.span
              key={tier}
              initial={reduce ? false : { opacity: 0, scale: 0.84, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.9, y: -3 }}
              transition={motionSpring}
              className={cx("mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-bold ring-1", tone.badge)}
            >
              {tier}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
