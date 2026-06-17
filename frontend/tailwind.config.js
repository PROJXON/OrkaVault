/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0d1f3c",
          800: "#122349",
          700: "#1a3260",
        },
        brand: {
          blue: "#1a73e8",
          teal: "#00897b",
          green: "#34a853",
          amber: "#f9ab00",
          red: "#ea4335",
        },
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "Google Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
