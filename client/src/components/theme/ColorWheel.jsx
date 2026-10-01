import { useRef } from "react";
import { hsvToHex } from "../../lib/theme/color.js";

const HUE_RING = "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
const WHITE_CENTER = "radial-gradient(circle closest-side, #ffffff, rgba(255, 255, 255, 0))";

const HUE_NAMES = [
  [15, "אדום"],
  [45, "כתום"],
  [70, "צהוב"],
  [160, "ירוק"],
  [195, "טורקיז"],
  [255, "כחול"],
  [290, "סגול"],
  [335, "ורוד"],
  [360, "אדום"],
];

function describe({ h, s, v }) {
  if (v < 0.12) return "שחור";
  if (s < 0.08) return v > 0.85 ? "לבן" : "אפור";
  const name = HUE_NAMES.find(([max]) => h < max)?.[1] ?? "אדום";
  const depth = s < 0.4 ? "בהיר" : "רווי";
  return `${name} ${depth}`;
}

/**
 * Hue (angle, red at the top, clockwise) × saturation (distance from the white centre).
 * Pointer events cover mouse, touch and pen; `touch-action: none` keeps the page from scrolling while dragging.
 * Arrow keys: left/right change the hue, up/down the saturation (Shift = bigger steps).
 */
export default function ColorWheel({ hsv, onChange, onChangeEnd, hasSelection, label }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const latest = useRef(hsv);
  latest.current = hsv;

  function fromPointer(e) {
    const rect = ref.current.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = e.clientX - (rect.left + radius);
    const dy = e.clientY - (rect.top + radius);
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    return { h, s, v: latest.current.v };
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    ref.current.focus({ preventScroll: true });
    try {
      ref.current.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
    dragging.current = true;
    onChange(fromPointer(e));
  }

  function onPointerMove(e) {
    if (dragging.current) onChange(fromPointer(e));
  }

  function finish(e, usePointer) {
    if (!dragging.current) return;
    dragging.current = false;
    onChangeEnd(usePointer ? fromPointer(e) : latest.current);
  }

  function onKeyDown(e) {
    const step = e.shiftKey ? 15 : 5;
    const { h, s, v } = latest.current;
    let next = null;
    if (e.key === "ArrowLeft") next = { h: (h - step + 360) % 360, s: Math.max(s, 0.3), v };
    else if (e.key === "ArrowRight") next = { h: (h + step) % 360, s: Math.max(s, 0.3), v };
    else if (e.key === "ArrowUp") next = { h, s: Math.min(1, s + step / 100), v };
    else if (e.key === "ArrowDown") next = { h, s: Math.max(0, s - step / 100), v };
    if (!next) return;
    e.preventDefault();
    latest.current = next;
    onChangeEnd(next);
  }

  const rad = (hsv.h * Math.PI) / 180;
  const left = 50 + Math.sin(rad) * hsv.s * 50;
  const top = 50 - Math.cos(rad) * hsv.s * 50;
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-roledescription="גלגל צבעים"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={hasSelection ? `${describe(hsv)} (${hex})` : "צבע ברירת המחדל של האתר"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onLostPointerCapture={(e) => finish(e, false)}
      onKeyDown={onKeyDown}
      className="relative aspect-square w-full max-w-[15rem] touch-none select-none rounded-full cursor-crosshair ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4 focus-visible:ring-offset-oled-900"
      style={{ backgroundImage: `${WHITE_CENTER}, ${HUE_RING}` }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-full bg-black transition-opacity duration-150"
        style={{ opacity: 1 - hsv.v }}
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_4px_14px_rgba(0,0,0,0.5)] ${
          hasSelection ? "" : "bg-transparent border-dashed opacity-80"
        }`}
        style={{ left: `${left}%`, top: `${top}%`, backgroundColor: hasSelection ? hex : "transparent" }}
      />
    </div>
  );
}
