import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cx } from "../../lib/format";
import { motionSpring } from "./motionConfig";

type MotionCardProps = Omit<HTMLMotionProps<"article">, "children"> & {
  children: ReactNode;
  interactive?: boolean;
};

export function MotionCard({ className, children, interactive = true, ...props }: MotionCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const smoothX = useSpring(pointerX, { stiffness: 180, damping: 28 });
  const smoothY = useSpring(pointerY, { stiffness: 180, damping: 28 });
  const spotlight = useMotionTemplate`radial-gradient(340px circle at ${smoothX}% ${smoothY}%, rgba(37, 99, 235, 0.075), transparent 64%)`;

  return (
    <motion.article
      whileHover={!shouldReduceMotion && interactive ? { y: -3, scale: 1.006 } : undefined}
      whileTap={!shouldReduceMotion && interactive ? { scale: 0.995 } : undefined}
      transition={motionSpring}
      onPointerMove={interactive && !shouldReduceMotion ? (event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - bounds.left) / bounds.width) * 100);
        pointerY.set(((event.clientY - bounds.top) / bounds.height) * 100);
      } : undefined}
      className={cx("relative isolate overflow-hidden rounded-2xl bg-white shadow-panel ring-1 ring-graphite-200/80", className)}
      {...props}
    >
      {interactive && !shouldReduceMotion ? <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" style={{ background: spotlight }} /> : null}
      <div className="relative z-[1]">{children}</div>
    </motion.article>
  );
}
