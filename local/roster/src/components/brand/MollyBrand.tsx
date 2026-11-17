import type { CSSProperties } from "react";
import cloverAsset from "../../assets/molly-clover.png";

export function MollyClover({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="molly-clover"
      style={{ "--molly-clover-image": `url(${cloverAsset})`, width: size, height: size } as CSSProperties}
    />
  );
}

export function MollyBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="molly-logo-lockup flex min-w-0 items-center gap-3">
      <span className="molly-logo-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]">
        <MollyClover size={compact ? 19 : 22} />
      </span>
      <span className={compact ? "min-w-0" : "min-w-0 lg:hidden min-[1360px]:block"}>
        <span className="block truncate text-sm font-semibold text-graphite-950">Molly Roster</span>
        <span className="block truncate text-xs text-graphite-500">茉莉排班系统</span>
      </span>
    </div>
  );
}

