import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, Search, UsersRound } from "lucide-react";
import PageHeader from "../components/ui/PageHeader.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import RoleBadge from "../components/admin/RoleBadge.jsx";
import { SCORE_TIERS } from "../components/admin/CustomerScore.jsx";
import { fetchAdminCustomers } from "../lib/authApi.js";
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

function CustomerRow({ customer, removedView }) {
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  const tier = SCORE_TIERS.find((t) => t.value === customer.score?.tier);
  const secondary = customer.email || customer.phone || `@${customer.username}`;
  return (
    <li>
      <Link to={`/admin/customers/${customer.id}`} className="list-row">
        <UserAvatar user={customer} className="h-11 w-11 text-base" />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="t-headline truncate">{fullName}</span>
            {customer.role !== "customer" && <RoleBadge role={customer.role} />}
          </span>
          <span className="block t-foot truncate">
            <bdi dir="ltr">{secondary}</bdi>
            {customer.email && !customer.emailVerified ? " · לא מאומת" : ""}
          </span>
          <span className="flex items-center gap-1.5 text-cap text-white/45 mt-0.5">
            {removedView ? (
              <>הוסר ב־{formatDate(customer.removedAt)}</>
            ) : (
              <>
                {tier && <span className={`h-2 w-2 rounded-full ${tier.dot}`} aria-hidden="true" />}
                {tier ? (customer.score?.insufficientData ? "עוד אין מספיק פעילות" : tier.label) : "דירוג יחושב בקרוב"}
                {customer.lastActiveAt && <> · פעילה {formatDate(customer.lastActiveAt)}</>}
              </>
            )}
          </span>
        </span>
        <ChevronLeft size={20} className="text-white/30 shrink-0" aria-hidden="true" />
      </Link>
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
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState(() => (SORTS.some((x) => x.value === searchParams.get("sort")) ? searchParams.get("sort") : "score"));
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const customers = result?.customers || [];
  const totals = result?.totals;
  const tiers = result?.tiers;
  const filtered = Boolean(search || role || tier);

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pt-2">
      <PageHeader
        eyebrow="Clients"
        {...(removedView ? { title: "משתמשים", accent: "שהוסרו" } : { accent: "לקוחות" })}
        subtitle={
          totals
            ? removedView
              ? `${result.total} משתמשים שהוסרו`
              : filtered
                ? `${result.total} תוצאות מתוך ${totals.all}`
                : `${totals.all} רשומות`
            : " "
        }
      />

      <div className="relative">
        <Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
        <label htmlFor="customer-search" className="sr-only">
          חיפוש לפי שם, אימייל או טלפון
        </label>
        <input
          id="customer-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="input ps-11 rounded-full"
          placeholder="חיפוש: שם, אימייל או 050…"
        />
      </div>

      <div className="space-y-2">
        <div className="chip-scroller" role="group" aria-label="סינון">
          {owner &&
            [
              { value: "active", label: "פעילים" },
              { value: "removed", label: `הוסרו${totals ? ` · ${totals.removed}` : ""}` },
            ].map((s) => (
              <button key={s.value} type="button" aria-pressed={status === s.value} className="chip" onClick={() => changeFilter(setStatus, s.value)}>
                {s.label}
              </button>
            ))}
          {owner && <span className="w-px bg-white/10 my-2" aria-hidden="true" />}
          {ROLE_FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" aria-pressed={role === f.value} className="chip" onClick={() => changeFilter(setRole, f.value)}>
              {f.label}
              {totals && !removedView ? <span className="tnum text-white/45">{totals[f.countKey] ?? 0}</span> : null}
            </button>
          ))}
        </div>
        {!removedView && (
          <div className="chip-scroller" role="group" aria-label="סינון לפי פעילות">
            <button type="button" aria-pressed={tier === ""} className="chip" onClick={() => changeFilter(setTier, "")}>
              כל רמות הפעילות
            </button>
            {SCORE_TIERS.map((t) => (
              <button key={t.value} type="button" aria-pressed={tier === t.value} className="chip" onClick={() => changeFilter(setTier, t.value)}>
                <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
                {t.label}
                {tiers ? <span className="tnum text-white/45">{tiers[t.value] ?? 0}</span> : null}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center justify-end gap-2 t-foot">
          <span>מיון</span>
          <select value={sort} onChange={(e) => changeFilter(setSort, e.target.value)} className="input w-auto min-h-[2.5rem] py-1.5 text-sub rounded-full">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && !result && (
        <div className="list-group" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="list-row">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="notice-warning justify-between items-center" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-text p-0" onClick={() => void loadCustomers()}>
            לנסות שוב
          </button>
        </div>
      )}

      {result && !error && customers.length === 0 && (
        <div className="card">
          <EmptyState
            icon={UsersRound}
            title={removedView ? "אין משתמשים שהוסרו" : filtered ? "לא נמצאו התאמות" : "עדיין אין לקוחות"}
            text={filtered ? "אפשר לנסות חיפוש אחר או לנקות את הסינון." : removedView ? "" : "כשלקוחה תירשם, היא תופיע כאן."}
            compact
          />
        </div>
      )}

      {customers.length > 0 && (
        <ul className={`list-group transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {customers.map((c) => (
            <CustomerRow key={c.id} customer={c} removedView={removedView} />
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="עמודים">
          <button type="button" className="btn-ghost btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            הקודם
          </button>
          <span className="t-foot tnum">
            {result.page} / {result.totalPages}
          </span>
          <button type="button" className="btn-ghost btn-sm" disabled={page >= result.totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            הבא
          </button>
        </nav>
      )}

      <p className="t-foot px-1">
        רמת הפעילות היא ציון פנימי לצוות בלבד: תורים, מסלולים, רכישות ופעילות אחרונה. לקוחות פעילות מופיעות ראשונות.
      </p>
    </div>
  );
}
