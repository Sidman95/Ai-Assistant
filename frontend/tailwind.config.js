/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#fcfcfb",
        page: "#f9f9f7",
        ink: "#0b0b0b",
        "ink-2": "#52514e",
        muted: "#898781",
        hairline: "#e1e0d9",
        accent: "#2a78d6",
      },
    },
  },
  plugins: [],
};
