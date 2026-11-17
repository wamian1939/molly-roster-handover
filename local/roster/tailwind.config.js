/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf7f7", 100: "#faebec", 200: "#f4d6d8", 300: "#efc5c8",
          400: "#e9b2b6", 500: "#e9b2b6", 600: "#c97f87", 700: "#9d5660",
          800: "#763c46", 900: "#512a31", 950: "#2f171c",
        },
        graphite: {
          50: "#f6f7f8", 100: "#e8ebee", 200: "#d8dde2", 300: "#b8c0ca",
          400: "#647180", 500: "#586574", 600: "#566171", 700: "#454e5c",
          800: "#303744", 900: "#1d2430", 950: "#111722",
        },
        signal: { teal: "#0f766e", blue: "#2563eb", amber: "#d97706", red: "#dc2626", emerald: "#059669" },
      },
      boxShadow: {
        panel: "0 2px 8px rgba(17, 24, 39, 0.07)",
        lift: "0 16px 42px rgba(15, 23, 42, 0.13)",
      },
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
};
