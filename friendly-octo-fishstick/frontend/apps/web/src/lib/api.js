/**
 * Titan/Svarah backend client.
 *
 * Everything the web app sends to the backend goes through `request()` below.
 * That buys four things no scattered `fetch()` call gets for free:
 *
 *  - one place that attaches the session token;
 *  - one error shape (`ApiError`) carrying the backend's stable `code`, so the
 *    UI can branch on `facts_not_locked` or `asset_not_verified` rather than
 *    matching on prose;
 *  - a request timeout, so a hung backend surfaces as an error instead of a
 *    spinner that never resolves;
 *  - `AbortSignal` passthrough, so a component that unmounts stops its work.
 *
 * By default requests are relative (`/api/...`) and the Vite dev proxy forwards
 * them to http://localhost:8000. Set VITE_API_BASE to point the frontend at
 * another origin (see .env.example).
 */

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');

/** Default per-request ceiling. Media generation overrides this explicitly. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** Poster/voice/video composition is slow but bounded. */
const GENERATION_TIMEOUT_MS = 180_000;

const SESSION_STORAGE_KEY = 'svarah.session.v1';

export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** The caller is not signed in (or the token expired). */
  get isAuthFailure() {
    return this.status === 401;
  }

  /** The backend could not be reached at all. */
  get isOffline() {
    return this.code === 'network_error';
  }
}

// ── session token ───────────────────────────────────────────────────────
let memorySession = null;

/**
 * The token lives in localStorage so a reload keeps you signed in, with an
 * in-memory mirror so the app still works when storage is unavailable
 * (private browsing, blocked third-party storage).
 */
export function loadSession() {
  if (memorySession) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    memorySession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  memorySession = session;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable — the in-memory mirror carries this tab.
  }
}

export function clearSession() {
  memorySession = null;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}

function authHeaders() {
  const session = loadSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

// ── core request ────────────────────────────────────────────────────────
/**
 * @param {string} path   path below `/api`, e.g. `/campaigns/1`
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {unknown} [options.body]       JSON-serialized when present
 * @param {AbortSignal} [options.signal] caller-controlled cancellation
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.auth]       set false for public endpoints
 * @param {'json'|'blob'|'text'} [options.as]
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = true,
    as = 'json',
    headers: extraHeaders,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  // Caller-driven aborts (unmount, user cancel) must also stop the request.
  const onExternalAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onExternalAbort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(auth ? authHeaders() : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error; // the caller cancelled; let it propagate
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ApiError(
        `The backend did not respond within ${Math.round(timeoutMs / 1000)}s.`,
        'timeout',
        0,
      );
    }
    throw new ApiError('The backend is unreachable.', 'network_error', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onExternalAbort);
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return null;
  if (as === 'blob') return response.blob();
  if (as === 'text') return response.text();

  // A 2xx with a non-JSON body is a backend contract break, not a crash site.
  try {
    return await response.json();
  } catch {
    throw new ApiError('The backend returned a malformed response.', 'bad_response', response.status);
  }
}

/** Normalize the backend's `{error: {code, message, details}}` envelope. */
async function readError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error body (proxy error page, 502 from a dead backend).
  }
  const error = body?.error;
  if (error?.message) {
    return new ApiError(error.message, error.code ?? 'http_error', response.status, error.details);
  }
  if (response.status === 401) {
    return new ApiError('Sign in to continue.', 'auth_required', 401);
  }
  if (response.status === 413) {
    return new ApiError('That file is too large to upload.', 'request_too_large', 413);
  }
  return new ApiError(`Request failed (${response.status}).`, 'http_error', response.status);
}

// ── system ──────────────────────────────────────────────────────────────
/** GET /api/health — backend status, version, and current mode. */
export function getHealth(signal) {
  return request('/health', { auth: false, signal, timeoutMs: 8000 });
}

/** GET /api/modes — provider, seal, auth and storage configuration status. */
export function getModes(signal) {
  return request('/modes', { auth: false, signal, timeoutMs: 8000 });
}

// ── auth ────────────────────────────────────────────────────────────────
function adoptSession(payload) {
  const session = {
    token: payload.token,
    expiresAt: payload.expires_at,
    account: payload.account,
    ephemeralSigningKey: payload.ephemeral_signing_key,
  };
  saveSession(session);
  return session;
}

export async function register({ email, password, displayName }) {
  const payload = await request('/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, password, display_name: displayName || null },
  });
  return adoptSession(payload);
}

export async function login({ email, password }) {
  const payload = await request('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  return adoptSession(payload);
}

/** Password-less sign-in. Available only while the backend runs in mock mode. */
export async function demoLogin() {
  const payload = await request('/auth/demo', { method: 'POST', auth: false, body: {} });
  return adoptSession(payload);
}

export function getAccount(signal) {
  return request('/auth/me', { signal });
}

export function logout() {
  clearSession();
}

// ── campaigns ───────────────────────────────────────────────────────────
export function listCampaigns({ limit = 50, signal } = {}) {
  return request(`/campaigns?limit=${encodeURIComponent(limit)}`, { signal });
}

export function getCampaign(campaignId, signal) {
  return request(`/campaigns/${campaignId}`, { signal });
}

/** Create a campaign from typed text. */
export function createTextCampaign({ text, languageHint, shopId } = {}) {
  return request('/campaigns', {
    method: 'POST',
    timeoutMs: 60_000, // extraction runs inline
    body: {
      text,
      ...(languageHint ? { language_hint: languageHint } : {}),
      ...(shopId ? { shop_id: shopId } : {}),
    },
  });
}

/**
 * Create a campaign from recorded audio.
 * The backend accepts base64 in the JSON body; `blobToBase64` does the encode.
 */
export async function createAudioCampaign({ blob, mimeType, languageHint, shopId } = {}) {
  const audioB64 = await blobToBase64(blob);
  return request('/campaigns', {
    method: 'POST',
    timeoutMs: 120_000, // upload + transcription + extraction
    body: {
      audio_b64: audioB64,
      audio_mime: mimeType || blob?.type || 'audio/webm',
      ...(languageHint ? { language_hint: languageHint } : {}),
      ...(shopId ? { shop_id: shopId } : {}),
    },
  });
}

export function extractFacts(campaignId) {
  return request(`/campaigns/${campaignId}/extract`, { method: 'POST', timeoutMs: 60_000 });
}

// ── fact sheets ─────────────────────────────────────────────────────────
export function getFactSheet(sheetId, signal) {
  return request(`/factsheets/${sheetId}`, { signal });
}

/** PATCH only the sections the owner actually edited. */
export function patchFactSheet(sheetId, patch) {
  return request(`/factsheets/${sheetId}`, { method: 'PATCH', body: patch });
}

export function lockFactSheet(sheetId) {
  return request(`/factsheets/${sheetId}/lock`, { method: 'POST' });
}

// ── plan ────────────────────────────────────────────────────────────────
export function createPlan(campaignId) {
  return request(`/campaigns/${campaignId}/plan`, { method: 'POST', timeoutMs: 90_000 });
}

export function getPlan(campaignId, signal) {
  return request(`/campaigns/${campaignId}/plan`, { signal });
}

// ── assets ──────────────────────────────────────────────────────────────
export function listAssets(campaignId, signal) {
  return request(`/campaigns/${campaignId}/assets`, { signal });
}

export function generatePosters(campaignId, variants = 1) {
  return request(`/campaigns/${campaignId}/assets/posters`, {
    method: 'POST',
    body: { variants },
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

export function generateCaptions(campaignId) {
  return request(`/campaigns/${campaignId}/assets/captions`, {
    method: 'POST',
    timeoutMs: 60_000,
  });
}

/**
 * Asset bytes require the bearer token, which the browser will not attach to a
 * plain `<img src>`. Fetch the blob and hand back an object URL instead; the
 * caller revokes it when the element unmounts.
 */
export async function fetchAssetObjectUrl(assetId, signal) {
  const blob = await request(`/campaigns/assets/${assetId}/file`, {
    signal,
    as: 'blob',
    timeoutMs: 60_000,
  });
  return URL.createObjectURL(blob);
}

// ── voice ───────────────────────────────────────────────────────────────
export function listVoiceProfiles(signal) {
  return request('/voice-profiles', { signal });
}

export async function createVoiceProfile({
  displayName,
  consentConfirmed,
  consentRecord,
  referenceBlob,
  referenceMime,
  referenceTranscript,
  campaignId,
}) {
  const referenceAudioB64 = referenceBlob ? await blobToBase64(referenceBlob) : null;
  return request('/voice-profiles', {
    method: 'POST',
    timeoutMs: 120_000,
    body: {
      display_name: displayName,
      consent_confirmed: Boolean(consentConfirmed),
      consent_record: consentRecord ?? null,
      reference_audio_b64: referenceAudioB64,
      reference_audio_mime: referenceMime || referenceBlob?.type || null,
      reference_transcript: referenceTranscript ?? null,
      campaign_id: campaignId ?? null,
    },
  });
}

export function deleteVoiceProfile(profileId) {
  return request(`/voice-profiles/${profileId}`, { method: 'DELETE' });
}

export function generateVoice(campaignId, { profileId, language }) {
  return request(`/campaigns/${campaignId}/voice`, {
    method: 'POST',
    body: { profile_id: profileId, language },
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

// ── video jobs ──────────────────────────────────────────────────────────
export function queueVideoJob(campaignId, { profileId } = {}) {
  return request(`/campaigns/${campaignId}/videos/jobs`, {
    method: 'POST',
    body: { profile_id: profileId ?? null },
  });
}

export function listVideoJobs(campaignId, signal) {
  return request(`/campaigns/${campaignId}/videos/jobs`, { signal });
}

export function runVideoJob(jobId) {
  return request(`/campaigns/videos/jobs/${jobId}/run`, {
    method: 'POST',
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

// ── guardian ────────────────────────────────────────────────────────────
export function verifyCampaign(campaignId) {
  return request(`/campaigns/${campaignId}/verify`, { method: 'POST', timeoutMs: 120_000 });
}

export function repairAsset(assetId) {
  return request(`/assets/${assetId}/repair`, { method: 'POST', timeoutMs: GENERATION_TIMEOUT_MS });
}

/**
 * Record an explicit owner decision on an *inconclusive* Guardian verdict
 * (NEEDS_REVIEW / WARN). A hard FAIL is refused by the backend, and the
 * Guardian rows are kept, so this never turns a failure into a silent pass.
 */
export function humanVerifyAsset(assetId, note) {
  return request(`/assets/${assetId}/human-verify`, {
    method: 'POST',
    body: { attestation: true, note: note || null },
  });
}

export function issueCertificate(campaignId) {
  return request(`/campaigns/${campaignId}/certificate`, { method: 'POST', timeoutMs: 60_000 });
}

export function getCertificateHtml(campaignId, signal) {
  return request(`/campaigns/${campaignId}/certificate/html`, { signal, as: 'text' });
}

// ── publishing / export ─────────────────────────────────────────────────
export function getPublishCapabilities(campaignId, signal) {
  return request(`/campaigns/${campaignId}/publish/capabilities`, { signal, timeoutMs: 45_000 });
}

export function preparePublish(campaignId, { assetId, platform, mediaKind }) {
  return request(`/campaigns/${campaignId}/publish/prepare`, {
    method: 'POST',
    body: { asset_id: assetId, platform, media_kind: mediaKind },
    timeoutMs: 45_000,
  });
}

export function approvePublish(publishId) {
  return request(`/campaigns/publish/${publishId}/approve`, { method: 'POST' });
}

export function executePublish(publishId) {
  return request(`/campaigns/publish/${publishId}/execute`, { method: 'POST', timeoutMs: 60_000 });
}

export function listPublishRecords(campaignId, signal) {
  return request(`/campaigns/${campaignId}/publish/records`, { signal });
}

export function exportCampaign(campaignId, signal) {
  return request(`/campaigns/${campaignId}/publish/export`, { signal, timeoutMs: 45_000 });
}

// ── helpers ─────────────────────────────────────────────────────────────
/** Base64 (no data-URL prefix) for a recorded or selected audio blob. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(new ApiError('No audio was captured.', 'empty_audio', 0));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new ApiError('That audio file could not be read.', 'invalid_audio', 0));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Human-readable message for anything thrown by this module. */
export function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  if (error?.name === 'AbortError') return 'Cancelled.';
  return error?.message || 'Something went wrong.';
}
