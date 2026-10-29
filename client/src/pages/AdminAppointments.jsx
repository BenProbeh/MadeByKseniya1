import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, Inbox, Phone } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { telHref } from "../lib/phone.js";
import { useAuth } from "../context/AuthContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
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
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="t-foot shrink-0">{label}</dt>
      <dd className="text-sub text-white/85 text-end min-w-0 break-words">{children}</dd>
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
  const tel = telHref(a.phoneE164);

  return (
    <li className={`card p-4 space-y-3 ${isPending ? "border-violet-400/40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="text-center shrink-0 w-14 rounded-control bg-white/[0.05] py-1.5">
          <p className="font-display text-headline tnum leading-tight">{a.time}</p>
          <p className="text-cap text-white/50 tnum">{a.date.slice(8, 10)}.{a.date.slice(5, 7)}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="t-headline truncate">{name}</p>
          <p className="t-foot truncate">
            {formatCalendarDay(a.date)} · {a.serviceLabel || "—"}
            {a.priceIls != null && (
              <>
                {" · "}
                <span className="tnum">{a.priceIls}</span> ₪
              </>
            )}
          </p>
          <div className="mt-1.5">
            <AppointmentStatusBadge status={a.status} staff />
          </div>
        </div>
        {tel && (
          <a href={tel} className="icon-btn text-violet-200 bg-white/[0.05]" aria-label={`חיוג אל ${name}`}>
            <Phone size={19} aria-hidden="true" />
          </a>
        )}
      </div>

      {a.notes && <p className="t-sub rounded-control bg-white/[0.04] px-3 py-2">״{a.notes}״</p>}

      {(offered.length > 0 || canResend) && (
        <div className="flex gap-2">
          {offered.map((status) => (
            <button
              key={status}
              type="button"
              className={`${status === "manager_approved" ? "btn-violet" : "btn-ghost text-red-300"} btn-sm flex-1`}
              disabled={busy}
              onClick={() => onAction(a, status)}
            >
              {ACTIONS[status].label}
            </button>
          ))}
          {canResend && (
            <button type="button" className="btn-ghost btn-sm flex-1" disabled={busy} onClick={() => onResendEmail(a)}>
              שליחת המייל שוב
            </button>
          )}
        </div>
      )}

      <details className="group">
        <summary className="flex items-center gap-1 min-h-[2.25rem] t-foot cursor-pointer list-none select-none">
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          פרטים נוספים
        </summary>
        <dl className="divide-y divide-white/[0.06]">
          <Field label="טלפון">{a.phone ? <span dir="ltr">{a.phone}</span> : "—"}</Field>
          <Field label="אימייל">{a.email ? <bdi dir="ltr" className="break-all">{a.email}</bdi> : "—"}</Field>
          <Field label="נשלחה">{formatDateTime(a.createdAt)}</Field>
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
            <Field label="אושר">
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
              <span className={emailState === "failed" ? "text-amber-200" : ""}>{EMAIL_STATUS_TEXT[emailState] || "עדיין לא נשלח"}</span>
            </Field>
          )}
        </dl>
      </details>
    </li>
  );
}

export default function AdminAppointments() {
  const { refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => {
    const wanted = searchParams.get("status");
    return STATUS_FILTERS.some((f) => f.value === wanted) ? wanted : "pending";
  });
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
    <div className="max-w-2xl mx-auto space-y-5 pt-2">
      <PageHeader
        title="תורים"
        subtitle={counts.pending > 0 ? `${counts.pending} בקשות מחכות להחלטה` : "אין בקשות שממתינות לאישור"}
      />

      <div className="space-y-2">
        <div className="chip-scroller" role="group" aria-label="סינון לפי סטטוס">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" aria-pressed={status === f.value} className="chip" onClick={() => changeFilter(setStatus, f.value)}>
              {f.label}
              {f.countKey && counts[f.countKey] > 0 ? <span className="tnum text-white/50">{counts[f.countKey]}</span> : null}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="טווח תאריכים">
          {SCOPES.map((s) => (
            <button key={s.value} type="button" aria-pressed={scope === s.value} onClick={() => changeFilter(setScope, s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p className="notice-success" role="status">
          {message}
        </p>
      )}

      {error && (
        <div className="notice-warning justify-between items-center" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-text p-0" onClick={() => void load()}>
            לנסות שוב
          </button>
        </div>
      )}

      {!items && !error && (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-36 rounded-card" />
          ))}
        </div>
      )}

      {items && items.length === 0 && !error && (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title={status === "pending" ? "אין בקשות שממתינות" : "אין תורים להצגה"}
            text={status === "pending" ? "כל הבקשות טופלו. בקשה חדשה תופיע כאן ובאייקון הלשונית." : "אפשר לשנות את הסינון למעלה."}
            compact
          />
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
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

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={action?.title || ""}
        confirmLabel={action?.confirmLabel}
        tone={pendingAction?.next === "manager_approved" ? "default" : "danger"}
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
