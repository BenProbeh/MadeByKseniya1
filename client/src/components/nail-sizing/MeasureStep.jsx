import { useCallback, useEffect, useRef, useState } from "react";
import { calculatePhotoQuality, getGuideRegions, getQualityLevel } from "../../lib/nailSizing/photoQuality.js";

function scoreColorClass(score) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-emerald-300/90";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

export default function MeasureStep({ camera, coinId, finger, existing, onConfirm, onBack }) {
  const { videoRef, setVideoRef, status, start, attachToVideo, errorHe } = camera;
  const captureCanvasRef = useRef(null);
  const captureLockRef = useRef(false);
  const successTimerRef = useRef(0);

  const [phase, setPhase] = useState("camera"); // camera | flash | review
  const [capturedImage, setCapturedImage] = useState(null);
  const [photoQuality, setPhotoQuality] = useState(null);
  const [error, setError] = useState("");
  const [showLowConfirm, setShowLowConfirm] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    document.body.classList.add("mbk-nail-measuring");
    return () => {
      document.body.classList.remove("mbk-nail-measuring");
      window.clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    captureLockRef.current = false;
    setPhase("camera");
    setCapturedImage(null);
    setPhotoQuality(null);
    setError("");
    setShowLowConfirm(false);
    setVideoReady(false);
  }, [finger.key]);

  useEffect(() => {
    if (status === "ready") {
      void attachToVideo?.(videoRef.current);
    } else if (status !== "ready" && status !== "requesting") {
      void start();
    }
  }, [status, start, attachToVideo, videoRef]);

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

  const cameraReady = status === "ready";
  const canCapture = cameraReady && videoReady && phase === "camera";

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
      setError("המצלמה עדיין אינה מוכנה. נסי שוב בעוד רגע.");
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
    setCapturedImage(null);
    setPhotoQuality(null);
    setShowLowConfirm(false);
    setError("");
    setPhase("camera");
    void attachToVideo?.(videoRef.current);
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

  const level = photoQuality
    ? getQualityLevel(photoQuality.score)
    : null;

  return (
    <div className="space-y-5">
      <div className="glass-panel p-4 text-center space-y-1">
        <p className="section-eyebrow justify-center">{finger.handLabelHe}</p>
        <h2 className="font-serif text-2xl text-white">{finger.fingerLabelHe}</h2>
        {existing?.status === "confirmed" && (
          <p className="text-xs text-violet-200">כבר נמדד — אפשר לצלם שוב או לאשר מחדש</p>
        )}
      </div>

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
              מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו
            </p>
          </div>
        )}

        {phase === "flash" && (
          <div className="measurement-success-overlay capture-success" role="status">
            <div className="measurement-success-badge" aria-hidden="true">
              ✓
            </div>
            <p className="measurement-success-text">התמונה צולמה ונשמרה</p>
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

      {phase === "camera" && (
        <>
          <div className="glass-panel p-4 space-y-2 text-center" aria-live="polite">
            <p className="text-sm text-white/80">מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו</p>
            <p className="text-xs text-white/50">
              ודאי שהציפורן גלויה ושהטלפון נמצא במקביל למשטח
            </p>
            {error && <p className="text-sm text-amber-200">{error}</p>}
          </div>

          <div className="flex flex-wrap gap-3 justify-between items-center">
            <button type="button" className="btn-ghost" onClick={onBack}>
              חזרה
            </button>
            <button
              type="button"
              className="btn-violet min-w-[10rem]"
              disabled={!canCapture}
              onClick={captureCurrentFrame}
            >
              צלמי עכשיו
            </button>
          </div>
        </>
      )}

      {phase === "review" && photoQuality && (
        <div className="glass-panel p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-xs text-white/45 tracking-wide">איכות הצילום</p>
            <p className={`font-serif text-5xl ${scoreColorClass(photoQuality.score)}`}>
              {photoQuality.score}
              <span className="text-2xl text-white/40">/100</span>
            </p>
            <p className="text-sm text-white/75">{level?.label}</p>
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
              איכות הצילום נמוכה ועלולה להשפיע על הדיוק. להמשיך בכל זאת?
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-between">
            <button type="button" className="btn-ghost" onClick={retake}>
              צלמי שוב
            </button>
            <button type="button" className="btn-violet" onClick={confirmCapture}>
              {showLowConfirm ? "השתמשי בתמונה הזו" : "אישור והמשך"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
