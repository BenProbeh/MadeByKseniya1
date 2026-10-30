import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ExternalLink, Package, Ruler, ShoppingBag } from "lucide-react";
import { formatCalendarDay, formatDate, formatMoney } from "../../lib/format.js";
import { cancelMyAppointment, confirmMyAppointment } from "../../lib/authApi.js";
import { getApiErrorMessage } from "../../lib/authErrors.js";
import { HANDS, measuredFingers } from "../../lib/nailSizing/summary.js";
import AppointmentStatusBadge from "../AppointmentStatusBadge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Sheet from "../ui/Sheet.jsx";

/** The customer's final "אישור ההזמנה" after the owner approved, the same step as the email button. */
export function ConfirmBookingButton({ appointment, onConfirmed, block = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { appointment: updated } = await confirmMyAppointment(appointment.id);
      onConfirmed?.(updated || { ...appointment, status: "confirmed", canConfirm: false });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לאשר את ההזמנה כרגע. אפשר לנסות שוב בעוד רגע."));
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${block ? "w-full" : ""}`}>
      <button type="button" className={`btn-violet ${block ? "btn-block" : "btn-sm"}`} disabled={busy} onClick={() => void confirm()}>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        {busy ? "מאשרת…" : "אישור ההזמנה"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CancelAppointmentSheet({ appointment, onClose, onCancelled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await cancelMyAppointment(appointment.id);
      onCancelled?.(updated || { ...appointment, status: "cancelled", canCancel: false, canConfirm: false });
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לבטל כרגע. אפשר לנסות שוב בעוד רגע."));
      setBusy(false);
    }
  }

  const isRequest = appointment.status === "pending";
  return (
    <Sheet
      open
      onClose={onClose}
      dismissible={!busy}
      role="alertdialog"
      title={isRequest ? "לבטל את הבקשה?" : "לבטל את התור?"}
      description={`${appointment.serviceLabel || ""} · ${formatCalendarDay(appointment.date)} · ${appointment.time}`}
      footer={
        <>
          <button type="button" className="btn-ghost sm:w-auto w-full" onClick={onClose} disabled={busy}>
            להשאיר
          </button>
          <button type="button" className="btn-danger sm:w-auto w-full" onClick={() => void cancel()} disabled={busy}>
            {busy ? "מבטלת…" : isRequest ? "ביטול הבקשה" : "ביטול התור"}
          </button>
        </>
      }
    >
      <p className="t-sub">השעה תתפנה מיד. אם תרצי מועד אחר, אפשר לשלוח בקשה חדשה בכל רגע.</p>
      {error && (
        <p className="notice-error mt-4" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

export function AppointmentItem({ appointment: a, onUpdated }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const closed = a.status === "rejected" || a.status === "cancelled";
  return (
    <li className={`p-4 space-y-3 ${closed ? "opacity-70" : ""}`}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-headline truncate">{a.serviceLabel || "תור"}</p>
          {a.priceIls != null && (
            <p className="price text-lg leading-none shrink-0">
              {a.priceIls} ₪
            </p>
          )}
        </div>
        <p className="t-sub">
          {formatCalendarDay(a.date)} · <span className="tnum">{a.time}</span>
        </p>
        <AppointmentStatusBadge status={a.status} />
      </div>
      {(a.canConfirm || a.canCancel) && onUpdated && (
        <div className="flex flex-wrap items-center gap-2">
          {a.canConfirm && <ConfirmBookingButton appointment={a} onConfirmed={onUpdated} />}
          {a.canCancel && (
            <button type="button" className="btn-text text-white/55 px-2" onClick={() => setCancelOpen(true)}>
              {a.status === "pending" ? "ביטול הבקשה" : "ביטול התור"}
            </button>
          )}
        </div>
      )}
      {cancelOpen && <CancelAppointmentSheet appointment={a} onClose={() => setCancelOpen(false)} onCancelled={onUpdated} />}
    </li>
  );
}

function ListSkeleton({ rows = 2 }) {
  return (
    <div className="list-group" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="p-4 space-y-2">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-3.5 w-56" />
        </div>
      ))}
    </div>
  );
}

export function AppointmentsSection({
  appointments,
  error,
  title = "התורים שלי",
  emptyText = "כשתשלחי בקשה לתור, תוכלי לעקוב כאן אחרי הסטטוס שלה.",
  showBookingLink = true,
  onAppointmentUpdated,
  limit,
  moreLink,
}) {
  const list = limit && appointments ? appointments.slice(0, limit) : appointments;
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-baseline justify-between px-1">
        <h2 className="t-title">{title}</h2>
        {moreLink && appointments?.length > (limit || 0) && (
          <Link to={moreLink} className="btn-text">
            הכול
          </Link>
        )}
      </div>
      {appointments === undefined && <ListSkeleton />}
      {error && <p className="notice-warning">{error}</p>}
      {appointments && appointments.length === 0 && !error && (
        <div className="card">
          <EmptyState
            icon={CalendarPlus}
            title="עדיין אין תורים"
            text={emptyText}
            compact
            action={
              showBookingLink && (
                <Link to="/booking" className="btn-violet btn-sm">
                  קביעת תור
                </Link>
              )
            }
          />
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="list-group">
          {list.map((a) => (
            <AppointmentItem key={a.id} appointment={a} onUpdated={onAppointmentUpdated} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Optional Neon Marquee label above a section title (the profile and the staff customer card). */
function Eyebrow({ text }) {
  return text ? <span className="section-eyebrow px-1">{text}</span> : null;
}

export function MeasurementsSection({ measurement, error, title = "המידות שלי", showActions = true, eyebrow }) {
  const fingers = measurement ? measuredFingers(measurement) : [];
  return (
    <section className="space-y-2" aria-label={title} id="measurements">
      <Eyebrow text={eyebrow} />
      <div className="flex items-baseline justify-between px-1">
        <h2 className="t-title">{title}</h2>
        {showActions && measurement && (
          <Link to="/nail-sizing" className="btn-text">
            מדידה מחדש
          </Link>
        )}
      </div>
      {measurement === undefined && <ListSkeleton rows={1} />}
      {error && <p className="notice-warning">{error}</p>}
      {measurement === null && !error && (
        <div className="card">
          <EmptyState
            icon={Ruler}
            title="עוד לא מדדנו"
            text="כמה דקות עם מטבע של 10 ₪, ואדע להתאים לך סט מדויק."
            compact
            action={
              showActions && (
                <Link to="/nail-sizing" className="btn-violet btn-sm">
                  למדידה
                </Link>
              )
            }
          />
        </div>
      )}
      {measurement && (
        <div className="card p-4 space-y-4">
          {HANDS.map((hand) => {
            const row = fingers.filter((f) => f.hand === hand.id);
            if (!row.length) return null;
            return (
              <div key={hand.id} className="space-y-2">
                <p className="t-foot">{hand.labelHe}</p>
                <ul className="grid grid-cols-5 gap-2">
                  {row.map((f) => (
                    <li key={f.fingerId} className={`rounded-control border px-1 py-2.5 text-center ${f.size != null ? "border-violet-400/25 bg-violet-400/[0.06]" : "border-white/[0.06] bg-white/[0.04]"}`}>
                      <span className="block marquee text-[1.625rem] leading-none tnum">{f.size ?? "—"}</span>
                      <span className="block text-cap text-white/50 mt-0.5 truncate">{f.shortHe}</span>
                      {f.widthMm != null && (
                        <span className="block text-cap text-white/35 tnum" dir="ltr">
                          {Number(f.widthMm).toFixed(1)}mm
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {fingers.some((f) => f.size == null) && (
            <p className="t-foot">חלק מהאצבעות צולמו לפני שהמדידה חישבה מידה. מדידה מחדש תשלים אותן.</p>
          )}
          {measurement.updatedAt && <p className="t-foot">עודכן ב־{formatDate(measurement.updatedAt)}</p>}
        </div>
      )}
    </section>
  );
}

export function OrdersSection({ orders, error, title = "הרכישות שלי", eyebrow }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <Eyebrow text={eyebrow} />
      <h2 className="t-title px-1">{title}</h2>
      {orders === undefined && <ListSkeleton rows={1} />}
      {error && <p className="notice-warning">{error}</p>}
      {orders && orders.length === 0 && !error && (
        <div className="list-group">
          <div className="list-row">
            <span className="grid place-items-center w-10 h-10 rounded-full bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
              <ShoppingBag size={20} strokeWidth={1.8} />
            </span>
            <span className="flex-1">
              <span className="block t-headline">עדיין אין רכישות</span>
              <span className="block t-foot">הסט הראשון שלך יופיע כאן.</span>
            </span>
          </div>
        </div>
      )}
      {orders && orders.length > 0 && (
        <ul className="list-group">
          {orders.map((o) => (
            <li key={o.id} className="list-row">
              <div className="flex-1 min-w-0">
                <p className="t-headline truncate">{o.titleHe || o.orderNumber}</p>
                <p className="t-foot mt-0.5">
                  {formatDate(o.createdAt)} · {o.statusHe}
                </p>
              </div>
              <p className="price text-lg leading-none shrink-0">{formatMoney(o.totalAmount, o.currency)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShipmentsSection({ shipments, error, title = "משלוחים", eyebrow }) {
  if (shipments && shipments.length === 0 && !error) return null;
  return (
    <section className="space-y-2" aria-label={title}>
      <Eyebrow text={eyebrow} />
      <h2 className="t-title px-1">{title}</h2>
      {shipments === undefined && <ListSkeleton rows={1} />}
      {error && <p className="notice-warning">{error}</p>}
      {shipments && shipments.length > 0 && (
        <ul className="list-group">
          {shipments.map((s) => (
            <li key={s.id} className="list-row items-start">
              <span className="grid place-items-center w-10 h-10 rounded-full bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
                <Package size={20} strokeWidth={1.8} />
              </span>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="t-headline">{s.statusHe}</p>
                <p className="t-foot">
                  הזמנה <span className="tnum">{s.orderNumber}</span> · עודכן {formatDate(s.updatedAt)}
                </p>
                {s.trackingNumber && (
                  <p className="t-foot">
                    מספר מעקב{" "}
                    <bdi dir="ltr" className="tnum text-white/70">
                      {s.trackingNumber}
                    </bdi>
                  </p>
                )}
              </div>
              {/^https?:\/\//i.test(s.trackingUrl || "") && (
                <a href={s.trackingUrl} className="icon-btn text-violet-300" target="_blank" rel="noreferrer" aria-label="מעקב משלוח">
                  <ExternalLink size={20} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
