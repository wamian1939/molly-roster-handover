import type { HTMLMotionProps } from "framer-motion";
import { motion, useReducedMotion } from "framer-motion";
import { Children, isValidElement, type ReactNode } from "react";
import { cx } from "../../lib/format";
import { pageTransition } from "./motionConfig";

type MotionPageProps = Omit<HTMLMotionProps<"div">, "children"> & { children: ReactNode };

export function MotionPage({ className, children, ...props }: MotionPageProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={pageTransition}
      className={cx("space-y-6", className)}
      {...props}
    >
      {Children.map(children, (child, index) => (
        <motion.div
          key={isValidElement(child) && child.key ? child.key : index}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.045 + index * 0.055, ease: [0.16, 1, 0.3, 1] }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
