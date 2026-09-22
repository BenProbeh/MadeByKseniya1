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
import { CAPTURE_CONFIG, CaptureState, TEN_SHEKEL_COIN } from "../../lib/nailSizing/captureConfig.js";
import {
  createFrameCounter,
  deriveLiveState,
  handleDetectionForCapture,
  hintForState,
  isLiveCaptureState,
} from "../../lib/nailSizing/captureMachine.js";

function useDebugCapture() {
  return useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("debugCapture") === "1";
    } catch {
      return false;
    }
  }, []);
}

function buildDraftFromAnalysis(result, coinId, outerMm, dataUrl) {
  const diameterPx = result.coin?.outerDiameterPx || result.coin?.diameterPx;
  const pxPerMm = pixelsPerMillimeter(diameterPx, outerMm);
  const widthMm = widthPxToMm(result.nail?.widthPx, pxPerMm);
  return {
    widthMm,
    size: widthMmToSize(widthMm),
    confidence: result.confidence,
    coinId,
    captureQuality: {
      brightness: result.brightness,
      sharpness: result.sharpness,
      coinScore: result.coin?.score,
      nailScore: result.nail?.score,
      outerDiameterPx: diameterPx,
      calibrationMm: outerMm,
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
  const counterRef = useRef(createFrameCounter(CAPTURE_CONFIG.REQUIRED_VALID_FRAMES));
  const captureLockRef = useRef(false);
  const captureStateRef = useRef(CaptureState.INITIALIZING);
  const runIdRef = useRef(0);

  const [captureState, setCaptureState] = useState(CaptureState.INITIALIZING);
  const [analysis, setAnalysis] = useState(null);
  const [gate, setGate] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
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
    } else if (status !== "ready") {
      setState(CaptureState.INITIALIZING);
      if (status !== "requesting") void start();
    }
  }, [status, start, attachToVideo, videoRef, setState]);

  useEffect(() => {
    runIdRef.current += 1;
    captureLockRef.current = false;
    counterRef.current = createFrameCounter(CAPTURE_CONFIG.REQUIRED_VALID_FRAMES);
    setDraft(null);
    setAnalysis(null);
    setGate(null);
    setFrameCount(0);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setManualMm("");
    setState(status === "ready" ? CaptureState.SEARCHING : CaptureState.INITIALIZING);
  }, [finger.key, setState, status]);

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
    async (liveResult) => {
      const runId = runIdRef.current;
      setState(CaptureState.CAPTURING);
      setFlash(true);
      window.setTimeout(() => setFlash(false), CAPTURE_CONFIG.CAPTURE_FLASH_MS);

      try {
        const video = videoRef.current;
        const captured = captureVideoFrame(video, captureCanvasRef.current);
        if (!captured?.dataUrl) {
          throw new Error("CAPTURE_FAILED");
        }

        // Freeze first — checkmark only after real image exists
        setFrozenUrl(captured.dataUrl);

        // Measure from frozen frame (does not block showing success)
        const measured =
          captured.imageData != null
            ? analyzeFrame(captured.imageData, { coinDiameterMm: outerMm, coinMeta: coin })
            : liveResult;
        const draftCandidate = buildDraftFromAnalysis(
          measured || liveResult || {},
          coinId,
          outerMm,
          captured.dataUrl
        );
        // If nail width missing, still keep draft with preview for manual fix
        setDraft(draftCandidate);
        setManualMm(draftCandidate.widthMm != null ? String(draftCandidate.widthMm) : "");
        setAnalysis(measured || liveResult);
        drawOverlay(measured || liveResult, video);

        setState(CaptureState.SUCCESS);
        try {
          navigator.vibrate?.(40);
        } catch {
          /* ignore */
        }

        window.setTimeout(() => {
          if (runId !== runIdRef.current) return;
          setState(CaptureState.REVIEW);
        }, CAPTURE_CONFIG.SUCCESS_HOLD_MS);
      } catch {
        setFrozenUrl(null);
        setDraft(null);
        setFailReason("הצילום נכשל — מנסים שוב");
        setState(CaptureState.FAILED);
        captureLockRef.current = false;
        counterRef.current.reset();
        setFrameCount(0);
        window.setTimeout(() => {
          if (runId !== runIdRef.current) return;
          setFailReason("");
          setState(CaptureState.ALIGNING);
        }, CAPTURE_CONFIG.FAILED_HOLD_MS);
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
      const imageData = captureCanvasFrame(video, detectCanvasRef.current);
      if (imageData && coin) {
        const result = analyzeFrame(imageData, { coinDiameterMm: outerMm, coinMeta: coin });
        setAnalysis(result);
        drawOverlay(result, video);

        const decision = handleDetectionForCapture({
          analysis: result,
          cameraReady: status === "ready",
          captureLocked: captureLockRef.current,
          counter: counterRef.current,
        });
        setGate(decision.gate);
        setFrameCount(decision.count);

        const next = deriveLiveState(decision.gate);
        if (isLiveCaptureState(captureStateRef.current) && next !== captureStateRef.current) {
          setState(decision.gate.ready ? CaptureState.HOLD_STILL : next);
        }

        if (debugCapture) {
          // Temporary diagnostics — only with ?debugCapture=1
          // eslint-disable-next-line no-console
          console.table({
            cameraReady: decision.gate.cameraReady,
            coinDetected: decision.gate.coinDetected,
            fingerDetected: decision.gate.fingerDetected,
            coinAboveFinger: decision.gate.coinAboveFinger,
            horizontalAlignmentValid: decision.gate.horizontalAlignmentValid,
            coinScaleValid: decision.gate.coinScaleValid,
            verticalDistanceValid: decision.gate.verticalDistanceValid,
            consecutiveValidFrames: decision.count,
            captureLocked: captureLockRef.current,
            blockedBy: decision.blockedBy,
          });
        }

        if (decision.shouldCapture) {
          captureLockRef.current = true;
          void captureCurrentFrame(result);
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
    counterRef.current.reset();
    setDraft(null);
    setFrozenUrl(null);
    setFlash(false);
    setFailReason("");
    setFrameCount(0);
    setGate(null);
    setManualMm("");
    void attachToVideo?.(videoRef.current);
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
  const busy = captureState === CaptureState.CAPTURING || captureState === CaptureState.SUCCESS;
  const showGuide = live && status === "ready" && !frozenUrl;
  const readyGate = !!gate?.ready;
  const coinGuideState = gate?.coinDetected ? (readyGate ? "ok" : "warn") : "idle";
  const fingerGuideState = gate?.fingerDetected ? (readyGate ? "ok" : "warn") : "idle";
  const ringState = readyGate ? "ok" : gate?.coinDetected || gate?.fingerDetected ? "warn" : "idle";
  const progress = Math.min(1, frameCount / CAPTURE_CONFIG.REQUIRED_VALID_FRAMES);
  const hint = hintForState(captureState, gate, failReason);
  const showSuccessCheck = captureState === CaptureState.SUCCESS && !!frozenUrl;

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
            <p className="measurement-guide__hint" data-ok={readyGate ? "true" : "false"}>
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

        {debugCapture && live && gate && (
          <div className="absolute top-2 left-2 z-[7] rounded-lg bg-black/80 text-[10px] leading-tight p-2 font-mono space-y-0.5 pointer-events-none">
            {[
              ["camera", gate.cameraReady],
              ["coin", gate.coinDetected],
              ["finger", gate.fingerDetected],
              ["above", gate.coinAboveFinger],
              ["aligned", gate.horizontalAlignmentValid],
              ["scale", gate.coinScaleValid],
              ["gap", gate.verticalDistanceValid],
            ].map(([label, ok]) => (
              <div key={label} className={ok ? "text-green-400" : "text-red-400"}>
                {label}: {ok ? "true" : "false"}
              </div>
            ))}
            <div className="text-white/80">
              frames: {frameCount}/{CAPTURE_CONFIG.REQUIRED_VALID_FRAMES}
            </div>
            <div className={captureLockRef.current ? "text-amber-300" : "text-white/80"}>
              locked: {captureLockRef.current ? "true" : "false"}
            </div>
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
        {readyGate && live && (
          <p className="text-sm text-violet-200">
            מצלמים… {frameCount}/{CAPTURE_CONFIG.REQUIRED_VALID_FRAMES}
          </p>
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
              disabled={!gate?.ready || busy}
              onClick={() => {
                if (!gate?.ready || captureLockRef.current) return;
                captureLockRef.current = true;
                counterRef.current.reset();
                void captureCurrentFrame(analysis);
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
