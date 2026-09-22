import { NAIL_SIZING_COPY as C } from "../../lib/nailSizing/copy.js";

export default function PrepStep({ onNext }) {
  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="font-serif text-2xl md:text-3xl text-white">{C.prep.title}</h2>
        <p className="font-serif text-white/60 text-sm md:text-base max-w-xl mx-auto">{C.prep.subtitle}</p>
      </div>
      <ul className="space-y-2 list-disc pr-5 text-sm md:text-base text-white/70 leading-relaxed text-right">
        {C.prep.bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button type="button" className="btn-violet w-full" onClick={onNext}>
        {C.prep.action}
      </button>
    </div>
  );
}
