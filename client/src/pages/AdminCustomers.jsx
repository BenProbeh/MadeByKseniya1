import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import WeeklySummaryCard from "../components/admin/WeeklySummaryCard.jsx";
import DialButton from "../components/admin/DialButton.jsx";
import { SCORE_TIERS, ScoreBadge, ScoreLegend } from "../components/admin/CustomerScore.jsx";
import { fetchAdminCustomers, fetchCustomerStats, fetchUnreadNotificationCount } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDate } from "../lib/format.js";
import { isOwner } from "../lib/roles.js";

const PAGE_SIZE = 20;

const ROLE_FILTERS = [
  { value: "", label: "הכול", countKey: "all" },
  { value: "customer", label: "לקוחות", countKey: "customer" },
  { value: "admin", label: "מנהלים", countKey: "admin" },
  { value: "owner", label: "בעלים", countKey: "owner" },
];

const SORTS = [
  { value: "score", label: "דירוג גבוה קודם" },
  { value: "activity", label: "פעילות אחרונה" },
  { value: "newest", label: "הצטרפו לאחרונה" },
  { value: "oldest", label: "הוותיקים ביותר" },
];

function Meta({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-white/35">{label}</dt>
      <dd className="text-xs text-white/70 break-words">{children}</dd>
    </div>
  );
}

function CustomerRow({ customer, removedView }) {
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  return (
    <li className="relative flex items-start gap-3 sm:gap-4 rounded-xl border border-white/[0.08] p-3 sm:p-4 transition-colors hover:border-violet-400/40 focus-within:border-violet-400/60">
      <UserAvatar user={customer} className="h-10 w-10 sm:h-12 sm:w-12 text-base" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to={`/admin/customers/${customer.id}`}
            className="font-serif text-lg text-white truncate outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {fullName}
          </Link>
          <RoleBadge role={customer.role} />
          {!removedView && <ScoreBadge score={customer.score} />}
          {removedView && (
            <span className="inline-flex items-center rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] text-white/55">
              הוסר ב־{formatDate(customer.removedAt)}
            </span>
          )}
        </div>
        <p className="text-xs text-white/45 text-right">
          <span dir="ltr">@{customer.username}</span>
        </p>
        {customer.phoneE164 && (
          <div className="relative z-10 w-fit">
            <DialButton phoneE164={customer.phoneE164} phoneDisplay={customer.phone} name={fullName} />
          </div>
        )}
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
          <Meta label="הצטרפות">{formatDate(customer.createdAt)}</Meta>
          <Meta label="מידות">{customer.hasMeasurements ? "נשמרו" : "אין עדיין"}</Meta>
          <Meta label="הזמנות">{customer.ordersCount}</Meta>
          <Meta label="פעילות אחרונה">{customer.lastActiveAt ? formatDate(customer.lastActiveAt) : "—"}</Meta>
          {!customer.phoneE164 && (
            <Meta label="טלפון">{customer.phone ? <span dir="ltr">{customer.phone}</span> : "לא נשמר"}</Meta>
          )}
        </dl>
      </div>
      <span className="hidden sm:inline text-violet-300 self-center" aria-hidden="true">
        ←
      </span>
    </li>
  );
}

export default function AdminCustomers() {
  const { user, refreshUser } = useAuth();
  const owner = isOwner(user);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState("score");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [unread, setUnread] = useState(0);

  const requestId = useRef(0);
  const removedView = status === "removed";

  const onAuthFailure = useCallback(
    async (err) => {
      const code = err?.response?.status;
      if (code === 401 || code === 403) await refreshUser();
    },
    [refreshUser]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminCustomers({ search, role, tier, sort, status, page, pageSize: PAGE_SIZE });
      if (id !== requestId.current) return;
      setResult(data);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(getApiErrorMessage(err, "לא הצלחתי לטעון את רשימת הלקוחות."));
      await onAuthFailure(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, role, tier, sort, status, page, onAuthFailure]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      setStats(await fetchCustomerStats());
    } catch (err) {
      setStatsError(getApiErrorMessage(err, "לא הצלחתי לטעון את הסיכום השבועי."));
      await onAuthFailure(err);
    } finally {
      setStatsLoading(false);
    }
  }, [onAuthFailure]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    fetchUnreadNotificationCount()
      .then(setUnread)
      .catch(() => setUnread(0));
  }, []);

  const customers = result?.customers || [];
  const totals = result?.totals;
  const tiers = result?.tiers;
  const filtered = Boolean(search || role || tier);

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Admin</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          ניהול <span className="violet-text">לקוחות</span>
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">
          כל מי שנרשם לאתר, במקום אחד.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link to="/profile" className="btn-text text-sm">
            <span aria-hidden="true">→</span>
            חזרה לפרופיל
          </Link>
          <Link to="/admin/notifications" className="btn-ghost px-5 py-2.5 text-sm">
            התראות
            {unread > 0 && (
              <span
                className="ms-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-violet-400 px-1.5 text-xs text-oled-950 font-semibold"
                aria-label={`${unread} התראות חדשות`}
              >
                {unread}
              </span>
            )}
          </Link>
          <Link to="/admin/content" className="btn-ghost px-5 py-2.5 text-sm">
            ניהול תוכן
          </Link>
        </div>
      </div>

      <WeeklySummaryCard stats={stats} loading={statsLoading} error={statsError} onRetry={loadStats} />

      <section className="glass-panel p-6 md:p-8 space-y-6" aria-labelledby="customers-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="customers-title" className="font-serif text-2xl md:text-3xl text-white">
            {removedView ? "משתמשים שהוסרו" : "רשימת הלקוחות"}
          </h2>
          {totals && (
            <p className="text-sm text-white/50" aria-live="polite">
              {removedView
                ? `${result.total} משתמשים שהוסרו`
                : filtered
                  ? `${result.total} תוצאות מתוך ${totals.all}`
                  : `סה״כ ${totals.all} משתמשים`}
            </p>
          )}
        </div>

        {owner && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="מצב חשבונות">
            {[
              { value: "active", label: "פעילים" },
              { value: "removed", label: `הוסרו${totals ? ` · ${totals.removed}` : ""}` },
            ].map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={status === s.value}
                className={`pill-option py-2 min-h-[40px] ${status === s.value ? "pill-option-active" : ""}`}
                onClick={() => changeFilter(setStatus, s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <label className="block space-y-2 text-sm text-white/70">
            <span>חיפוש לפי שם, שם משתמש או טלפון</span>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={100}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
              placeholder="לדוגמה: דנה, dana_k או 050"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי תפקיד">
              {ROLE_FILTERS.map((f) => (
                <button
                  key={f.value || "all"}
                  type="button"
                  aria-pressed={role === f.value}
                  className={`pill-option py-2 min-h-[40px] ${role === f.value ? "pill-option-active" : ""}`}
                  onClick={() => changeFilter(setRole, f.value)}
                >
                  {f.label}
                  {totals && !removedView ? ` · ${totals[f.countKey] ?? 0}` : ""}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-white/60">
              <span>מיון:</span>
              <select
                value={sort}
                onChange={(e) => changeFilter(setSort, e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-oled-950">
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!removedView && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי דירוג">
                <button
                  type="button"
                  aria-pressed={tier === ""}
                  className={`pill-option py-2 min-h-[40px] ${tier === "" ? "pill-option-active" : ""}`}
                  onClick={() => changeFilter(setTier, "")}
                >
                  כל הדירוגים
                </button>
                {SCORE_TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={tier === t.value}
                    className={`pill-option py-2 min-h-[40px] inline-flex items-center gap-2 ${
                      tier === t.value ? "pill-option-active" : ""
                    }`}
                    onClick={() => changeFilter(setTier, t.value)}
                  >
                    <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
                    {t.label}
                    {tiers ? ` · ${tiers[t.value] ?? 0}` : ""}
                  </button>
                ))}
              </div>
              <ScoreLegend />
            </>
          )}
        </div>

        {loading && !result && <p className="text-sm text-white/45 text-center">הרשימה נטענת…</p>}

        {error && (
          <div className="text-center space-y-3">
            <p className="text-sm text-amber-200" role="alert">
              {error}
            </p>
            <button type="button" className="btn-text text-sm" onClick={() => void loadCustomers()}>
              לנסות שוב
            </button>
          </div>
        )}

        {result && !error && customers.length === 0 && (
          <p className="font-serif text-sm text-white/55 text-center py-4">
            {removedView
              ? "אין משתמשים שהוסרו."
              : filtered
                ? "לא נמצאו לקוחות שמתאימים לחיפוש."
                : "עדיין אין לקוחות רשומים."}
          </p>
        )}

        {customers.length > 0 && (
          <ul className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            {customers.map((c) => (
              <CustomerRow key={c.id} customer={c} removedView={removedView} />
            ))}
          </ul>
        )}

        {result && result.totalPages > 1 && (
          <nav className="flex items-center justify-center gap-4 pt-2" aria-label="עמודים">
            <button
              type="button"
              className="btn-ghost px-5 py-2.5 text-sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              הקודם
            </button>
            <span className="text-sm text-white/55">
              עמוד {result.page} מתוך {result.totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost px-5 py-2.5 text-sm"
              disabled={page >= result.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              הבא
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
