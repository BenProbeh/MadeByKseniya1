import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCalendarDay, formatDate, formatMoney } from "../../lib/format.js";
import { confirmMyAppointment } from "../../lib/authApi.js";
import { getApiErrorMessage } from "../../lib/authErrors.js";
import AppointmentStatusBadge from "../AppointmentStatusBadge.jsx";

/** The customer's final "אישור ההזמנה" after the owner approved, the same step as the email button. */
function ConfirmBookingButton({ appointment, onConfirmed }) {
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
    <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-1">
      <button type="button" className="btn-violet text-sm" disabled={busy} onClick={() => void confirm()}>
        {busy ? "מאשרת…" : "אישור ההזמנה"}
      </button>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AppointmentsSection({
  appointments,
  error,
  title = "התורים שלי",
  emptyText = "עדיין לא שלחת בקשה לתור.",
  showBookingLink = true,
  onAppointmentUpdated,
}) {
  return (
    <section className="glass-panel p-6 space-y-4">
      <h2 className="font-serif text-2xl md:text-3xl text-white text-center">{title}</h2>
      {appointments === undefined && <p className="text-sm text-white/45 text-center">התורים נטענים…</p>}
      {error && <p className="text-sm text-amber-200 text-center">{error}</p>}
      {appointments && appointments.length === 0 && !error && (
        <div className="text-center space-y-4 py-2">
          <p className="font-serif text-sm text-white/55">{emptyText}</p>
          {showBookingLink && (
            <Link to="/booking" className="btn-violet inline-flex">
              לקביעת תור
            </Link>
          )}
        </div>
      )}
      {appointments && appointments.length > 0 && (
        <ul className="space-y-3">
          {appointments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] last:border-0 pb-3 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-white/90">{a.serviceLabel}</p>
                <p className="text-sm text-white/55">
                  {formatCalendarDay(a.date)} · {a.time}
                  {a.priceIls != null && ` · ₪${a.priceIls}`}
                </p>
              </div>
              <AppointmentStatusBadge status={a.status} />
              {a.canConfirm && onAppointmentUpdated && (
                <ConfirmBookingButton appointment={a} onConfirmed={onAppointmentUpdated} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MeasurementsSection({
  measurement,
  error,
  title = "המידות שלי",
  subtitle = "כאן אשמור את ההתאמה שלך לפעמים הבאות.",
  emptyTitle = "עדיין לא שמרתי את המידות שלך",
  emptyText = "מדידה קצרה תעזור לי להתאים לך את הסט בצורה מדויקת יותר.",
  showActions = true,
}) {
  return (
    <section className="glass-panel p-6 space-y-4">
      <div className="text-center space-y-1">
        <h2 className="font-serif text-2xl md:text-3xl text-white">{title}</h2>
        {subtitle && <p className="font-serif text-white/60 text-sm">{subtitle}</p>}
      </div>
      {measurement === undefined && <p className="text-sm text-white/45 text-center">המידות נטענות…</p>}
      {error && <p className="text-sm text-amber-200 text-center">{error}</p>}
      {measurement === null && !error && (
        <div className="text-center space-y-4 py-2">
          <p className="font-serif text-white">{emptyTitle}</p>
          {emptyText && <p className="font-serif text-sm text-white/55">{emptyText}</p>}
          {showActions && (
            <Link to="/nail-sizing" className="btn-violet inline-flex">
              להתחלת מדידה
            </Link>
          )}
        </div>
      )}
      {measurement && (
        <div className="grid md:grid-cols-2 gap-4">
          {["right", "left"].map((hand) => {
            const block = measurement.hands?.[hand];
            if (!block?.fingers?.length) return null;
            return (
              <div key={hand} className="space-y-3 border border-white/[0.08] rounded-xl p-4">
                <h3 className="font-serif text-xl text-white">{block.labelHe}</h3>
                <ul className="space-y-2 text-sm text-white/75">
                  {block.fingers.map((f) => (
                    <li key={f.fingerId} className="flex justify-between gap-3">
                      <span>{f.labelHe}</span>
                      <span className="text-white/50">
                        {f.size != null ? `מידה ${f.size}` : f.widthMm != null ? `${f.widthMm} מ״מ` : "—"}
                        {f.photoQualityScore != null ? ` · ${f.photoQualityScore}/100` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {showActions && (
            <div className="md:col-span-2 flex justify-center pt-2">
              <Link to="/nail-sizing" className="btn-text text-sm">
                מדידה מחדש
                <span className="btn-text-arrow">←</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function OrdersSection({
  orders,
  error,
  title = "הרכישות האחרונות שלי",
  emptyText = "עדיין אין כאן רכישות — הסט הראשון שלך מחכה לך.",
}) {
  return (
    <section className="glass-panel p-6 space-y-4">
      <h2 className="font-serif text-2xl md:text-3xl text-white text-center">{title}</h2>
      {orders === undefined && <p className="text-sm text-white/45 text-center">הרכישות נטענות…</p>}
      {error && <p className="text-sm text-amber-200 text-center">{error}</p>}
      {orders && orders.length === 0 && !error && (
        <p className="font-serif text-sm text-white/55 text-center">{emptyText}</p>
      )}
      {orders && orders.length > 0 && (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 border-b border-white/[0.08] last:border-0 pb-3 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-white/90">{o.titleHe || o.orderNumber}</p>
                <p className="text-xs text-white/45">
                  {formatDate(o.createdAt)} · {o.statusHe}
                </p>
              </div>
              <p className="font-serif text-violet-200 shrink-0">{formatMoney(o.totalAmount, o.currency)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShipmentsSection({
  shipments,
  error,
  title = "איפה ההזמנה שלי?",
  emptyText = "אין כרגע משלוח פעיל.",
}) {
  return (
    <section className="glass-panel p-6 space-y-4">
      <h2 className="font-serif text-2xl md:text-3xl text-white text-center">{title}</h2>
      {shipments === undefined && <p className="text-sm text-white/45 text-center">המשלוחים נטענים…</p>}
      {error && <p className="text-sm text-amber-200 text-center">{error}</p>}
      {shipments && shipments.length === 0 && !error && (
        <p className="font-serif text-sm text-white/55 text-center">{emptyText}</p>
      )}
      {shipments && shipments.length > 0 && (
        <ul className="space-y-4">
          {shipments.map((s) => (
            <li key={s.id} className="border border-white/[0.08] rounded-xl p-4 space-y-2">
              <p className="font-serif text-white">הזמנה {s.orderNumber}</p>
              <p className="text-sm text-violet-200">{s.statusHe}</p>
              {s.trackingNumber && (
                <p className="text-xs text-white/45">
                  מעקב: {s.trackingNumber}
                  {/^https?:\/\//i.test(s.trackingUrl || "") && (
                    <>
                      {" · "}
                      <a href={s.trackingUrl} className="text-violet-300" target="_blank" rel="noreferrer">
                        קישור
                      </a>
                    </>
                  )}
                </p>
              )}
              <p className="text-xs text-white/35">עודכן {formatDate(s.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
