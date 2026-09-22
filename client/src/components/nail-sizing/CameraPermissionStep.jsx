import { useEffect, useRef } from "react";

export default function CameraPermissionStep({ camera, onGrantedContinue, onBack }) {
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

  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-sm text-white/70 leading-relaxed">
        <p>כדי למדוד את הציפורניים נדרשת גישה למצלמה האחורית של הטלפון.</p>
        <p>אחרי האישור המצלמה תיפתח אוטומטית במסך המדידה.</p>
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
          <p className="absolute bottom-2 inset-x-0 text-center text-xs text-violet-200">
            המצלמה מוכנה — ממשיכים…
          </p>
        </div>
      )}

      {errorHe && (
        <p className="text-sm text-red-300" role="alert">
          {errorHe}
        </p>
      )}

      {status === "denied" && (
        <p className="text-sm text-white/55">
          באייפון: הגדרות ← Safari ← מצלמה. באנדרואיד: הגדרות האתר ← הרשאות ← מצלמה.
        </p>
      )}

      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          חזרה
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
            המשך למדידה
          </button>
        ) : (
          <button type="button" className="btn-violet" onClick={start} disabled={status === "requesting"}>
            {status === "requesting" ? "מבקשת הרשאה..." : "אפשרי גישה למצלמה"}
          </button>
        )}
      </div>
    </div>
  );
}
