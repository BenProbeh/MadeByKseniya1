import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const TOTAL_DURATION = 4.5;
const ZOOM_DELAY = 0.4;
const ZOOM_DURATION = 3.6;
const DOOR_OPEN_DELAY = 3.0;
const DOOR_OPEN_DURATION = 0.9;

function NeonSign({ className }) {
  return (
    <div className={`absolute ${className}`}>
      {/* phosphorescent violet bloom bleeding onto the wall behind the tube */}
      <div className="absolute inset-0 -m-8 bg-violet-400/35 blur-3xl rounded-full" />
      <div className="absolute inset-0 -m-4 bg-violet-500/25 blur-2xl rounded-full" />

      <motion.p
        className="relative font-neon whitespace-nowrap text-[#f2e2ff] text-[clamp(2.2rem,6.2vw,4.6rem)] leading-none"
        style={{
          textShadow:
            "0 0 6px rgba(242,226,255,0.98), 0 0 16px rgba(214,153,255,0.95), 0 0 32px rgba(176,38,255,0.9), 0 0 60px rgba(176,38,255,0.7), 0 0 120px rgba(149,0,230,0.55), 0 0 200px rgba(122,0,191,0.35)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.35, 1, 0.45, 1, 0.85, 1, 0.9, 1] }}
        transition={{
          duration: DOOR_OPEN_DELAY,
          delay: 0.6,
          times: [0, 0.08, 0.13, 0.18, 0.24, 0.3, 0.55, 0.7, 0.85, 1],
        }}
      >
        MadeByKseniya
      </motion.p>
    </div>
  );
}

/** Slim architectural pilaster with a hairline neon edge — replaces literal trees with a built, structural cue. */
function Pilaster({ className }) {
  return (
    <div className={`absolute bottom-0 top-0 w-[3%] max-w-[18px] ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-[#140d1f] via-[#0d0918] to-[#040308]" />
      <div className="absolute inset-y-0 right-0 w-px bg-violet-400/50 shadow-[0_0_8px_2px_rgba(176,38,255,0.45)]" />
    </div>
  );
}

export default function EntranceIntro({ onFinish, onSkip }) {
  const finished = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        onFinish?.();
      }
    }, TOTAL_DURATION * 1000 + 150);
    return () => clearTimeout(timer);
  }, [onFinish]);

  function handleSkip() {
    if (finished.current) return;
    finished.current = true;
    onSkip?.();
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-oled-950 overflow-hidden flex items-end justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: TOTAL_DURATION, times: [0, 0.88, 1], ease: "easeInOut" }}
    >
      <button
        type="button"
        onClick={handleSkip}
        className="fixed top-6 left-6 z-[110] text-xs font-semibold text-white/70 border border-white/20 rounded-full px-4 py-2 backdrop-blur-md bg-white/5 hover:bg-white/10 transition-colors"
      >
        דלגי ⏭
      </button>

      <motion.div
        className="relative w-full h-full flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="relative"
          style={{ width: "min(92vw, 68rem)", aspectRatio: "16 / 13", transformOrigin: "50% 58%" }}
          initial={{ scale: 1 }}
          animate={{ scale: 1.85 }}
          transition={{ duration: ZOOM_DURATION, delay: ZOOM_DELAY, ease: "easeIn" }}
        >
          {/* dark architectural facade — brushed concrete/black stone, not a flat illustration fill */}
          <div className="absolute inset-0 rounded-t-sm bg-gradient-to-b from-[#1a1029] via-[#100a1c] to-[#040308]" />
          <div
            className="absolute inset-0 rounded-t-sm pointer-events-none mix-blend-overlay opacity-60"
            style={{
              backgroundImage:
                "repeating-linear-gradient(100deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 46px)",
            }}
          />
          <div
            className="absolute inset-0 rounded-t-sm pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(ellipse at 50% 48%, transparent 38%, rgba(0,0,0,0.65) 100%)",
            }}
          />
          {/* fine grain so the surface reads as photographed material, not a vector fill */}
          <div
            className="absolute inset-0 rounded-t-sm pointer-events-none opacity-[0.06] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />

          {/* phosphorescent bloom bleeding onto the wall from the sign and window */}
          <div className="absolute left-[6%] top-[8%] w-[30%] h-[72%] bg-violet-500/20 blur-3xl rounded-full" />
          <div className="absolute right-[2%] top-[26%] w-[34%] h-[58%] bg-violet-400/25 blur-3xl rounded-full" />

          {/* glass storefront window — dark glazing with light glowing from inside + reflection streaks */}
          <div className="absolute right-0 top-[22%] bottom-[6%] w-[44%] overflow-hidden rounded-sm border border-white/15 shadow-[0_0_45px_6px_rgba(176,38,255,0.25)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#150d20] via-[#0c0716] to-[#040308]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_48%_62%,rgba(176,38,255,0.45),transparent_68%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,226,255,0.18),transparent_55%)]" />
            <div className="absolute inset-0 grid grid-cols-3">
              <div className="border-l border-white/10" />
              <div className="border-l border-r border-white/10" />
              <div className="border-r border-white/10" />
            </div>
            {/* glass reflection streaks */}
            <div
              className="absolute -inset-y-4 left-[10%] w-[10%] bg-white/10 blur-[2px]"
              style={{ transform: "skewX(-18deg)" }}
            />
            <div
              className="absolute -inset-y-4 left-[62%] w-[6%] bg-white/[0.06] blur-[2px]"
              style={{ transform: "skewX(-18deg)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-oled-950/60 to-transparent" />
          </div>

          {/* slim black canopy with a glowing violet LED edge */}
          <div
            className="absolute top-0 left-[9%] w-[38%] h-[10%] bg-gradient-to-b from-[#140d1f] to-[#0a0714]"
            style={{ clipPath: "polygon(0 0, 100% 0, 90% 100%, 10% 100%)" }}
          />
          <div
            className="absolute top-[10%] left-[9.6%] w-[36.5%] h-px bg-violet-300 shadow-[0_0_10px_2px_rgba(176,38,255,0.7)]"
            style={{ clipPath: "polygon(0 0, 100% 0, 96% 100%, 4% 100%)" }}
          />

          <NeonSign className="top-[2%] right-[3%] w-[66%] text-right" />

          {/* door frame — dark brushed metal, not wood */}
          <div className="absolute top-[12%] left-[15%] w-[23%] h-[76%] bg-gradient-to-b from-[#1c1229] to-[#0a0714] border border-white/10 rounded-t-2xl p-[6%]">
            <div className="relative w-full h-full flex overflow-hidden rounded-t-lg">
              <motion.div
                className="w-1/2 h-full bg-gradient-to-b from-[#2a1a3f] via-[#170f24] to-[#0a0714] border-l border-violet-400/20"
                style={{ boxShadow: "inset 0 0 30px rgba(176,38,255,0.25)" }}
                initial={{ x: 0 }}
                animate={{ x: "-105%" }}
                transition={{ delay: DOOR_OPEN_DELAY, duration: DOOR_OPEN_DURATION, ease: "easeInOut" }}
              />
              <motion.div
                className="w-1/2 h-full bg-gradient-to-b from-[#2a1a3f] via-[#170f24] to-[#0a0714] border-r border-violet-400/20"
                style={{ boxShadow: "inset 0 0 30px rgba(176,38,255,0.25)" }}
                initial={{ x: 0 }}
                animate={{ x: "105%" }}
                transition={{ delay: DOOR_OPEN_DELAY, duration: DOOR_OPEN_DURATION, ease: "easeInOut" }}
              />
            </div>
            {/* light spilling out from inside as the doors part */}
            <motion.div
              className="absolute inset-[6%] rounded-t-lg bg-[radial-gradient(ellipse_at_50%_70%,rgba(176,38,255,0.65),transparent_75%)] pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1] }}
              transition={{ delay: DOOR_OPEN_DELAY, duration: DOOR_OPEN_DURATION, ease: "easeIn" }}
            />
          </div>

          <Pilaster className="left-[4%]" />
          <Pilaster className="left-[39.5%]" />

          {/* ground — dark polished stone reflecting the neon glow */}
          <div className="absolute bottom-0 inset-x-0 h-[8%] bg-gradient-to-t from-black to-transparent" />
          <div className="absolute bottom-0 right-0 w-[50%] h-[8%] bg-gradient-to-t from-violet-500/30 to-transparent blur-[1px]" />
          <div className="absolute bottom-[1%] right-[6%] w-[30%] h-px bg-violet-300/40 blur-[1px]" />

          {/* soft vignette to frame the scene like a photograph */}
          <div
            className="absolute inset-0 rounded-t-sm pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(0,0,0,0.5) 100%)",
            }}
          />
        </motion.div>

        {/* violet flash as we step through the door */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-t from-violet-200 via-violet-300 to-white pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1] }}
          transition={{ duration: TOTAL_DURATION, times: [0, 0.85, 0.97], ease: "easeIn" }}
        />
      </motion.div>
    </motion.div>
  );
}
