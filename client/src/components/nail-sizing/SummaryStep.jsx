import { ALL_FINGERS } from "../../lib/nailSizing/constants.js";
import { getQualityLevel } from "../../lib/nailSizing/photoQuality.js";

export default function SummaryStep({
  measurements,
  selectedFingerKeys,
  phone,
  onPhoneChange,
  onRetake,
  onSave,
  saving,
  saved,
  onBack,
}) {
  const selected = new Set(selectedFingerKeys?.length ? selectedFingerKeys : ALL_FINGERS.map((f) => f.key));
  const selectedList = ALL_FINGERS.filter((f) => selected.has(f.key));
  const missing = selectedList.filter((f) => measurements[f.key]?.status !== "confirmed");

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 text-center space-y-2">
        <span className="section-eyebrow justify-center">Summary</span>
        <h2 className="font-serif text-2xl md:text-3xl text-white">סיכום המידות</h2>
        <p className="text-sm text-white/55">
          מוצגות האצבעות שנבחרו למדידה. אפשר לצלם שוב אצבע בודדת בלי להתחיל מחדש.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {["right", "left"].map((handId) => {
          const label = handId === "right" ? "יד ימין" : "יד שמאל";
          const rows = selectedList.filter((f) => f.handId === handId);
          if (rows.length === 0) return null;
          return (
            <div key={handId} className="glass-panel p-5 space-y-3">
              <h3 className="font-serif text-xl text-white">{label}</h3>
              <ul className="space-y-3">
                {rows.map((f) => {
                  const m = measurements[f.key];
                  const needs = m?.status !== "confirmed";
                  const q =
                    m?.photoQualityScore != null ? getQualityLevel(m.photoQualityScore) : null;
                  return (
                    <li
                      key={f.key}
                      className="flex items-center justify-between gap-3 border-b border-white/[0.08] last:border-0 pb-3 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-white/90">{f.fingerLabelHe}</p>
                        <p className="text-xs text-white/45">
                          {m?.status === "confirmed"
                            ? m?.photoQualityScore != null
                              ? `צולם · איכות ${m.photoQualityScore}/100 · ${q?.label || ""}`
                              : "צולם"
                            : "טרם נמדד"}
                        </p>
                      </div>
                      <button type="button" className="btn-text text-xs shrink-0" onClick={() => onRetake(f.key)}>
                        {needs ? "מדדי" : "צלמי שוב"}
                        <span className="btn-text-arrow">←</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <p className="text-sm text-red-300 text-center" role="status">
          נותרו {missing.length} אצבעות להשלמה לפני שמירה.
        </p>
      )}

      <div className="glass-panel p-5 space-y-4">
        <label className="block text-sm text-white/60">
          טלפון לשמירת פרופיל המידות
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d\s\-+()]/g, ""))}
            placeholder="05XXXXXXXX"
            className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
          />
        </label>
        <p className="text-xs text-white/40">
          הפרופיל נשמר לפי מספר הטלפון (כמו באיתור תורים). אפשר להשתמש בו בהזמנות הבאות.
        </p>
      </div>

      {saved && (
        <p className="text-center text-violet-200 font-medium" role="status">
          המידות שנבחרו נשמרו בהצלחה ✓
        </p>
      )}

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          חזרה
        </button>
        <button
          type="button"
          className="btn-violet"
          disabled={missing.length > 0 || !phone.trim() || saving}
          onClick={onSave}
        >
          {saving ? "שומרת..." : "אישור ושמירת המידות"}
        </button>
      </div>
    </div>
  );
}
