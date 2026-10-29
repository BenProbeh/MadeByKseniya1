import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, CalendarSearch, Check, MapPin } from "lucide-react";
import Calendar from "../components/Calendar.jsx";
import Sheet from "../components/ui/Sheet.jsx";
import TextField from "../components/ui/TextField.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import api, { getAvailability, createAppointmentRequest } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import AppointmentStatusBadge from "../components/AppointmentStatusBadge.jsx";
import { formatCalendarDay } from "../lib/format.js";
import { STUDIO_ADDRESS_LINE_1, STUDIO_ADDRESS_LINE_2, STUDIO_WAZE_URL, openStudioInWaze } from "../lib/studioAddress.js";

/** How often an open booking page re-reads the shared schedule. */
const REFRESH_MS = 30_000;
const STRIP_DAYS = 21;

const SLOT_TAKEN_NOTICE = "השעה שבחרת נתפסה בינתיים. אפשר לבחור שעה אחרת.";
const SLOT_STATE_TEXT = { free: "פנוי", pending: "ממתין לאישור", booked: "תפוס" };
const EMAIL_NOT_VERIFIED_TEXT = "כדי לשלוח בקשה לתור צריך קודם לאמת את כתובת האימייל בחשבון.";

/** Optional contact phone; when given: 9–10 local digits, or 972 + 8–9. */
function isValidPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return true;
  if (digits.startsWith("972")) return digits.length >= 11 && digits.length <= 12;
  return /^0\d{8,9}$/.test(digits);
}

function newRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Next three weeks as a swipeable strip; later dates come from the month sheet. */
function DayStrip({ selected, onSelect, onMore }) {
  const today = startOfDay(new Date());
  const days = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i)), [today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedOutside = selected && !days.some((d) => isSameDay(d, selected));
  return (
    <div className="chip-scroller gap-2 py-1" role="listbox" aria-label="בחירת יום">
      {days.map((day, i) => {
        const on = selected && isSameDay(day, selected);
        return (
          <button
            key={day.toISOString()}
            type="button"
            role="option"
            aria-selected={Boolean(on)}
            onClick={() => onSelect(day)}
            className={`flex flex-col items-center justify-center w-[3.75rem] h-[4.75rem] rounded-control border transition-colors ${
              on ? "border-violet-400 bg-violet-400 text-white" : "border-white/[0.12] bg-white/[0.03] text-white/80 active:bg-white/[0.08]"
            }`}
            style={on ? { color: "#fff" } : undefined}
          >
            <span className={`text-cap ${on ? "" : "text-white/50"}`}>{i === 0 ? "היום" : i === 1 ? "מחר" : format(day, "EEEEEE", { locale: he })}</span>
            <span className="font-display text-title tnum leading-none mt-1">{format(day, "d")}</span>
            <span className={`text-cap ${on ? "" : "text-white/40"}`}>{format(day, "MMM", { locale: he })}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className={`flex flex-col items-center justify-center gap-1 w-[4.25rem] h-[4.75rem] rounded-control border border-dashed text-cap ${
          selectedOutside ? "border-violet-400 text-white bg-violet-400/15" : "border-white/20 text-white/60"
        }`}
      >
        <CalendarSearch size={20} strokeWidth={1.8} aria-hidden="true" />
        {selectedOutside ? format(selected, "d.M") : "תאריך אחר"}
      </button>
    </div>
  );
}

function SlotButton({ slot, selected, onSelect }) {
  const base = "min-h-[3.25rem] rounded-control px-2 border flex flex-col items-center justify-center leading-tight transition-colors tnum";
  if (slot.state !== "free") {
    // Kept from the calendar's meaning: pending = grey (held while waiting), booked = red (taken).
    const style = slot.state === "booked" ? "border-red-400/30 bg-red-500/10 text-red-300/80" : "border-white/[0.06] bg-white/[0.05] text-white/40";
    return (
      <button type="button" disabled aria-label={`${slot.time} — ${SLOT_STATE_TEXT[slot.state]}`} className={`${base} ${style} cursor-not-allowed`}>
        <span className={`text-body ${slot.state === "booked" ? "line-through decoration-1" : ""}`}>{slot.time}</span>
        <span className="text-cap mt-0.5">{SLOT_STATE_TEXT[slot.state]}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.time)}
      aria-pressed={selected}
      aria-label={`${slot.time} — ${SLOT_STATE_TEXT.free}`}
      className={`${base} text-body ${
        selected ? "border-violet-400 bg-violet-400 font-bold" : "border-white/[0.14] bg-white/[0.03] text-white/85 active:bg-white/[0.08]"
      }`}
      style={selected ? { color: "#fff" } : undefined}
    >
      {slot.time}
    </button>
  );
}

function SlotLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 t-foot" aria-hidden="true">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-white/40" />
        פנוי
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
        ממתין לאישור
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
        תפוס
      </span>
    </div>
  );
}

function Step({ n, title, children, done }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="flex items-center gap-2.5 t-headline">
        <span
          className={`grid place-items-center w-6 h-6 rounded-full text-cap font-bold tnum ${done ? "bg-violet-400" : "bg-white/10 text-white/70"}`}
          style={done ? { color: "#fff" } : undefined}
          aria-hidden="true"
        >
          {done ? <Check size={14} strokeWidth={3} /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function RequestSent({ appointment, label, email }) {
  return (
    <div className="max-w-md mx-auto pt-6 space-y-6 text-center" role="status" aria-live="polite">
      <span className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-violet-400/15 text-violet-200" aria-hidden="true">
        <CalendarDays size={30} strokeWidth={1.7} />
      </span>
      <AppointmentStatusBadge status="pending" />
      <div className="space-y-3">
        <h1 className="t-title leading-snug">קיבלתי את הפרטים שלך, מיד אעבור עליהם ואשתדל לאשר את התור. נתראה!</h1>
        <p className="t-sub">
          {label} · {formatCalendarDay(appointment.date)} בשעה <span className="tnum">{appointment.time}</span>
        </p>
        {email && (
          <p className="t-foot">
            עדכון יגיע למייל{" "}
            <bdi dir="ltr" className="break-all text-white/70">
              {email}
            </bdi>
          </p>
        )}
      </div>

      <div className="list-group text-start">
      <a
        href={STUDIO_WAZE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault();
          openStudioInWaze();
        }}
        className="list-row"
        aria-label="ניווט בוויז אל הסטודיו"
      >
        <span className="grid place-items-center w-10 h-10 rounded-full bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
          <MapPin size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block t-headline">ניווט לסטודיו</span>
          <span className="block t-foot">
            {STUDIO_ADDRESS_LINE_1} {STUDIO_ADDRESS_LINE_2}
          </span>
        </span>
      </a>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/" className="btn-ghost">
          לבית
        </Link>
        <Link to="/appointments" className="btn-violet">
          לתורים שלי
        </Link>
      </div>
    </div>
  );
}

export default function Booking() {
  const { user } = useAuth();
  const location = useLocation();
  const initialNotes = location.state?.prefillNotes ?? "";
  const skipServiceSelect = Boolean(location.state?.skipServiceSelect);
  const packageLabel = location.state?.packageLabel ?? "";
  const packageKey = typeof location.state?.packageKey === "string" ? location.state.packageKey : "";

  const [services, setServices] = useState(null);
  const [servicesError, setServicesError] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
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
  const timesRef = useRef(null);
  const detailsRef = useRef(null);

  const dateStr = date ? format(date, "yyyy-MM-dd") : "";
  const slotKey = `${dateStr}|${serviceId}`;

  // Real services only: a booking must never be sent for a placeholder catalogue.
  const loadServices = useCallback(() => {
    setServicesError(false);
    api
      .get("/services")
      .then((r) => setServices(Array.isArray(r.data) ? r.data : []))
      .catch(() => {
        setServices([]);
        setServicesError(true);
      });
  }, []);
  useEffect(() => loadServices(), [loadServices]);

  useEffect(() => {
    if (!skipServiceSelect || !services?.length || serviceId) return;
    setServiceId(String(services[0].id));
  }, [skipServiceSelect, services, serviceId]);

  useEffect(() => {
    if (requested) window.scrollTo({ top: 0, behavior: "auto" });
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
        const list = Array.isArray(data?.times) ? data.times : (data?.slots || []).map((t) => ({ time: t, state: "free" }));
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

  function pickDate(next) {
    setDate(next);
    setCalendarOpen(false);
    window.setTimeout(() => timesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function selectTime(next) {
    setTime(next);
    setNotice("");
    setError(null);
    window.setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current || !serviceId || !dateStr || !time) return;
    if (!emailReady) return setError(EMAIL_NOT_VERIFIED_TEXT);
    if (!form.clientName.trim()) return setError("נשאר להקליד שם.");
    if (!isValidPhone(form.phone)) return setError("מספר הטלפון לא נראה תקין. אפשר גם להשאיר את השדה ריק.");
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
    } catch (err) {
      const data = err?.response?.data;
      const message = typeof data?.error === "string" ? data.error : "";
      if (data?.code === "SLOT_TAKEN") {
        setTime(null);
        setNotice(message || SLOT_TAKEN_NOTICE);
        loadSlots({ silent: true });
      } else {
        setError(message || "לא הצלחתי לשלוח את הבקשה. אפשר לנסות שוב.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (requested) {
    const service = services?.find((s) => s.id === Number(serviceId));
    return <RequestSent appointment={requested} label={requested.serviceLabel || packageLabel || service?.name_he} email={user?.email} />;
  }

  const hasFree = times.some((t) => t.state === "free");
  const slotsLoading = (loadingSlots || loadedKey !== slotKey) && times.length === 0;
  const selectedService = services?.find((s) => String(s.id) === serviceId);
  let n = 0;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-8 pt-2" noValidate>
      <PageHeader title="קביעת תור" subtitle="בוחרות יום ושעה, ואני מאשרת את הבקשה בהקדם." />

      {servicesError && (
        <div className="notice-warning justify-between items-center">
          <span>לא הצלחתי לטעון את רשימת הטיפולים.</span>
          <button type="button" className="btn-text p-0" onClick={loadServices}>
            לנסות שוב
          </button>
        </div>
      )}

      {skipServiceSelect && packageLabel ? (
        <div className="card p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-foot">המסלול שבחרת</p>
            <p className="t-headline truncate">{packageLabel}</p>
          </div>
          <Link to="/services" className="btn-text shrink-0">
            החלפה
          </Link>
        </div>
      ) : (
        <Step n={++n} title="טיפול" done={Boolean(serviceId)}>
          {services === null ? (
            <div className="skeleton h-32 rounded-card" aria-hidden="true" />
          ) : (
            <div className="list-group" role="radiogroup" aria-label="בחירת טיפול">
              {services.map((s) => {
                const on = String(s.id) === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setServiceId(String(s.id))}
                    className="list-row"
                  >
                    <span
                      className={`grid place-items-center w-5 h-5 rounded-full border-2 shrink-0 ${on ? "border-violet-400 bg-violet-400" : "border-white/30"}`}
                      aria-hidden="true"
                    >
                      {on && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-body text-white">{s.name_he}</span>
                      <span className="block t-foot tnum">{s.duration_min} דק׳</span>
                    </span>
                    <span className="font-display text-headline tnum shrink-0">{s.price_ils} ₪</span>
                  </button>
                );
              })}
            </div>
          )}
        </Step>
      )}

      <Step n={++n} title="יום" done={Boolean(date)}>
        <DayStrip selected={date} onSelect={pickDate} onMore={() => setCalendarOpen(true)} />
      </Step>

      <div ref={timesRef} className="scroll-mt-[calc(var(--safe-top)+var(--header-h)+1rem)]">
        <Step n={++n} title="שעה" done={Boolean(time)}>
          {notice && (
            <p className="notice-warning" role="alert">
              {notice}
            </p>
          )}
          {!serviceId || !date ? (
            <p className="t-sub">{!serviceId ? "בחרי טיפול ויום, ואראה לך את השעות הפנויות." : "בחרי יום, ואראה לך את השעות הפנויות."}</p>
          ) : slotsLoading ? (
            <div className="grid grid-cols-3 gap-2" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="skeleton h-[3.25rem] rounded-control" />
              ))}
            </div>
          ) : slotsError ? (
            <div className="notice-warning justify-between items-center">
              <span>לא הצלחתי לטעון את השעות.</span>
              <button type="button" className="btn-text p-0" onClick={() => loadSlots()}>
                לנסות שוב
              </button>
            </div>
          ) : !slotsOpen ? (
            <EmptyState compact icon={CalendarDays} title="הסטודיו סגור ביום הזה" text="אפשר לבחור יום אחר." />
          ) : times.length === 0 || !hasFree ? (
            <EmptyState compact icon={CalendarDays} title="אין שעות פנויות ביום הזה" text="אפשר לנסות יום אחר בפס הימים." />
          ) : (
            <>
              <SlotLegend />
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {times.map((slot) => (
                  <SlotButton key={slot.time} slot={slot} selected={time === slot.time} onSelect={selectTime} />
                ))}
              </div>
            </>
          )}
        </Step>
      </div>

      {time && (
        <div ref={detailsRef} className="scroll-mt-[calc(var(--safe-top)+var(--header-h)+1rem)]">
          <Step n={++n} title="פרטים">
            <div className="space-y-4">
              <TextField
                label="שם מלא"
                autoComplete="name"
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                maxLength={80}
              />
              <TextField
                label="טלפון (לא חובה)"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                ltr
                value={form.phone}
                onChange={(e) => {
                  setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d\s\-+()]/g, "") }));
                  if (error) setError(null);
                }}
                hint="רק אם נוח לך שאתקשר במקרה הצורך."
              />
              <TextField
                as="textarea"
                label="הערות (לא חובה)"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                maxLength={500}
              />
              <p className="t-foot">התור נקבע אחרי שאאשר את הבקשה.</p>
              {emailReady ? (
                <p className="t-foot">
                  עדכונים על התור יגיעו למייל{" "}
                  <bdi dir="ltr" className="text-white/70 break-all">
                    {user.email}
                  </bdi>
                </p>
              ) : (
                <p className="notice-warning" role="alert">
                  <span>
                    {EMAIL_NOT_VERIFIED_TEXT}{" "}
                    <Link to="/account/email" state={{ from: "/booking" }} className="underline">
                      לאימות האימייל
                    </Link>
                  </span>
                </p>
              )}
            </div>
          </Step>
        </div>
      )}

      {error && (
        <p className="notice-error" role="alert">
          {error}
        </p>
      )}

      {time && date && (
        <div className="sticky-cta">
          <p className="text-center t-sub mb-2 tnum">
            {selectedService?.name_he || packageLabel} · {formatCalendarDay(dateStr)} · {time}
          </p>
          <button type="submit" disabled={submitting || !emailReady} className="btn-violet btn-block">
            {submitting && <span className="spinner" aria-hidden="true" />}
            {submitting ? "שולחת בקשה…" : "שליחת בקשה לתור"}
          </button>
        </div>
      )}

      <Sheet open={calendarOpen} onClose={() => setCalendarOpen(false)} title="בחירת תאריך">
        <Calendar selectedDate={date} onSelectDate={pickDate} />
      </Sheet>
    </form>
  );
}
