/**
 * Small API client for the Titan backend.
 *
 * By default requests are relative (`/api/...`) and the Vite dev proxy
 * forwards them to http://localhost:8000. Set VITE_API_BASE to point the
 * frontend at another origin (see .env.example).
 */

export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch(path, init = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError("The backend is unreachable.", "network_error", 0);
  }

  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.code ?? "http_error",
      response.status,
      body?.error?.details,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

/** GET /api/health — backend status, version, and current mode. */
export function getHealth() {
  return apiFetch("/health");
}

/** GET /api/modes — provider/fallback status report. */
export function getModes() {
  return apiFetch("/modes");
}
