import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-oled-950/80 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="glass-panel p-6 md:p-7 w-full max-w-md space-y-5 text-center">
        <h3 id="confirm-dialog-title" className="font-serif text-2xl text-white">
          {title}
        </h3>
        <div className="font-serif text-sm text-white/70 space-y-2">{children}</div>
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          <button ref={cancelRef} type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-violet" onClick={onConfirm} disabled={busy}>
            {busy ? "רגע אחד…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
