/** Shared API types — mirrors backend/app/schemas.py (Phase 2). */

export interface TranscriptView {
  raw: string;
  normalized: string | null;
  hash: string | null;
  language: string | null;
  duration_seconds: number | null;
  confidence: number | null;
  provider: string | null;
  is_mock: boolean;
  segments: Array<Record<string, unknown>>;
}

export interface STTStatus {
  status: "ok" | "unavailable" | "error" | "skipped";
  provider: string | null;
  code: string | null;
  message: string | null;
  fallback: string | null;
}

export interface AuditEventView {
  id: number;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ── FactSheet (Phase 2) ───────────────────────────────────────────────
export interface BusinessFacts {
  name: string | null;
  location: string | null;
}

export interface OfferFacts {
  product: string[];
  discount_percent: number | null;
  discount_flat: number | null;
  price: number | null;
  quantity: number | null;
  audience: string[];
  days: string[];
  date_start: string | null;
  date_end: string | null;
  start_time: string | null;
  end_time: string | null;
  conditions: string[];
  location: string | null;
}

export interface Ambiguity {
  field: string;
  note: string;
  candidates: string[];
}

export interface FactSheet {
  business: BusinessFacts;
  offer: OfferFacts;
  languages: string[];
  extraction_confidence: Record<string, number>;
  inferred: string[];
  ambiguities: Ambiguity[];
  missing: string[];
}

export interface ExtractionStatus {
  status: "ok" | "unavailable" | "error";
  provider: string | null;
  is_mock: boolean;
  message: string | null;
  fallback: string | null;
}

export interface FactSheetRead {
  id: number;
  campaign_id: number;
  version: number;
  status: "draft" | "locked" | "superseded";
  facts: FactSheet;
  tokens: Record<string, string> | null;
  fact_hash: string | null;
  seal: string | null;
  seal_algorithm: string | null;
  seal_valid: boolean | null;
  extraction: ExtractionStatus | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
}

export interface FactSheetVersionSummary {
  id: number;
  version: number;
  status: string;
  fact_hash: string | null;
  created_at: string;
  locked_at: string | null;
}

/** Editable payload accepted by PATCH /api/factsheets/{id}. */
export interface FactSheetPatch {
  business?: Partial<BusinessFacts>;
  offer?: Record<string, unknown>;
  languages?: string[];
}

export interface CampaignRead {
  id: number;
  shop_id: number;
  status: string;
  input_type: "typed" | "audio" | null;
  transcript: TranscriptView | null;
  audio_path: string | null;
  facts: FactSheet | null;
  factsheet: FactSheetRead | null;
  factsheet_versions: FactSheetVersionSummary[];
  assets: Array<Record<string, unknown>>;
  verification: Array<Record<string, unknown>>;
  audit_events: AuditEventView[];
  stt: STTStatus | null;
  created_at: string;
  updated_at: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  mode: "live" | "mock";
  database: string;
  assets_dir: string;
  time: string;
}

export interface ProviderStatusView {
  name: string;
  kind: string;
  mode: string;
  configured: boolean;
  available: boolean;
  verified: boolean;
  detail: string;
  capabilities: string[];
}

export interface ModesResponse {
  mode: "live" | "mock";
  providers: ProviderStatusView[];
  stt: ProviderStatusView;
  extraction: ProviderStatusView;
  seal: { configured: boolean; algorithm: string; detail: string };
  storage: Record<string, unknown>;
  database: Record<string, unknown>;
}

export interface AssetView {
  id: number;
  campaign_id: number;
  kind: string;
  locale: string;
  asset_status: string;
  text_content: string | null;
  storage_path: string | null;
  sha256: string | null;
  fact_hash: string | null;
  provider: string | null;
  is_mock: boolean;
  used_fallback: boolean;
  provenance: Record<string, unknown> | null;
  verification: Array<{ check: string; verdict: string; confidence: number | null; attempt: number }>;
  created_at: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}
