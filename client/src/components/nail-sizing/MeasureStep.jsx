import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CAPTURE_CONFIG, CaptureState, TEN_SHEKEL_COIN, AUTO_CAPTURE_CONFIG } from "../../lib/nailSizing/captureConfig.js";
import {
  createAlignmentHoldTracker,
  deriveLiveState,
  handleDetectionForCapture,
  hintForState,
  isLiveCaptureState,
  evaluateMeasurementQuality,
  getInstructionFromBlockers,
} from "../../lib/nailSizing/captureMachine.js";

function useDebugCapture() {
  return useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("debugCapture") === "1" || q.get("nailSizingDebug") === "1";
    } catch {
      return false;
    }
  }, []);
}

function buildDraftFromAnalysis(result, coinId, outerMm, dataUrl, quality) {
  const diameterPx = result.coin?.outerDiameterPx || result.coin?.diameterPx;
  const pxPerMm = pixelsPerMillimeter(diameterPx, outerMm);
  const widthMm = widthPxToMm(result.nail?.widthPx, pxPerMm);
  const confidence = quality?.confidence ?? result.confidence ?? 0;
  return {
    widthMm,
    size: widthMmToSize(widthMm),
    confidence,
    confidenceLevel: confidence >= CONFIDENCE_AUTO_OK ? "high" : "low",
    coinId,
    captureQuality: {
      brightness: result.brightness,
      sharpness: result.sharpness,
      coinScore: result.coin?.score,
      nailScore: result.nail?.score,
      outerDiameterPx: diameterPx,
      calibrationMm: outerMm,
      metrics: quality?.metrics,
    },
    previewDataUrl: dataUrl,
    detection: { coin: result.coin, nail: result.nail },
    manualOverride: false,
    tips: result.tips,
  };
}

function captureVideoFrame(video, canvas) {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
  };
}

export default function MeasureStep({ camera, coinId, finger, existing, onConfirm, onBack }) {
  const debugCapture = useDebugCapture();
  const { videoRef, setVideoRef, status, start, attachToVideo, errorHe } = camera;
  const viewportRef = useRef(null);
  const overlayRef = useRef(null);
  const detectCanvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const holdTrackerRef = useRef(createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG));
  const captureLockRef = useRef(false);
  const captureStateRef = useRef(CaptureState.INITIALIZING);
  const runIdRef = useRef(0);
  const flashTimerRef = useRef(0);
  const successTimerRef = useRef(0);
  const failTimerRef = useRef(0);

  const [captureState, setCaptureState] = useState(CaptureState.INITIALIZING);
  const [analysis, setAnalysis] = useState(null);
  const [gate, setGate] = useState(null);
  const [alignmentProgress, setAlignmentProgress] = useState(0);
  const [warmupComplete, setWarmupComplete] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState(null);
  const [flash, setFlash] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [draft, setDraft] = useState(null);
  const [manualMm, setManualMm] = useState("");
  const [liveQuality, setLiveQuality] = useState(null);
  const [guideHint, setGuideHint] = useState("");

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
    } else if (status !== "ready") {
      setState(CaptureState.INITIALIZING);
      if (status !== "requesting") void start();
    }
  }, [status, start, attachToVideo, videoRef, setState]);

  useEffect(() => {
    runIdRef.current += 1;
    captureLockRef.current = false;
    holdTrackerRef.current = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
    window.clearTimeout(flashTimerRef.current);
    window.clearTimeout(successTimerRef.current);
    window.clearTimeout(failTimerRef.current);
    setDraft(null);
    setAnalysis(null);
    setGate(null);
    setAlignmentProgress(0);
    setWarmupComplete(false);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setManualMm("");
    setGuideHint("");
    setLiveQuality(null);
    setState(status === "ready" ? CaptureState.SEARCHING : CaptureState.INITIALIZING);
  }, [finger.key, setState, status]);

  useEffect(() => {
    return () => {
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(successTimerRef.current);
      window.clearTimeout(failTimerRef.current);
    };
  }, []);

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

    if (result.coin?.found || (result.coin?.score ?? 0) > 0.12) {
      const c = videoPointToDisplay(result.coin.center.x, result.coin.center.y, transform);
      const r = videoLengthToDisplay((result.coin.outerDiameterPx || result.coin.diameterPx) / 2, transform);
      ctx.strokeStyle = "rgba(74,222,128,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (result.nail?.found || result.nail?.presence) {
      const cy = result.nail.center.y;
      if (result.nail.left != null && result.nail.right != null) {
        const a = videoPointToDisplay(result.nail.left, cy, transform);
        const b = videoPointToDisplay(result.nail.right, cy, transform);
        ctx.strokeStyle = "rgba(74,222,128,0.95)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }, []);

  const captureCurrentFrame = useCallback(
    async (liveResult, preQuality) => {
      const runId = runIdRef.current;

      const pre =
        preQuality ||
        evaluateMeasurementQuality(liveResult, { cameraReady: true });
      if (!pre.ready) {
        captureLockRef.current = false;
        holdTrackerRef.current.resetAlignment();
        setAlignmentProgress(0);
        setGuideHint(getInstructionFromBlockers(pre.blockers));
        setState(CaptureState.ALIGNING);
        return;
      }

      setState(CaptureState.CAPTURING);
      setFlash(true);
      flashTimerRef.current = window.setTimeout(() => setFlash(false), CAPTURE_CONFIG.CAPTURE_FLASH_MS);

      try {
        const video = videoRef.current;
        const captured = captureVideoFrame(video, captureCanvasRef.current);
        if (!captured?.dataUrl) {
          throw new Error("CAPTURE_FAILED");
        }

        const measured =
          captured.imageData != null
            ? analyzeFrame(captured.imageData, { coinDiameterMm: outerMm, coinMeta: coin })
            : liveResult;

        const finalQuality = evaluateMeasurementQuality(measured, { cameraReady: true });

        // Same quality gate as live — reject silently back to camera (no low-confidence review)
        if (!finalQuality.ready || measured?.nail?.widthPx == null) {
          captureLockRef.current = false;
          holdTrackerRef.current.resetAlignment();
          setAlignmentProgress(0);
          setFrozenUrl(null);
          setDraft(null);
          setGuideHint(getInstructionFromBlockers(finalQuality.blockers));
          setState(CaptureState.ALIGNING);
          return;
        }

        setFrozenUrl(captured.dataUrl);
        const draftCandidate = buildDraftFromAnalysis(
          measured,
          coinId,
          outerMm,
          captured.dataUrl,
          finalQuality
        );
        setDraft(draftCandidate);
        setManualMm(String(draftCandidate.widthMm));
        setAnalysis(measured);
        drawOverlay(measured, video);

        setState(CaptureState.SUCCESS);
        try {
          navigator.vibrate?.(40);
        } catch {
          /* ignore */
        }

        successTimerRef.current = window.setTimeout(() => {
          if (runId !== runIdRef.current) return;
          setState(CaptureState.REVIEW);
        }, CAPTURE_CONFIG.SUCCESS_HOLD_MS);
      } catch {
        setFrozenUrl(null);
        setDraft(null);
        setGuideHint("הצילום נכשל — מנסים שוב");
        setState(CaptureState.ALIGNING);
        captureLockRef.current = false;
        holdTrackerRef.current.resetAlignment();
        setAlignmentProgress(0);
      }
    },
    [coin, coinId, outerMm, videoRef, setState, drawOverlay]
  );

  const liveLoopActive = isLiveCaptureState(captureState);

  useEffect(() => {
    if (status !== "ready" || !liveLoopActive) return undefined;
    let alive = true;
    let timer = 0;

    const tick = () => {
      if (!alive) return;
      if (captureLockRef.current || !isLiveCaptureState(captureStateRef.current)) return;

      const video = videoRef.current;
      // Start warmup clock only once video stream has real dimensions
      if (
        video &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        holdTrackerRef.current.cameraReadyAt == null
      ) {
        holdTrackerRef.current.markCameraReady(performance.now());
      }

      const imageData = captureCanvasFrame(video, detectCanvasRef.current);
      if (imageData && coin) {
        const result = analyzeFrame(imageData, { coinDiameterMm: outerMm, coinMeta: coin });
        setAnalysis(result);
        drawOverlay(result, video);

        const decision = handleDetectionForCapture({
          analysis: result,
          cameraReady: status === "ready",
          captureLocked: captureLockRef.current,
          holdTracker: holdTrackerRef.current,
        });
        setGate(decision.gate);
        setLiveQuality(decision.quality || null);
        setAlignmentProgress(decision.progress || 0);
        setWarmupComplete(!!decision.warmupComplete);
        if (!decision.warmupComplete) {
          setGuideHint("");
        } else if (!decision.gate.ready && decision.quality?.blockers?.length) {
          setGuideHint(getInstructionFromBlockers(decision.quality.blockers));
        } else if (decision.gate.ready) {
          setGuideHint("");
        }

        const next = deriveLiveState(decision.gate, { warmupComplete: decision.warmupComplete });
        if (isLiveCaptureState(captureStateRef.current) && next !== captureStateRef.current) {
          setState(
            decision.warmupComplete && decision.gate.ready ? CaptureState.HOLD_STILL : next
          );
        }

        if (debugCapture && decision.quality) {
          const q = decision.quality;
          const t = q.thresholds;
          // eslint-disable-next-line no-console
          console.table({
            ready: q.ready,
            overall: `${q.confidence.toFixed(2)} / ${t.overallConfidence}`,
            coin: `${q.metrics.coinConfidence.toFixed(2)} / ${t.coinConfidence}`,
            finger: `${q.metrics.fingerConfidence.toFixed(2)} / ${t.fingerConfidence}`,
            nail: `${q.metrics.nailConfidence.toFixed(2)} / ${t.nailConfidence}`,
            alignment: `${q.metrics.alignmentScore.toFixed(2)} / ${t.alignmentScore}`,
            sharpness: `${q.metrics.sharpnessScore.toFixed(2)} / ${t.sharpnessScore}`,
            lighting: `${q.metrics.lightingScore.toFixed(2)} / ${t.lightingScore}`,
            blocker: q.blockers[0] || "—",
            hold: decision.progress,
            warmup: decision.warmupComplete,
          });
        }

        if (decision.shouldCapture) {
          captureLockRef.current = true;
          void captureCurrentFrame(result, decision.quality);
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
  }, [
    status,
    liveLoopActive,
    coin,
    outerMm,
    videoRef,
    drawOverlay,
    captureCurrentFrame,
    setState,
    debugCapture,
  ]);

  function restartLive() {
    runIdRef.current += 1;
    captureLockRef.current = false;
    holdTrackerRef.current = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
    window.clearTimeout(flashTimerRef.current);
    window.clearTimeout(successTimerRef.current);
    window.clearTimeout(failTimerRef.current);
    setDraft(null);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setGuideHint("");
    setLiveQuality(null);
    setAlignmentProgress(0);
    setWarmupComplete(false);
    setGate(null);
    setManualMm("");
    void attachToVideo?.(videoRef.current);
    setState(CaptureState.SEARCHING);
  }

  function confirmDraft(overrideMm) {
    if (!draft) return;
    if (draft.confidence < CONFIDENCE_AUTO_OK) return;
    if (draft.widthMm == null && (overrideMm == null || overrideMm === "")) return;
    const widthMm = overrideMm != null && overrideMm !== "" ? Number(overrideMm) : draft.widthMm;
    if (!widthMm || Number.isNaN(widthMm)) return;
    const size = widthMmToSize(widthMm);
    const manual = overrideMm != null && Number(overrideMm) !== draft.widthMm;
    onConfirm({
      ...draft,
      widthMm,
      size,
      confidence: draft.confidence,
      confidenceLevel: "high",
      manualOverride: manual,
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    });
  }

  const live = isLiveCaptureState(captureState) || captureState === CaptureState.INITIALIZING;
  const busy = captureState === CaptureState.CAPTURING || captureState === CaptureState.SUCCESS;
  const showGuide = live && status === "ready" && !frozenUrl;
  const holding = warmupComplete && !!gate?.ready;
  const coinGuideState = holding ? "ok" : gate?.coinDetected ? "warn" : "idle";
  const fingerGuideState = holding ? "ok" : gate?.fingerDetected ? "warn" : "idle";
  const ringState = holding ? "ok" : gate?.coinDetected || gate?.fingerDetected ? "warn" : "idle";
  const progress = holding ? alignmentProgress : 0;
  const baseHint = hintForState(captureState, gate, failReason, { warmupComplete });
  const hint = guideHint || baseHint;
  const showSuccessCheck =
    captureState === CaptureState.SUCCESS && !!frozenUrl && draft?.confidence >= CONFIDENCE_AUTO_OK;

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
          className={`absolute inset-0 w-full h-full object-cover ${frozenUrl ? "opacity-0" : "opacity-100"}`}
          playsInline
          muted
          autoPlay
        />
        {frozenUrl && (
          <img src={frozenUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        )}
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-[1]" />
        <canvas ref={detectCanvasRef} className="hidden" />
        <canvas ref={captureCanvasRef} className="hidden" />

        {showGuide && (
          <div className="measurement-guide" aria-hidden="true">
            <div className="measurement-progress-ring" data-state={ringState}>
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
            <p className="measurement-guide__hint" data-ok={holding ? "true" : "false"}>
              {hint}
            </p>
          </div>
        )}

        {flash && <div className="measurement-capture-flash" aria-hidden="true" />}

        {showSuccessCheck && (
          <div className="measurement-success-overlay capture-success" role="status">
            <div className="measurement-success-badge" aria-hidden="true">
              ✓
            </div>
            <p className="measurement-success-text">הצילום בוצע בהצלחה</p>
          </div>
        )}

        {captureState === CaptureState.CAPTURING && (
          <div className="absolute inset-0 z-[4] flex items-center justify-center bg-oled-950/35">
            <p className="text-sm text-white/85">מצלמים…</p>
          </div>
        )}

        {captureState === CaptureState.FAILED && (
          <div className="absolute inset-x-0 bottom-10 z-[4] px-4 text-center">
            <p className="text-sm text-amber-200 bg-oled-950/70 rounded-xl px-3 py-2 inline-block">
              {failReason || "הצילום נכשל"}
            </p>
          </div>
        )}

        {debugCapture && live && (liveQuality || gate) && (
          <div className="absolute top-2 left-2 z-[7] rounded-lg bg-black/80 text-[10px] leading-tight p-2 font-mono space-y-0.5 pointer-events-none max-w-[55%]">
            {liveQuality ? (
              <>
                <div className={liveQuality.ready ? "text-green-400" : "text-red-400"}>
                  ready: {String(liveQuality.ready)}
                </div>
                <div className="text-white/80">
                  overall: {liveQuality.confidence.toFixed(2)} / {liveQuality.thresholds.overallConfidence}
                </div>
                <div className="text-white/80">
                  coin: {liveQuality.metrics.coinConfidence.toFixed(2)} / {liveQuality.thresholds.coinConfidence}
                </div>
                <div className="text-white/80">
                  finger: {liveQuality.metrics.fingerConfidence.toFixed(2)} / {liveQuality.thresholds.fingerConfidence}
                </div>
                <div className="text-white/80">
                  nail: {liveQuality.metrics.nailConfidence.toFixed(2)} / {liveQuality.thresholds.nailConfidence}
                </div>
                <div className="text-white/80">
                  alignment: {liveQuality.metrics.alignmentScore.toFixed(2)} / {liveQuality.thresholds.alignmentScore}
                </div>
                <div className="text-white/80">
                  sharpness: {liveQuality.metrics.sharpnessScore.toFixed(2)} / {liveQuality.thresholds.sharpnessScore}
                </div>
                <div className="text-white/80">
                  lighting: {liveQuality.metrics.lightingScore.toFixed(2)} / {liveQuality.thresholds.lightingScore}
                </div>
                <div className="text-amber-300">blocker: {liveQuality.blockers[0] || "—"}</div>
                <div className="text-white/80">hold: {Math.round(alignmentProgress * 100)}%</div>
              </>
            ) : null}
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
        {holding && live && (
          <p className="text-sm text-violet-200">הישארי במקום… {Math.round(alignmentProgress * 100)}%</p>
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
              disabled={!gate?.ready || !warmupComplete || busy}
              onClick={() => {
                if (!gate?.ready || !warmupComplete || captureLockRef.current) return;
                captureLockRef.current = true;
                holdTrackerRef.current.resetAlignment();
                void captureCurrentFrame(analysis, liveQuality || gate?.quality);
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
              <p className="text-sm text-emerald-300/90">
                {draft?.confidence >= CONFIDENCE_AUTO_OK ? "גבוהה" : confidenceLabelHe(draft?.confidence)}
              </p>
            </div>
          </div>

          <details className="text-sm text-white/50">
            <summary className="cursor-pointer select-none text-white/60">תיקון ידני (אופציונלי)</summary>
            <label className="block mt-2 text-sm text-white/60">
              רוחב במ״מ
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
          </details>

          <div className="flex flex-wrap gap-3 justify-between">
            <button type="button" className="btn-ghost" onClick={restartLive}>
              צלמי שוב
            </button>
            <button
              type="button"
              className="btn-violet"
              onClick={() => confirmDraft(manualMm)}
              disabled={!draft || draft.confidence < CONFIDENCE_AUTO_OK || draft.widthMm == null}
            >
              אישור האצבע
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
