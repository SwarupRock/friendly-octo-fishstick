/** Small typed API client for the Titan backend. */

import type {
  ApiErrorBody,
  CampaignRead,
  FactSheetPatch,
  FactSheetRead,
  HealthResponse,
  ModesResponse,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(
      "The backend is unreachable. Is it running on port 8000?",
      "network_error",
      0,
    );
  }

  if (!response.ok) {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    throw new ApiError(
      body.error?.message ?? `Request failed (${response.status}).`,
      body.error?.code ?? "http_error",
      response.status,
      body.error?.details,
    );
  }
  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function getModes(): Promise<ModesResponse> {
  return request<ModesResponse>("/modes");
}

export interface CreateCampaignInput {
  text?: string;
  audio_b64?: string;
  audio_mime?: string;
  shop_id?: number;
  language_hint?: string;
}

export function createCampaign(input: CreateCampaignInput): Promise<CampaignRead> {
  return request<CampaignRead>("/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCampaign(id: number): Promise<CampaignRead> {
  return request<CampaignRead>(`/campaigns/${id}`);
}

export function extractFacts(campaignId: number): Promise<CampaignRead> {
  return request<CampaignRead>(`/campaigns/${campaignId}/extract`, {
    method: "POST",
  });
}

export function patchFactSheet(
  sheetId: number,
  patch: FactSheetPatch,
): Promise<FactSheetRead> {
  return request<FactSheetRead>(`/factsheets/${sheetId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function lockFactSheet(sheetId: number): Promise<FactSheetRead> {
  return request<FactSheetRead>(`/factsheets/${sheetId}/lock`, {
    method: "POST",
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected reader result."));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
