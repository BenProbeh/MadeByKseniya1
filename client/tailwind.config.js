/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        oled: {
          950: "#000000",
          900: "#07050c",
          850: "#0f0916",
          800: "#170f22",
          700: "#251536",
          600: "#371d4f",
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
      fontFamily: {
        sans: ["Sekuya", "Heebo", "system-ui", "sans-serif"],
        serif: ["'Bitcount Ink Variable'", "Heebo", "system-ui", "sans-serif"],
        neon: ["'Alex Brush'", "cursive"],
      },
      fontSize: {
        "display-lg": ["clamp(3rem, 6.5vw, 6.75rem)", { lineHeight: "1.04", letterSpacing: "-0.01em" }],
        "display-md": ["clamp(2.25rem, 4.5vw, 4rem)", { lineHeight: "1.08", letterSpacing: "-0.01em" }],
      },
      maxWidth: {
        content: "1440px",
      },
      boxShadow: {
        glow: "0 0 30px 2px rgba(176, 38, 255, 0.5), 0 0 60px 12px rgba(176, 38, 255, 0.25)",
        "glow-lg": "0 0 60px 6px rgba(176, 38, 255, 0.55), 0 0 130px 24px rgba(176, 38, 255, 0.3)",
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
