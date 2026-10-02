import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import DialButton from "../components/admin/DialButton.jsx";
import AppointmentStatusBadge from "../components/AppointmentStatusBadge.jsx";
import { fetchAdminAppointments, resendAppointmentEmail, setAppointmentStatus } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatCalendarDay, formatDateTime } from "../lib/format.js";

const REFRESH_MS = 30_000;

const STATUS_FILTERS = [
  { value: "pending", label: "ממתינות לאישור", countKey: "pending" },
  { value: "manager_approved", label: "אושרו · ממתינות ללקוחה", countKey: "approved" },
  { value: "confirmed", label: "מאושרים סופית", countKey: "confirmed" },
  { value: "rejected", label: "נדחו" },
  { value: "cancelled", label: "בוטלו" },
  { value: "", label: "הכול" },
];

const SCOPES = [
  { value: "upcoming", label: "מהיום והלאה" },
  { value: "past", label: "תורים שעברו" },
  { value: "all", label: "כל התאריכים" },
];

const ACTIONS = {
  manager_approved: {
    label: "אישור התור",
    title: "לאשר את התור?",
    confirmLabel: "כן, לאשר",
    done: "התור אושר. שלחתי ללקוחה מייל עם כפתור לאישור ההזמנה.",
    className: "btn-violet px-5 py-2.5 text-sm",
  },
  rejected: {
    label: "דחיית הבקשה",
    title: "לדחות את הבקשה?",
    confirmLabel: "כן, לדחות",
    done: "הבקשה נדחתה והשעה התפנתה.",
    className:
      "rounded-full border border-red-400/40 px-5 py-2.5 text-sm text-red-300 hover:bg-red-400/10 disabled:opacity-50",
  },
  cancelled: {
    label: "ביטול התור",
    title: "לבטל את התור?",
    confirmLabel: "כן, לבטל",
    done: "התור בוטל והשעה התפנתה.",
    className:
      "rounded-full border border-red-400/40 px-5 py-2.5 text-sm text-red-300 hover:bg-red-400/10 disabled:opacity-50",
  },
};

/** Actions offered per status: decisions on requests, cancellation of approved bookings. */
const OFFERED = {
  pending: ["manager_approved", "rejected"],
  manager_approved: ["cancelled"],
  confirmed: ["cancelled"],
};

/** The customer email that belongs to each status (the one staff can re-send if it failed). */
const EMAIL_KIND = { pending: "requested", manager_approved: "approved", rejected: "rejected", cancelled: "cancelled" };

const EMAIL_STATUS_TEXT = {
  queued: "בשליחה",
  sent: "נשלח",
  delivered: "התקבל אצל הלקוחה",
  failed: "לא נשלח",
};

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-white/35">{label}</dt>
      <dd className="text-sm text-white/80 break-words">{children}</dd>
    </div>
  );
}

function fullName(a) {
  return `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.clientName || "—";
}

function AppointmentCard({ appointment: a, busy, onAction, onResendEmail }) {
  const offered = (OFFERED[a.status] || []).filter((s) => a.allowedActions?.includes(s));
  const isPending = a.status === "pending";
  const name = fullName(a);
  const emailKind = EMAIL_KIND[a.status];
  const emailState = emailKind ? a.emailStatus?.[emailKind] : null;
  const canResend = Boolean(a.email && emailKind && emailState === "failed");

  return (
    <li
      className={`rounded-xl border p-4 sm:p-5 space-y-4 transition-colors ${
        isPending ? "border-violet-400/40 bg-violet-400/[0.04]" : "border-white/[0.08]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="font-serif text-lg text-white">{name}</p>
          <p className="text-sm text-violet-200">
            {formatCalendarDay(a.date)} · {a.time}
            {a.durationMin ? (
              <>
                {" "}
                <span className="whitespace-nowrap text-white/45">({a.durationMin} דק')</span>
              </>
            ) : null}
          </p>
        </div>
        <AppointmentStatusBadge status={a.status} staff />
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="טלפון">
          {a.phoneE164 ? (
            <DialButton phoneE164={a.phoneE164} phoneDisplay={a.phone} name={name} />
          ) : (
            <span dir="ltr">{a.phone || "—"}</span>
          )}
        </Field>
        <Field label="אימייל">
          {a.email ? (
            <bdi dir="ltr" className="break-all">
              {a.email}
            </bdi>
          ) : (
            "—"
          )}
        </Field>
        <Field label="שירות / חבילה">{a.serviceLabel || "—"}</Field>
        <Field label="מחיר">{a.priceIls != null ? `${a.priceIls} ₪` : "—"}</Field>
        <Field label="נשלחה ב־">{formatDateTime(a.createdAt)}</Field>
        <Field label="הערות">{a.notes || "—"}</Field>
        {a.username && (
          <Field label="חשבון">
            {a.userId ? (
              <Link to={`/admin/customers/${a.userId}`} className="text-violet-300">
                <span dir="ltr">@{a.username}</span>
              </Link>
            ) : (
              <span dir="ltr">@{a.username}</span>
            )}
          </Field>
        )}
        {a.approvedAt && (
          <Field label="אושר על ידי">
            {formatDateTime(a.approvedAt)}
            {a.approvedBy?.name ? ` · ${a.approvedBy.name}` : ""}
          </Field>
        )}
        {a.customerConfirmedAt && <Field label="הלקוחה אישרה">{formatDateTime(a.customerConfirmedAt)}</Field>}
        {a.statusChangedAt && a.status !== "pending" && (
          <Field label="עודכן">
            {formatDateTime(a.statusChangedAt)}
            {a.statusChangedBy?.name ? ` · ${a.statusChangedBy.name}` : ""}
          </Field>
        )}
        {emailKind && a.email && (
          <Field label="מייל ללקוחה">
            <span className={emailState === "failed" ? "text-amber-200" : ""}>
              {EMAIL_STATUS_TEXT[emailState] || "עדיין לא נשלח"}
            </span>
          </Field>
        )}
      </dl>

      {(offered.length > 0 || canResend) && (
        <div className="flex flex-wrap items-center gap-3">
          {offered.map((status) => (
            <button
              key={status}
              type="button"
              className={ACTIONS[status].className}
              disabled={busy}
              onClick={() => onAction(a, status)}
            >
              {ACTIONS[status].label}
            </button>
          ))}
          {canResend && (
            <button type="button" className="btn-ghost px-5 py-2.5 text-sm" disabled={busy} onClick={() => onResendEmail(a)}>
              שליחת המייל שוב
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function AdminAppointments() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState("pending");
  const [scope, setScope] = useState("upcoming");
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, confirmed: 0 });
  const [resendingId, setResendingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setError("");
      try {
        const data = await fetchAdminAppointments({ status, scope });
        if (id !== requestId.current) return;
        setItems(data.appointments);
        setCounts(data.counts);
        setError("");
      } catch (err) {
        if (id !== requestId.current) return;
        if (!silent) setError(getApiErrorMessage(err, "לא הצלחתי לטעון את התורים."));
        const code = err?.response?.status;
        if (code === 401 || code === 403) await refreshUser();
      }
    },
    [status, scope, refreshUser]
  );

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const closeDialog = useCallback(() => {
    if (actionBusy) return;
    setPendingAction(null);
    setActionError("");
  }, [actionBusy]);

  function changeFilter(setter, value) {
    setItems(null);
    setMessage("");
    setter(value);
  }

  function openAction(appointment, next) {
    setMessage("");
    setActionError("");
    setPendingAction({ appointment, next });
  }

  async function runAction() {
    if (!pendingAction || actionBusy) return;
    const { appointment, next } = pendingAction;
    setActionBusy(true);
    setActionError("");
    try {
      const updated = await setAppointmentStatus(appointment.id, next);
      setItems((prev) =>
        (prev || [])
          .map((a) => (a.id === updated.id ? updated : a))
          .filter((a) => !status || a.status === status)
      );
      setMessage(ACTIONS[next].done);
      setPendingAction(null);
      void load({ silent: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (["ALREADY_HANDLED", "INVALID_TRANSITION", "IN_PAST", "NOT_FOUND"].includes(code)) {
        setPendingAction(null);
        setMessage(getApiErrorMessage(err, "הבקשה הזו כבר טופלה."));
        void load({ silent: true });
      } else {
        setActionError(getApiErrorMessage(err, "לא הצלחתי לעדכן את התור. אפשר לנסות שוב."));
        const httpStatus = err?.response?.status;
        if (httpStatus === 401 || httpStatus === 403) await refreshUser();
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function resendEmail(appointment) {
    if (resendingId) return;
    setResendingId(appointment.id);
    setMessage("");
    try {
      const updated = await resendAppointmentEmail(appointment.id);
      setItems((prev) => (prev || []).map((a) => (a.id === updated.id ? updated : a)));
      setMessage(
        appointment.status === "manager_approved"
          ? "המייל נשלח שוב, עם קישור חדש לאישור ההזמנה."
          : "המייל נשלח שוב ללקוחה."
      );
    } catch (err) {
      setMessage(getApiErrorMessage(err, "לא הצלחתי לשלוח את המייל שוב. אפשר לנסות שוב מאוחר יותר."));
      void load({ silent: true });
    } finally {
      setResendingId(null);
    }
  }

  const target = pendingAction?.appointment;
  const action = pendingAction ? ACTIONS[pendingAction.next] : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Admin</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          ניהול <span className="violet-text">תורים</span>
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base" aria-live="polite">
          {counts.pending > 0 ? `${counts.pending} בקשות ממתינות לאישור` : "אין בקשות שממתינות לאישור"}
          {counts.approved > 0 ? ` · ${counts.approved} ממתינות לאישור הלקוחה` : ""}
          {` · ${counts.confirmed} תורים מאושרים סופית מהיום והלאה`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link to="/admin/customers" className="btn-text text-sm">
            <span aria-hidden="true">→</span>
            חזרה לניהול לקוחות
          </Link>
          <Link to="/admin/notifications" className="btn-ghost px-5 py-2.5 text-sm">
            התראות
          </Link>
        </div>
      </div>

      <section className="glass-panel p-6 md:p-8 space-y-6" aria-label="רשימת תורים">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי סטטוס">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || "all"}
                type="button"
                aria-pressed={status === f.value}
                className={`pill-option py-2 min-h-[40px] ${status === f.value ? "pill-option-active" : ""}`}
                onClick={() => changeFilter(setStatus, f.value)}
              >
                {f.label}
                {f.countKey && counts[f.countKey] > 0 ? ` (${counts[f.countKey]})` : ""}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי תאריך">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={scope === s.value}
                className={`pill-option py-1.5 min-h-[36px] text-xs ${scope === s.value ? "pill-option-active" : ""}`}
                onClick={() => changeFilter(setScope, s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <p className="text-sm text-violet-200 text-center" role="status">
            {message}
          </p>
        )}

        {error && (
          <div className="text-center space-y-3">
            <p className="text-sm text-amber-200" role="alert">
              {error}
            </p>
            <button type="button" className="btn-text text-sm" onClick={() => void load()}>
              לנסות שוב
            </button>
          </div>
        )}

        {!items && !error && <p className="text-sm text-white/45 text-center">התורים נטענים…</p>}

        {items && items.length === 0 && !error && (
          <p className="font-serif text-sm text-white/55 text-center py-4">
            {status === "pending" ? "אין בקשות שממתינות לאישור." : "אין תורים להצגה."}
          </p>
        )}

        {items && items.length > 0 && (
          <ul className="space-y-4">
            {items.map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                busy={(actionBusy && pendingAction?.appointment.id === a.id) || resendingId === a.id}
                onAction={openAction}
                onResendEmail={resendEmail}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={action?.title || ""}
        confirmLabel={action?.confirmLabel}
        cancelLabel="חזרה"
        busy={actionBusy}
        error={actionError}
        onConfirm={runAction}
        onCancel={closeDialog}
      >
        {target && (
          <>
            <p>
              {fullName(target)} · {target.serviceLabel}
            </p>
            <p>
              {formatCalendarDay(target.date)} בשעה {target.time}
            </p>
            {pendingAction.next === "manager_approved" ? (
              <p className="text-white/50">השעה תסומן כתפוסה, והלקוחה תקבל מייל עם כפתור לאישור ההזמנה.</p>
            ) : (
              <p className="text-white/50">השעה תתפנה לבחירה של לקוחות אחרות, והלקוחה תקבל על כך מייל.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
