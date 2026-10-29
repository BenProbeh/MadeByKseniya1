import { useRef, useState } from "react";
import { clamp } from "../../lib/nailSizing/measure.js";

const LOUPE = 112; // px
const ZOOM = 2.6;
const MIN_R = 18;

/**
 * Marks on top of the still photo. Coordinates are stage pixels (the still fills the stage exactly).
 * - coin mode: drag the circle to move it; drag the edge knob (or use the size slider) to resize.
 * - nail mode: drag either edge line sideways; drag the centre knob to move both up or down.
 * Every knob is a real button: arrow keys move it 1px (Shift: 5px). While dragging, a loupe shows the
 * area under the finger so the edge can be placed precisely.
 */
export default function MarkingStage({ imageUrl, size, mode, coin, nail, onCoinChange, onNailChange }) {
  const stageRef = useRef(null);
  const drag = useRef(null);
  const [active, setActive] = useState(null); // { x, y } of the point being placed, for the loupe
  const { w, h } = size;

  function point(e) {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: clamp(e.clientX - rect.left, 0, w), y: clamp(e.clientY - rect.top, 0, h) };
  }

  function begin(handle, e) {
    e.preventDefault();
    e.stopPropagation();
    const p = point(e);
    drag.current = { handle, start: p, coin: { ...coin }, nail: { ...nail } };
    stageRef.current.setPointerCapture?.(e.pointerId);
    update(p);
  }

  function update(p) {
    const d = drag.current;
    if (!d) return;
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    switch (d.handle) {
      case "coin-move": {
        const cx = clamp(d.coin.cx + dx, 0, w);
        const cy = clamp(d.coin.cy + dy, 0, h);
        onCoinChange({ ...d.coin, cx, cy });
        setActive({ x: cx + d.coin.r, y: cy });
        break;
      }
      case "coin-edge": {
        const r = clamp(Math.hypot(p.x - d.coin.cx, p.y - d.coin.cy), MIN_R, Math.max(w, h) / 2);
        onCoinChange({ ...d.coin, r });
        setActive({ x: d.coin.cx + r, y: d.coin.cy });
        break;
      }
      case "nail-a":
      case "nail-b": {
        const key = d.handle === "nail-a" ? "x1" : "x2";
        const x = clamp(d.nail[key] + dx, 0, w);
        onNailChange({ ...d.nail, [key]: x });
        setActive({ x, y: d.nail.y });
        break;
      }
      case "nail-move": {
        const y = clamp(d.nail.y + dy, 0, h);
        onNailChange({ ...d.nail, y });
        setActive({ x: (d.nail.x1 + d.nail.x2) / 2, y });
        break;
      }
      default:
    }
  }

  function end() {
    drag.current = null;
    setActive(null);
  }

  function nudge(handle, e) {
    const step = e.shiftKey ? 5 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const [dx, dy] = delta;
    if (handle === "coin-move") onCoinChange({ ...coin, cx: clamp(coin.cx + dx, 0, w), cy: clamp(coin.cy + dy, 0, h) });
    if (handle === "coin-edge") onCoinChange({ ...coin, r: clamp(coin.r + dx - dy, MIN_R, Math.max(w, h) / 2) });
    if (handle === "nail-a") onNailChange({ ...nail, x1: clamp(nail.x1 + dx, 0, w) });
    if (handle === "nail-b") onNailChange({ ...nail, x2: clamp(nail.x2 + dx, 0, w) });
    if (handle === "nail-move") onNailChange({ ...nail, y: clamp(nail.y + dy, 0, h) });
  }

  const knob =
    "absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full grid place-items-center touch-none outline-none focus-visible:ring-2 focus-visible:ring-white";
  const dot = "block w-5 h-5 rounded-full border-2 border-white bg-violet-400 shadow-[0_2px_8px_rgba(0,0,0,0.6)]";
  const tick = Math.max(28, h * 0.09);
  const left = Math.min(nail.x1, nail.x2);
  const right = Math.max(nail.x1, nail.x2);

  return (
    <div
      ref={stageRef}
      dir="ltr"
      className="absolute inset-0 touch-none select-none"
      onPointerMove={(e) => drag.current && update(point(e))}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <img src={imageUrl} alt="התמונה שצילמת" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />

      <svg className="absolute inset-0 pointer-events-none" width={w} height={h} aria-hidden="true">
        {mode === "coin" && (
          <>
            <defs>
              <mask id="coin-hole">
                <rect width={w} height={h} fill="white" />
                <circle cx={coin.cx} cy={coin.cy} r={coin.r} fill="black" />
              </mask>
            </defs>
            <rect width={w} height={h} fill="rgba(0,0,0,0.45)" mask="url(#coin-hole)" />
          </>
        )}
        {mode === "coin" && <circle cx={coin.cx} cy={coin.cy} r={coin.r} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={4} />}
        <circle
          cx={coin.cx}
          cy={coin.cy}
          r={coin.r}
          fill="none"
          stroke={mode === "coin" ? "#f5e0ff" : "rgba(255,255,255,0.45)"}
          strokeWidth={mode === "coin" ? 2 : 1.25}
          strokeDasharray={mode === "coin" ? undefined : "4 4"}
        />
        {mode === "nail" && (
          <>
            {/* Dark underlay keeps the marks readable on light skin and bright backgrounds. */}
            <line x1={left} x2={right} y1={nail.y} y2={nail.y} stroke="rgba(0,0,0,0.55)" strokeWidth="3.5" />
            <line x1={left} x2={right} y1={nail.y} y2={nail.y} stroke="#e6b8ff" strokeWidth="1.5" strokeDasharray="5 4" />
            {[nail.x1, nail.x2].map((x, i) => (
              <g key={i}>
                <line x1={x} x2={x} y1={nail.y - tick} y2={nail.y + tick} stroke="rgba(0,0,0,0.55)" strokeWidth="4" />
                <line x1={x} x2={x} y1={nail.y - tick} y2={nail.y + tick} stroke="#f5e0ff" strokeWidth="2" />
              </g>
            ))}
          </>
        )}
      </svg>

      {mode === "coin" && (
        <>
          <button
            type="button"
            className="absolute rounded-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ left: coin.cx - coin.r, top: coin.cy - coin.r, width: coin.r * 2, height: coin.r * 2 }}
            onPointerDown={(e) => begin("coin-move", e)}
            onKeyDown={(e) => nudge("coin-move", e)}
            aria-label="מיקום העיגול על המטבע (חיצים להזזה)"
          />
          <button
            type="button"
            className={knob}
            style={{ left: coin.cx + coin.r, top: coin.cy }}
            onPointerDown={(e) => begin("coin-edge", e)}
            onKeyDown={(e) => nudge("coin-edge", e)}
            aria-label="גודל העיגול (חיצים לשינוי)"
          >
            <span className={dot} />
          </button>
        </>
      )}

      {mode === "nail" && (
        <>
          {[
            ["nail-a", nail.x1, "קצה ראשון של הציפורן"],
            ["nail-b", nail.x2, "קצה שני של הציפורן"],
          ].map(([handle, x, label]) => (
            <button
              key={handle}
              type="button"
              className={`${knob} w-12 h-[5.5rem] rounded-none`}
              style={{ left: x, top: nail.y }}
              onPointerDown={(e) => begin(handle, e)}
              onKeyDown={(e) => nudge(handle, e)}
              aria-label={`${label} (חיצים להזזה)`}
            >
              <span className={dot} />
            </button>
          ))}
          <button
            type="button"
            className={knob}
            style={{ left: (left + right) / 2, top: nail.y + tick + 18 }}
            onPointerDown={(e) => begin("nail-move", e)}
            onKeyDown={(e) => nudge("nail-move", e)}
            aria-label="גובה הסימון (חיצים למעלה ולמטה)"
          >
            <span className="block w-7 h-2 rounded-full bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
          </button>
        </>
      )}

      {active && (
        <div
          className="absolute rounded-full overflow-hidden border-2 border-white shadow-lift pointer-events-none"
          style={{
            width: LOUPE,
            height: LOUPE,
            top: 12,
            left: active.x < w / 2 ? w - LOUPE - 12 : 12,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${w * ZOOM}px ${h * ZOOM}px`,
            backgroundPosition: `${-(active.x * ZOOM - LOUPE / 2)}px ${-(active.y * ZOOM - LOUPE / 2)}px`,
          }}
          aria-hidden="true"
        >
          <span className="absolute left-1/2 top-0 bottom-0 w-px bg-violet-200/90" />
          <span className="absolute top-1/2 left-0 right-0 h-px bg-violet-200/60" />
        </div>
      )}
    </div>
  );
}
