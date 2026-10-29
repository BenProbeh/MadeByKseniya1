import Sheet from "./ui/Sheet.jsx";

/**
 * Confirmation for consequential actions: a bottom sheet on phones, a dialog on desktop.
 * `tone="danger"` paints the confirm button as destructive. Cancel stays the safe default and is
 * where focus lands first.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  busy = false,
  confirmDisabled = false,
  error = "",
  tone = "default",
  onConfirm,
  onCancel,
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      dismissible={!busy}
      role="alertdialog"
      title={title}
      footer={
        <>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${tone === "danger" ? "btn-danger" : "btn-violet"} w-full sm:w-auto`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? "רגע אחד…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="t-sub space-y-2">{children}</div>
      {error && (
        <p className="notice-error mt-4" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
