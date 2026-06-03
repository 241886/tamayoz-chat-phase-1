import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#f8fafc",
        mist: "#0d0d12",
        nexus: {
          dark: "#0d0d12",
          panel: "#12101a"
        },
        "brand-purple": "#c87aff",
        "brand-pink": "#ff6eb4",
        "brand-cyan": "#22d3ee",
        brand: {
          50: "rgba(200, 122, 255, 0.12)",
          100: "rgba(255, 110, 180, 0.18)",
          500: "#c87aff",
          600: "#b45cff",
          700: "#ff6eb4"
        }
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0, 0, 0, 0.28)",
        nexus: "0 24px 90px rgba(200, 122, 255, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
