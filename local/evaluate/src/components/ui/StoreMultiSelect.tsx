import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/format";

type StoreOption = { id: string; name: string };

export function StoreMultiSelect({
  stores,
  value,
  onChange,
  disabled = false,
  label = "可管理门店",
  error,
}: {
  stores: StoreOption[];
  value: string[];
  onChange: (storeIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  error?: string | null;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const listboxId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320 });
  const selected = useMemo(() => stores.filter((store) => value.includes(store.id)), [stores, value]);
  const filtered = useMemo(() => stores.filter((store) => store.name.toLowerCase().includes(query.trim().toLowerCase())), [query, stores]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const panelHeight = Math.min(360, window.innerHeight - 24);
      const below = rect.bottom + 8;
      const top = below + panelHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - panelHeight - 8);
      setPosition({ left, top, width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function toggle(storeId: string) {
    onChange(value.includes(storeId) ? value.filter((id) => id !== storeId) : [...value, storeId]);
  }

  function focusOption(index: number) {
    const options = panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    options?.[index]?.focus();
  }

  function onOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const last = filtered.length - 1;
      focusOption(event.key === "Home" ? 0 : event.key === "End" ? last : (index + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) inputRef.current?.focus();
      else {
        setOpen(false);
        triggerRef.current?.focus();
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(filtered[index].id);
    }
  }

  return (
    <div className="min-w-0">
      <span id={labelId} className="mb-1.5 block text-sm font-medium text-graphite-700">{label}</span>
      {selected.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="已选门店">
          {selected.map((store) => (
            <span key={store.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-brand-100 px-2.5 py-1.5 text-xs font-semibold text-brand-900">
              <span className="truncate">{store.name}</span>
              <button type="button" onClick={() => toggle(store.id)} disabled={disabled} aria-label={`移除 ${store.name}`} className="rounded p-0.5 hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-labelledby={labelId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        className={cx("flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-sm font-semibold transition", error ? "border-red-400" : "border-graphite-300 hover:border-graphite-400", disabled && "cursor-not-allowed bg-graphite-100 text-graphite-500")}
      >
        <span className={value.length ? "text-graphite-950" : "text-graphite-500"}>{value.length ? `已选择 ${value.length} 家门店` : "添加门店"}</span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {error ? <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-700">{error}</p> : null}
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} style={{ left: position.left, top: position.top, width: position.width }} className="fixed z-[90] max-h-[min(360px,calc(100dvh-24px))] overflow-hidden rounded-xl border border-graphite-200 bg-white shadow-xl">
          <div className="border-b border-graphite-100 p-2.5">
            <label className="flex h-10 items-center gap-2 rounded-lg bg-graphite-50 px-3 text-graphite-600 focus-within:ring-2 focus-within:ring-brand-600">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">搜索门店</span>
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  focusOption(event.key === "ArrowDown" ? 0 : filtered.length - 1);
                }
              }} aria-controls={listboxId} placeholder="搜索门店" className="min-w-0 flex-1 bg-transparent text-sm text-graphite-950 outline-none placeholder:text-graphite-500" />
            </label>
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <button type="button" onClick={() => onChange(stores.map((store) => store.id))} className="min-h-11 px-2 text-xs font-semibold text-graphite-700 hover:text-graphite-950">全选</button>
              <button type="button" onClick={() => onChange([])} className="min-h-11 px-2 text-xs font-semibold text-graphite-700 hover:text-graphite-950">清除</button>
            </div>
          </div>
          <div id={listboxId} role="listbox" aria-labelledby={labelId} aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.map((store, index) => {
              const checked = value.includes(store.id);
              return (
                <button key={store.id} type="button" role="option" tabIndex={-1} aria-selected={checked} onClick={() => toggle(store.id)} onKeyDown={(event) => onOptionKeyDown(event, index)} className={cx("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600", checked ? "bg-brand-50 font-semibold text-brand-900" : "text-graphite-700 hover:bg-graphite-50")}>
                  <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded border", checked ? "border-brand-700 bg-brand-700 text-white" : "border-graphite-300 bg-white")}>
                    {checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="truncate">{store.name}</span>
                </button>
              );
            })}
            {!filtered.length ? <p className="px-3 py-6 text-center text-sm text-graphite-500">没有匹配的门店</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
