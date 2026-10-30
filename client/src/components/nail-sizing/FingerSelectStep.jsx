import { Check } from "lucide-react";
import PageHeader, { litLast } from "../ui/PageHeader.jsx";
import { ALL_FINGERS, HANDS } from "../../lib/nailSizing/constants.js";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

/** Large, unambiguous toggles: each finger is a 56px tile; measured fingers show their size. */
export default function FingerSelectStep({ selected, results, onChange, onNext }) {
  const set = new Set(selected);
  const toggle = (key) => onChange(set.has(key) ? selected.filter((k) => k !== key) : ALL_FINGERS.map((f) => f.key).filter((k) => k === key || set.has(k)));
  const allOn = selected.length === ALL_FINGERS.length;

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-2">
      <PageHeader eyebrow="Fingers" {...litLast(C.fingers.title)} subtitle={C.fingers.subtitle} />

      <div className="flex items-center justify-between">
        <p className="t-sub tnum" aria-live="polite">
          {C.fingers.selectedCount(selected.length)}
        </p>
        <button
          type="button"
          className="btn-text"
          onClick={() => onChange(allOn ? [] : ALL_FINGERS.map((f) => f.key))}
        >
          {allOn ? C.fingers.clear : C.fingers.all}
        </button>
      </div>

      {HANDS.map((hand) => (
        <fieldset key={hand.id} className="space-y-2">
          <legend className="section-title">{hand.labelHe}</legend>
          <div className="grid grid-cols-5 gap-2">
            {hand.fingers.map((finger) => {
              const key = `${hand.id}-${finger.id}`;
              const on = set.has(key);
              const done = results[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${finger.labelHe} ${hand.labelHe}${done ? `, ${C.fingers.measured}` : ""}`}
                  onClick={() => toggle(key)}
                  className={`relative flex flex-col items-center justify-center gap-1 min-h-[4.5rem] rounded-control border text-center transition-[background-color,border-color,box-shadow] duration-300 ${
                    on ? "border-violet-400/70 bg-violet-400/15 text-white shadow-glow-soft" : "border-white/[0.12] bg-white/[0.03] text-white/55"
                  }`}
                >
                  <span className="font-display text-sub leading-tight px-1">{finger.labelHe.replace("אצבע ", "")}</span>
                  {done ? (
                    <span className="flex items-baseline gap-1 text-cap text-white/60">
                      מידה <span className="marquee text-base leading-none">{done.size}</span>
                    </span>
                  ) : (
                    <span
                      className={`grid place-items-center w-5 h-5 rounded-full border ${on ? "border-transparent bg-violet-gradient shadow-glow-soft" : "border-white/30"}`}
                      aria-hidden="true"
                    >
                      {on && <Check size={13} strokeWidth={3} style={{ color: "#000" }} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="sticky-cta">
        <button type="button" className="btn-violet btn-block" disabled={!selected.length} onClick={onNext}>
          {selected.length ? C.fingers.next(selected.length) : C.fingers.selectedCount(0)}
        </button>
      </div>
    </div>
  );
}
