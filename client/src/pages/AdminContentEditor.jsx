import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ContentPageRenderer from "../components/content/ContentPageRenderer.jsx";
import {
  createContentPage,
  fetchContentPage,
  setContentPagePublished,
  updateContentPage,
} from "../lib/authApi.js";
import { getApiErrorMessage } from "../lib/authErrors.js";
import { formatDateTime } from "../lib/format.js";
import { SECTION_TYPES, emptySection, slugProblem } from "../lib/contentPages.js";

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-white outline-none focus:border-violet-400/60";

const EMPTY_PAGE = { slug: "", title: "", subtitle: "", eyebrow: "", seoTitle: "", seoDescription: "", sections: [] };

let keySeq = 0;
const withKey = (section) => ({ ...section, _key: `s${++keySeq}` });

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-2 text-sm text-white/70">
      <span>{label}</span>
      {children}
      {hint && <span className="block text-xs text-white/40">{hint}</span>}
    </label>
  );
}

function sectionLabel(type) {
  return SECTION_TYPES.find((s) => s.type === type)?.label || type;
}

function SectionFields({ section, onChange }) {
  const { type, data } = section;
  const set = (patch) => onChange({ ...section, data: { ...data, ...patch } });

  switch (type) {
    case "heading":
      return (
        <Field label="טקסט הכותרת">
          <input className={inputClass} value={data.text} maxLength={120} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      );
    case "paragraph":
      return (
        <Field label="טקסט" hint="שורה ריקה מתחילה פסקה חדשה. טקסט רגיל בלבד.">
          <textarea
            className={`${inputClass} min-h-[140px]`}
            value={data.text}
            maxLength={3000}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
      );
    case "list":
      return (
        <div className="space-y-3">
          <Field label="פריטים" hint="כל שורה היא פריט ברשימה.">
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={data.items.join("\n")}
              onChange={(e) => set({ items: e.target.value.split("\n") })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-white/65">
            <input type="checkbox" checked={data.ordered} onChange={(e) => set({ ordered: e.target.checked })} />
            <span>רשימה ממוספרת</span>
          </label>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <Field label="כתובת התמונה" hint="קישור שמתחיל ב־https:// או נתיב באתר כמו /logo.png">
            <input dir="ltr" className={inputClass} value={data.url} onChange={(e) => set({ url: e.target.value })} />
          </Field>
          <Field label="תיאור התמונה (לנגישות)">
            <input className={inputClass} value={data.alt} maxLength={150} onChange={(e) => set({ alt: e.target.value })} />
          </Field>
          <Field label="כיתוב (לא חובה)">
            <input className={inputClass} value={data.caption} maxLength={200} onChange={(e) => set({ caption: e.target.value })} />
          </Field>
        </div>
      );
    case "cta":
      return (
        <div className="space-y-3">
          <Field label="טקסט הכפתור">
            <input className={inputClass} value={data.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="לאן הכפתור מוביל" hint="נתיב באתר (למשל /booking), https://, tel: או mailto:">
            <input dir="ltr" className={inputClass} value={data.href} onChange={(e) => set({ href: e.target.value })} />
          </Field>
          <Field label="סגנון">
            <select className={inputClass} value={data.variant} onChange={(e) => set({ variant: e.target.value })}>
              <option value="primary" className="bg-oled-950">
                סגול מלא
              </option>
              <option value="ghost" className="bg-oled-950">
                מסגרת
              </option>
            </select>
          </Field>
        </div>
      );
    case "links":
      return (
        <div className="space-y-3">
          {data.items.map((item, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <Field label={`טקסט קישור ${i + 1}`}>
                <input
                  className={inputClass}
                  value={item.label}
                  maxLength={60}
                  onChange={(e) => set({ items: data.items.map((it, j) => (j === i ? { ...it, label: e.target.value } : it)) })}
                />
              </Field>
              <Field label="כתובת">
                <input
                  dir="ltr"
                  className={inputClass}
                  value={item.href}
                  onChange={(e) => set({ items: data.items.map((it, j) => (j === i ? { ...it, href: e.target.value } : it)) })}
                />
              </Field>
              <button
                type="button"
                className="btn-text text-xs pb-3"
                disabled={data.items.length <= 1}
                onClick={() => set({ items: data.items.filter((_, j) => j !== i) })}
              >
                הסרה
              </button>
            </div>
          ))}
          {data.items.length < 10 && (
            <button
              type="button"
              className="btn-text text-sm"
              onClick={() => set({ items: [...data.items, { label: "", href: "" }] })}
            >
              + קישור נוסף
            </button>
          )}
        </div>
      );
    default:
      return null;
  }
}

function toPayload(page) {
  return {
    slug: page.slug.trim().toLowerCase(),
    title: page.title,
    subtitle: page.subtitle,
    eyebrow: page.eyebrow,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    sections: page.sections.map(({ type, data }) => ({ type, data })),
  };
}

export default function AdminContentEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [page, setPage] = useState(isNew ? EMPTY_PAGE : null);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addType, setAddType] = useState("paragraph");
  const busyRef = useRef(false);

  const applyServerPage = useCallback((p) => {
    setPage({
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle || "",
      eyebrow: p.eyebrow || "",
      seoTitle: p.seoTitle || "",
      seoDescription: p.seoDescription || "",
      sections: (p.sections || []).map(withKey),
    });
    setMeta({
      id: p.id,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      publishedAt: p.publishedAt,
      createdBy: p.createdBy,
      updatedBy: p.updatedBy,
    });
    setDirty(false);
  }, []);

  useEffect(() => {
    if (isNew) {
      setPage(EMPTY_PAGE);
      setMeta(null);
      return;
    }
    let cancelled = false;
    fetchContentPage(id)
      .then((p) => {
        if (!cancelled) applyServerPage(p);
      })
      .catch(async (err) => {
        if (cancelled) return;
        setLoadError(getApiErrorMessage(err, "לא הצלחתי לטעון את הדף."));
        const code = err?.response?.status;
        if (code === 401 || code === 403) await refreshUser();
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, applyServerPage, refreshUser]);

  function update(patch) {
    setPage((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setMessage("");
  }

  function updateSection(index, next) {
    update({ sections: page.sections.map((s, i) => (i === index ? next : s)) });
  }

  function moveSection(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= page.sections.length) return;
    const next = [...page.sections];
    [next[index], next[target]] = [next[target], next[index]];
    update({ sections: next });
  }

  function addSection() {
    if (page.sections.length >= 40) return;
    update({ sections: [...page.sections, withKey(emptySection(addType))] });
  }

  async function save({ publish = null } = {}) {
    if (busyRef.current) return;
    setError("");
    setMessage("");
    const slugError = slugProblem(page.slug);
    if (slugError) return setError(slugError);
    if (!page.title.trim()) return setError("יש למלא כותרת לדף.");

    busyRef.current = true;
    setBusy(true);
    try {
      let saved = isNew ? await createContentPage(toPayload(page)) : dirty ? await updateContentPage(id, toPayload(page)) : null;
      const pageId = saved?.id ?? meta?.id;
      if (publish !== null) saved = await setContentPagePublished(pageId, publish);
      if (saved) applyServerPage(saved);
      setMessage(publish === true ? "הדף נשמר ופורסם באתר." : publish === false ? "הפרסום בוטל. הדף חזר לטיוטה." : "הטיוטה נשמרה.");
      if (isNew && pageId) navigate(`/admin/content/${pageId}`, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "לא הצלחתי לשמור את הדף. אפשר לנסות שוב."));
      const code = err?.response?.status;
      if (code === 401 || code === 403) await refreshUser();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-6 text-center">
        <section className="glass-panel p-8 space-y-3">
          <p className="text-sm text-amber-200" role="alert">
            {loadError}
          </p>
        </section>
        <Link to="/admin/content" className="btn-text text-sm">
          <span aria-hidden="true">→</span>
          חזרה לניהול תוכן
        </Link>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-white/45 text-center">הדף נטען…</p>
      </div>
    );
  }

  const published = meta?.status === "published";

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-8">
      <div className="text-center space-y-3">
        <span className="section-eyebrow justify-center">Admin</span>
        <h1 className="font-serif font-medium text-3xl md:text-5xl text-white">
          {isNew ? (
            <>
              צור <span className="violet-text">דף</span>
            </>
          ) : (
            <>
              עריכת <span className="violet-text">דף</span>
            </>
          )}
        </h1>
        <Link to="/admin/content" className="btn-text text-sm">
          <span aria-hidden="true">→</span>
          חזרה לניהול תוכן
        </Link>
      </div>

      {meta && (
        <p className="text-center text-xs text-white/45">
          {published ? "מפורסם" : "טיוטה"} · נוצר {formatDateTime(meta.createdAt)}
          {meta.createdBy?.name ? ` על ידי ${meta.createdBy.name}` : ""} · עודכן {formatDateTime(meta.updatedAt)}
          {meta.updatedBy?.name ? ` על ידי ${meta.updatedBy.name}` : ""}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="מצב תצוגה">
        <button
          type="button"
          aria-pressed={!preview}
          className={`pill-option py-2 min-h-[40px] ${!preview ? "pill-option-active" : ""}`}
          onClick={() => setPreview(false)}
        >
          עריכה
        </button>
        <button
          type="button"
          aria-pressed={preview}
          className={`pill-option py-2 min-h-[40px] ${preview ? "pill-option-active" : ""}`}
          onClick={() => setPreview(true)}
        >
          תצוגה מקדימה
        </button>
      </div>

      {preview ? (
        <div className="rounded-2xl border border-dashed border-violet-400/30 -mx-2 sm:mx-0">
          <p className="text-center text-xs text-violet-200/70 pt-3">תצוגה מקדימה — כך הדף ייראה באתר</p>
          <ContentPageRenderer page={page} />
        </div>
      ) : (
        <>
          <section className="glass-panel p-6 md:p-8 space-y-4" aria-label="פרטי הדף">
            <Field label="כותרת">
              <input className={inputClass} value={page.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <Field label="כותרת משנה (לא חובה)">
              <input className={inputClass} value={page.subtitle} maxLength={240} onChange={(e) => update({ subtitle: e.target.value })} />
            </Field>
            <Field label="תווית קטנה מעל הכותרת (לא חובה)" hint="למשל: Courses">
              <input className={inputClass} value={page.eyebrow} maxLength={40} onChange={(e) => update({ eyebrow: e.target.value })} />
            </Field>
            <Field label="כתובת הדף" hint={`אותיות באנגלית, מספרים ומקפים. הדף יופיע בכתובת /${page.slug || "my-page"}`}>
              <input
                dir="ltr"
                className={inputClass}
                value={page.slug}
                maxLength={60}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => update({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
          </section>

          <section className="glass-panel p-6 md:p-8 space-y-5" aria-labelledby="sections-title">
            <h2 id="sections-title" className="font-serif text-2xl text-white">
              מקטעים
            </h2>
            {page.sections.length === 0 && <p className="text-sm text-white/50">עדיין אין מקטעים. אפשר להוסיף מלמטה.</p>}
            <ol className="space-y-4">
              {page.sections.map((section, i) => (
                <li key={section._key} className="rounded-xl border border-white/[0.08] p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-violet-200">
                      {i + 1}. {sectionLabel(section.type)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn-text text-xs px-2"
                        disabled={i === 0}
                        onClick={() => moveSection(i, -1)}
                        aria-label={`הזזת מקטע ${i + 1} למעלה`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn-text text-xs px-2"
                        disabled={i === page.sections.length - 1}
                        onClick={() => moveSection(i, 1)}
                        aria-label={`הזזת מקטע ${i + 1} למטה`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-text text-xs px-2 text-white/55"
                        onClick={() => update({ sections: page.sections.filter((_, j) => j !== i) })}
                      >
                        הסרה
                      </button>
                    </div>
                  </div>
                  <SectionFields section={section} onChange={(next) => updateSection(i, next)} />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="סוג מקטע">
                <select className={inputClass} value={addType} onChange={(e) => setAddType(e.target.value)}>
                  {SECTION_TYPES.map((s) => (
                    <option key={s.type} value={s.type} className="bg-oled-950">
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="button" className="btn-ghost" onClick={addSection} disabled={page.sections.length >= 40}>
                הוספת מקטע
              </button>
            </div>
          </section>

          <section className="glass-panel p-6 md:p-8 space-y-4" aria-label="הגדרות חיפוש">
            <h2 className="font-serif text-2xl text-white">מנועי חיפוש</h2>
            <Field label="כותרת לחיפוש (לא חובה)" hint="עד 70 תווים. אם ריק, תשמש כותרת הדף.">
              <input className={inputClass} value={page.seoTitle} maxLength={70} onChange={(e) => update({ seoTitle: e.target.value })} />
            </Field>
            <Field label="תיאור לחיפוש (לא חובה)" hint="עד 160 תווים.">
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={page.seoDescription}
                maxLength={160}
                onChange={(e) => update({ seoDescription: e.target.value })}
              />
            </Field>
          </section>
        </>
      )}

      {error && (
        <p className="text-sm text-amber-200 text-center" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-violet-200 text-center" role="status" aria-live="polite">
          {message}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="btn-ghost" disabled={busy || (!isNew && !dirty)} onClick={() => save()}>
          {busy ? "רגע אחד…" : "שמירת טיוטה"}
        </button>
        {published ? (
          <>
            {dirty && (
              <button type="button" className="btn-violet" disabled={busy} onClick={() => save({ publish: true })}>
                שמירה ופרסום
              </button>
            )}
            <button type="button" className="btn-text text-sm" disabled={busy} onClick={() => save({ publish: false })}>
              ביטול פרסום
            </button>
            <Link to={`/${page.slug}`} className="btn-text text-sm">
              צפייה בדף
            </Link>
          </>
        ) : (
          <button type="button" className="btn-violet" disabled={busy} onClick={() => save({ publish: true })}>
            {busy ? "רגע אחד…" : "שמירה ופרסום"}
          </button>
        )}
      </div>
    </div>
  );
}
