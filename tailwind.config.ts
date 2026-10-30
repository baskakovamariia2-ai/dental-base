import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#18181b", soft: "#52525b", mute: "#a1a1aa" },
        accent: { DEFAULT: "#0f766e", soft: "#ccfbf1", ink: "#134e4a" },
        canvas: "#f6f6f4",
      },
      boxShadow: { card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.02)" },
    },
  },
  plugins: [],
} satisfies Config;
