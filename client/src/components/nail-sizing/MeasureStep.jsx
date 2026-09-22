import { useEffect, useRef, useState } from "react";
import { analyzeFrame, captureCanvasFrame } from "../../lib/nailSizing/measurementEngine.js";
import { getCoverTransform, videoPointToDisplay, videoLengthToDisplay } from "../../lib/nailSizing/videoGeometry.js";
import { pixelsPerMillimeter, widthPxToMm, widthMmToSize, confidenceLabelHe, CONFIDENCE_AUTO_OK } from "../../lib/nailSizing/sizing.js";
import { findCoinById } from "../../lib/nailSizing/coins.js";

const STABLE_MS = 750;

export default function MeasureStep({
  camera,
  coinId,
  finger,
  existing,
  onConfirm,
  onBack,
}) {
  const { videoRef, setVideoRef, status, start, attachToVideo, errorHe } = camera;
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const detectCanvasRef = useRef(null);
  const [analysis, setAnalysis] = useState(null);
  const [stableMs, setStableMs] = useState(0);
  const [draft, setDraft] = useState(null);
  const [manualMm, setManualMm] = useState("");
  const [countdown, setCountdown] = useState(null);
  const stableSinceRef = useRef(null);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const coin = findCoinById(coinId);
  const outerMm = coin?.outerDiameterMm ?? coin?.diameterMm ?? 23;
  const progress = Math.min(1, stableMs / STABLE_MS);
  const guideState = analysis?.guideState || "idle";
  const primaryTip = analysis?.tips?.[0];

  useEffect(() => {
    document.body.classList.add("mbk-nail-measuring");
    return () => document.body.classList.remove("mbk-nail-measuring");
  }, []);

  useEffect(() => {
    if (status === "ready") {
      void attachToVideo?.(videoRef.current);
    } else if (status !== "requesting") {
      void start();
    }
  }, [status, start, attachToVideo, videoRef]);

  useEffect(() => {
    setDraft(null);
    setAnalysis(null);
    setStableMs(0);
    setCountdown(null);
    setManualMm("");
    stableSinceRef.current = null;
  }, [finger.key]);

  useEffect(() => {
    if (status !== "ready" || draft) return undefined;
    let alive = true;
    let timer = 0;

    const tick = () => {
      if (!alive) return;
      const video = videoRef.current;
      const detectCanvas = detectCanvasRef.current;
      const overlay = canvasRef.current;
      const viewport = viewportRef.current;
      const imageData = captureCanvasFrame(video, detectCanvas);
      if (imageData && coin) {
        const result = analyzeFrame(imageData, {
          coinDiameterMm: outerMm,
          coinMeta: coin,
        });
        setAnalysis(result);

        const now = performance.now();
        if (result.ready) {
          if (stableSinceRef.current == null) stableSinceRef.current = now;
          setStableMs(now - stableSinceRef.current);
        } else {
          stableSinceRef.current = null;
          setStableMs(0);
        }

        if (overlay && viewport && video?.videoWidth) {
          const displayW = viewport.clientWidth;
          const displayH = viewport.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          overlay.width = Math.floor(displayW * dpr);
          overlay.height = Math.floor(displayH * dpr);
          overlay.style.width = `${displayW}px`;
          overlay.style.height = `${displayH}px`;
          const ctx = overlay.getContext("2d");
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, displayW, displayH);

          const transform = getCoverTransform(video.videoWidth, video.videoHeight, displayW, displayH);

          // Detected coin outline (mapped through object-fit: cover)
          if (result.coin?.found) {
            const c = videoPointToDisplay(result.coin.center.x, result.coin.center.y, transform);
            const r = videoLengthToDisplay(result.coin.outerDiameterPx / 2, transform);
            ctx.strokeStyle = result.validation?.coinValid ? "rgba(74,222,128,0.95)" : "rgba(209,125,255,0.85)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Detected nail width segment
          if (result.nail?.found && result.nail.left != null && result.nail.right != null) {
            const a = videoPointToDisplay(result.nail.left, result.nail.center.y, transform);
            const b = videoPointToDisplay(result.nail.right, result.nail.center.y, transform);
            ctx.strokeStyle = result.validation?.nailValid ? "rgba(74,222,128,0.95)" : "rgba(251,191,36,0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      timer = window.setTimeout(tick, 160);
    };

    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [status, draft, coin, videoRef, outerMm]);

  useEffect(() => {
    if (draft || !analysis?.ready || stableMs < STABLE_MS) return undefined;
    if (prefersReducedMotion) {
      takeSnapshot();
      return undefined;
    }
    setCountdown(3);
    const t1 = window.setTimeout(() => setCountdown(2), 350);
    const t2 = window.setTimeout(() => setCountdown(1), 700);
    const t3 = window.setTimeout(() => {
      setCountdown(null);
      takeSnapshot();
    }, 1050);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableMs, analysis?.ready, draft, prefersReducedMotion]);

  function takeSnapshot({ force = false } = {}) {
    const imageData = captureCanvasFrame(videoRef.current, detectCanvasRef.current);
    if (!imageData || !coin) return;
    const result = analyzeFrame(imageData, { coinDiameterMm: outerMm, coinMeta: coin });
    if (!force && !result.ready) return;
    const diameterPx = result.coin.outerDiameterPx || result.coin.diameterPx;
    const pxPerMm = pixelsPerMillimeter(diameterPx, outerMm);
    const widthMm = widthPxToMm(result.nail.widthPx, pxPerMm);
    if (widthMm == null && !force) return;

    const size = widthMmToSize(widthMm);
    const dataUrl = detectCanvasRef.current?.toDataURL?.("image/jpeg", 0.72) ?? null;
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
        outerDiameterPx: diameterPx,
        calibrationMm: outerMm,
      },
      previewDataUrl: dataUrl,
      detection: {
        coin: result.coin,
        nail: result.nail,
      },
      manualOverride: false,
      tips: result.tips,
    });
    setManualMm(widthMm != null ? String(widthMm) : "");
    setStableMs(0);
    stableSinceRef.current = null;
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

  const coinGuideState = analysis?.validation?.coinValid ? "ok" : analysis?.coin?.found ? "warn" : "idle";
  const fingerGuideState = analysis?.validation?.nailValid ? "ok" : analysis?.nail?.found ? "warn" : "idle";

  return (
    <div className="space-y-5">
      <div className="glass-panel p-4 text-center space-y-1">
        <p className="section-eyebrow justify-center">{finger.handLabelHe}</p>
        <h2 className="font-serif text-2xl text-white">{finger.fingerLabelHe}</h2>
        {existing?.status === "confirmed" && (
          <p className="text-xs text-violet-200">כבר נמדד — אפשר לצלם שוב או לאשר מחדש</p>
        )}
      </div>

      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black aspect-[3/4] max-h-[min(70vh,640px)] mx-auto w-full"
      >
        <video
          ref={setVideoRef || videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[1]" />
        <canvas ref={detectCanvasRef} className="hidden" />

        {!draft && status === "ready" && (
          <div className="measurement-guide" aria-hidden="true">
            <div
              className="measurement-progress-ring"
              data-state={guideState === "ok" ? "ok" : guideState === "warn" ? "warn" : "idle"}
            >
              <div
                className="measurement-progress-ring__arc"
                style={{ ["--progress"]: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="measurement-axis">
              <div className="measurement-axis__spine" />
              <div className="coin-guide" data-state={coinGuideState} />
              <div className="finger-guide" data-state={fingerGuideState}>
                <div className="nail-guide" />
              </div>
            </div>
            <p className="measurement-guide__hint" data-ok={analysis?.ready ? "true" : "false"}>
              {primaryTip?.textHe || "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו"}
            </p>
          </div>
        )}

        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-oled-950/70 px-4 text-center z-[3]">
            <p className="text-sm text-white/70">
              {status === "requesting" ? "פותחים את המצלמה…" : "ממתינים למצלמה…"}
            </p>
            {errorHe && <p className="text-sm text-red-300">{errorHe}</p>}
            {(status === "denied" || status === "error" || status === "idle") && (
              <button type="button" className="btn-violet" onClick={start}>
                הפעילי מצלמה
              </button>
            )}
          </div>
        )}
        {countdown != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-oled-950/40 z-[4]">
            <span className="font-serif text-6xl violet-text">{countdown}</span>
          </div>
        )}
      </div>

      <div className="glass-panel p-4 space-y-2" aria-live="polite">
        {(analysis?.tips || []).map((tip) => (
          <p
            key={tip.code}
            className={`text-sm flex items-start gap-2 ${tip.ok ? "text-green-300" : tip.code.includes("warn") || tip.code === "blur" ? "text-amber-200" : "text-white/70"}`}
          >
            <span aria-hidden="true">{tip.ok ? "✓" : "!"}</span>
            <span>{tip.textHe}</span>
          </p>
        ))}
        {!analysis && <p className="text-sm text-white/45">מכינים את המצלמה...</p>}
        {analysis?.ready && stableMs < STABLE_MS && (
          <p className="text-sm text-violet-200">מחזיקים יציב… {Math.round(progress * 100)}%</p>
        )}
      </div>

      {!draft ? (
        <div className="flex flex-wrap gap-3 justify-between">
          <button type="button" className="btn-ghost" onClick={onBack}>
            חזרה
          </button>
          <button
            type="button"
            className="btn-violet"
            disabled={!analysis?.ready}
            onClick={() => takeSnapshot()}
          >
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
              <p className="text-xs text-white/40 mb-1">רוחב ציפורן</p>
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
          {draft.captureQuality?.calibrationMm && (
            <p className="text-xs text-white/40 text-center">
              כיול לפי קוטר חיצוני {draft.captureQuality.calibrationMm} מ״מ
              {draft.captureQuality.outerDiameterPx
                ? ` · ${Math.round(draft.captureQuality.outerDiameterPx)}px`
                : ""}
            </p>
          )}

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
                setStableMs(0);
                stableSinceRef.current = null;
              }}
            >
              צלמי שוב
            </button>
            <button
              type="button"
              className="btn-violet"
              onClick={() => confirmDraft(manualMm)}
              disabled={!manualMm || (draft.confidence < CONFIDENCE_AUTO_OK && Number(manualMm) === draft.widthMm)}
              title={
                draft.confidence < CONFIDENCE_AUTO_OK
                  ? "ביטחון נמוך — תקני ידנית או צלמי שוב"
                  : undefined
              }
            >
              אישור האצבע
            </button>
          </div>
          {draft.confidence < CONFIDENCE_AUTO_OK && (
            <p className="text-xs text-amber-200 text-center">
              הביטחון נמוך — צלמי שוב או עדכני את המידה ידנית לפני אישור.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
