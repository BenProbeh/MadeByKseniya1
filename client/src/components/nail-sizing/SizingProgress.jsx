const STEP_ORDER = ["prep", "coin", "camera", "guide", "measure", "summary"];

export default function SizingProgress({ step, fingerIndex = 0, totalFingers = 10 }) {
  const idx = STEP_ORDER.indexOf(step);
  const labels = [
    { id: "prep", label: "הכנה" },
    { id: "coin", label: "מטבע" },
    { id: "camera", label: "מצלמה" },
    { id: "measure", label: "מדידה" },
    { id: "summary", label: "סיום" },
  ];

  // Map guide into camera bucket for compact progress
  const visualIdx =
    step === "guide" ? 2 : step === "measure" ? 3 : step === "summary" ? 4 : Math.max(0, labels.findIndex((l) => l.id === step));

  return (
    <div className="space-y-3" aria-label="התקדמות המדידה">
      <div className="flex flex-wrap gap-2 justify-center">
        {labels.map((item, i) => {
          const active = i === visualIdx;
          const done = i < visualIdx;
          return (
            <span
              key={item.id}
              className={`text-[11px] tracking-wide px-3 py-1.5 rounded-full border ${
                active
                  ? "bg-violet-gradient text-oled-950 border-transparent font-semibold"
                  : done
                    ? "border-violet-400/40 text-violet-200"
                    : "border-white/15 text-white/40"
              }`}
            >
              {item.label}
            </span>
          );
        })}
      </div>
      {step === "measure" && (
        <p className="text-center text-xs text-white/45" aria-live="polite">
          אצבע {fingerIndex + 1} מתוך {totalFingers}
        </p>
      )}
      <p className="sr-only">
        שלב {idx + 1} מתוך {STEP_ORDER.length}
      </p>
    </div>
  );
}
