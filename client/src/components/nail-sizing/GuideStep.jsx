export default function GuideStep({ canSkip, onSkip, onNext, onBack }) {
  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-sm text-white/70 leading-relaxed">
        <p className="font-serif text-lg text-white">לפני הצילום</p>
        <ul className="space-y-2 list-disc pr-5">
          <li>הניחי מטבע ואצבע על אותו משטח שטוח, באותו מישור.</li>
          <li>אל תכסי את הציפורן במטבע ואל תצמידי אותם זה לזה.</li>
          <li>החזיקי את הטלפון במקביל למשטח, בלי זום דיגיטלי.</li>
          <li>הימנעי מצללים, השתקפויות וזווית אלכסונית.</li>
          <li>הזיזי לפי ההכוונה עד שהמטבע והאצבע נכנסים למסגרות.</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          חזרה
        </button>
        <div className="flex flex-wrap gap-3">
          {canSkip && (
            <button type="button" className="btn-text" onClick={onSkip}>
              דלגי על ההדרכה
            </button>
          )}
          <button type="button" className="btn-violet" onClick={onNext}>
            הבנתי, בואו נמדוד
          </button>
        </div>
      </div>
    </div>
  );
}
