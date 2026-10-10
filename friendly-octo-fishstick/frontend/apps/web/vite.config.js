import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PROXY = {
  "/api": {
    target: "http://localhost:8000",
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
    port: 5173,
    proxy: API_PROXY,
  },
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
});
