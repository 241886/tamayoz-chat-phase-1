import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        mist: "#eef3f6",
        nexus: {
          dark: "#080c14",
          panel: "#0e1421"
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#5865F2",
          600: "#4f46e5",
          700: "#4338ca"
        }
      },
      boxShadow: {
        soft: "0 18px 60px rgba(14, 30, 37, 0.12)",
        nexus: "0 24px 80px rgba(2, 6, 23, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
