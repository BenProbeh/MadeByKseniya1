import { Component, useEffect, useMemo, useRef, useState } from "react";
import ColorWheel from "./ColorWheel.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { hexToHsv, hsvToHex } from "../../lib/theme/color.js";
import { DEFAULT_PALETTE, derivePalette } from "../../lib/theme/palette.js";

const START_HSV = { h: 0, s: 0, v: 1 };

function SitePreview({ palette }) {
  const { pageBackground, surfaceBackground, borderColor } = palette.named;
  return (
    <div
      className="h-16 w-24 rounded-lg p-2 ring-1 ring-white/10"
      style={{ backgroundColor: pageBackground }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-md border p-1.5 flex flex-col justify-between"
        style={{ backgroundColor: surfaceBackground, borderColor }}
      >
        <span className="block h-1 w-10 rounded-full bg-white/80" />
        <span className="block h-1 w-7 rounded-full bg-white/40" />
        <span className="block h-2.5 w-9 self-end rounded-full bg-violet-gradient" />
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

  return (
    <section className="glass-panel p-6 md:p-8 space-y-6" aria-labelledby="site-color-title">
      <div className="text-center space-y-1">
        <h2 id="site-color-title" className="font-serif text-2xl md:text-3xl text-white">
          צבע האתר שלי
        </h2>
        <p className="font-serif text-white/60 text-sm max-w-md mx-auto">
          בחרי את הצבע שייתן לאתר את האווירה שלך. אני אתאים אותו אוטומטית למראה OLED כהה ונקי.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-10">
        <div className="w-full max-w-[15rem] shrink-0 space-y-4">
          <ColorWheel
            hsv={hsv}
            hasSelection={isCustom}
            label="גלגל צבעים לבחירת צבע הרקע של האתר"
            onChange={onDrag}
            onChangeEnd={onCommit}
          />
          <label className="block space-y-2">
            <span className="block text-xs text-white/60 text-center">בהירות הצבע</span>
            <input
              type="range"
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

        <div className="w-full space-y-5 text-center sm:text-right">
          <div className="flex items-end justify-center sm:justify-start gap-5">
            <div className="space-y-2">
              <span
                className="block h-16 w-16 rounded-full ring-1 ring-white/15"
                style={{ backgroundColor: isCustom ? chosenHex : "transparent" }}
                aria-hidden="true"
              />
              <p className="text-xs text-white/60">הצבע שבחרת</p>
            </div>
            <div className="space-y-2">
              <SitePreview palette={palette} />
              <p className="text-xs text-white/60">כך זה נראה באתר</p>
            </div>
          </div>

          <p className="text-sm text-white/70 min-h-[1.25rem]">
            {isCustom ? (
              <>
                צבע אישי פעיל · <span dir="ltr">{activeColor}</span>
              </>
            ) : (
              "כרגע האתר בצבע המקורי שלו."
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
            <button
              type="button"
              className="btn-ghost px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/20 disabled:hover:text-white/80"
              onClick={() => void resetToDefault()}
              disabled={!canReset}
            >
              חזרה לצבע הדיפולטיבי
            </button>
          </div>

          <div className="min-h-[2.75rem]" aria-live="polite">
            {busy && <p className="text-xs text-white/50">שומרת…</p>}
            {status.state === "saved" && (
              <p className="text-sm text-violet-200" role="status">
                {status.message}
              </p>
            )}
            {status.state === "error" && (
              <p className="text-sm text-red-300" role="alert">
                {status.message}
              </p>
            )}
          </div>
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
        <section className="glass-panel p-6 text-center space-y-1">
          <h2 className="font-serif text-2xl text-white">צבע האתר שלי</h2>
          <p className="text-sm text-white/60">לא הצלחתי לטעון את בחירת הצבע כרגע. אפשר לרענן את הדף ולנסות שוב.</p>
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
