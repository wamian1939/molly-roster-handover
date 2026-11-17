import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "framer-motion";

gsap.registerPlugin(useGSAP);

type GsapScoreProps = {
  value: number;
  className?: string;
  duration?: number;
  formatter?: (value: number) => string;
};

function defaultFormatter(value: number) {
  return Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

export function GsapScore({ value, className, duration = 0.65, formatter = defaultFormatter }: GsapScoreProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const currentValueRef = useRef(value);
  const shouldReduceMotion = useReducedMotion();

  useGSAP(
    () => {
      const node = ref.current;
      if (!node) return;

      if (shouldReduceMotion) {
        node.textContent = formatter(value);
        return;
      }

      const state = { value: currentValueRef.current };
      node.textContent = formatter(state.value);
      const tween = gsap.to(state, {
        value,
        duration,
        ease: "power3.out",
        onUpdate: () => {
          node.textContent = formatter(state.value);
        },
        onComplete: () => {
          currentValueRef.current = value;
          node.textContent = formatter(value);
        },
      });

      return () => tween.kill();
    },
    { dependencies: [duration, formatter, shouldReduceMotion, value], scope: ref },
  );

  return (
    <span ref={ref} className={className}>
      {formatter(value)}
    </span>
  );
}
