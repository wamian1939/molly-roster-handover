import { MollyClover } from "./MollyClover";

export function BrandLoader({ label = "正在验证登录状态" }: { label?: string }) {
  return (
    <div className="brand-loader" role="status" aria-live="polite">
      <div className="brand-loader-mark" aria-hidden="true">
        {[0, 1, 2, 3].map((leaf) => (
          <span key={leaf} className={`brand-loader-leaf brand-loader-leaf-${leaf}`}>
            <MollyClover size={52} tone="brand" />
          </span>
        ))}
      </div>
      <p>{label}</p>
    </div>
  );
}
