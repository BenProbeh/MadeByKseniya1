import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import Calendar from "../components/Calendar.jsx";
import {
  getServices,
  getAvailability,
  createAppointment,
  findAppointmentsByPhone,
  updateAppointment,
} from "../lib/api.js";

/** Israeli phone: digits only after stripping spaces/dashes; 9–10 local digits, or 972 + 8–9. */
function isValidPhone(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("972")) {
    return digits.length >= 11 && digits.length <= 12;
  }
  return /^0\d{8,9}$/.test(digits);
}

function BookingForm({ services, initialNotes, skipServiceSelect = false, packageLabel = "" }) {
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [time, setTime] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ clientName: "", phone: "", email: "", notes: initialNotes || "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);
  const [slotsError, setSlotsError] = useState(false);

  useEffect(() => {
    if (!skipServiceSelect || !services.length || serviceId) return;
    setServiceId(String(services[0].id));
  }, [skipServiceSelect, services, serviceId]);

  useEffect(() => {
    setTime(null);
    setSlotsError(false);
    if (!date || !serviceId) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    getAvailability(format(date, "yyyy-MM-dd"), serviceId)
      .then((data) => {
        setSlots(data.slots);
        setSlotsOpen(data.open);
      })
      .catch(() => {
        setSlots([]);
        setSlotsError(true);
      })
      .finally(() => setLoadingSlots(false));
  }, [date, serviceId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!serviceId || !date || !time) return;
    if (!isValidPhone(form.phone)) {
      setError("נא להזין מספר טלפון תקין (ספרות בלבד).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const appt = await createAppointment({
        clientName: form.clientName,
        phone: form.phone,
        email: form.email || undefined,
        serviceId: Number(serviceId),
        date: format(date, "yyyy-MM-dd"),
        time,
        notes: form.notes || undefined,
      });
      setConfirmed(appt);
    } catch (err) {
      setError(err?.response?.data?.error || "לא הצלחנו לקבוע את התור, נסי שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    const service = services.find((s) => s.id === Number(serviceId));
    const label = packageLabel || service?.name_he;
    return (
      <div className="glass-panel p-8 text-center shadow-glow">
        <p className="text-4xl mb-4">✓</p>
        <h3 className="text-xl font-bold mb-2">התור נקבע בהצלחה!</h3>
        <p className="text-white/60">
          {label} · {confirmed.date} בשעה {confirmed.time}
        </p>
        <p className="text-white/40 text-sm mt-4">מספר אישור: #{confirmed.id}</p>
      </div>
    );
  }

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
          <p className="text-sm font-medium text-white/70 mb-3">שעות פנויות</p>
          {!serviceId || !date ? (
            <p className="text-white/40 text-sm">
              {skipServiceSelect ? "בחרי תאריך כדי לראות שעות פנויות." : "בחרי שירות ותאריך כדי לראות שעות פנויות."}
            </p>
          ) : loadingSlots ? (
            <p className="text-white/40 text-sm">טוען שעות...</p>
          ) : slotsError ? (
            <p className="text-white/40 text-sm">לא ניתן לטעון שעות פנויות כרגע, נסי שוב מאוחר יותר.</p>
          ) : !slotsOpen ? (
            <p className="text-white/40 text-sm">הסטודיו סגור בתאריך זה.</p>
          ) : slots.length === 0 ? (
            <p className="text-white/40 text-sm">אין שעות פנויות בתאריך זה, נסי תאריך אחר.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTime(s)}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                    time === s
                      ? "bg-violet-gradient text-oled-950 font-bold border-transparent"
                      : "border-white/15 text-white/70 hover:border-violet-400/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
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
              required
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="טלפון"
              value={form.phone}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d\s\-+()]/g, "");
                setForm((f) => ({ ...f, phone: next }));
                if (error) setError(null);
              }}
              pattern="[\d\s\-+()]+"
              title="נא להזין מספר טלפון תקין"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            <input
              type="email"
              placeholder="אימייל (אופציונלי)"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            <textarea
              placeholder="הערות (אופציונלי)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-violet w-full disabled:opacity-50">
              {submitting ? "קובעת תור..." : "אישור קביעת תור"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ManageAppointments() {
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newDate, setNewDate] = useState(null);
  const [newSlots, setNewSlots] = useState([]);
  const [newTime, setNewTime] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await findAppointmentsByPhone(phone.trim());
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setError("לא ניתן להתחבר לשרת כרגע, נסי שוב מאוחר יותר.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(appt) {
    setEditingId(appt.id);
    setNewDate(null);
    setNewTime(null);
    setNewSlots([]);
  }

  useEffect(() => {
    if (!editingId || !newDate) return;
    const appt = results.find((a) => a.id === editingId);
    if (!appt) return;
    getAvailability(format(newDate, "yyyy-MM-dd"), appt.service_id)
      .then((d) => setNewSlots(d.slots))
      .catch(() => setNewSlots([]));
  }, [newDate, editingId, results]);

  async function confirmReschedule(appt) {
    setBusy(true);
    setError(null);
    try {
      await updateAppointment(appt.id, { date: format(newDate, "yyyy-MM-dd"), time: newTime });
      const data = await findAppointmentsByPhone(phone.trim());
      setResults(Array.isArray(data) ? data : []);
      setEditingId(null);
    } catch {
      setError("לא הצלחנו להזיז את התור, נסי שוב מאוחר יותר.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(appt) {
    setBusy(true);
    setError(null);
    try {
      await updateAppointment(appt.id, { status: "cancelled" });
      const data = await findAppointmentsByPhone(phone.trim());
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setError("לא הצלחנו לבטל את התור, נסי שוב מאוחר יותר.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-panel p-6 md:p-8">
      <h3 className="text-lg font-bold mb-4">איתור וניהול תור קיים</h3>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="הזיני מספר טלפון"
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
        />
        <button type="submit" disabled={loading} className="btn-ghost px-6 shrink-0">
          {loading ? "מחפשת..." : "חיפוש"}
        </button>
      </form>

      {error && <p className="text-sm text-red-300 mb-4">{error}</p>}

      {results && results.length === 0 && (
        <p className="text-white/40 text-sm">לא נמצאו תורים פעילים למספר זה.</p>
      )}

      <div className="space-y-4">
        {results?.map((appt) => (
          <div key={appt.id} className="border border-white/10 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{appt.service_name}</p>
                <p className="text-sm text-white/50">
                  {appt.date} · {appt.time}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(appt)}
                  className="btn-ghost text-xs px-4 py-2"
                >
                  הזזת תור
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cancelAppointment(appt)}
                  className="text-xs px-4 py-2 rounded-full border border-red-400/30 text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </div>

            {editingId === appt.id && (
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <Calendar selectedDate={newDate} onSelectDate={setNewDate} />
                <div>
                  <p className="text-sm text-white/60 mb-2">שעות פנויות</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {newSlots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewTime(s)}
                        className={`px-3 py-1.5 rounded-full text-xs border ${
                          newTime === s
                            ? "bg-violet-gradient text-oled-950 font-bold border-transparent"
                            : "border-white/15 text-white/70 hover:border-violet-400/50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!newDate || !newTime || busy}
                    onClick={() => confirmReschedule(appt)}
                    className="btn-violet text-sm w-full disabled:opacity-50"
                  >
                    אישור הזזת תור
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Booking() {
  const [services, setServices] = useState([]);
  const location = useLocation();
  const prefillNotes = location.state?.prefillNotes ?? "";
  const skipServiceSelect = Boolean(location.state?.skipServiceSelect);
  const packageLabel = location.state?.packageLabel ?? "";

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
            ? "בחרי תאריך ושעה פנויה — התור נשמר אצלנו אונליין."
            : "בחרי שירות, תאריך ושעה פנויה — התור נשמר אצלנו אונליין."}
        </p>
      </div>

      <BookingForm
        services={services}
        initialNotes={prefillNotes}
        skipServiceSelect={skipServiceSelect}
        packageLabel={packageLabel}
      />

      <ManageAppointments />
    </div>
  );
}
