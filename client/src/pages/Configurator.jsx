import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import NailPreview from "../components/NailPreview.jsx";
import ShadePhoto from "../components/ShadePhoto.jsx";
import OptionPicker from "../components/OptionPicker.jsx";
import ScrollCue from "../components/ScrollCue.jsx";
import Ils from "../components/Ils.jsx";
import {
  SHAPES,
  FINISHES,
  LENGTHS,
  COLOURS,
  computePrice,
  buildSetSummary,
} from "../lib/nailOptions.js";

function ShadeSpotlight({ onBookLook }) {
  const [colourId, setColourId] = useState(COLOURS[0].id);
  const colour = COLOURS.find((c) => c.id === colourId);

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <ShadePhoto colour={colour} />

        <div>
          <h2 className="text-3xl md:text-5xl font-black mb-4">{colour.label}</h2>
          <p className="text-white/50 mb-8">{colour.tag} · גימור מבריק על צורת שקד קלאסית</p>

          <div className="grid grid-cols-3 gap-3 mb-8">
            {COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColourId(c.id)}
                aria-pressed={c.id === colourId}
                className={`glass-panel p-3 flex flex-col items-center gap-2 transition-all duration-200 ${
                  c.id === colourId ? "border-violet-400/60 shadow-glow" : "hover:border-white/25"
                }`}
              >
                <span
                  className="w-8 h-8 rounded-full border border-white/20"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-xs text-white/70 text-center leading-tight">{c.label}</span>
              </button>
            ))}
          </div>

          <button type="button" onClick={() => onBookLook(colour)} className="btn-violet">
            הזמיני מראה זה
          </button>
        </div>
      </div>
    </section>
  );
}

function FullConfigurator({ onBookSet }) {
  const [shapeId, setShapeId] = useState(SHAPES[0].id);
  const [finishId, setFinishId] = useState(FINISHES[0].id);
  const [lengthId, setLengthId] = useState(LENGTHS[1].id);
  const [colourId, setColourId] = useState(COLOURS[0].id);

  const selection = { shapeId, finishId, lengthId, colourId };
  const price = computePrice(selection);
  const shapeLabel = SHAPES.find((s) => s.id === shapeId).label;
  const colourLabel = COLOURS.find((c) => c.id === colourId).label;

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="section-eyebrow">Build a set</span>
        <h2 className="text-3xl md:text-5xl font-black mt-3">
          עצבי את זה.
          <br />
          <span className="font-neon text-violet-300 text-[1.3em] leading-none">וראי את המחיר.</span>
        </h2>
        <p className="text-white/60 mt-4">בחרי צורה, גוון, גימור ואורך — המחיר מתעדכן מיד.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <OptionPicker label="צורה" options={SHAPES} value={shapeId} onChange={setShapeId} />
          <OptionPicker label="גוון" options={COLOURS} value={colourId} onChange={setColourId} />
          <OptionPicker label="גימור" options={FINISHES} value={finishId} onChange={setFinishId} />
          <OptionPicker label="אורך" options={LENGTHS} value={lengthId} onChange={setLengthId} />

          <div className="glass-panel p-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-[0.2em] mb-1">מחיר משוער</p>
              <p className="text-3xl font-black violet-text">
                {price}
                <Ils />
              </p>
            </div>
            <button type="button" onClick={() => onBookSet(selection)} className="btn-violet">
              הזמיני את הסט הזה
            </button>
          </div>
        </div>

        <div>
          <NailPreview shapeId={shapeId} finishId={finishId} colourId={colourId} />
          <p className="text-center text-white/50 text-sm mt-4">
            {shapeLabel} · {colourLabel}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Configurator() {
  const navigate = useNavigate();

  function goToBooking(notes) {
    navigate("/booking", { state: { prefillNotes: notes } });
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-3xl mx-auto px-6 pt-16 text-center"
      >
        <span className="section-eyebrow">Colours</span>
        <h1 className="text-3xl md:text-5xl font-black mt-3">גלריית הגוונים שלנו</h1>
        <p className="text-white/60 mt-4">
          עברי בין הגוונים, מצאי את המראה שמדבר אלייך, ואז עצבי את הסט המדויק שלך למטה.
        </p>
      </motion.div>

      <ShadeSpotlight onBookLook={(colour) => goToBooking(`בקשה: לק ${colour.label} (${colour.tag})`)} />

      <ScrollCue label="המשיכי לגלול לעיצוב הסט המלא" />

      <FullConfigurator onBookSet={(selection) => goToBooking(buildSetSummary(selection))} />
    </div>
  );
}
