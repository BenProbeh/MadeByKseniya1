// Personal site colour: surfaces, "white" text/lines and light accent inks read CSS variables whose defaults
// (:root in index.css) are the original values. Brand violet backgrounds, buttons and glows are fixed.
const ink = (name) => `rgb(var(--ink-${name}) / <alpha-value>)`;
// Translucent text (white/60 …) is pulled toward solid on personal colours: alpha' = 1 - (1 - alpha) * soft.
const SOFT_FG = "rgb(var(--theme-fg) / calc(1 - (1 - <alpha-value>) * var(--theme-fg-soft)))";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--theme-fg) / <alpha-value>)",
        oled: {
          950: "rgb(var(--oled-950) / <alpha-value>)",
          900: "rgb(var(--oled-900) / <alpha-value>)",
          850: "rgb(var(--oled-850) / <alpha-value>)",
          800: "rgb(var(--oled-800) / <alpha-value>)",
          700: "rgb(var(--oled-700) / <alpha-value>)",
          600: "rgb(var(--oled-600) / <alpha-value>)",
        },
        violet: {
          100: "#f5e0ff",
          200: "#e6b8ff",
          300: "#d17dff",
          400: "#b026ff",
          500: "#9500e6",
          600: "#7a00bf",
          700: "#5c0091",
        },
      },
      textColor: {
        white: SOFT_FG,
        // Dark ink on violet buttons/badges stays exactly as designed, whatever the background colour.
        oled: {
          950: "#000000",
          900: "#07050c",
          850: "#0f0916",
          800: "#170f22",
          700: "#251536",
          600: "#371d4f",
        },
        violet: { 100: ink("violet-100"), 200: ink("violet-200"), 300: ink("violet-300") },
        red: { 300: ink("red-300") },
        rose: { 300: ink("rose-300") },
        amber: { 200: ink("amber-200"), 300: ink("amber-300") },
        emerald: { 200: ink("emerald-200"), 300: ink("emerald-300"), 400: ink("emerald-400") },
      },
      placeholderColor: {
        white: SOFT_FG,
      },
      borderColor: {
        white: "rgb(var(--theme-fg) / calc(<alpha-value> * var(--theme-line)))",
      },
      ringColor: {
        violet: { 300: ink("violet-300") },
      },
      fontFamily: {
        // Body, inputs, numbers and data: Heebo (clean Hebrew + Latin, real weights).
        sans: ["Heebo", "system-ui", "-apple-system", "Arial", "sans-serif"],
        // Brand voice: headings, buttons, tabs. Secular One covers Hebrew only; Latin and digits fall to Heebo.
        display: ["'Secular One'", "Heebo", "system-ui", "Arial", "sans-serif"],
        // Legacy alias: `font-serif` was the Hebrew heading font across the app.
        serif: ["'Secular One'", "Heebo", "system-ui", "Arial", "sans-serif"],
        // Latin brand words only (package names, wordmark).
        brand: ["Sekuya", "'Secular One'", "Heebo", "sans-serif"],
        neon: ["'Alex Brush'", "'Secular One'", "cursive"],
      },
      fontSize: {
        "large-title": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.01em" }],
        title: ["1.3125rem", { lineHeight: "1.75rem", letterSpacing: "-0.005em" }],
        headline: ["1.0625rem", { lineHeight: "1.5rem" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        sub: ["0.9375rem", { lineHeight: "1.375rem" }],
        foot: ["0.8125rem", { lineHeight: "1.125rem" }],
        cap: ["0.75rem", { lineHeight: "1rem" }],
        "display-lg": ["clamp(2.5rem, 6.5vw, 5rem)", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
        "display-md": ["clamp(2rem, 4.5vw, 3.5rem)", { lineHeight: "1.08", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        control: "0.875rem",
        card: "1.125rem",
      },
      spacing: {
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        tabbar: "var(--tabbar-h)",
      },
      maxWidth: {
        content: "1440px",
      },
      boxShadow: {
        // Brand glow: an offset, soft-blurred violet lift (not a zero-offset halo).
        glow: "0 10px 28px -10px rgba(176, 38, 255, 0.65), 0 2px 8px -2px rgba(176, 38, 255, 0.35)",
        "glow-lg": "0 16px 44px -12px rgba(176, 38, 255, 0.7), 0 4px 14px -4px rgba(176, 38, 255, 0.4)",
        lift: "0 12px 32px -16px rgba(0, 0, 0, 0.9), 0 2px 6px -2px rgba(0, 0, 0, 0.6)",
        hairline: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      },
      backgroundImage: {
        "violet-gradient": "linear-gradient(135deg, #f5e0ff 0%, #d17dff 40%, #b026ff 70%, #7a00bf 100%)",
        "violet-sheen": "linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.6) 45%, transparent 70%)",
        "chrome-gradient": "linear-gradient(135deg, #ffffff 0%, #c9c9c9 50%, #6e6e6e 100%)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        shimmer: "shimmer 2.8s linear infinite",
        "sheen-sweep": "sheen-sweep 1.1s ease-editorial",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "sheen-sweep": {
          "0%": { backgroundPosition: "-150% 0" },
          "100%": { backgroundPosition: "250% 0" },
        },
      },
    },
  },
  plugins: [],
};
