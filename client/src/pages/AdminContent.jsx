import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import {
  deleteContentPage,
  duplicateContentPage,
  fetchContentPages,
  setContentPagePublished,
} from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDateTime } from "../lib/format.js";

function StatusBadge({ status }) {
  const published = status === "published";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] shrink-0 ${
        published ? "border-violet-400/60 text-violet-100 bg-violet-400/15" : "border-white/20 text-white/55"
      }`}
    >
      {published ? "מפורסם" : "טיוטה"}
    </span>
  );
}

export default function AdminContent() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [pages, setPages] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setPages(await fetchContentPages());
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לטעון את הדפים."));
      const code = err?.response?.status;
      if (code === 401 || code === 403) await refreshUser();
    }
  }, [refreshUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDelete = useCallback(() => {
    if (!busyId) setPendingDelete(null);
  }, [busyId]);

  async function run(id, action, okText) {
    if (busyId) return;
    setBusyId(id);
    setMessage("");
    setError("");
    try {
      const result = await action();
      await load();
      setMessage(okText);
      return result;
    } catch (err) {
      setError(getApiErrorMessage(err, "הפעולה לא הושלמה. אפשר לנסות שוב."));
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function onDuplicate(page) {
    const copy = await run(page.id, () => duplicateContentPage(page.id), "נוצר עותק כטיוטה.");
    if (copy?.id) navigate(`/admin/content/${copy.id}`);
  }

  async function confirmDelete() {
    if (!pendingDelete || busyId) return;
    setBusyId(pendingDelete.id);
    setDeleteError("");
    try {
      await deleteContentPage(pendingDelete.id);
      setPendingDelete(null);
      setMessage("הדף נמחק מהאתר.");
      await load();
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, "לא הצלחתי למחוק את הדף."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Admin</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          ניהול <span className="violet-text">תוכן</span>
        </h1>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">
          יצירה ועריכה של דפים באתר, בעיצוב של האתר ובלי קוד.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link to="/profile" className="btn-text text-sm">
            <span aria-hidden="true">→</span>
            חזרה לפרופיל
          </Link>
          <Link to="/admin/content/new" className="btn-violet">
            צור דף
          </Link>
        </div>
      </div>

      <section className="glass-panel p-6 md:p-8 space-y-6" aria-labelledby="pages-title">
        <h2 id="pages-title" className="font-serif text-2xl md:text-3xl text-white">
          עריכת דפים
        </h2>

        {message && (
          <p className="text-sm text-violet-200" role="status" aria-live="polite">
            {message}
          </p>
        )}
        {error && (
          <p className="text-sm text-amber-200" role="alert">
            {error}
          </p>
        )}

        {!pages && !error && <p className="text-sm text-white/45 text-center">הדפים נטענים…</p>}

        {pages && pages.length === 0 && (
          <p className="font-serif text-sm text-white/55 text-center py-4">עדיין אין דפים. אפשר ליצור את הראשון.</p>
        )}

        {pages && pages.length > 0 && (
          <ul className="space-y-3">
            {pages.map((page) => {
              const published = page.status === "published";
              const busy = busyId === page.id;
              return (
                <li key={page.id} className="rounded-xl border border-white/[0.08] p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link to={`/admin/content/${page.id}`} className="font-serif text-lg text-white hover:text-violet-200">
                      {page.title}
                    </Link>
                    <StatusBadge status={page.status} />
                  </div>
                  <p className="text-xs text-white/45">
                    <span dir="ltr">/{page.slug}</span>
                    {" · "}
                    עודכן {formatDateTime(page.updatedAt)}
                    {page.updatedBy?.name ? ` על ידי ${page.updatedBy.name}` : ""}
                    {published && page.publishedAt ? ` · פורסם ${formatDateTime(page.publishedAt)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/admin/content/${page.id}`} className="btn-ghost px-4 py-2 text-sm">
                      עריכה
                    </Link>
                    {published && (
                      <Link to={`/${page.slug}`} className="btn-ghost px-4 py-2 text-sm">
                        צפייה בדף
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn-ghost px-4 py-2 text-sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          page.id,
                          () => setContentPagePublished(page.id, !published),
                          published ? "הדף הוסר מהאתר וחזר לטיוטה." : "הדף פורסם באתר."
                        )
                      }
                    >
                      {published ? "ביטול פרסום" : "פרסום"}
                    </button>
                    <button type="button" className="btn-text text-sm" disabled={busy} onClick={() => onDuplicate(page)}>
                      שכפול
                    </button>
                    <button
                      type="button"
                      className="btn-text text-sm text-white/55"
                      disabled={busy}
                      onClick={() => {
                        setDeleteError("");
                        setPendingDelete(page);
                      }}
                    >
                      מחיקה
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="מחיקת דף"
        confirmLabel="כן, מחק את הדף"
        busy={Boolean(busyId)}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
      >
        <p>
          הדף <strong className="text-white">{pendingDelete?.title}</strong> יוסר מהאתר ומרשימת הדפים.
        </p>
        <p>התוכן נשמר ברקע ורישום הפעולה נשמר ביומן.</p>
      </ConfirmDialog>
    </div>
  );
}
