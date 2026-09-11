import type { Config } from "tailwindcss";

/**
 * Meritr design tokens.
 *
 * Shares the house palette used across the author's protocol front-ends: a near-black `ink`
 * scale for surfaces, one indigo accent (`model`) for anything the system computes, and a
 * green/rose pair (`up`/`down`) reserved for state that is genuinely good or genuinely bad.
 *
 * The discipline that matters: colour is never decoration here. `up`/`down` mean solvent and
 * distressed, `model` means "derived by Meritr rather than asserted by a human", and everything
 * else stays grey. A reader should be able to tell a position's health without reading a number.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          700: "rgb(31 41 55)",   // borders
          800: "rgb(17 24 39)",   // raised surfaces, code
          900: "rgb(11 15 25)",   // cards
          950: "rgb(7 9 15)",     // page
        },
        model: "rgb(129 140 248)", // computed by Meritr
        up: "rgb(52 211 153)",     // healthy / proven
        down: "rgb(251 113 133)",  // distressed / refuted
      },
      maxWidth: {
        // Widens with the viewport but stays readable on ultrawide displays.
        page: "calc(50vw + 36rem)",
        // Console content sits inside the rail, so it gets its own ceiling.
        app: "1400px",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
