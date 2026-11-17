import type { ReactNode } from "react";
import { MotionPage } from "../motion/MotionPage";

export function PageContainer({ children }: { children: ReactNode }) {
  return <MotionPage>{children}</MotionPage>;
}
