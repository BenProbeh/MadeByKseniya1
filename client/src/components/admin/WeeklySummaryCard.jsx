import { Link } from "react-router-dom";
import { formatCalendarDay, formatDateTime } from "../../lib/format.js";

function Signed({ value, suffix = "" }) {
  const text = value > 0 ? `+${value}${suffix}` : `${value}${suffix}`;
  return <span dir="ltr">{text}</span>;
}

function Stat({ label, children, hint }) {
  return (
    <div className="border border-white/[0.08] rounded-xl p-4 text-center space-y-1">
      <p className="text-xs text-white/45">{label}</p>
      <p className="font-serif text-3xl md:text-4xl violet-text leading-tight">{children}</p>
      {hint && <p className="text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

export default function WeeklySummaryCard({ stats, loading, error, onRetry }) {
  return (
    <section className="glass-panel p-6 md:p-8 space-y-6" aria-labelledby="weekly-summary-title">
      <div className="text-center space-y-2">
        <span className="section-eyebrow justify-center">Weekly</span>
        <h2 id="weekly-summary-title" className="font-serif text-2xl md:text-3xl text-white">
          סיכום <span className="violet-text">שבועי</span>
        </h2>
        {stats && (
          <p className="font-serif text-white/50 text-sm">
            השבוע שהתחיל ב{formatCalendarDay(stats.week.current.startDate)} · לפי שעון ישראל
          </p>
        )}
      </div>

      {loading && !stats && <p className="text-sm text-white/45 text-center">הנתונים נטענים…</p>}
      {error && (
        <div className="text-center space-y-3">
          <p className="text-sm text-amber-200">{error}</p>
          {onRetry && (
            <button type="button" className="btn-text text-sm" onClick={onRetry}>
              לנסות שוב
            </button>
          )}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="השבוע">{stats.week.current.count}</Stat>
            <Stat label="שבוע שעבר">{stats.week.previous.count}</Stat>
            <Stat label="שינוי">
              <Signed value={stats.week.change} />
            </Stat>
            <Stat
              label="שינוי באחוזים"
              hint={stats.week.changePercent == null ? "אין הצטרפויות בשבוע הקודם להשוואה" : null}
            >
              {stats.week.changePercent == null ? "—" : <Signed value={stats.week.changePercent} suffix="%" />}
            </Stat>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/60">
            <span>
              היום: <span className="text-white">{stats.totals.today}</span>
            </span>
            <span>
              7 ימים אחרונים: <span className="text-white">{stats.totals.last7Days}</span>
            </span>
            <span>
              סה״כ משתמשים: <span className="text-white">{stats.totals.all}</span>
            </span>
          </div>

          <p className="font-serif text-center text-white/75">
            {stats.week.busiestDay ? (
              <>
                היום העמוס ביותר השבוע: {formatCalendarDay(stats.week.busiestDay.date)} (
                {stats.week.busiestDay.count === 1 ? "הצטרפות אחת" : `${stats.week.busiestDay.count} הצטרפויות`})
              </>
            ) : (
              "עדיין אין הצטרפויות השבוע."
            )}
          </p>

          {stats.recentSignups.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-serif text-lg text-white text-center">הצטרפו לאחרונה</h3>
              <ul className="space-y-2">
                {stats.recentSignups.map((u) => (
                  <li key={u.id}>
                    <Link
                      to={`/admin/customers/${u.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] px-4 py-3 transition-colors hover:border-violet-400/40"
                    >
                      <span className="min-w-0 truncate text-white/85">
                        {u.firstName} {u.lastName}{" "}
                        <span className="text-xs text-white/40" dir="ltr">
                          @{u.username}
                        </span>
                      </span>
                      <span className="text-xs text-white/40 shrink-0">{formatDateTime(u.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
