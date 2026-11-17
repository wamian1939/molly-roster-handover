import { Children, isValidElement, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cx } from "../../lib/format";

type MotionListProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  itemClassName?: string;
};

export function MotionList({ children, className, itemClassName, ...props }: MotionListProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <motion.div className={className} {...props}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.045, delayChildren: 0.03 },
        },
      }}
      className={className}
      {...props}
    >
      {Children.map(children, (child, index) => (
        <motion.div
          key={isValidElement(child) && child.key ? child.key : index}
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
          }}
          className={cx("h-full min-w-0", itemClassName)}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
