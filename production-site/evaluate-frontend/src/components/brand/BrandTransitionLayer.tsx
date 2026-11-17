import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";
import { MollyClover } from "./MollyClover";

export function BrandTransitionLayer({ mode, onComplete }: { mode: "intro" | "success"; onComplete?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useGSAP(() => {
    const curtain = curtainRef.current;
    const mark = markRef.current;
    if (!curtain || !mark) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealDuration = mode === "intro" ? 0.42 : 0.34;
    const markDuration = mode === "intro" ? 0.3 : 0.18;
    const markExitDuration = mode === "intro" ? 0.28 : 0.2;
    const timeline = gsap.timeline({
      onComplete: () => {
        setVisible(false);
        onComplete?.();
      },
    });

    if (reduced) {
      timeline.to(root.current, { opacity: 0, duration: 0.16, ease: "power1.out" });
      return;
    }

    timeline.fromTo(
      mark,
      { autoAlpha: 0, scale: 0.84, filter: "blur(5px)" },
      { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: markDuration, ease: "back.out(1.22)" },
    );

    timeline
      .to(mark, { autoAlpha: 0, scale: 1.34, filter: "blur(8px)", duration: markExitDuration, ease: "power3.in" }, mode === "intro" ? "+=.02" : "+=0")
      .to(curtain, { opacity: 0, duration: revealDuration, ease: "power3.inOut" }, "<+.08");
  }, { scope: root, dependencies: [mode] });

  if (!visible) return null;

  return (
    <div ref={root} className="brand-transition-layer" aria-hidden="true">
      <div ref={curtainRef} data-brand-curtain className="brand-transition-curtain" />
      <div ref={markRef} data-brand-mark className="brand-transition-mark"><MollyClover size={76} tone="white" /></div>
    </div>
  );
}
