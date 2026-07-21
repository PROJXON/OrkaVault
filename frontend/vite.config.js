import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Check if we are building for the desktop app
const isElectron = process.env.ELECTRON === "true";

export default defineConfig({
  plugins: [react()],
  // Use relative paths for Electron, absolute for Web
  base: isElectron ? './' : '/', 
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});