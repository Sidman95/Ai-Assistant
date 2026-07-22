/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        card: "var(--card)",
        line: "var(--border)",
        line2: "var(--border2)",
        row: "var(--row)",
        divider: "var(--divider)",
        input: "var(--input)",
        ink: "var(--ink)",
        "ink-2": "var(--ink2)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-text": "var(--accent-text)",
        "accent-soft": "var(--accent-soft)",
        avatar: "var(--avatar)",
      },
      boxShadow: {
        card: "var(--card-shadow)",
        btn: "var(--btn-shadow)",
      },
      borderRadius: {
        card: "18px",
      },
    },
  },
  plugins: [],
};
