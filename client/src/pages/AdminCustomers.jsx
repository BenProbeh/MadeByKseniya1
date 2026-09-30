import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import WeeklySummaryCard from "../components/admin/WeeklySummaryCard.jsx";
import { fetchAdminCustomers, fetchCustomerStats } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDate } from "../lib/format.js";

const PAGE_SIZE = 20;

const ROLE_FILTERS = [
  { value: "", label: "הכול", countKey: "all" },
  { value: "customer", label: "לקוחות", countKey: "customer" },
  { value: "admin", label: "מנהלים", countKey: "admin" },
  { value: "owner", label: "בעלים", countKey: "owner" },
];

function Meta({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-white/35">{label}</dt>
      <dd className="text-xs text-white/70 break-words">{children}</dd>
    </div>
  );
}

function CustomerRow({ customer }) {
  return (
    <li>
      <Link
        to={`/admin/customers/${customer.id}`}
        className="flex items-start gap-3 sm:gap-4 rounded-xl border border-white/[0.08] p-3 sm:p-4 transition-colors hover:border-violet-400/40 focus-visible:border-violet-400/60 outline-none"
      >
        <UserAvatar user={customer} className="h-10 w-10 sm:h-12 sm:w-12 text-base" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-serif text-lg text-white truncate">
              {customer.firstName} {customer.lastName}
            </p>
            <RoleBadge role={customer.role} />
          </div>
          <p className="text-xs text-white/45 text-right">
            <span dir="ltr">@{customer.username}</span>
          </p>
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2">
            <Meta label="טלפון">{customer.phone ? <span dir="ltr">{customer.phone}</span> : "—"}</Meta>
            <Meta label="הצטרפות">{formatDate(customer.createdAt)}</Meta>
            <Meta label="מידות">{customer.hasMeasurements ? "נשמרו" : "אין עדיין"}</Meta>
            <Meta label="הזמנות">{customer.ordersCount}</Meta>
            <Meta label="פעילות אחרונה">{customer.lastActiveAt ? formatDate(customer.lastActiveAt) : "—"}</Meta>
          </dl>
        </div>
        <span className="hidden sm:inline text-violet-300 self-center" aria-hidden="true">
          ←
        </span>
      </Link>
    </li>
  );
}

export default function AdminCustomers() {
  const { refreshUser } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const requestId = useRef(0);

  const onAuthFailure = useCallback(
    async (err) => {
      const status = err?.response?.status;
      if (status === 401 || status === 403) await refreshUser();
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
      const data = await fetchAdminCustomers({ search, role, sort, page, pageSize: PAGE_SIZE });
      if (id !== requestId.current) return;
      setResult(data);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(getApiErrorMessage(err, "לא הצלחתי לטעון את רשימת הלקוחות."));
      await onAuthFailure(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, role, sort, page, onAuthFailure]);

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

  const customers = result?.customers || [];
  const totals = result?.totals;
  const filtered = Boolean(search || role);

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
        <Link to="/profile" className="btn-text text-sm">
          <span aria-hidden="true">→</span>
          חזרה לפרופיל
        </Link>
      </div>

      <WeeklySummaryCard stats={stats} loading={statsLoading} error={statsError} onRetry={loadStats} />

      <section className="glass-panel p-6 md:p-8 space-y-6" aria-labelledby="customers-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="customers-title" className="font-serif text-2xl md:text-3xl text-white">
            רשימת הלקוחות
          </h2>
          {totals && (
            <p className="text-sm text-white/50" aria-live="polite">
              {filtered ? `${result.total} תוצאות מתוך ${totals.all}` : `סה״כ ${totals.all} משתמשים`}
            </p>
          )}
        </div>

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
                  onClick={() => {
                    setRole(f.value);
                    setPage(1);
                  }}
                >
                  {f.label}
                  {totals ? ` · ${totals[f.countKey] ?? 0}` : ""}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-white/60">
              <span>מיון:</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
              >
                <option value="newest" className="bg-oled-950">
                  הצטרפו לאחרונה
                </option>
                <option value="oldest" className="bg-oled-950">
                  הוותיקים ביותר
                </option>
              </select>
            </label>
          </div>
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
            {filtered ? "לא נמצאו לקוחות שמתאימים לחיפוש." : "עדיין אין לקוחות רשומים."}
          </p>
        )}

        {customers.length > 0 && (
          <ul className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            {customers.map((c) => (
              <CustomerRow key={c.id} customer={c} />
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
