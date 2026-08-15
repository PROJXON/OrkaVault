/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tailwind's default gray scale re-mapped to OrkaOS's blue-tinted
        // neutrals, so every existing `bg-gray-*`/`text-gray-*`/`border-gray-*`
        // usage across the app inherits the new palette without per-file edits.
        gray: {
          50: "#F2F7FD",
          100: "#E9F1FB",
          150: "#E2EAF3",
          200: "#CBD8E8",
          300: "#9FB0C6",
          400: "#7587A0",
          500: "#5E7187",
          600: "#41566F",
          700: "#243B57",
          800: "#142C4B",
          900: "#0A2A52",
          950: "#06182E",
        },
        navy: {
          700: "#1573C6",
          800: "#0A3B73",
          900: "#0A2A52",
        },
        brand: {
          blue: "#1E8FEC",
          teal: "#15B5C2",
          green: "#0FA76C",
          amber: "#E0930A",
          red: "#CB2D20",
          indigo: "#5B6CF5",
        },
        orka: {
          blue: {
            50: "#F1F8FE", 100: "#E7F2FD", 200: "#C6E2FA", 300: "#86BEF2", 400: "#5AA8EE",
            500: "#3D9BF0", 600: "#1E8FEC", 700: "#1573C6", 800: "#0A3B73", 900: "#0A3463",
          },
          neutral: {
            0: "#FFFFFF", 25: "#F8FBFF", 50: "#F2F7FD", 100: "#E9F1FB", 150: "#E2EAF3",
            200: "#CBD8E8", 300: "#9FB0C6", 400: "#7587A0", 500: "#5E7187", 600: "#41566F",
            700: "#243B57", 800: "#142C4B", 850: "#0F2440", 900: "#0A2A52", 950: "#06182E",
          },
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "Segoe UI", "Roboto", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
