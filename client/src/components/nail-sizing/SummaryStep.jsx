import { Link } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import PageHeader, { litLast } from "../ui/PageHeader.jsx";
import { HANDS } from "../../lib/nailSizing/constants.js";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

/**
 * What was measured, per hand. A finger tile re-measures that finger. Saving is honest: the success
 * state shows only after the server stored the sizes; a failure keeps everything and offers a retry.
 */
export default function SummaryStep({ results, remaining, saveState, saveError, onSave, onRemeasure, onContinue }) {
  const measuredCount = Object.keys(results).length;
  const saved = saveState === "saved";

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-2">
      {saved ? (
        <div className="marquee-frame rounded-card shadow-glow" role="status">
          <div className="marquee-frame__inner p-6 text-center space-y-3">
            <span className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-violet-gradient shadow-glow" style={{ color: "#000" }} aria-hidden="true">
              <Check size={28} strokeWidth={2.6} />
            </span>
            <span className="section-eyebrow">Saved</span>
            <h1 className="t-title">{C.summary.savedTitle}</h1>
            <p className="t-sub">{C.summary.savedText}</p>
          </div>
        </div>
      ) : (
        <PageHeader eyebrow="Your sizes" {...litLast(C.summary.title)} subtitle={C.summary.subtitle} />
      )}

      {HANDS.map((hand) => (
        <section key={hand.id} className="space-y-2" aria-label={hand.labelHe}>
          <h2 className="section-title">{hand.labelHe}</h2>
          <ul className="grid grid-cols-5 gap-2">
            {hand.fingers.map((finger) => {
              const key = `${hand.id}-${finger.id}`;
              const r = results[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onRemeasure(key)}
                    className={`w-full rounded-control border px-1 py-3 text-center transition-colors active:bg-white/[0.06] ${
                      r ? "border-violet-400/25 bg-violet-400/[0.06]" : "border-dashed border-white/15"
                    }`}
                    aria-label={r ? `${finger.labelHe}: מידה ${r.size}, ${r.widthMm} מ״מ. מדידה מחדש` : `${finger.labelHe}: עוד לא נמדדה. למדידה`}
                  >
                    <span className={`block leading-none mb-1 ${r ? "marquee text-[1.625rem]" : "font-display text-title text-white/30"}`}>{r ? r.size : C.summary.notMeasured}</span>
                    <span className="block text-cap text-white/55 truncate">{finger.labelHe.replace("אצבע ", "")}</span>
                    {r && (
                      <span className="block text-cap text-white/35 tnum" dir="ltr">
                        {r.widthMm.toFixed(1)}mm
                      </span>
                    )}
                    {r && !r.plausible && <AlertTriangle size={13} className="mx-auto mt-0.5 text-amber-300" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {remaining > 0 && !saved && (
        <div className="notice-info flex-col gap-2">
          <p className="font-display">{C.summary.missingTitle(remaining)}</p>
          <p className="text-foot text-violet-100/80">{C.summary.missingText}</p>
          <button type="button" className="btn-text p-0" onClick={onContinue}>
            {C.summary.continueMeasuring}
          </button>
        </div>
      )}

      {saveError && (
        <p className="notice-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="sticky-cta">
        {saved ? (
          <div className="grid grid-cols-2 gap-3">
            <Link to="/" className="btn-ghost">
              {C.summary.home}
            </Link>
            <Link to="/booking" className="btn-violet">
              {C.summary.book}
            </Link>
          </div>
        ) : (
          <button type="button" className="btn-violet btn-block" disabled={!measuredCount || saveState === "saving"} onClick={onSave}>
            {saveState === "saving" && <span className="spinner" aria-hidden="true" />}
            {saveState === "saving" ? C.summary.saving : C.summary.save}
          </button>
        )}
      </div>
    </div>
  );
}
