import { useMemo, useState } from "react";
import { CALIBRATION_COINS } from "../../lib/nailSizing/coins.js";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";
import CoinImage from "./CoinImage.jsx";

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
      <div className="glass-panel p-5 space-y-3 text-center">
        <h2 className="font-serif text-2xl md:text-3xl text-white">{C.coin.title}</h2>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">{C.coin.subtitle}</p>
        <p className="text-xs text-white/40">{C.coin.sourceNote}</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={C.coin.searchPlaceholder}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60 text-right"
          aria-label={C.coin.searchPlaceholder}
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
              className={`text-right glass-panel p-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/70 ${
                active ? "border-violet-400/50 shadow-glow" : "hover:border-white/25"
              }`}
            >
              <div className="flex items-center gap-4">
                <CoinImage coin={coin} />
                <div className="min-w-0">
                  <p className="font-serif text-lg text-white">{coin.labelHe}</p>
                  <p className="font-serif text-sm text-white/50">קוטר {coin.diameterMm} מ״מ</p>
                  {coin.noteHe && <p className="text-xs text-white/40 mt-1">{coin.noteHe}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          {C.coin.back}
        </button>
        <button type="button" className="btn-violet" disabled={!selectedId} onClick={onNext}>
          {C.coin.next}
        </button>
      </div>
    </div>
  );
}
