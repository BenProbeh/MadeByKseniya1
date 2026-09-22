import { useEffect, useRef, useState } from "react";
import { analyzeFrame, captureCanvasFrame } from "../../lib/nailSizing/measurementEngine.js";
import { pixelsPerMillimeter, widthPxToMm, widthMmToSize, confidenceLabelHe, CONFIDENCE_AUTO_OK } from "../../lib/nailSizing/sizing.js";
import { findCoinById } from "../../lib/nailSizing/coins.js";

export default function MeasureStep({
  camera,
  coinId,
  finger,
  existing,
  onConfirm,
  onBack,
  stableFramesNeeded = 8,
}) {
  const { videoRef, status, start } = camera;
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [analysis, setAnalysis] = useState(null);
  const [stableCount, setStableCount] = useState(0);
  const [draft, setDraft] = useState(null);
  const [manualMm, setManualMm] = useState("");
  const [countdown, setCountdown] = useState(null);
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const coin = findCoinById(coinId);

  useEffect(() => {
    if (status !== "ready") start();
  }, [status, start]);

  useEffect(() => {
    if (status !== "ready" || draft) return undefined;
    let raf = 0;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const imageData = captureCanvasFrame(videoRef.current, canvasRef.current);
      if (imageData && coin) {
        const result = analyzeFrame(imageData, { coinDiameterMm: coin.diameterMm });
        setAnalysis(result);
        setStableCount((c) => (result.ready ? c + 1 : 0));

        const overlay = overlayRef.current;
        if (overlay) {
          overlay.width = imageData.width;
          overlay.height = imageData.height;
          const ctx = overlay.getContext("2d");
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          // coin guide (left)
          ctx.strokeStyle = result.coin.score > 0.22 ? "#d17dff" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(overlay.width * 0.32, overlay.height * 0.55, Math.min(overlay.width, overlay.height) * 0.16, 0, Math.PI * 2);
          ctx.stroke();
          // nail guide (right)
          ctx.strokeStyle = result.nail.widthPx ? "#d17dff" : "rgba(255,255,255,0.35)";
          const nx = overlay.width * 0.55;
          const ny = overlay.height * 0.35;
          const nw = overlay.width * 0.32;
          const nh = overlay.height * 0.35;
          ctx.beginPath();
          ctx.ellipse(nx + nw / 2, ny + nh / 2, nw / 2, nh / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      raf = window.setTimeout(tick, 180);
    };

    tick();
    return () => {
      alive = false;
      window.clearTimeout(raf);
    };
  }, [status, draft, coin, videoRef]);

  useEffect(() => {
    if (draft || !analysis?.ready || stableCount < stableFramesNeeded) return undefined;
    if (prefersReducedMotion) {
      takeSnapshot();
      return undefined;
    }
    setCountdown(3);
    const t1 = window.setTimeout(() => setCountdown(2), 400);
    const t2 = window.setTimeout(() => setCountdown(1), 800);
    const t3 = window.setTimeout(() => {
      setCountdown(null);
      takeSnapshot();
    }, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableCount, analysis?.ready, draft, stableFramesNeeded, prefersReducedMotion]);

  function takeSnapshot() {
    const imageData = captureCanvasFrame(videoRef.current, canvasRef.current);
    if (!imageData || !coin) return;
    const result = analyzeFrame(imageData, { coinDiameterMm: coin.diameterMm });
    const pxPerMm = pixelsPerMillimeter(result.coin.diameterPx, coin.diameterMm);
    const widthMm = widthPxToMm(result.nail.widthPx, pxPerMm);
    const size = widthMmToSize(widthMm);
    const dataUrl = canvasRef.current?.toDataURL?.("image/jpeg", 0.72) ?? null;
    setDraft({
      widthMm,
      size,
      confidence: result.confidence,
      coinId,
      captureQuality: {
        brightness: result.brightness,
        sharpness: result.sharpness,
        coinScore: result.coin.score,
        nailScore: result.nail.score,
      },
      previewDataUrl: dataUrl,
      manualOverride: false,
      tips: result.tips,
    });
    setManualMm(widthMm != null ? String(widthMm) : "");
    setStableCount(0);
  }

  function confirmDraft(overrideMm) {
    const widthMm = overrideMm != null ? Number(overrideMm) : draft.widthMm;
    if (!widthMm || Number.isNaN(widthMm)) return;
    const size = widthMmToSize(widthMm);
    const manual = overrideMm != null && Number(overrideMm) !== draft.widthMm;
    onConfirm({
      ...draft,
      widthMm,
      size,
      manualOverride: manual || draft.confidence < CONFIDENCE_AUTO_OK,
      status: draft.confidence < CONFIDENCE_AUTO_OK && !manual ? "needs_retake" : "confirmed",
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel p-4 text-center space-y-1">
        <p className="section-eyebrow justify-center">{finger.handLabelHe}</p>
        <h2 className="font-serif text-2xl text-white">{finger.fingerLabelHe}</h2>
        {existing?.status === "confirmed" && (
          <p className="text-xs text-violet-200">כבר נמדד — אפשר לצלם שוב או לאשר מחדש</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black aspect-[3/4] max-h-[70vh] mx-auto w-full">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <canvas ref={canvasRef} className="hidden" />
        {countdown != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-oled-950/40">
            <span className="font-serif text-6xl violet-text">{countdown}</span>
          </div>
        )}
      </div>

      <div className="glass-panel p-4 space-y-2" aria-live="polite">
        {(analysis?.tips || []).map((tip) => (
          <p
            key={tip.code}
            className={`text-sm flex items-start gap-2 ${tip.ok ? "text-violet-200" : "text-white/70"}`}
          >
            <span aria-hidden="true">{tip.ok ? "✓" : "!"}</span>
            <span>{tip.textHe}</span>
          </p>
        ))}
        {!analysis && <p className="text-sm text-white/45">מכינים את המצלמה...</p>}
      </div>

      {!draft ? (
        <div className="flex flex-wrap gap-3 justify-between">
          <button type="button" className="btn-ghost" onClick={onBack}>
            חזרה
          </button>
          <button type="button" className="btn-violet" onClick={takeSnapshot}>
            צילום ידני
          </button>
        </div>
      ) : (
        <div className="glass-panel p-5 space-y-4">
          {draft.previewDataUrl && (
            <img
              src={draft.previewDataUrl}
              alt={`צילום ${finger.fingerLabelHe}`}
              className="w-full rounded-lg border border-white/10"
            />
          )}
          <div className="grid sm:grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-white/40 mb-1">רוחב</p>
              <p className="font-serif text-xl violet-text">{draft.widthMm ?? "—"} מ״מ</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">מידה מוצעת</p>
              <p className="font-serif text-xl text-white">{draft.size ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">ביטחון</p>
              <p className="text-sm text-white/70">{confidenceLabelHe(draft.confidence)}</p>
            </div>
          </div>

          <label className="block text-sm text-white/60">
            תיקון ידני (מ״מ)
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="5"
              max="20"
              value={manualMm}
              onChange={(e) => setManualMm(e.target.value)}
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base outline-none focus:border-violet-400/60"
            />
          </label>

          <div className="flex flex-wrap gap-3 justify-between">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setDraft(null);
                setStableCount(0);
              }}
            >
              צלמי שוב
            </button>
            <button
              type="button"
              className="btn-violet"
              onClick={() => confirmDraft(manualMm)}
              disabled={!manualMm}
            >
              אישור האצבע
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
