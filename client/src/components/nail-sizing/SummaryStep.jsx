import { Link } from "react-router-dom";
import { AlertTriangle, CircleCheck } from "lucide-react";
import PageHeader from "../ui/PageHeader.jsx";
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
        <div className="card-raised p-6 text-center space-y-3" role="status">
          <CircleCheck size={40} strokeWidth={1.6} className="mx-auto text-emerald-300" aria-hidden="true" />
          <h1 className="t-title">{C.summary.savedTitle}</h1>
          <p className="t-sub">{C.summary.savedText}</p>
        </div>
      ) : (
        <PageHeader title={C.summary.title} subtitle={C.summary.subtitle} />
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
                      r ? "border-white/[0.12] bg-oled-900" : "border-dashed border-white/15"
                    }`}
                    aria-label={r ? `${finger.labelHe}: מידה ${r.size}, ${r.widthMm} מ״מ. מדידה מחדש` : `${finger.labelHe}: עוד לא נמדדה. למדידה`}
                  >
                    <span className={`block font-display text-title tnum ${r ? "text-white" : "text-white/30"}`}>{r ? r.size : C.summary.notMeasured}</span>
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
