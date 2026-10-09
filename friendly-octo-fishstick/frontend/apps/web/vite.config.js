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
    port: 5173,
    proxy: API_PROXY,
  },
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
});
