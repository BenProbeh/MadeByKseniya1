import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchNotifications, markNotificationRead } from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDateTime } from "../lib/format.js";

const FILTERS = [
  { value: "new", label: "חדשות" },
  { value: "", label: "הכול" },
  { value: "read", label: "נקראו" },
];

const TYPE_TEXT = {
  duplicate_phone_signup:
    "התקבל ניסיון הרשמה עם מספר טלפון שכבר קיים במערכת. כדאי לבדוק אם מדובר בלקוחה קיימת.",
};

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-white/35">{label}</dt>
      <dd className="text-sm text-white/80 break-words">{children}</dd>
    </div>
  );
}

function NotificationItem({ item, busy, onRead }) {
  const m = item.metadata;
  const typedName = `${m.firstName} ${m.lastName}`.trim() || "—";
  const related = item.relatedUser;
  const isNew = item.status === "new";

  return (
    <li
      className={`rounded-xl border p-4 sm:p-5 space-y-4 ${
        isNew ? "border-violet-400/40 bg-violet-400/[0.04]" : "border-white/[0.08]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="font-serif text-white">
            {isNew && <span className="me-2 inline-block h-2 w-2 rounded-full bg-violet-400 align-middle" aria-hidden="true" />}
            {TYPE_TEXT[item.type] || m.reason}
          </p>
          <p className="text-xs text-white/45">
            {formatDateTime(m.lastAttemptAt)}
            {m.attempts > 1 ? ` · ${m.attempts} ניסיונות (הראשון ב־${formatDateTime(m.attemptedAt)})` : ""}
          </p>
        </div>
        <span className="text-[11px] text-white/45 shrink-0">{isNew ? "חדשה" : `נקראה ${formatDateTime(item.readAt)}`}</span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="שם שהוזן בהרשמה">{typedName}</Field>
        <Field label="שם משתמש שהוזן">{m.username ? <span dir="ltr">@{m.username}</span> : "—"}</Field>
        <Field label="טלפון">
          <span dir="ltr" className="inline-block">
            {m.phoneDisplay || "—"}
            {m.phoneE164 && <span className="text-white/40"> ({m.phoneE164})</span>}
          </span>
        </Field>
        <Field label="סיבה">{m.reason}</Field>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        {related && (
          <Link to={`/admin/customers/${related.id}`} className="btn-ghost px-4 py-2 text-sm">
            לחשבון הקיים: {`${related.firstName || ""} ${related.lastName || ""}`.trim() || `#${related.id}`}
            {related.removed ? " (הוסר)" : ""}
          </Link>
        )}
        {isNew && (
          <button type="button" className="btn-text text-sm" onClick={() => onRead(item.id)} disabled={busy}>
            {busy ? "רגע אחד…" : "סימון כנקראה"}
          </button>
        )}
      </div>
    </li>
  );
}

export default function AdminNotifications() {
  const { refreshUser } = useAuth();
  const [filter, setFilter] = useState("new");
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await fetchNotifications({ status: filter });
      setItems(data.notifications);
      setUnread(data.unread);
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לטעון את ההתראות."));
      const code = err?.response?.status;
      if (code === 401 || code === 403) await refreshUser();
    }
  }, [filter, refreshUser]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function onRead(id) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await markNotificationRead(id);
      setUnread(res.unread);
      setItems((prev) =>
        filter === "new" ? prev.filter((n) => n.id !== id) : prev.map((n) => (n.id === id ? res.notification : n))
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לעדכן את ההתראה."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Admin</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          <span className="violet-text">התראות</span> פנימיות
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base">
          {unread > 0 ? `${unread} התראות חדשות` : "אין התראות חדשות"}
        </p>
        <Link to="/admin/customers" className="btn-text text-sm">
          <span aria-hidden="true">→</span>
          חזרה לניהול לקוחות
        </Link>
      </div>

      <section className="glass-panel p-6 md:p-8 space-y-6" aria-label="רשימת התראות">
        <div className="flex flex-wrap gap-2" role="group" aria-label="סינון התראות">
          {FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              aria-pressed={filter === f.value}
              className={`pill-option py-2 min-h-[40px] ${filter === f.value ? "pill-option-active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="text-center space-y-3">
            <p className="text-sm text-amber-200" role="alert">
              {error}
            </p>
            <button type="button" className="btn-text text-sm" onClick={() => void load()}>
              לנסות שוב
            </button>
          </div>
        )}

        {!items && !error && <p className="text-sm text-white/45 text-center">ההתראות נטענות…</p>}

        {items && items.length === 0 && (
          <p className="font-serif text-sm text-white/55 text-center py-4">
            {filter === "new" ? "אין התראות חדשות." : "אין התראות להצגה."}
          </p>
        )}

        {items && items.length > 0 && (
          <ul className="space-y-4">
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} busy={busyId === item.id} onRead={onRead} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
