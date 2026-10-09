/**
 * Titan backend connection settings.
 *
 * The FastAPI backend runs at http://localhost:8000 during development.
 * On a physical device, replace localhost with your computer's LAN IP
 * (or set EXPO_PUBLIC_API_BASE in a .env file — Expo inlines it at build time).
 */
export const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000"
).replace(/\/+$/, "");

/** Build a full URL for a backend API path, e.g. apiUrl("/health"). */
export function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}
