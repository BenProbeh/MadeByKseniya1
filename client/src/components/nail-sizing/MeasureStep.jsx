import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeFrame, captureCanvasFrame } from "../../lib/nailSizing/measurementEngine.js";
import { getCoverTransform, videoPointToDisplay, videoLengthToDisplay } from "../../lib/nailSizing/videoGeometry.js";
import {
  pixelsPerMillimeter,
  widthPxToMm,
  widthMmToSize,
  confidenceLabelHe,
  CONFIDENCE_AUTO_OK,
} from "../../lib/nailSizing/sizing.js";
import { findCoinById } from "../../lib/nailSizing/coins.js";
import { CAPTURE_CONFIG, CaptureState, TEN_SHEKEL_COIN } from "../../lib/nailSizing/captureConfig.js";
import {
  createStabilityTracker,
  deriveLiveState,
  hintForState,
  isLiveCaptureState,
  readyForAutoCapture,
  toStabilitySample,
} from "../../lib/nailSizing/captureMachine.js";

function buildDraftFromAnalysis(result, coinId, outerMm, dataUrl) {
  const diameterPx = result.coin.outerDiameterPx || result.coin.diameterPx;
  const pxPerMm = pixelsPerMillimeter(diameterPx, outerMm);
  const widthMm = widthPxToMm(result.nail.widthPx, pxPerMm);
  return {
    widthMm,
    size: widthMmToSize(widthMm),
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
    detection: { coin: result.coin, nail: result.nail },
    manualOverride: false,
    tips: result.tips,
  };
}

function failReasonFromAnalysis(result) {
  if (!result) return "לא הצלחנו לאמת את הצילום";
  if (!result.validation?.sharpnessValid) return "התמונה מטושטשת — החזיקי את הטלפון יציב";
  if (!result.validation?.lightingValid) return "התאורה אינה מספיקה — נסי שוב במקום מואר";
  if (!result.validation?.coinValid) return "המטבע לא זוהה מספיק בבירור";
  if (!result.validation?.nailValid) return "הציפורן לא זוהתה מספיק בבירור";
  if (!result.validation?.verticalAlignmentValid) return "המטבע והאצבע אינם מיושרים";
  if (!result.validation?.distanceValid) return "הרווח בין המטבע לאצבע אינו תקין";
  if ((result.confidence ?? 0) < CAPTURE_CONFIG.DETECTION_CONFIDENCE_MIN) {
    return "רמת הביטחון נמוכה מדי — נסי שוב";
  }
  return result.tips?.find((t) => !t.ok)?.textHe || "הצילום לא עבר בדיקה — מנסים שוב";
}

export default function MeasureStep({ camera, coinId, finger, existing, onConfirm, onBack }) {
  const { videoRef, setVideoRef, status, start, attachToVideo, errorHe } = camera;
  const viewportRef = useRef(null);
  const overlayRef = useRef(null);
  const detectCanvasRef = useRef(null);
  const freezeCanvasRef = useRef(null);
  const trackerRef = useRef(createStabilityTracker(CAPTURE_CONFIG));
  const captureLockedRef = useRef(false);
  const captureStateRef = useRef(CaptureState.INITIALIZING);
  const runIdRef = useRef(0);

  const [captureState, setCaptureState] = useState(CaptureState.INITIALIZING);
  const [analysis, setAnalysis] = useState(null);
  const [progress, setProgress] = useState(0);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [flash, setFlash] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [draft, setDraft] = useState(null);
  const [manualMm, setManualMm] = useState("");

  const coin = findCoinById(coinId);
  const outerMm =
    coin?.outerDiameterMm ?? coin?.diameterMm ?? TEN_SHEKEL_COIN.calibrationDiameterMm;

  const setState = useCallback((next) => {
    captureStateRef.current = next;
    setCaptureState(next);
  }, []);

  useEffect(() => {
    document.body.classList.add("mbk-nail-measuring");
    return () => document.body.classList.remove("mbk-nail-measuring");
  }, []);

  useEffect(() => {
    if (status === "ready") {
      void attachToVideo?.(videoRef.current);
      if (isLiveCaptureState(captureStateRef.current) || captureStateRef.current === CaptureState.INITIALIZING) {
        setState(CaptureState.SEARCHING);
      }
    } else if (status === "requesting") {
      setState(CaptureState.INITIALIZING);
    } else if (status !== "ready") {
      setState(CaptureState.INITIALIZING);
      if (status !== "requesting") void start();
    }
  }, [status, start, attachToVideo, videoRef, setState]);

  useEffect(() => {
    // Reset machine when switching finger
    runIdRef.current += 1;
    captureLockedRef.current = false;
    trackerRef.current = createStabilityTracker(CAPTURE_CONFIG);
    setDraft(null);
    setAnalysis(null);
    setProgress(0);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setManualMm("");
    setState(status === "ready" ? CaptureState.SEARCHING : CaptureState.INITIALIZING);
  }, [finger.key, setState, status]);

  const pausePreviewTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    stream?.getVideoTracks?.().forEach((t) => {
      try {
        t.enabled = false;
      } catch {
        /* ignore */
      }
    });
  }, [videoRef]);

  const resumePreviewTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject;
    stream?.getVideoTracks?.().forEach((t) => {
      try {
        t.enabled = true;
      } catch {
        /* ignore */
      }
    });
    void attachToVideo?.(videoRef.current);
  }, [videoRef, attachToVideo]);

  const drawOverlay = useCallback((result, video) => {
    const overlay = overlayRef.current;
    const viewport = viewportRef.current;
    if (!overlay || !viewport || !video?.videoWidth || !result) return;
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

    if (result.coin?.found) {
      const c = videoPointToDisplay(result.coin.center.x, result.coin.center.y, transform);
      const r = videoLengthToDisplay(result.coin.outerDiameterPx / 2, transform);
      ctx.strokeStyle = result.validation?.coinValid ? "rgba(74,222,128,0.95)" : "rgba(209,125,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  }, []);

  const runCapturePipeline = useCallback(async () => {
    if (captureLockedRef.current) return;
    captureLockedRef.current = true;
    const runId = runIdRef.current;
    setState(CaptureState.CAPTURING);
    setFlash(true);
    window.setTimeout(() => setFlash(false), CAPTURE_CONFIG.CAPTURE_FLASH_MS);

    const video = videoRef.current;
    const freezeCanvas = freezeCanvasRef.current;
    const imageData = captureCanvasFrame(video, freezeCanvas);
    if (!imageData || !coin) {
      captureLockedRef.current = false;
      setFailReason("לא הצלחנו ללכוד פריים");
      setState(CaptureState.FAILED);
      return;
    }

    const dataUrl = freezeCanvas.toDataURL("image/jpeg", 0.85);
    setFrozenUrl(dataUrl);
    pausePreviewTracks();
    setState(CaptureState.VALIDATING);

    // Full-resolution re-check of the frozen frame (not the live stream)
    await new Promise((r) => window.setTimeout(r, 40));
    if (runId !== runIdRef.current) return;

    const result = analyzeFrame(imageData, { coinDiameterMm: outerMm, coinMeta: coin });
    const draftCandidate = buildDraftFromAnalysis(result, coinId, outerMm, dataUrl);
    const passed =
      result.ready &&
      (result.confidence ?? 0) >= CAPTURE_CONFIG.DETECTION_CONFIDENCE_MIN &&
      draftCandidate.widthMm != null;

    if (!passed) {
      setFailReason(failReasonFromAnalysis(result));
      setFrozenUrl(null);
      setDraft(null);
      setState(CaptureState.FAILED);
      resumePreviewTracks();
      trackerRef.current.reset();
      setProgress(0);
      window.setTimeout(() => {
        if (runId !== runIdRef.current) return;
        captureLockedRef.current = false;
        setFailReason("");
        setState(CaptureState.ALIGNING);
      }, CAPTURE_CONFIG.FAILED_HOLD_MS);
      return;
    }

    setDraft(draftCandidate);
    setManualMm(String(draftCandidate.widthMm));
    setAnalysis(result);
    drawOverlay(result, video);
    setState(CaptureState.SUCCESS);
    try {
      navigator.vibrate?.(40);
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      if (runId !== runIdRef.current) return;
      setState(CaptureState.REVIEW);
      // unlock only for retake path
      captureLockedRef.current = false;
    }, CAPTURE_CONFIG.SUCCESS_HOLD_MS);
  }, [
    coin,
    coinId,
    outerMm,
    videoRef,
    pausePreviewTracks,
    resumePreviewTracks,
    setState,
    drawOverlay,
  ]);

  // Live detection loop — only in live states, never a fake countdown timer
  const liveLoopActive = isLiveCaptureState(captureState);

  useEffect(() => {
    if (status !== "ready") return undefined;
    if (!liveLoopActive) return undefined;

    let alive = true;
    let timer = 0;

    const tick = () => {
      if (!alive) return;
      if (captureLockedRef.current || !isLiveCaptureState(captureStateRef.current)) return;

      const video = videoRef.current;
      const imageData = captureCanvasFrame(video, detectCanvasRef.current);
      if (imageData && coin) {
        const result = analyzeFrame(imageData, { coinDiameterMm: outerMm, coinMeta: coin });
        setAnalysis(result);
        drawOverlay(result, video);

        const now = performance.now();
        const sample = toStabilitySample(result, now);
        let stability;
        if (result.ready) {
          stability = trackerRef.current.push(sample);
        } else {
          trackerRef.current.reset();
          stability = { stable: false, progress: 0, motionValid: false, frameCount: 0, stableMs: 0 };
        }
        setProgress(stability.progress || 0);

        const nextLive = deriveLiveState(result, stability);
        if (isLiveCaptureState(captureStateRef.current) && nextLive !== captureStateRef.current) {
          setState(nextLive);
        }

        const canShoot = readyForAutoCapture({
          cameraReady: status === "ready",
          analysis: result,
          stability,
          captureLocked: captureLockedRef.current,
        });

        if (canShoot) {
          void runCapturePipeline();
          return;
        }
      }

      timer = window.setTimeout(tick, CAPTURE_CONFIG.FRAME_INTERVAL_MS);
    };

    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [status, liveLoopActive, coin, outerMm, videoRef, drawOverlay, runCapturePipeline, setState]);

  function restartLive() {
    runIdRef.current += 1;
    captureLockedRef.current = false;
    trackerRef.current.reset();
    setDraft(null);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setProgress(0);
    setManualMm("");
    resumePreviewTracks();
    setState(CaptureState.SEARCHING);
  }

  function confirmDraft(overrideMm) {
    if (!draft) return;
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

  const live = isLiveCaptureState(captureState) || captureState === CaptureState.INITIALIZING;
  const busy =
    captureState === CaptureState.CAPTURING ||
    captureState === CaptureState.VALIDATING ||
    captureState === CaptureState.SUCCESS;
  const showGuide = live && status === "ready" && !frozenUrl;
  const coinGuideState = analysis?.validation?.coinValid ? "ok" : analysis?.coin?.found ? "warn" : "idle";
  const fingerGuideState = analysis?.validation?.nailValid ? "ok" : analysis?.nail?.found ? "warn" : "idle";
  const ringState =
    captureState === CaptureState.HOLD_STILL || captureState === CaptureState.COUNTING_DOWN
      ? "ok"
      : analysis?.guideState === "warn"
        ? "warn"
        : "idle";
  const hint = hintForState(captureState, analysis, failReason);

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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
            frozenUrl ? "opacity-0" : "opacity-100"
          }`}
          playsInline
          muted
          autoPlay
        />
        {frozenUrl && (
          <img
            src={frozenUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-[1]" />
        <canvas ref={detectCanvasRef} className="hidden" />
        <canvas ref={freezeCanvasRef} className="hidden" />

        {showGuide && (
          <div className="measurement-guide" aria-hidden="true">
            <div className="measurement-progress-ring" data-state={ringState}>
              <div
                className="measurement-progress-ring__arc"
                style={{ ["--progress"]: `${Math.round(Math.min(1, progress) * 100)}%` }}
              />
            </div>
            <div className="measurement-axis">
              <div className="measurement-axis__spine" />
              <div className="coin-guide" data-state={coinGuideState} />
              <div className="finger-guide" data-state={fingerGuideState}>
                <div className="nail-guide" />
              </div>
            </div>
            <p
              className="measurement-guide__hint"
              data-ok={
                captureState === CaptureState.HOLD_STILL || captureState === CaptureState.COUNTING_DOWN
                  ? "true"
                  : "false"
              }
            >
              {hint}
            </p>
          </div>
        )}

        {flash && <div className="measurement-capture-flash" aria-hidden="true" />}

        {captureState === CaptureState.SUCCESS && (
          <div className="measurement-success-overlay" role="status">
            <div className="measurement-success-badge" aria-hidden="true">
              ✓
            </div>
            <p className="measurement-success-text">הצילום בוצע בהצלחה</p>
          </div>
        )}

        {(captureState === CaptureState.CAPTURING || captureState === CaptureState.VALIDATING) && (
          <div className="absolute inset-0 z-[4] flex items-center justify-center bg-oled-950/35">
            <p className="text-sm text-white/85">
              {captureState === CaptureState.CAPTURING ? "מצלמים…" : "בודקים את הצילום…"}
            </p>
          </div>
        )}

        {captureState === CaptureState.FAILED && (
          <div className="absolute inset-x-0 bottom-10 z-[4] px-4 text-center">
            <p className="text-sm text-amber-200 bg-oled-950/70 rounded-xl px-3 py-2 inline-block">
              {failReason || "הצילום לא עבר בדיקה"}
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
      </div>

      <div className="glass-panel p-4 space-y-2" aria-live="polite">
        <p className="text-sm text-white/80">{hint}</p>
        {live &&
          analysis?.tips
            ?.filter((t) => !t.ok)
            .slice(0, 2)
            .map((tip) => (
              <p key={tip.code} className="text-sm text-white/55 flex items-start gap-2">
                <span aria-hidden="true">!</span>
                <span>{tip.textHe}</span>
              </p>
            ))}
        {(captureState === CaptureState.HOLD_STILL || captureState === CaptureState.COUNTING_DOWN) && (
          <p className="text-sm text-violet-200">סורקים… {Math.round(Math.min(1, progress) * 100)}%</p>
        )}
      </div>

      {captureState !== CaptureState.REVIEW ? (
        <div className="flex flex-wrap gap-3 justify-between">
          <button type="button" className="btn-ghost" onClick={onBack} disabled={busy}>
            חזרה
          </button>
          {live && (
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={!analysis?.ready || busy}
              onClick={() => {
                if (!analysis?.ready || busy) return;
                void runCapturePipeline();
              }}
            >
              צילום ידני
            </button>
          )}
        </div>
      ) : (
        <div className="glass-panel p-5 space-y-4">
          {draft?.previewDataUrl && (
            <img
              src={draft.previewDataUrl}
              alt={`צילום ${finger.fingerLabelHe}`}
              className="w-full rounded-lg border border-white/10"
            />
          )}
          <div className="grid sm:grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-white/40 mb-1">רוחב ציפורן</p>
              <p className="font-serif text-xl violet-text">{draft?.widthMm ?? "—"} מ״מ</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">מידה מוצעת</p>
              <p className="font-serif text-xl text-white">{draft?.size ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-white/40 mb-1">ביטחון</p>
              <p className="text-sm text-white/70">{confidenceLabelHe(draft?.confidence)}</p>
            </div>
          </div>
          {draft?.captureQuality?.calibrationMm && (
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
            <button type="button" className="btn-ghost" onClick={restartLive}>
              צלמי שוב
            </button>
            <button
              type="button"
              className="btn-violet"
              onClick={() => confirmDraft(manualMm)}
              disabled={
                !manualMm ||
                (draft?.confidence < CONFIDENCE_AUTO_OK && Number(manualMm) === draft?.widthMm)
              }
            >
              אישור האצבע
            </button>
          </div>
          {draft?.confidence < CONFIDENCE_AUTO_OK && (
            <p className="text-xs text-amber-200 text-center">
              הביטחון נמוך — צלמי שוב או עדכני את המידה ידנית לפני אישור.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
