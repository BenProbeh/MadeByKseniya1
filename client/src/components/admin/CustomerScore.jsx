/** Internal customer score (staff only). Tiers and thresholds come from server/src/customerScore.js. */
export const SCORE_TIERS = [
  { value: "top", label: "לקוחה מובילה", range: "75–100", dot: "bg-violet-400", badge: "border-violet-400/60 text-violet-100 bg-violet-400/15" },
  { value: "high", label: "פעילה מאוד", range: "50–74", dot: "bg-emerald-400", badge: "border-emerald-400/50 text-emerald-200 bg-emerald-400/10" },
  { value: "medium", label: "פעילות בינונית", range: "25–49", dot: "bg-amber-400", badge: "border-amber-400/50 text-amber-200 bg-amber-400/10" },
  { value: "low", label: "פעילות נמוכה", range: "0–24", dot: "bg-white/40", badge: "border-white/20 text-white/55 bg-white/5" },
];

const NO_DATA_LABEL = "אין מספיק נתונים";

function tierInfo(tier) {
  return SCORE_TIERS.find((t) => t.value === tier) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

export function ScoreBadge({ score }) {
  if (!score) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/45 shrink-0">
        דירוג יחושב בקרוב
      </span>
    );
  }
  const info = tierInfo(score.tier);
  const label = score.insufficientData ? NO_DATA_LABEL : info.label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] tracking-wide shrink-0 ${info.badge}`}
      title={`ציון פנימי ${score.value} מתוך 100 · ${label}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} aria-hidden="true" />
      <span dir="ltr">{score.value}</span>
      <span>· {label}</span>
    </span>
  );
}

export function ScoreLegend() {
  return (
    <div className="rounded-xl border border-white/[0.08] px-4 py-3 space-y-2" aria-label="מקרא דירוג לקוחות">
      <p className="text-xs text-white/50">
        ציון פנימי 0–100 לפי תורים, בניות מלאות, מסלולים, רכישות ופעילות אחרונה. גלוי לצוות בלבד.
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/60">
        {SCORE_TIERS.map((t) => (
          <li key={t.value} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden="true" />
            {t.label} <span dir="ltr" className="text-white/35">({t.range})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScoreBreakdown({ score }) {
  if (!score) return <p className="text-sm text-white/50">הדירוג עדיין לא חושב. הוא יתעדכן בכניסה הבאה לרשימת הלקוחות.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ScoreBadge score={score} />
        {score.insufficientData && (
          <span className="text-xs text-white/45">עדיין אין תורים או רכישות, ולכן הציון נמוך.</span>
        )}
      </div>
      <ul className="space-y-3">
        {score.breakdown.map((part) => {
          const pct = part.max ? Math.round((part.points / part.max) * 100) : 0;
          return (
            <li key={part.key || part.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-white/80">{part.label}</span>
                <span className="text-white/60 shrink-0" dir="ltr">
                  {part.points} / {part.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-white/45">{part.detail}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
