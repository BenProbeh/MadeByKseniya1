import { useCallback, useEffect, useRef, useState } from "react";
import { calculatePhotoQuality, getGuideRegions, getQualityLevel } from "../../lib/nailSizing/photoQuality.js";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";
import {
  scrollCameraIntoView as scrollCameraElementIntoView,
  scheduleAfterPaint,
} from "../../lib/nailSizing/scrollCameraIntoView.js";

function scoreColorClass(score) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-emerald-300/90";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

export default function MeasureStep({ camera, coinId, finger, existing, onConfirm, onBack }) {
  const { videoRef, setVideoRef, status, start, attachToVideo, errorHe } = camera;
  const cameraSectionRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const captureLockRef = useRef(false);
  const successTimerRef = useRef(0);
  const cameraCenteredRef = useRef(false);
  const scrollCancelRef = useRef(null);

  const [phase, setPhase] = useState("camera"); // camera | flash | review
  const [capturedImage, setCapturedImage] = useState(null);
  const [photoQuality, setPhotoQuality] = useState(null);
  const [error, setError] = useState("");
  const [showLowConfirm, setShowLowConfirm] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const scrollCameraIntoView = useCallback(({ immediate = false } = {}) => {
    scrollCameraElementIntoView(cameraSectionRef.current, { immediate });
  }, []);

  const scheduleCenter = useCallback(
    ({ immediate = false } = {}) => {
      if (scrollCancelRef.current) {
        scrollCancelRef.current();
        scrollCancelRef.current = null;
      }
      scrollCancelRef.current = scheduleAfterPaint(() => {
        scrollCameraIntoView({ immediate });
      });
    },
    [scrollCameraIntoView]
  );

  useEffect(() => {
    document.body.classList.add("mbk-nail-measuring");
    return () => {
      document.body.classList.remove("mbk-nail-measuring");
      window.clearTimeout(successTimerRef.current);
      if (scrollCancelRef.current) {
        scrollCancelRef.current();
        scrollCancelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    captureLockRef.current = false;
    cameraCenteredRef.current = false;
    setPhase("camera");
    setCapturedImage(null);
    setPhotoQuality(null);
    setError("");
    setShowLowConfirm(false);
    setVideoReady(false);
  }, [finger.key]);

  // Enter measure / new finger → center once after paint
  useEffect(() => {
    scheduleCenter();
    return () => {
      if (scrollCancelRef.current) {
        scrollCancelRef.current();
        scrollCancelRef.current = null;
      }
    };
  }, [finger.key, scheduleCenter]);

  // Re-attach only when already ready — never auto-start on mount
  useEffect(() => {
    if (status === "ready") {
      void attachToVideo?.(videoRef.current);
    }
  }, [status, attachToVideo, videoRef]);

  const onVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoReady(true);
    }
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const check = () => onVideoMeta();
    v.addEventListener("loadedmetadata", check);
    v.addEventListener("playing", check);
    check();
    const id = window.setInterval(check, 400);
    return () => {
      v.removeEventListener("loadedmetadata", check);
      v.removeEventListener("playing", check);
      window.clearInterval(id);
    };
  }, [videoRef, status, onVideoMeta, finger.key]);

  // After camera becomes ready the first time per finger, re-center once
  useEffect(() => {
    if (status !== "ready" || !videoReady || cameraCenteredRef.current) return undefined;
    if (phase !== "camera") return undefined;
    cameraCenteredRef.current = true;
    scheduleCenter();
    return undefined;
  }, [status, videoReady, phase, scheduleCenter]);

  const cameraReady = status === "ready";
  const canCapture = cameraReady && videoReady && phase === "camera";
  const needsEnable =
    status === "idle" ||
    status === "denied" ||
    status === "error" ||
    status === "unavailable" ||
    status === "insecure" ||
    status === "unsupported";

  function captureCurrentFrame() {
    if (captureLockRef.current || phase !== "camera") return;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (
      !video ||
      !canvas ||
      video.readyState < 2 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      setError(C.measure.notReady);
      return;
    }

    captureLockRef.current = true;
    setError("");
    setPhase("flash");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const imageUrl = canvas.toDataURL("image/jpeg", 0.92);
    const guides = getGuideRegions(canvas.width, canvas.height);
    const qualityResult = calculatePhotoQuality(imageData, guides);

    setCapturedImage(imageUrl);
    setPhotoQuality(qualityResult);

    successTimerRef.current = window.setTimeout(() => {
      setPhase("review");
    }, 650);
  }

  function retake() {
    window.clearTimeout(successTimerRef.current);
    captureLockRef.current = false;
    cameraCenteredRef.current = false;
    setCapturedImage(null);
    setPhotoQuality(null);
    setShowLowConfirm(false);
    setError("");
    setPhase("camera");
    void attachToVideo?.(videoRef.current);
    scheduleCenter();
  }

  function confirmCapture() {
    if (!capturedImage || !photoQuality) return;
    if (photoQuality.score < 50 && !showLowConfirm) {
      setShowLowConfirm(true);
      return;
    }
    onConfirm({
      status: "confirmed",
      imageUrl: capturedImage,
      previewDataUrl: capturedImage,
      photoQualityScore: photoQuality.score,
      photoQualityLevel: photoQuality.level,
      photoQualityChecks: photoQuality.checks,
      photoQualityTips: photoQuality.tips,
      source: "manual-camera-capture",
      capturedAt: new Date().toISOString(),
      coinId,
      confidence: null,
      widthMm: null,
      size: null,
    });
  }

  const level = photoQuality ? getQualityLevel(photoQuality.score) : null;
  const enableLabel = status === "idle" ? C.camera.resumeAction : C.measure.enableCamera;
  const waitingCopy =
    status === "requesting"
      ? C.measure.requestingCamera
      : needsEnable
        ? C.camera.resumeSubtitle
        : C.measure.waitingCamera;

  return (
    <div className="space-y-5">
      <div className="glass-panel p-4 text-center space-y-1">
        <p className="section-eyebrow justify-center">{finger.handLabelHe}</p>
        <h2 className="font-serif text-2xl md:text-3xl text-white">
          {C.measure.title(finger.fingerLabelHe, finger.handLabelHe)}
        </h2>
        {existing?.status === "confirmed" && (
          <p className="font-serif text-xs text-violet-200">{C.measure.alreadyDone}</p>
        )}
      </div>

      <section
        ref={cameraSectionRef}
        className="camera-measurement-section space-y-4"
        aria-label="צילום למדידת הציפורן"
      >
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black aspect-[3/4] max-h-[min(70vh,640px)] mx-auto w-full">
          <video
            ref={setVideoRef || videoRef}
            className={`absolute inset-0 w-full h-full object-cover ${capturedImage && phase !== "camera" ? "opacity-0" : "opacity-100"}`}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={onVideoMeta}
            onPlaying={onVideoMeta}
          />
          {capturedImage && phase !== "camera" && (
            <img
              src={capturedImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          )}
          <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />

          {phase === "camera" && cameraReady && (
            <div className="measurement-guide" aria-hidden="true">
              <div className="measurement-progress-ring" data-state="idle">
                <div className="measurement-progress-ring__arc" style={{ ["--progress"]: "0%" }} />
              </div>
              <div className="measurement-axis">
                <div className="measurement-axis__spine" />
                <div className="coin-guide" data-state="idle" />
                <div className="finger-guide" data-state="idle">
                  <div className="nail-guide" />
                </div>
              </div>
              <p className="measurement-guide__hint" data-ok="false">
                {C.measure.hintPrimary}
              </p>
            </div>
          )}

          {phase === "flash" && (
            <div className="measurement-success-overlay capture-success" role="status">
              <div className="measurement-success-badge" aria-hidden="true">
                ✓
              </div>
              <p className="measurement-success-text">{C.measure.capturedTitle}</p>
            </div>
          )}

          {status !== "ready" && phase === "camera" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-oled-950/70 px-4 text-center z-[3]">
              <h3 className="font-serif text-xl text-white">
                {needsEnable ? C.camera.resumeTitle : C.measure.waitingCamera}
              </h3>
              <p className="font-serif text-sm text-white/70">{waitingCopy}</p>
              <p className="text-xs text-white/40">{C.camera.privacyNote}</p>
              {errorHe && <p className="text-sm text-red-300">{errorHe}</p>}
              {(needsEnable || status === "requesting") && (
                <button
                  type="button"
                  className="btn-violet"
                  onClick={start}
                  disabled={status === "requesting"}
                >
                  {status === "requesting" ? C.measure.requestingCamera : enableLabel}
                </button>
              )}
            </div>
          )}
        </div>

        {phase === "camera" && (
          <>
            <div className="glass-panel p-4 space-y-2 text-center" aria-live="polite">
              <p className="font-serif text-sm text-white/80">{C.measure.hintPrimary}</p>
              <p className="font-serif text-xs text-white/50">{C.measure.hintSecondary}</p>
              {error && <p className="text-sm text-amber-200">{error}</p>}
            </div>

            <div className="flex flex-wrap gap-3 justify-between items-center">
              <button type="button" className="btn-ghost" onClick={onBack}>
                {C.measure.back}
              </button>
              <button
                type="button"
                className="btn-violet min-w-[10rem]"
                disabled={!canCapture}
                onClick={captureCurrentFrame}
              >
                {C.measure.capture}
              </button>
            </div>
          </>
        )}
      </section>

      {phase === "review" && photoQuality && (
        <div className="glass-panel p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="section-eyebrow justify-center">{C.measure.qualityLabel}</p>
            <h2 className="font-serif text-2xl md:text-3xl text-white">{C.measure.reviewTitle}</h2>
            <p className={`font-serif text-5xl ${scoreColorClass(photoQuality.score)}`}>
              {photoQuality.score}
              <span className="text-2xl text-white/40">/100</span>
            </p>
            <p className="font-serif text-sm text-white/75">{level?.label}</p>
          </div>

          <ul className="space-y-2 text-sm text-white/70">
            {photoQuality.tips.slice(0, 4).map((tip) => (
              <li key={tip} className="flex gap-2 leading-snug">
                <span className="text-violet-300 shrink-0" aria-hidden="true">
                  •
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          {showLowConfirm && (
            <p className="text-sm text-amber-200 bg-amber-400/10 rounded-xl px-3 py-2 text-center" role="status">
              {C.measure.lowWarn}
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-between">
            <button type="button" className="btn-ghost" onClick={retake}>
              {C.measure.retake}
            </button>
            <button type="button" className="btn-violet" onClick={confirmCapture}>
              {showLowConfirm ? C.measure.confirmAnyway : C.measure.confirm}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
