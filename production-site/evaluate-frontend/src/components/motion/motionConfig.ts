export const motionEase = [0.16, 1, 0.3, 1] as const;

export const motionSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
  mass: 0.72,
};

export const softSpring = {
  type: "spring" as const,
  stiffness: 260,
  damping: 30,
  mass: 0.8,
};

export const pageTransition = { duration: 0.32, ease: motionEase };
