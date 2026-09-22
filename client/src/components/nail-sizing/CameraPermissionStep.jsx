export default function CameraPermissionStep({ camera, onGrantedContinue, onBack }) {
  const { status, errorHe, start } = camera;

  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-sm text-white/70 leading-relaxed">
        <p>כדי למדוד את הציפורניים נדרשת גישה למצלמה האחורית של הטלפון.</p>
        <p>ההרשאה מתבקשת רק אחרי לחיצה מפורשת שלך. אפשר להמשיך בלי לשמור תמונות בשרת.</p>
      </div>

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
          <button type="button" className="btn-violet" onClick={onGrantedContinue}>
            המצלמה מוכנה — המשך
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
