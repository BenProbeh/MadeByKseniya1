import { useState } from "react";
import NailPreview from "./NailPreview.jsx";

export default function ShadePhoto({ colour }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const hasPhoto = Boolean(colour.image) && !imageFailed;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <span className="absolute top-4 right-4 z-10 text-xs font-semibold bg-oled-950/80 backdrop-blur border border-white/10 rounded-full px-3 py-1.5 text-violet-200">
        {colour.label} · {colour.tag}
      </span>

      {hasPhoto ? (
        <img
          src={colour.image}
          alt={`לק ${colour.label} (${colour.tag}) על ציפורניים אמיתיות בסטודיו MadeByKseniya`}
          className="w-full aspect-[4/3] object-cover border border-white/10 rounded-2xl"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className="absolute bottom-4 left-4 z-10 text-xs font-semibold bg-oled-950/80 backdrop-blur border border-white/10 rounded-full w-9 h-9 flex items-center justify-center text-white/70 hover:text-violet-300 hover:border-violet-400/40 transition-colors"
            aria-label="הפעילי שוב"
            title="הפעילי שוב"
          >
            ↻
          </button>
          <NailPreview key={replayKey} shapeId="almond" finishId="glossy" colourId={colour.id} />
        </>
      )}
    </div>
  );
}
