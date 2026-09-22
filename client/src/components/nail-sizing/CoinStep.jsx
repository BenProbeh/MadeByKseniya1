import { useMemo, useState } from "react";
import { CALIBRATION_COINS } from "../../lib/nailSizing/coins.js";

export default function CoinStep({ selectedId, onSelect, onNext, onBack }) {
  const [query, setQuery] = useState("");
  const coins = useMemo(() => {
    const q = query.trim();
    if (!q) return CALIBRATION_COINS;
    return CALIBRATION_COINS.filter(
      (c) => c.labelHe.includes(q) || c.labelEn.toLowerCase().includes(q.toLowerCase())
    );
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 space-y-3">
        <p className="text-sm text-white/60">
          בחרי מטבע ישראלי אמיתי. הקטרים מבוססים על נתוני{" "}
          <span className="text-violet-200">בנק ישראל</span>.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש מטבע..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
          aria-label="חיפוש מטבע"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {coins.map((coin) => {
          const active = coin.id === selectedId;
          return (
            <button
              key={coin.id}
              type="button"
              onClick={() => onSelect(coin.id)}
              aria-pressed={active}
              className={`text-right glass-panel p-5 transition-colors ${
                active ? "border-violet-400/50 shadow-glow" : "hover:border-white/25"
              }`}
            >
              <div className="flex items-center gap-4">
                <span
                  className="shrink-0 w-12 h-12 rounded-full border border-white/20 bg-gradient-to-br from-white/30 to-white/5 flex items-center justify-center text-[10px] text-white/70"
                  aria-hidden="true"
                >
                  ₪
                </span>
                <div className="min-w-0">
                  <p className="font-serif text-lg text-white">{coin.labelHe}</p>
                  <p className="text-sm text-white/50">קוטר {coin.diameterMm} מ״מ</p>
                  {coin.noteHe && <p className="text-xs text-white/40 mt-1">{coin.noteHe}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          חזרה
        </button>
        <button type="button" className="btn-violet" disabled={!selectedId} onClick={onNext}>
          המשך
        </button>
      </div>
    </div>
  );
}
