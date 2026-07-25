import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1b2430",
        indigo: "#1b2430",
        "indigo-deep": "#131a23",
        parchment: "#ede6d6",
        "parchment-line": "#c9bfa8",
        amber: "#e8a33d",
        sage: "#7a8b6f",
        rust: "#b3552f",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
