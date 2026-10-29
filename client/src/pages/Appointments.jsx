import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, Plus } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { AppointmentItem } from "../components/profile/ProfileSections.jsx";
import { fetchMyAppointments } from "../lib/api.js";
import { israelToday } from "../lib/nextStep.js";

const ACTIVE = new Set(["pending", "manager_approved", "confirmed"]);

/** The customer's requests and bookings: what's coming first, history below. */
export default function Appointments() {
  const [appointments, setAppointments] = useState(undefined);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    return fetchMyAppointments()
      .then(setAppointments)
      .catch(() => {
        setAppointments((prev) => prev ?? []);
        setError("לא הצלחתי לטעון את התורים. אפשר לנסות שוב.");
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = israelToday();
  const upcoming = (appointments || []).filter((a) => ACTIVE.has(a.status) && a.date >= today);
  const history = (appointments || []).filter((a) => !(ACTIVE.has(a.status) && a.date >= today));
  const onUpdated = (updated) => setAppointments((list) => (list || []).map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));

  return (
    <div className="max-w-2xl mx-auto space-y-7 pt-2">
      <PageHeader
        eyebrow="Appointments"
        title="התורים"
        accent="שלי"
        action={
          <Link to="/booking" className="btn-violet btn-sm gap-1.5">
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            תור חדש
          </Link>
        }
      />

      {error && (
        <div className="notice-warning justify-between items-center">
          <span>{error}</span>
          <button type="button" className="btn-text p-0" onClick={() => void load()}>
            לנסות שוב
          </button>
        </div>
      )}

      {appointments === undefined && (
        <div className="list-group" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="p-4 space-y-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-3.5 w-56" />
            </div>
          ))}
        </div>
      )}

      {appointments && (
        <section className="space-y-2" aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="section-title">
            קרובים
          </h2>
          {upcoming.length ? (
            <ul className="list-group">
              {upcoming.map((a) => (
                <AppointmentItem key={a.id} appointment={a} onUpdated={onUpdated} />
              ))}
            </ul>
          ) : (
            <div className="card">
              <EmptyState
                icon={CalendarPlus}
                title="אין תור קרוב"
                text="בוחרות מסלול, יום ושעה — ואני מאשרת בהקדם."
                action={
                  <Link to="/booking" className="btn-violet btn-sm">
                    קביעת תור
                  </Link>
                }
              />
            </div>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-2" aria-labelledby="history-title">
          <h2 id="history-title" className="section-title">
            היסטוריה
          </h2>
          <ul className="list-group">
            {history.map((a) => (
              <AppointmentItem key={a.id} appointment={a} onUpdated={onUpdated} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
