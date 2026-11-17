import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type ToastTone = "success" | "error";
type ToastInput = { tone: ToastTone; title: string; description?: string; durationMs?: number };
type ToastMessage = ToastInput & { id: number };
type ToastContextValue = { showToast: (toast: ToastInput) => void };

const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const reduce = useReducedMotion();
  const showToast = useCallback((next: ToastInput) => {
    setToast({ ...next, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), toast.durationMs ?? 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex justify-center" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false}>
          {toast ? (
            <motion.div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-graphite-950 px-4 py-3 text-white shadow-lift ring-1 ring-white/10"
            >
              {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />}
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{toast.title}</p>{toast.description ? <p className="mt-0.5 text-xs leading-5 text-graphite-300">{toast.description}</p> : null}</div>
              <button type="button" onClick={() => setToast(null)} className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-graphite-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="关闭通知"><X className="h-4 w-4" aria-hidden="true" /></button>
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
  return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />;
}
