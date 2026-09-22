import { ALL_FINGERS, HANDS } from "../../lib/nailSizing/constants.js";

export default function FingerSelectStep({ selectedKeys, onChange, onNext, onBack }) {
  const selected = new Set(selectedKeys || []);

  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(ALL_FINGERS.filter((f) => next.has(f.key)).map((f) => f.key));
  }

  function selectHand(handId) {
    const handKeys = ALL_FINGERS.filter((f) => f.handId === handId).map((f) => f.key);
    const allOn = handKeys.every((k) => selected.has(k));
    if (allOn) {
      onChange(selectedKeys.filter((k) => !handKeys.includes(k)));
    } else {
      const merged = new Set([...selectedKeys, ...handKeys]);
      onChange(ALL_FINGERS.filter((f) => merged.has(f.key)).map((f) => f.key));
    }
  }

  function selectAll() {
    onChange(ALL_FINGERS.map((f) => f.key));
  }

  function clearAll() {
    onChange([]);
  }

  const count = selectedKeys.length;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 space-y-3">
        <p className="font-serif text-lg text-white">איזה אצבעות למדוד?</p>
        <p className="text-sm text-white/60 leading-relaxed">
          בחרי רק את האצבעות שצריך — אפשר ציפורן אחת, שתיים, יד שלמה או את כולן.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-text text-xs" onClick={selectAll}>
            בחרי הכול
          </button>
          <button type="button" className="btn-text text-xs" onClick={clearAll}>
            נקה בחירה
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {HANDS.map((hand) => {
          const handKeys = hand.fingers.map((f) => `${hand.id}-${f.id}`);
          const handCount = handKeys.filter((k) => selected.has(k)).length;
          return (
            <div key={hand.id} className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-serif text-xl text-white">{hand.labelHe}</h3>
                <button type="button" className="btn-text text-xs shrink-0" onClick={() => selectHand(hand.id)}>
                  {handCount === hand.fingers.length ? "הסירי יד" : "בחרי יד"}
                  <span className="btn-text-arrow">←</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {hand.fingers.map((finger) => {
                  const key = `${hand.id}-${finger.id}`;
                  const active = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(key)}
                      className={`text-sm px-3 py-2 rounded-xl border transition-colors ${
                        active
                          ? "bg-violet-gradient text-oled-950 border-transparent font-semibold"
                          : "border-white/15 text-white/70 hover:border-white/30"
                      }`}
                    >
                      {finger.labelHe}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-white/45" aria-live="polite">
        {count === 0 ? "בחרי לפחות אצבע אחת" : `נבחרו ${count} אצבעות`}
      </p>

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          חזרה
        </button>
        <button type="button" className="btn-violet" disabled={count === 0} onClick={onNext}>
          התחילי מדידה
        </button>
      </div>
    </div>
  );
}
