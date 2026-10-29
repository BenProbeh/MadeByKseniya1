import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

let openSheets = 0;

/**
 * Bottom sheet on phones, centred dialog from md up. Traps focus, closes on Escape and backdrop tap
 * (unless `dismissible` is false, e.g. while a request is running), locks page scroll and restores focus.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  role = "dialog",
  initialFocusRef,
  size = "md",
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    openSheets += 1;
    document.documentElement.classList.add("mbk-sheet-open");

    const focusTarget = initialFocusRef?.current || panelRef.current?.querySelector(FOCUSABLE) || panelRef.current;
    focusTarget?.focus({ preventScroll: true });

    function onKey(e) {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets -= 1;
      if (openSheets <= 0) {
        openSheets = 0;
        document.documentElement.classList.remove("mbk-sheet-open");
      }
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" dir="rtl">
      <div
        className="absolute inset-0 bg-black/70 mbk-fade-in"
        aria-hidden="true"
        onClick={() => dismissible && onClose?.()}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${size === "lg" ? "md:max-w-xl" : "md:max-w-md"} max-h-[calc(100dvh-var(--safe-top)-1.5rem)] flex flex-col bg-oled-800 border border-[color:var(--theme-border)] rounded-t-[1.5rem] md:rounded-card shadow-lift outline-none mbk-sheet-in`}
      >
        <div className="md:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-white/20" />
        </div>
        {(title || dismissible) && (
          <div className="flex items-start gap-3 px-5 pt-2 md:pt-5">
            <div className="flex-1 min-w-0 pt-1.5">
              {title && (
                <h2 id={titleId} className="t-title">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="t-sub mt-1">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button type="button" className="icon-btn -me-2 text-white/60" onClick={onClose} aria-label="סגירה">
                <X size={22} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-2">{children}</div>
        {footer && (
          <div className="px-5 pt-3 pb-[calc(var(--safe-bottom)+1rem)] md:pb-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-[calc(var(--safe-bottom)+0.75rem)] md:pb-3" />}
      </div>
    </div>,
    document.body
  );
}
