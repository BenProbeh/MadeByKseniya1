import { Component, useEffect, useMemo, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import ColorWheel from "./ColorWheel.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { hexToHsv, hsvToHex } from "../../lib/theme/color.js";
import { DEFAULT_PALETTE, derivePalette } from "../../lib/theme/palette.js";

const START_HSV = { h: 0, s: 0, v: 1 };

/** Curated starting points; each still goes through derivePalette, which keeps text readable. */
const SWATCHES = [
  { hex: "#2a0f3d", label: "שזיף" },
  { hex: "#3a0c1f", label: "יין" },
  { hex: "#0e1a3a", label: "לילה" },
  { hex: "#0f2a22", label: "ירוק עמוק" },
  { hex: "#2e2018", label: "מוקה" },
  { hex: "#f3dfe6", label: "ורוד עתיק" },
  { hex: "#ece7df", label: "שמנת" },
];

function SitePreview({ palette }) {
  const { pageBackground, elevatedSurface, borderColor, textPrimary, textSecondary } = palette.named;
  return (
    <div
      className="h-16 w-24 rounded-lg p-2 ring-1 ring-white/10"
      style={{ backgroundColor: pageBackground }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-md border p-1.5 flex flex-col justify-between"
        style={{ backgroundColor: elevatedSurface, borderColor }}
      >
        <span className="block h-1 w-10 rounded-full" style={{ backgroundColor: textPrimary }} />
        <span className="block h-1 w-7 rounded-full" style={{ backgroundColor: textSecondary }} />
        <span className="block h-2.5 w-9 self-end rounded-full bg-violet-gradient shadow-glow" />
      </div>
    </div>
  );
}

function SiteColorPicker() {
  const { activeColor, savedColor, isCustom, status, previewColor, commitColor, resetToDefault } = useTheme();
  const [hsv, setHsv] = useState(() => (activeColor ? hexToHsv(activeColor) : START_HSV));
  const frameRef = useRef(0);
  const pendingRef = useRef(null);

  const sentRef = useRef(activeColor);

  // Follow changes made elsewhere (save failure → last saved colour, reset → default), not our own echoes.
  useEffect(() => {
    if (activeColor && activeColor === sentRef.current) return;
    sentRef.current = activeColor;
    setHsv((current) => {
      if (!activeColor) return START_HSV;
      return hsvToHex(current.h, current.s, current.v) === activeColor ? current : hexToHsv(activeColor);
    });
  }, [activeColor]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const chosenHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const palette = useMemo(() => {
    if (!activeColor) return DEFAULT_PALETTE;
    try {
      return derivePalette(activeColor) || DEFAULT_PALETTE;
    } catch {
      return DEFAULT_PALETTE;
    }
  }, [activeColor]);

  function onDrag(next) {
    setHsv(next);
    pendingRef.current = next;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const p = pendingRef.current;
      if (!p) return;
      sentRef.current = hsvToHex(p.h, p.s, p.v);
      previewColor(sentRef.current);
    });
  }

  function onCommit(next) {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setHsv(next);
    sentRef.current = hsvToHex(next.h, next.s, next.v);
    commitColor(sentRef.current);
  }

  function onBrightness(e) {
    const v = Number(e.target.value) / 100;
    onCommit({ ...hsv, v });
  }

  const busy = status.state === "saving";
  const canReset = Boolean(savedColor || activeColor);

  const [wheelOpen, setWheelOpen] = useState(false);
  const isSwatch = SWATCHES.some((w) => w.hex === activeColor);

  return (
    <section className="space-y-2" aria-labelledby="site-color-title">
      <h2 id="site-color-title" className="t-title px-1">
        צבע האפליקציה
      </h2>
      <div className="card p-4 space-y-5">
        <div className="flex items-center gap-4">
          <SitePreview palette={palette} />
          <p className="t-sub">תעצבי את האפליקציה כמו שאת רוצה. הטקסט נשאר קריא בכל צבע, והסגול נשאר שלנו.</p>
        </div>

        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="צבעים מוכנים">
          <button
            type="button"
            role="radio"
            aria-checked={!activeColor}
            aria-label="ברירת המחדל: שחור"
            onClick={() => void resetToDefault()}
            className="relative w-11 h-11 rounded-full ring-1 ring-white/20 bg-black grid place-items-center"
          >
            {!activeColor && <Check size={18} strokeWidth={3} style={{ color: "#fff" }} aria-hidden="true" />}
          </button>
          {SWATCHES.map((w) => {
            const on = activeColor === w.hex;
            return (
              <button
                key={w.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={w.label}
                title={w.label}
                onClick={() => {
                  // Commit the exact swatch hex (an HSV round trip could drift by one step).
                  setHsv(hexToHsv(w.hex));
                  sentRef.current = w.hex;
                  commitColor(w.hex);
                }}
                className="relative w-11 h-11 rounded-full ring-1 ring-white/20 grid place-items-center"
                style={{ backgroundColor: w.hex }}
              >
                {on && <Check size={18} strokeWidth={3} style={{ color: hexToHsv(w.hex).v > 0.6 ? "#000" : "#fff" }} aria-hidden="true" />}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={Boolean(activeColor) && !isSwatch}
            aria-expanded={wheelOpen}
            aria-label="צבע חופשי"
            onClick={() => setWheelOpen((v) => !v)}
            className="relative w-11 h-11 rounded-full grid place-items-center"
            style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
          >
            <span className="grid place-items-center w-7 h-7 rounded-full bg-black/70">
              {activeColor && !isSwatch ? (
                <Check size={16} strokeWidth={3} style={{ color: "#fff" }} aria-hidden="true" />
              ) : (
                <Palette size={15} style={{ color: "#fff" }} aria-hidden="true" />
              )}
            </span>
          </button>
        </div>

        {wheelOpen && (
          <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
            <div className="w-full max-w-[14rem] shrink-0 space-y-3">
              <ColorWheel
                hsv={hsv}
                hasSelection={isCustom}
                label="גלגל צבעים לבחירת צבע הרקע"
                onChange={onDrag}
                onChangeEnd={onCommit}
              />
              <label className="block">
                <input
                  type="range"
                  aria-label="בהירות הצבע"
                  dir="ltr"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(hsv.v * 100)}
                  onChange={onBrightness}
                  className="theme-range"
                  style={{ "--range-color": hsvToHex(hsv.h, Math.max(hsv.s, 0.0001), 1) }}
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <span className="block h-12 w-12 rounded-full ring-1 ring-white/15" style={{ backgroundColor: isCustom ? chosenHex : "transparent" }} aria-hidden="true" />
              <span className="t-foot" dir="ltr">
                {isCustom ? chosenHex.toUpperCase() : ""}
              </span>
            </div>
          </div>
        )}

        <div className={`flex items-center justify-between gap-3 ${busy || status.state !== "idle" || canReset ? "min-h-[2.75rem]" : "hidden"}`} aria-live="polite">
          <span className="t-foot">
            {busy && "שומרת…"}
            {status.state === "saved" && <span className="text-violet-200">{status.message}</span>}
            {status.state === "error" && <span className="text-red-300">{status.message}</span>}
          </span>
          {canReset && (
            <button type="button" className="btn-text text-white/60" onClick={() => void resetToDefault()}>
              חזרה לשחור
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** A problem in the picker must never take the profile (or the site's colours) down with it. */
class SiteColorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="card p-5 space-y-1">
          <h2 className="t-headline">צבע האפליקציה</h2>
          <p className="t-sub">לא הצלחתי לטעון את בחירת הצבע כרגע. אפשר לרענן ולנסות שוב.</p>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function SiteColorSection() {
  return (
    <SiteColorBoundary>
      <SiteColorPicker />
    </SiteColorBoundary>
  );
}
