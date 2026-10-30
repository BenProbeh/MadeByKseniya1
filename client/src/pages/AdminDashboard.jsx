import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronLeft, Inbox, UserPlus } from "lucide-react";
import EmptyState from "../components/ui/EmptyState.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchAdminAppointments, fetchCustomerStats } from "../lib/authApi.js";
import { formatCalendarDay, formatDateTime } from "../lib/format.js";
import { israelToday } from "../lib/nextStep.js";

const REFRESH_MS = 60_000;

function displayName(a) {
  return `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.clientName || "לקוחה";
}

/** A count that opens its list. A count that needs a decision is lit: violet border, soft glow, gradient numeral. */
function Stat({ to, value, label, tone = "default" }) {
  const lit = tone === "attention" && value > 0;
  return (
    <Link
      to={to}
      className={`card p-4 flex flex-col gap-1.5 active:bg-oled-800 transition-colors ${lit ? "border-violet-400/50 shadow-glow-soft" : ""}`}
    >
      <span className={`marquee text-[2rem] leading-none ${lit ? "violet-text" : ""}`}>{value}</span>
      <span className="t-foot">{label}</span>
    </Link>
  );
}

/**
 * The owner's morning view: what needs a decision, who's coming today, and how the week is going.
 * Every number is a door to the list behind it.
 */
export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [appts, weekly] = await Promise.all([
        fetchAdminAppointments({ status: "", scope: "upcoming" }),
        fetchCustomerStats().catch(() => null),
      ]);
      setData(appts);
      setStats(weekly);
      setError("");
    } catch {
      setError("לא הצלחתי לטעון את הנתונים. אפשר לנסות שוב.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = israelToday();
  const list = data?.appointments || [];
  const pending = list.filter((a) => a.status === "pending").sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const todays = list
    .filter((a) => a.date === today && (a.status === "confirmed" || a.status === "manager_approved"))
    .sort((a, b) => a.time.localeCompare(b.time));
  const counts = data?.counts || { pending: 0, approved: 0, confirmed: 0 };

  return (
    <div className="max-w-3xl mx-auto space-y-7 pt-2">
      <header>
        <span className="section-eyebrow mb-2">Studio</span>
        <h1 className="t-large-title md:text-[2.25rem] md:leading-[2.75rem]">
          שלום
          {user?.firstName && (
            <>
              , <span className="violet-text">{user.firstName}</span>
            </>
          )}
        </h1>
        <p className="t-sub mt-1">{formatCalendarDay(today)}</p>
      </header>

      {error && (
        <div className="notice-warning justify-between items-center">
          <span>{error}</span>
          <button type="button" className="btn-text p-0" onClick={() => void load()}>
            לנסות שוב
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat to="/admin/appointments" value={counts.pending} label="ממתינות לאישור" tone="attention" />
        <Stat to="/admin/appointments?status=manager_approved" value={counts.approved} label="מחכות ללקוחה" />
        <Stat to="/admin/appointments?status=confirmed" value={counts.confirmed} label="מאושרים קדימה" />
      </div>

      <section className="space-y-2" aria-labelledby="pending-title">
        <div className="flex items-end justify-between px-1">
          <div>
            <span className="section-eyebrow mb-1">Requests</span>
            <h2 id="pending-title" className="t-title">
              בקשות שמחכות לך
            </h2>
          </div>
          {pending.length > 3 && (
            <Link to="/admin/appointments" className="btn-text">
              הכול
            </Link>
          )}
        </div>
        {!data && !error && <div className="skeleton h-28 rounded-card" aria-hidden="true" />}
        {data && pending.length === 0 && (
          <div className="card">
            <EmptyState icon={Inbox} title="אין בקשות פתוחות" text="כל הבקשות טופלו. בקשה חדשה תופיע כאן." compact />
          </div>
        )}
        {pending.length > 0 && (
          <ul className="list-group">
            {pending.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link to="/admin/appointments" className="list-row">
                  <UserAvatar user={{ firstName: displayName(a) }} className="h-10 w-10 text-sub" />
                  <span className="flex-1 min-w-0">
                    <span className="block t-headline truncate">{displayName(a)}</span>
                    <span className="block t-foot truncate">
                      {formatCalendarDay(a.date)} · <span className="tnum">{a.time}</span> · {a.serviceLabel}
                    </span>
                  </span>
                  <ChevronLeft size={20} className="text-white/30 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="today-title">
        <div className="px-1">
          <span className="section-eyebrow mb-1">Today</span>
          <h2 id="today-title" className="t-title">
            היום בסטודיו
          </h2>
        </div>
        {data && todays.length === 0 && (
          <div className="card">
            <EmptyState icon={CalendarClock} title="אין תורים היום" compact />
          </div>
        )}
        {todays.length > 0 && (
          <ul className="list-group">
            {todays.map((a) => (
              <li key={a.id} className="list-row">
                <span className="font-display text-headline text-violet-200 tnum w-14 shrink-0">{a.time}</span>
                <span className="flex-1 min-w-0">
                  <span className="block t-headline truncate">{displayName(a)}</span>
                  <span className="block t-foot truncate">{a.serviceLabel}</span>
                </span>
                {a.userId && (
                  <Link to={`/admin/customers/${a.userId}`} className="icon-btn text-white/50" aria-label={`כרטיס הלקוחה ${displayName(a)}`}>
                    <ChevronLeft size={20} aria-hidden="true" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats && (
        <section className="space-y-2" aria-labelledby="week-title">
          <div className="flex items-end justify-between px-1">
            <div>
              <span className="section-eyebrow mb-1">This week</span>
              <h2 id="week-title" className="t-title">
                הצטרפו השבוע
              </h2>
            </div>
            <Link to="/admin/customers?sort=newest" className="btn-text">
              ללקוחות
            </Link>
          </div>
          <div className="card p-4 space-y-4">
            <div className="flex items-end gap-4">
              <span className="marquee violet-text text-[2.75rem] leading-none">{stats.week.current.count}</span>
              <span className="t-sub pb-1">
                {stats.week.change === 0
                  ? "כמו בשבוע שעבר"
                  : stats.week.change > 0
                    ? `${stats.week.change} יותר משבוע שעבר`
                    : `${Math.abs(stats.week.change)} פחות משבוע שעבר`}
              </span>
            </div>
            {stats.recentSignups?.length > 0 ? (
              <ul className="space-y-1 -mx-1">
                {stats.recentSignups.slice(0, 4).map((u) => (
                  <li key={u.id}>
                    <Link to={`/admin/customers/${u.id}`} className="flex items-center gap-3 min-h-[3rem] px-1 rounded-control active:bg-white/[0.05]">
                      <UserPlus size={18} className="text-violet-300 shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0 truncate">
                        {u.firstName} {u.lastName}
                      </span>
                      <span className="t-foot shrink-0">{formatDateTime(u.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-foot">עדיין אין הצטרפויות השבוע.</p>
            )}
            <p className="t-foot">
              סה״כ <span className="tnum">{stats.totals.all}</span> משתמשים רשומים
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
