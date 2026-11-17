import { cx } from "../../lib/format";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { motionSpring } from "../motion/motionConfig";

type RatingControlProps = {
  label: string;
  description: string;
  options: readonly string[];
  valueDescriptions?: readonly string[];
  value: number | null;
  disabled: boolean;
  onChange: (value: number) => void;
};

export function RatingControl({ label, description, options, valueDescriptions, value, disabled, onChange }: RatingControlProps) {
  const reduce = useReducedMotion();
  return (
    <fieldset className="grid gap-3 border-b border-graphite-100 py-5 last:border-b-0 lg:grid-cols-[minmax(180px,0.8fr)_minmax(420px,1.4fr)] lg:items-center lg:gap-6">
      <legend className="sr-only">{label}</legend>
      <div>
        <p className="text-sm font-semibold text-graphite-950">{label}</p>
        <p className="mt-1 max-w-xl text-sm leading-5 text-graphite-600">{description}</p>
        <div className="mt-2 min-h-5" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {value && valueDescriptions?.[value - 1] ? (
              <motion.p
                key={value}
                initial={reduce ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="text-xs font-medium text-signal-teal"
              >
                {valueDescriptions[value - 1]}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-graphite-100 p-1" role="radiogroup" aria-label={label}>
        {options.map((option, index) => {
          const rating = index + 1;
          const selected = value === rating;
          return (
            <motion.button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(rating)}
              whileHover={!reduce && !disabled ? { y: -2, scale: 1.025 } : undefined}
              whileTap={!reduce && !disabled ? { scale: 0.96 } : undefined}
              transition={motionSpring}
              className={cx(
                "relative min-h-11 min-w-0 overflow-hidden rounded-lg px-1 text-xs font-semibold leading-4 transition-colors focus-visible:z-10 sm:px-1.5 sm:text-sm",
                selected
                  ? "text-graphite-950"
                  : "text-graphite-600 hover:bg-white/60 hover:text-graphite-900",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {selected ? <motion.span layoutId={`rating-selection-${label}`} className="absolute inset-0 rounded-lg bg-white shadow-sm ring-1 ring-inset ring-graphite-200" transition={motionSpring} /> : null}
              <span className="relative z-[1] min-w-0 break-words">{option}</span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}
