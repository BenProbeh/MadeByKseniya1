import { useEffect, useRef } from "react";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

export default function CameraPermissionStep({ camera, onGrantedContinue, onBack, isResume = false }) {
  const { status, errorHe, start, setVideoRef } = camera;
  const continueRef = useRef(onGrantedContinue);
  continueRef.current = onGrantedContinue;
  const advancedRef = useRef(false);

  useEffect(() => {
    if (status !== "ready" || advancedRef.current) return undefined;
    const t = window.setTimeout(() => {
      advancedRef.current = true;
      continueRef.current?.();
    }, 500);
    return () => window.clearTimeout(t);
  }, [status]);

  const showResumeCopy = isResume && status !== "ready";

  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="font-serif text-2xl md:text-3xl text-white">
          {showResumeCopy ? C.camera.resumeTitle : C.camera.title}
        </h2>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">
          {status === "ready"
            ? C.camera.readyHint
            : showResumeCopy
              ? C.camera.resumeSubtitle
              : C.camera.subtitle}
        </p>
        <p className="text-xs text-white/40">{C.camera.privacyNote}</p>
      </div>

      {status === "ready" && (
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black aspect-video max-h-48 mx-auto w-full">
          <video
            ref={setVideoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <p className="absolute bottom-2 inset-x-0 text-center text-xs text-violet-200">{C.camera.readyHint}</p>
        </div>
      )}

      {errorHe && (
        <p className="text-sm text-red-300 text-center" role="alert">
          {errorHe}
        </p>
      )}

      {status === "denied" && (
        <p className="text-sm text-white/55 text-center">{C.camera.deniedHint}</p>
      )}

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          {C.camera.back}
        </button>
        {status === "ready" ? (
          <button
            type="button"
            className="btn-violet"
            onClick={() => {
              advancedRef.current = true;
              onGrantedContinue();
            }}
          >
            {C.camera.continue}
          </button>
        ) : (
          <button type="button" className="btn-violet" onClick={start} disabled={status === "requesting"}>
            {status === "requesting"
              ? C.camera.requesting
              : showResumeCopy
                ? C.camera.resumeAction
                : C.camera.action}
          </button>
        )}
      </div>
    </div>
  );
}
