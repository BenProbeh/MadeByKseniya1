import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImagePlus, X } from "lucide-react";
import Sheet from "../ui/Sheet.jsx";
import MarkingStage from "./MarkingStage.jsx";
import { useCamera } from "../../lib/nailSizing/useCamera.js";
import { useImmersive } from "../../lib/useViewportState.js";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";
import { FRAME_ASPECT, REFERENCE_COIN, coverCrop, guideGeometry, measureFinger, qualityRegions } from "../../lib/nailSizing/measure.js";
import { calculatePhotoQuality } from "../../lib/nailSizing/photoQuality.js";

const MAX_STILL_WIDTH = 1080;

/** Draws `source` (video or image) cropped to the 3:4 frame and returns the still plus its photo check. */
function captureStill(source, srcW, srcH) {
  const crop = coverCrop(srcW, srcH, FRAME_ASPECT);
  if (!crop) return null;
  const outW = Math.round(Math.min(crop.sw, MAX_STILL_WIDTH));
  const outH = Math.round(outW / FRAME_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, outW, outH);
  let quality = null;
  try {
    quality = calculatePhotoQuality(ctx.getImageData(0, 0, outW, outH), qualityRegions(outW, outH));
  } catch {
    quality = null;
  }
  return { url: canvas.toDataURL("image/jpeg", 0.9), quality };
}

/** The 3:4 frame, as large as the space between the header and the controls allows. */
function useStageSize(containerRef) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      // Content box only: the container's padding is breathing room, not frame.
      const cs = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const height = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.floor(Math.min(width, height * FRAME_ASPECT));
      setSize((s) => (s.w === w ? s : { w, h: Math.floor(w / FRAME_ASPECT) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return size;
}

function CameraGuides({ size }) {
  if (!size.w) return null;
  const g = guideGeometry(size.w, size.h);
  return (
    <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h} aria-hidden="true">
      <circle cx={g.coin.cx} cy={g.coin.cy} r={g.coin.r} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeDasharray="6 5" />
      <text x={g.coin.cx} y={g.coin.cy + 5} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize="15" fontFamily="Heebo, sans-serif">
        10 ₪
      </text>
      <rect
        x={g.finger.x}
        y={g.finger.y}
        width={g.finger.width}
        height={g.finger.height}
        rx={g.finger.width / 2}
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
      <line x1={g.coin.cx} x2={g.coin.cx} y1={g.coin.cy + g.coin.r + 6} y2={g.finger.y - 6} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
    </svg>
  );
}

/**
 * One finger: live camera with guides → still → mark the coin → mark the nail → save.
 * Full-screen and calm; the camera runs only while this step is open.
 */
export default function CaptureStep({ finger, position, total, isLast, onSave, onExit }) {
  useImmersive(true);
  const camera = useCamera();
  const containerRef = useRef(null);
  const fileRef = useRef(null);
  const size = useStageSize(containerRef);

  const [phase, setPhase] = useState("camera"); // camera | coin | nail
  const [still, setStill] = useState(null); // { url, quality }
  const [coin, setCoin] = useState(null);
  const [nail, setNail] = useState(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [flash, setFlash] = useState(false);

  // Open the camera straight away when she already allowed it; otherwise wait for her tap.
  useEffect(() => {
    let active = true;
    navigator.permissions
      ?.query({ name: "camera" })
      .then((p) => active && p.state === "granted" && camera.start())
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New finger: back to the live camera with clean state.
  useEffect(() => {
    setPhase("camera");
    setStill(null);
    setCoin(null);
    setNail(null);
    setError("");
    if (camera.status === "ready") void camera.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finger.key]);

  const startMarking = useCallback(
    (shot) => {
      const g = guideGeometry(size.w, size.h);
      setStill(shot);
      setCoin(g.coin);
      setNail(g.nail);
      setPhase("coin");
      setError("");
    },
    [size]
  );

  function shoot() {
    const video = camera.videoRef.current;
    const live = video?.srcObject?.getVideoTracks?.().some((t) => t.readyState === "live");
    if (video && !live) {
      // The camera stopped without telling us (another app took it, the OS suspended it): say so, don't freeze.
      camera.stop();
      setError(C.errors.interrupted);
      return;
    }
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setError(C.errors.captureFailed);
      return;
    }
    const shot = captureStill(video, video.videoWidth, video.videoHeight);
    if (!shot) {
      setError(C.errors.captureFailed);
      return;
    }
    setFlash(true);
    window.setTimeout(() => setFlash(false), 160);
    navigator.vibrate?.(10);
    startMarking(shot);
  }

  async function fromFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      const shot = captureStill(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      if (!shot) throw new Error("empty");
      startMarking(shot);
    } catch {
      setError(C.errors.imageLoad);
    }
  }

  function retake() {
    setStill(null);
    setCoin(null);
    setNail(null);
    setError("");
    setPhase("camera");
    if (camera.status === "ready") void camera.resume();
    else void camera.start();
  }

  const result =
    coin && nail ? measureFinger({ fingerId: finger.fingerId, nailPx: Math.abs(nail.x2 - nail.x1), coinDiameterPx: coin.r * 2 }) : null;
  const poorPhoto = still?.quality && still.quality.score < 50;

  function save() {
    if (!result?.widthMm) return;
    onSave({
      widthMm: result.widthMm,
      size: result.size,
      plausible: result.plausible,
      photoQualityScore: still?.quality?.score ?? null,
      measuredAt: new Date().toISOString(),
    });
  }

  function requestExit() {
    if (phase === "camera") onExit();
    else setLeaving(true);
  }

  const blocked = ["denied", "insecure", "unsupported", "unavailable"].includes(camera.status);
  const cameraLive = camera.status === "ready" && !camera.playBlocked;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={`מדידת ${finger.fingerLabelHe}`}>
      <header className="shrink-0 pt-[var(--safe-top)]">
        <div className="h-14 flex items-center gap-2 px-2">
          <button type="button" className="icon-btn" onClick={requestExit} aria-label="יציאה מהמדידה">
            <X size={24} aria-hidden="true" />
          </button>
          <div className="flex-1 text-center min-w-0">
            <p className="t-headline truncate">{C.capture.fingerTitle(finger.fingerLabelHe, finger.handLabelHe)}</p>
            <p className="text-cap text-white/55 tnum">{C.capture.progress(position, total)}</p>
          </div>
          <span className="w-11" aria-hidden="true" />
        </div>
        <div className="h-0.5 mx-4 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-violet-gradient shadow-glow transition-[width] duration-300" style={{ width: `${((position - 1) / total) * 100}%` }} />
        </div>
      </header>

      <div ref={containerRef} className="flex-1 min-h-0 grid place-items-center px-3 py-3">
        <div className="relative overflow-hidden rounded-[1.25rem] bg-oled-900" style={{ width: size.w, height: size.h }}>
          <video
            ref={camera.setVideoRef}
            className={`absolute inset-0 w-full h-full object-cover ${phase === "camera" && cameraLive ? "" : "invisible"}`}
            playsInline
            muted
            autoPlay
            aria-hidden="true"
          />

          {phase === "camera" && cameraLive && <CameraGuides size={size} />}

          {phase === "camera" && camera.status === "ready" && camera.playBlocked && (
            <button type="button" className="absolute inset-0 grid place-items-center bg-black/60 text-center px-8" onClick={() => void camera.resume()}>
              <span className="space-y-3">
                <Camera size={32} className="mx-auto text-violet-200" aria-hidden="true" />
                <span className="block t-headline">{C.capture.tapToResume}</span>
              </span>
            </button>
          )}

          {phase === "camera" && camera.status !== "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-7 text-center">
              {blocked ? (
                <>
                  <CameraOff size={34} className="text-white/60" aria-hidden="true" />
                  <p className="t-headline">{camera.status === "denied" ? C.camera.deniedTitle : camera.errorHe}</p>
                  {camera.status === "denied" && <p className="t-foot max-w-xs">{C.camera.deniedHint}</p>}
                  <p className="t-foot max-w-xs">{C.camera.fallback}</p>
                  <div className="flex flex-col gap-2 w-full max-w-[16rem]">
                    <button type="button" className="btn-violet" onClick={() => fileRef.current?.click()}>
                      <ImagePlus size={19} aria-hidden="true" />
                      {C.capture.fromGallery}
                    </button>
                    {camera.status === "denied" && (
                      <button type="button" className="btn-ghost" onClick={() => void camera.start()}>
                        {C.camera.retry}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <img src={REFERENCE_COIN.imageSrc} alt="" className="w-16 h-16" />
                  <p className="t-headline">{C.camera.title}</p>
                  <p className="t-foot max-w-xs">{camera.errorHe || C.camera.text}</p>
                  <button
                    type="button"
                    className="btn-violet min-w-[14rem]"
                    onClick={() => void camera.start()}
                    disabled={camera.status === "requesting"}
                  >
                    {camera.status === "requesting" ? <span className="spinner" aria-hidden="true" /> : <Camera size={19} aria-hidden="true" />}
                    {camera.status === "requesting" ? C.capture.openingCamera : C.capture.openCamera}
                  </button>
                </>
              )}
            </div>
          )}

          {phase !== "camera" && still && coin && nail && size.w > 0 && (
            <MarkingStage
              imageUrl={still.url}
              size={size}
              mode={phase}
              coin={coin}
              nail={nail}
              onCoinChange={setCoin}
              onNailChange={setNail}
            />
          )}

          {flash && <div className="absolute inset-0 bg-white/70 mbk-fade-out pointer-events-none" aria-hidden="true" />}
        </div>
      </div>

      <footer className="shrink-0 px-5 pt-1 pb-[calc(var(--safe-bottom)+1rem)] space-y-3 min-h-[11rem]" aria-live="polite">
        {error && <p className="notice-error">{error}</p>}

        {phase === "camera" && (
          <>
            <p className="t-foot text-center text-white/70 max-w-sm mx-auto">{C.capture.hint}</p>
            <div className="grid grid-cols-3 items-center">
              <button
                type="button"
                className="justify-self-start flex flex-col items-center gap-1 text-cap text-white/70 min-w-[4rem] min-h-[3.5rem]"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={24} strokeWidth={1.7} aria-hidden="true" />
                {C.capture.fromGallery}
              </button>
              <button
                type="button"
                onClick={shoot}
                disabled={!cameraLive}
                className="justify-self-center w-[4.75rem] h-[4.75rem] rounded-full border-4 border-white/90 grid place-items-center shadow-glow transition-transform active:scale-95 disabled:opacity-35 disabled:shadow-none"
                aria-label={C.capture.shutter}
              >
                <span className="block w-[3.75rem] h-[3.75rem] rounded-full bg-white" />
              </button>
              <span aria-hidden="true" />
            </div>
          </>
        )}

        {phase === "coin" && (
          <>
            <div className="text-center space-y-1">
              <p className="t-headline">{C.mark.coinTitle}</p>
              <p className="t-foot text-white/65 max-w-sm mx-auto">{C.mark.coinText}</p>
            </div>
            <label className="block max-w-sm mx-auto">
              <span className="sr-only">{C.mark.coinSize}</span>
              <input
                type="range"
                className="theme-range"
                min={18}
                max={Math.max(40, Math.round(size.w / 2))}
                step={0.5}
                value={coin?.r ?? 40}
                onChange={(e) => setCoin((c) => ({ ...c, r: Number(e.target.value) }))}
                style={{ "--range-color": "#d17dff" }}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-ghost" onClick={retake}>
                {C.mark.retake}
              </button>
              <button type="button" className="btn-violet" onClick={() => setPhase("nail")}>
                {C.mark.next}
              </button>
            </div>
          </>
        )}

        {phase === "nail" && (
          <>
            <div className="text-center space-y-1">
              <p className="t-headline">{C.mark.nailTitle}</p>
              <p className="t-foot text-white/65 max-w-sm mx-auto">{C.mark.nailText}</p>
            </div>
            {result?.widthMm != null && (
              <p className="text-center">
                <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-400/15 px-4 py-1.5 font-prose text-headline tnum shadow-glow-soft">
                  {C.mark.result(result.widthMm.toFixed(1), result.size)}
                </span>
              </p>
            )}
            {result && !result.plausible && <p className="notice-warning">{C.mark.implausible}</p>}
            {result?.plausible && poorPhoto && <p className="notice-warning">{C.mark.poorPhoto}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-ghost" onClick={() => setPhase("coin")}>
                {C.mark.back}
              </button>
              <button type="button" className="btn-violet" onClick={save} disabled={!result?.widthMm}>
                {isLast ? C.mark.saveLast : C.mark.save}
              </button>
            </div>
          </>
        )}
      </footer>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={fromFile} />

      <Sheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title={C.capture.leaveTitle}
        description={C.capture.leaveText}
        footer={
          <>
            <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => setLeaving(false)}>
              {C.capture.stay}
            </button>
            <button type="button" className="btn-violet w-full sm:w-auto" onClick={onExit}>
              {C.capture.leave}
            </button>
          </>
        }
      />
    </div>
  );
}
