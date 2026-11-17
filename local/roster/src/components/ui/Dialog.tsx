import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const focusable = [
  "button:not([disabled])", "[href]", "input:not([disabled])", "textarea:not([disabled])",
  "summary", '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Dialog({
  titleId, children, onClose, initialFocusRef, closeDisabled = false, className = "",
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeDisabled?: boolean;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);

  useEffect(() => { closeRef.current = onClose; disabledRef.current = closeDisabled; }, [closeDisabled, onClose]);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (root) { root.inert = true; root.setAttribute("aria-hidden", "true"); }
    (initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(focusable) ?? panelRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabledRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(focusable)]
        .filter((node) => {
          const closedDetails = node.closest("details:not([open])");
          return !node.closest("[inert]") && (!closedDetails || node === closedDetails.querySelector("summary"));
        });
      if (!nodes.length) { event.preventDefault(); panelRef.current.focus(); return; }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (root) { root.inert = false; root.removeAttribute("aria-hidden"); }
      document.body.style.overflow = bodyOverflow;
      // Preserve the calendar's time position when the trigger sits below the
      // grid (for example, the Day sidebar toggle).
      trigger?.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => {
      // A double-click on the card that opened this dialog can deliver its
      // second press to the newly mounted backdrop. Keep the editor open.
      if (event.target === event.currentTarget && event.detail <= 1 && !closeDisabled) onClose();
    }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`dialog-panel ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

