import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

const STEP_ORDER = ["prep", "coin", "camera", "guide", "fingers", "measure", "summary"];

export default function SizingProgress({ step, fingerIndex = 0, totalFingers = 0 }) {
  const idx = STEP_ORDER.indexOf(step);
  const labels = [
    { id: "prep", label: C.progress.prep },
    { id: "coin", label: C.progress.coin },
    { id: "camera", label: C.progress.camera },
    { id: "fingers", label: C.progress.fingers },
    { id: "measure", label: C.progress.measure },
    { id: "summary", label: C.progress.summary },
  ];

  const visualIdx =
    step === "guide"
      ? 2
      : step === "fingers"
        ? 3
        : step === "measure"
          ? 4
          : step === "summary"
            ? 5
            : Math.max(0, labels.findIndex((l) => l.id === step));

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
      {step === "measure" && totalFingers > 0 && (
        <p className="text-center text-xs text-white/45" aria-live="polite">
          {C.progress.fingerOf(fingerIndex + 1, totalFingers)}
        </p>
      )}
      <p className="sr-only">
        שלב {idx + 1} מתוך {STEP_ORDER.length}
      </p>
    </div>
  );
}
