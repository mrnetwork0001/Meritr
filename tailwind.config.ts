import type { Config } from "tailwindcss";

/**
 * Meritr design tokens.
 *
 * The palette is built around a single semantic idea: credit health has bands, and the UI should
 * make which band a position is in readable at a glance, before any number is parsed.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 900: "#05070D", 800: "#0A0F1C", 700: "#111827", 600: "#1B2434", 500: "#28344A" },
        mist: { 100: "#F8FAFC", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 500: "#64748B" },
        // Health bands, used consistently across gauges, badges and borders.
        healthy: "#34D399",
        watch: "#FBBF24",
        stress: "#FB923C",
        danger: "#F87171",
        credit: "#7DF9FF",
        accent: "#818CF8",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      animation: {
        "pulse-soft": "pulse-soft 2.6s ease-in-out infinite",
        "slide-up": "slide-up 0.4s ease-out",
      },
      keyframes: {
        "pulse-soft": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
