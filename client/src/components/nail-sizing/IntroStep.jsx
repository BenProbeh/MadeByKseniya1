import { Lightbulb, ShieldCheck, Sparkles } from "lucide-react";
import PageHeader from "../ui/PageHeader.jsx";
import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";
import { REFERENCE_COIN } from "../../lib/nailSizing/measure.js";

const ICONS = [null, Lightbulb, Sparkles];

export default function IntroStep({ progress, onStart, onResume, onRestart }) {
  const resumable = progress && progress.done > 0;
  return (
    <div className="max-w-xl mx-auto space-y-7 pt-2">
      <PageHeader title={C.intro.title} subtitle={C.intro.subtitle} />

      <section aria-labelledby="need-title" className="space-y-2">
        <h2 id="need-title" className="section-title">
          {C.intro.needTitle}
        </h2>
        <ul className="list-group">
          {C.intro.needs.map((item, i) => {
            const Icon = ICONS[i];
            return (
              <li key={item.title} className="list-row items-start">
                {Icon ? (
                  <span className="grid place-items-center w-12 h-12 rounded-full bg-white/[0.06] text-violet-200 shrink-0" aria-hidden="true">
                    <Icon size={22} strokeWidth={1.8} />
                  </span>
                ) : (
                  <img src={REFERENCE_COIN.imageSrc} alt="" className="w-12 h-12 shrink-0" />
                )}
                <div className="min-w-0 pt-0.5">
                  <p className="t-headline">{item.title}</p>
                  <p className="t-sub mt-0.5">{item.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="flex items-start gap-2.5 t-foot px-1">
        <ShieldCheck size={18} className="text-violet-300 shrink-0 mt-px" aria-hidden="true" />
        {C.intro.privacy}
      </p>

      <div className="sticky-cta space-y-2">
        {resumable ? (
          <>
            <button type="button" className="btn-violet btn-block" onClick={onResume}>
              {C.intro.resume(progress.done, progress.total)}
            </button>
            <button type="button" className="btn-text w-full justify-center text-white/60" onClick={onRestart}>
              {C.intro.restart}
            </button>
          </>
        ) : (
          <button type="button" className="btn-violet btn-block" onClick={onStart}>
            {C.intro.action}
          </button>
        )}
      </div>
    </div>
  );
}
