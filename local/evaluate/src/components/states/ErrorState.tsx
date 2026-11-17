import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

type ErrorStateProps = {
  title: string;
  description: string;
};

export function ErrorState({ title, description }: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-600 ring-1 ring-red-100">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-red-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-red-800">{description}</p>
      <Link
        to="/evaluations"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800"
      >
        返回工作台
      </Link>
    </div>
  );
}
