import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SVARAH_API_URL / SVARAH_WEB_PORT let a second stack (e.g. an offline mock
// backend) run beside the usual one.
const API_PROXY = {
  "/api": {
    target: process.env.SVARAH_API_URL || "http://localhost:8000",
    changeOrigin: true,
    // The live-transcription preview is a WebSocket, so the dev proxy has to
    // forward upgrades as well as plain requests.
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on IPv4 so the site answers on http://127.0.0.1:5173 as well as
    // http://localhost:5173 — Firebase phone sign-in rejects real numbers
    // from "localhost".
    host: "127.0.0.1",
    port: Number(process.env.SVARAH_WEB_PORT) || 5173,
    proxy: API_PROXY,
  },
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
});
