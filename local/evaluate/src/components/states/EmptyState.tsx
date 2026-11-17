import type { LucideIcon } from "lucide-react";
import { SearchX } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

export function EmptyState({ title, description, icon: Icon = SearchX }: EmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-graphite-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-graphite-100 text-graphite-600 ring-1 ring-graphite-200">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-graphite-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-graphite-600">{description}</p>
    </div>
  );
}
