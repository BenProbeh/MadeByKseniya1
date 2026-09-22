import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

export default function GuideStep({ canSkip, onSkip, onNext, onBack }) {
  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="font-serif text-2xl md:text-3xl text-white">{C.guide.title}</h2>
        <ul className="space-y-2 list-disc pr-5 text-sm text-white/70 leading-relaxed text-right max-w-xl mx-auto">
          {C.guide.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-3 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>
          {C.guide.back}
        </button>
        <div className="flex flex-wrap gap-3">
          {canSkip && (
            <button type="button" className="btn-text" onClick={onSkip}>
              {C.guide.skip}
            </button>
          )}
          <button type="button" className="btn-violet" onClick={onNext}>
            {C.guide.next}
          </button>
        </div>
      </div>
    </div>
  );
}
