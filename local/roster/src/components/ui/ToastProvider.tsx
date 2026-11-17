import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Toast = { tone: "success" | "error" | "info"; title: string; description?: string; durationMs?: number };
type ToastMessage = Toast & { id: number };
type ToastContextValue = { showToast: (toast: Toast) => void };
const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const reduce = useReducedMotion();
  const showToast = useCallback((next: Toast) => setToast({ ...next, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((value) => value?.id === toast.id ? null : value), toast.durationMs ?? 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex justify-center" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false}>
          {toast ? (
            <motion.div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-graphite-950 px-4 py-3 text-white shadow-lift"
            >
              {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /> : toast.tone === "error" ? <AlertCircle className="mt-0.5 h-5 w-5 text-red-300" /> : <Info className="mt-0.5 h-5 w-5 text-blue-300" />}
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{toast.title}</p>{toast.description ? <p className="mt-0.5 text-xs text-graphite-300">{toast.description}</p> : null}</div>
              <button type="button" onClick={() => setToast(null)} className="grid h-11 w-11 place-items-center rounded-lg text-graphite-300 hover:bg-white/10" aria-label="关闭通知"><X className="h-4 w-4" /></button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() { return useContext(ToastContext); }

export function InlineSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />;
}
