import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        canvas: "#f4f3ed",
        paper: "#fffef9",
        moss: "#315b45",
        lime: "#d7f277",
        line: "#d8d8cf",
      },
      boxShadow: { card: "0 18px 50px rgba(35, 45, 38, 0.08)" },
    },
  },
  plugins: [],
} satisfies Config;

