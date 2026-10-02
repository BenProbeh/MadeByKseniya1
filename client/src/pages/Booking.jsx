import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { format } from "date-fns";
import Calendar from "../components/Calendar.jsx";
import { getServices, getAvailability, createAppointmentRequest, fetchMyAppointments } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AppointmentStatusBadge from "../components/AppointmentStatusBadge.jsx";
import { AppointmentsSection } from "../components/profile/ProfileSections.jsx";
import { formatCalendarDay } from "../lib/format.js";
import WazeIcon from "../components/WazeIcon.jsx";
import {
  STUDIO_ADDRESS_LINE_1,
  STUDIO_ADDRESS_LINE_2,
  STUDIO_WAZE_URL,
  openStudioInWaze,
} from "../lib/studioAddress.js";

/** How often an open booking page re-reads the shared schedule. */
const REFRESH_MS = 30_000;

const SLOT_TAKEN_NOTICE = "השעה שבחרת נתפסה בינתיים. אפשר לבחור שעה אחרת.";

const SLOT_STATE_TEXT = { free: "פנוי", pending: "ממתין לאישור", booked: "תפוס" };

const EMAIL_NOT_VERIFIED_TEXT = "כדי לשלוח בקשה לתור צריך קודם לאמת את כתובת האימייל בחשבון.";

/** Optional contact phone; when given: 9–10 local digits, or 972 + 8–9. */
function isValidPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return true;
  if (digits.startsWith("972")) {
    return digits.length >= 11 && digits.length <= 12;
  }
  return /^0\d{8,9}$/.test(digits);
}

function newRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function SlotButton({ slot, selected, onSelect }) {
  const base =
    "min-h-[3.25rem] rounded-2xl px-2 py-2 text-sm border flex flex-col items-center justify-center leading-tight transition-colors";
  if (slot.state === "pending" || slot.state === "booked") {
    const style =
      slot.state === "booked"
        ? "border-red-400/50 bg-red-500/15 text-red-300"
        : "border-white/10 bg-white/[0.07] text-white/45";
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-label={`${slot.time} — ${SLOT_STATE_TEXT[slot.state]}`}
        className={`${base} ${style} cursor-not-allowed`}
      >
        <span className={slot.state === "booked" ? "line-through decoration-1" : ""}>{slot.time}</span>
        <span className="text-[11px] mt-0.5">{SLOT_STATE_TEXT[slot.state]}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.time)}
      aria-pressed={selected}
      aria-label={`${slot.time} — ${SLOT_STATE_TEXT.free}`}
      className={`${base} ${
        selected
          ? "bg-violet-gradient text-oled-950 font-bold border-transparent shadow-glow"
          : "border-white/15 text-white/70 hover:border-violet-400/50"
      }`}
    >
      {slot.time}
    </button>
  );
}

function SlotLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/55 mb-3" aria-hidden="true">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-white/30" />
        פנוי
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-white/10 bg-white/20" />
        ממתין לאישור
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-full border border-red-400/60 bg-red-500/40" />
        תפוס
      </span>
    </div>
  );
}

function BookingForm({
  services,
  user,
  initialNotes,
  skipServiceSelect = false,
  packageLabel = "",
  packageKey = "",
  onRequested,
}) {
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(null);
  const [times, setTimes] = useState([]);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [time, setTime] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState(() => ({
    clientName: [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    phone: user?.phone || "",
    notes: initialNotes || "",
  }));
  const emailReady = Boolean(user?.emailVerified);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [requested, setRequested] = useState(null);
  const [slotsError, setSlotsError] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const fetchSeq = useRef(0);
  const submittingRef = useRef(false);
  const requestKeyRef = useRef(newRequestKey());

  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
  const slotKey = `${dateStr}|${serviceId}`;

  useEffect(() => {
    if (!skipServiceSelect || !services.length || serviceId) return;
    setServiceId(String(services[0].id));
  }, [skipServiceSelect, services, serviceId]);

  useEffect(() => {
    if (!requested) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [requested]);

  /** Re-reads the schedule from the server; resolves to the fresh slot list, or null if it failed or went stale. */
  const loadSlots = useCallback(
    async ({ silent = false } = {}) => {
      if (!dateStr || !serviceId) return null;
      const seq = ++fetchSeq.current;
      if (!silent) setLoadingSlots(true);
      try {
        const data = await getAvailability(dateStr, serviceId);
        if (seq !== fetchSeq.current) return null;
        const list = Array.isArray(data?.times)
          ? data.times
          : (data?.slots || []).map((t) => ({ time: t, state: "free" }));
        setTimes(list);
        setSlotsOpen(data?.open !== false);
        setSlotsError(false);
        return list;
      } catch {
        if (seq !== fetchSeq.current) return null;
        if (!silent) {
          setTimes([]);
          setSlotsError(true);
        }
        return null;
      } finally {
        if (seq === fetchSeq.current) {
          setLoadingSlots(false);
          setLoadedKey(`${dateStr}|${serviceId}`);
        }
      }
    },
    [dateStr, serviceId]
  );

  useEffect(() => {
    setTime(null);
    setNotice("");
    setSlotsError(false);
    setTimes([]);
    if (!dateStr || !serviceId) return;
    loadSlots();
  }, [dateStr, serviceId, loadSlots]);

  useEffect(() => {
    if (!dateStr || !serviceId || requested) return undefined;
    const refresh = () => {
      if (document.visibilityState === "visible") loadSlots({ silent: true });
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [dateStr, serviceId, requested, loadSlots]);

  // Someone else took the selected time while the form was open.
  useEffect(() => {
    if (!time || requested || submittingRef.current) return;
    if (times.find((t) => t.time === time)?.state === "free") return;
    setTime(null);
    setNotice(SLOT_TAKEN_NOTICE);
  }, [times, time, requested]);

  // A new slot is a new request; a retry of the same slot reuses the key so it can never be stored twice.
  useEffect(() => {
    requestKeyRef.current = newRequestKey();
  }, [dateStr, serviceId, time]);

  function selectTime(next) {
    setTime(next);
    setNotice("");
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current || !serviceId || !dateStr || !time) return;
    if (!emailReady) {
      setError(EMAIL_NOT_VERIFIED_TEXT);
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError("מספר הטלפון לא נראה תקין. אפשר גם להשאיר את השדה ריק.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setNotice("");
    try {
      const latest = await loadSlots({ silent: true });
      if (latest && latest.find((t) => t.time === time)?.state !== "free") {
        setTime(null);
        setNotice(SLOT_TAKEN_NOTICE);
        return;
      }
      const { appointment } = await createAppointmentRequest({
        clientName: form.clientName,
        phone: form.phone.trim() || undefined,
        serviceId: Number(serviceId),
        date: dateStr,
        time,
        notes: form.notes || undefined,
        packageKey: packageKey || undefined,
        requestKey: requestKeyRef.current,
      });
      setRequested(appointment);
      onRequested?.();
    } catch (err) {
      const data = err?.response?.data;
      const message = typeof data?.error === "string" ? data.error : "";
      if (data?.code === "SLOT_TAKEN") {
        setTime(null);
        setNotice(message || SLOT_TAKEN_NOTICE);
        loadSlots({ silent: true });
      } else {
        setError(message || "לא הצלחתי לשלוח את הבקשה, נסי שוב.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (requested) {
    const service = services.find((s) => s.id === Number(serviceId));
    const label = requested.serviceLabel || packageLabel || service?.name_he;
    return (
      <div className="glass-panel p-8 text-center shadow-glow" role="status" aria-live="polite">
        <AppointmentStatusBadge status="pending" className="mb-5" />
        <p className="font-serif text-xl md:text-2xl text-white leading-relaxed">
          קיבלתי את הפרטים שלך, מיד אעבור עליהם ואשתדל לאשר את התור.
          <br />
          נתראה!
        </p>
        <p className="text-white/60 mt-4">
          {label} · {formatCalendarDay(requested.date)} בשעה {requested.time}
        </p>
        <p className="text-white/45 text-sm mt-2">הבקשה ממתינה לאישור. אפשר לראות את הסטטוס שלה בפרופיל.</p>
        {user?.email && (
          <p className="text-white/45 text-sm mt-1">
            פרטי הבקשה נשלחים גם למייל{" "}
            <bdi dir="ltr" className="break-all">
              {user.email}
            </bdi>
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-white/[0.08] flex flex-col items-center gap-3">
          <a
            href={STUDIO_WAZE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              openStudioInWaze();
            }}
            className="inline-flex flex-col items-center gap-2 rounded-2xl px-4 py-3 transition-transform duration-300 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            aria-label="ניווט בוויז אל הסטודיו"
          >
            <WazeIcon className="w-16 h-16 shadow-[0_0_18px_rgba(51,204,255,0.35)]" />
            <span className="text-xs tracking-wide text-white/50">ניווט בוויז</span>
          </a>
          <div className="text-sm text-white/60 leading-relaxed">
            <p>{STUDIO_ADDRESS_LINE_1}</p>
            <p>{STUDIO_ADDRESS_LINE_2}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasFree = times.some((t) => t.state === "free");

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        {!skipServiceSelect && (
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">בחירת שירות</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            >
              <option value="">בחרי שירות...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id} className="bg-oled-900">
                  {s.name_he} — {s.price_ils}₪ ({s.duration_min} דק')
                </option>
              ))}
            </select>
          </div>
        )}

        {skipServiceSelect && packageLabel && (
          <p className="text-sm text-violet-300 font-semibold">מסלול נבחר: {packageLabel}</p>
        )}

        <Calendar selectedDate={date} onSelectDate={setDate} />
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-white/70 mb-3">שעות</p>
          {notice && (
            <p className="text-sm text-red-300 mb-3" role="alert">
              {notice}
            </p>
          )}
          {!serviceId || !date ? (
            <p className="text-white/40 text-sm">
              {skipServiceSelect ? "בחרי תאריך כדי לראות שעות פנויות." : "בחרי שירות ותאריך כדי לראות שעות פנויות."}
            </p>
          ) : (loadingSlots || loadedKey !== slotKey) && times.length === 0 ? (
            <p className="text-white/40 text-sm">טוען שעות...</p>
          ) : slotsError ? (
            <p className="text-white/40 text-sm">לא ניתן לטעון שעות פנויות כרגע, נסי שוב מאוחר יותר.</p>
          ) : !slotsOpen ? (
            <p className="text-white/40 text-sm">הסטודיו סגור בתאריך זה.</p>
          ) : times.length === 0 ? (
            <p className="text-white/40 text-sm">אין שעות פנויות בתאריך זה, נסי תאריך אחר.</p>
          ) : (
            <>
              <SlotLegend />
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {times.map((slot) => (
                  <SlotButton key={slot.time} slot={slot} selected={time === slot.time} onSelect={selectTime} />
                ))}
              </div>
              {!hasFree && <p className="text-white/40 text-sm mt-3">אין שעות פנויות בתאריך זה, נסי תאריך אחר.</p>}
            </>
          )}
        </div>

        {time && (
          <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-4">
            <p className="text-sm text-violet-300 font-semibold">
              {date && format(date, "dd/MM/yyyy")} · {time}
            </p>
            <input
              required
              placeholder="שם מלא"
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="טלפון (אופציונלי)"
              value={form.phone}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d\s\-+()]/g, "");
                setForm((f) => ({ ...f, phone: next }));
                if (error) setError(null);
              }}
              pattern="[\d\s\-+()]*"
              title="נא להזין מספר טלפון תקין"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            {emailReady ? (
              <p className="text-xs text-white/50">
                העדכונים על התור יישלחו למייל{" "}
                <bdi dir="ltr" className="text-white/75 break-all">
                  {user.email}
                </bdi>
              </p>
            ) : (
              <p className="text-sm text-amber-200" role="alert">
                {EMAIL_NOT_VERIFIED_TEXT}{" "}
                <Link to="/account/email" state={{ from: "/booking" }} className="text-violet-200 underline">
                  לאימות האימייל
                </Link>
              </p>
            )}
            <textarea
              placeholder="הערות (אופציונלי)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <p className="text-xs text-white/45">התור ייקבע רק אחרי שאאשר את הבקשה.</p>
            <button type="submit" disabled={submitting || !emailReady} className="btn-violet w-full disabled:opacity-50">
              {submitting ? "שולחת בקשה..." : "שליחת בקשה לתור"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MyAppointments({ refreshKey }) {
  const [appointments, setAppointments] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchMyAppointments()
      .then((list) => {
        if (!cancelled) {
          setAppointments(list);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppointments([]);
          setError("לא הצלחתי לטעון את התורים.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <AppointmentsSection
      appointments={appointments}
      error={error}
      title="הבקשות והתורים שלי"
      emptyText="עדיין לא שלחת בקשה לתור."
      showBookingLink={false}
      onAppointmentUpdated={(updated) =>
        setAppointments((list) => (list || []).map((a) => (a.id === updated.id ? updated : a)))
      }
    />
  );
}

export default function Booking() {
  const [services, setServices] = useState([]);
  const [requestsVersion, setRequestsVersion] = useState(0);
  const { user } = useAuth();
  const location = useLocation();
  const prefillNotes = location.state?.prefillNotes ?? "";
  const skipServiceSelect = Boolean(location.state?.skipServiceSelect);
  const packageLabel = location.state?.packageLabel ?? "";
  const packageKey = typeof location.state?.packageKey === "string" ? location.state.packageKey : "";

  useEffect(() => {
    getServices()
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 space-y-16">
      <div className="text-center max-w-2xl mx-auto">
        <span className="section-eyebrow">Booking</span>
        <h1 className="text-3xl md:text-5xl font-black mt-3 mb-4">
          קביעת <span className="violet-text">תור</span>
        </h1>
        <p className="text-white/60">
          {skipServiceSelect
            ? "בחרי תאריך ושעה פנויה ושלחי בקשה — אעבור עליה ואאשר את התור."
            : "בחרי שירות, תאריך ושעה פנויה ושלחי בקשה — אעבור עליה ואאשר את התור."}
        </p>
      </div>

      <BookingForm
        services={services}
        user={user}
        initialNotes={prefillNotes}
        skipServiceSelect={skipServiceSelect}
        packageLabel={packageLabel}
        packageKey={packageKey}
        onRequested={() => setRequestsVersion((v) => v + 1)}
      />

      <MyAppointments refreshKey={requestsVersion} />
    </div>
  );
}
