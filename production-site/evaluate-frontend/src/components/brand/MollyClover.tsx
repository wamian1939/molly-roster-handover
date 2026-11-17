import type { CSSProperties } from "react";
import { cx } from "../../lib/format";
import { mollyCloverAsset } from "./brandAssets";

type CloverTone = "current" | "graphite" | "brand" | "white" | "muted";

export function MollyClover({
  size = 32,
  tone = "current",
  animated = false,
  title,
  className,
}: {
  size?: number | string;
  tone?: CloverTone;
  animated?: boolean;
  title?: string;
  className?: string;
}) {
  const style = {
    "--molly-clover-image": `url("${mollyCloverAsset}")`,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cx("molly-clover", `molly-clover-${tone}`, animated && "molly-clover-animated", className)}
      style={style}
    />
  );
}

export function MollyLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cx("molly-logo-lockup group flex min-w-0 items-center gap-3", className)}>
      <span className={cx("molly-logo-mark flex shrink-0 items-center justify-center", compact ? "h-9 w-9 rounded-xl" : "h-10 w-10 rounded-[14px]")}>
        <MollyClover size={compact ? 19 : 22} tone="white" animated />
      </span>
      <span className={cx("min-w-0", !compact && "lg:hidden min-[1360px]:block")}>
        <span className="block truncate text-sm font-semibold text-graphite-950">Evaluate Molly</span>
        <span className="block truncate text-xs text-graphite-500">员工评价系统</span>
      </span>
    </div>
  );
}
