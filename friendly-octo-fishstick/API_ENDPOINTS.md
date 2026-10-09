# API_ENDPOINTS — Titan

Status vocabulary (handoff §8):
`IMPLEMENTED_AND_LIVE_VERIFIED` | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `MOCK_ONLY` | `UNAVAILABLE` | `UNSUPPORTED`

## Integration registry

| Integration | Status | Notes |
| --- | --- | --- |
| Agnes 3.0 Flash (extraction, semantic fact validation, Campaign Director) | `IMPLEMENTED_AND_LIVE_VERIFIED` | `POST {base}/chat/completions`, bearer auth. No `response_format` is sent (the model guide documents no JSON mode); JSON is requested in the prompt and validated by deterministic schemas with bounded repair attempts. Live run 2026-10-09: extraction, semantic validation and a full Director plan (English + Devanagari Hindi copy) succeeded. Gate: `TITAN_MODE=live` + `TITAN_AGNES_API_KEY`. |
| Agnes Image 2.5 Flash | `IMPLEMENTED_AND_LIVE_VERIFIED` | `POST {base}/images/generations` with `size: "1K"`, `ratio: "3:4"`, `extra_body.response_format: "url"`. Prompt = the Director's poster brief + product/audience/location (never numbers). Returned bytes are decoded before use. Live run 2026-10-09: poster composed on model art. A failure is an error unless the caller sets `allow_fallback_art`. |
| Agnes Video 2.5 | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `POST {base}/videos` (`mode: text`, `seconds`, `size: 720P`, `aspect_ratio`) then `GET {host}/agnesapi?video_id=…&model_name=…` until `completed` (top-level `url`) or `failed`. Persistent job with throttled polling, deadline, download + container check. Live attempt 2026-10-09 was rejected by the provider with `403 Insufficient user quota` (account balance), so the completed path is covered by tests only. |
| Sarvam Saaras STT | `IMPLEMENTED_AND_LIVE_VERIFIED` | `POST /speech-to-text` (multipart `file`, `model`, `language_code` — `unknown` auto-detects), `api-subscription-key` header. Live run 2026-10-09: transcribed Sarvam-generated speech back to the original sentence. The synchronous endpoint is meant for clips under ~30 s. No partial/streaming transcription is used; the UI shows recording → transcribing → transcript. |
| Sarvam Bulbul TTS | `IMPLEMENTED_AND_LIVE_VERIFIED` | `POST /text-to-speech` JSON `text` (≤2500 chars), `language_code`, `speaker`, `model: bulbul:v3`, `output_audio_codec: wav`; response `audios[0]` (base64 WAV). Live run 2026-10-09: English and Hindi speech generated and stored as voice assets. |
| Sarvam voice cloning | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `POST /voices/create` → persist `voice_id`; `POST /voices/clone` (text ≤1000 chars, sentence-split chunking); base64 audio decode + WAV probe. Mocks labelled `mock_cloned_voice`. No live clone has been run yet. |
| Windsor.ai MCP | `IMPLEMENTED_NOT_LIVE_VERIFIED` | Streamable HTTP JSON-RPC `tools/call` (`get_current_user`, `get_connectors`, `list_actions`, `execute_action`). Mock mode never calls social endpoints. Only organic writes. Docs to re-verify: `https://mcp.windsor.ai/llms-full.txt`. |
| Firebase Auth/Firestore/Storage | `UNAVAILABLE` (release blocker) | Not implemented. Production data layer is SQLAlchemy/SQLite + filesystem storage, per source-of-truth §61 (kept for the hackathon). Handoff §1 marks Firebase as blocking prerequisite for a production release — see OPERATIONS.md "Release blockers". |
| faster-whisper | `UNSUPPORTED` as a fallback | Sarvam is the only speech provider. The legacy class is used only if an operator sets `TITAN_STT_PROVIDER=faster-whisper` explicitly; `auto` never selects it. |

## Endpoints (all under `/api`)

| Method & path | Auth | Description | Limits/state |
| --- | --- | --- | --- |
| `GET /health`, `GET /modes` | none | Health; provider/fallback status | truthful labels |
| `POST /campaigns` | owner | Typed text or base64 audio → STT → extraction | audio ≤25 MB; auto-extract; graceful manual-entry fallback |
| `GET /campaigns`, `GET /campaigns/{id}` | owner | List/detail with factsheet + audit | limit ≤200 |
| `POST /campaigns/{id}/extract` | owner | Re-extract (409 if locked) | |
| `POST /campaigns/{id}/transcript` | owner | Typed recovery when STT failed: attach a transcript, then extract | 409 if a transcript exists |
| `POST /factsheets/{id}/validate` | owner | Deterministic rules + Agnes semantic validation; stored on the sheet as `validation` | model failure → `semantic.status = "unavailable"` (HTTP 200) |
| `GET/PATCH/POST /factsheets/{id}[/lock]` | owner | Edit → renormalize → rehash; idempotent lock | seal secret required for lock (503 otherwise) |
| `POST /campaigns/{id}/plan` | owner | Campaign Director plan. Optional body `{objective, tone, instructions, regenerate}` | idempotent per locked factsheet unless `regenerate`; live failure → 503, nothing stored |
| `GET /campaigns/{id}/plan` | owner | Plan + substituted copy (master + localized) | fails closed on unresolved tokens |
| `POST /campaigns/{id}/assets/posters` | owner | Compose posters. Body `{variants, allow_fallback_art}` | budget `TITAN_MAX_POSTERS`; live image failure → 503 unless `allow_fallback_art` |
| `POST /campaigns/{id}/assets/captions` | owner | Materialize substituted captions | |
| `GET /campaigns/{id}/assets` | owner | Assets + verification matrix | |
| `GET /campaigns/assets/{id}/file` | owner | Asset bytes | PNG |
| `POST /voice-profiles` | owner | Create profile; consent REQUIRED (422 without) | reference audio ≤50 MB; `voice_id` persisted & reused |
| `GET/DELETE /voice-profiles[/{id}]` | owner | List/get/delete (deletes reference audio) | owner isolation |
| `POST /campaigns/{id}/voice` | owner | Localized cloned voice asset | 5 languages; unsupported → 422; chunks ≤1000 chars; WAV probe |
| `GET /voice/options` | owner | TTS languages, speakers, channels | documented provider values only |
| `POST /campaigns/{id}/tts` | owner | Sarvam TTS of plan copy. Body `{language, speaker?, channel?}` → voice asset | budget `TITAN_MAX_VOICE_VARIANTS`; provider failure → 503, nothing stored |
| `POST /campaigns/{id}/videos/generate` | owner | Submit an Agnes AI video task (202). Body `{seconds 4–12, aspect_ratio}` | budget `TITAN_MAX_VIDEO_VARIANTS`; flag `TITAN_ENABLE_AGNES_VIDEO`; repeat while active returns the same job |
| `GET /campaigns/{id}/videos/jobs` | owner | All video jobs; each call advances active AI jobs by at most one throttled provider poll | states `running → validating → completed / failed / cancelled`; 15-minute deadline |
| `POST /campaigns/videos/jobs/{id}/cancel` | owner | Stop tracking an active job | 409 if already terminal |
| `POST /campaigns/{id}/videos/jobs` | owner | Queue local FFmpeg reel job (needs poster; budget-capped) | job states persisted |
| `POST /campaigns/videos/jobs/{id}/run` | owner | Drive job to terminal state | idempotent for COMPLETED |
| `POST /campaigns/{id}/verify` | owner | Guardian over all assets | deterministic-first |
| `POST /assets/{id}/repair` | owner | Bounded repair (≤2 auto attempts) | manual review after |
| `POST /campaigns/{id}/certificate` | owner | Verification Certificate (HMAC seal) | seal secret required |
| `GET /campaigns/{id}/certificate/html` | owner | Readable HTML certificate | |
| `POST /demo/sabotage/{asset_id}` | flag+owner | Sabotage demo on a COPY | requires `TITAN_ENABLE_DEMO_SABOTAGE=true` AND mock mode; original untouched |
| `GET /campaigns/{id}/publish/capabilities` | owner | Discover connectors/actions | only organic writes |
| `POST /campaigns/{id}/publish/prepare` | owner | Bind asset+caption→destination | schema-validated; server-side gate: only `verified`/`human_verified` assets accepted → 409 `asset_not_verified`; superseded facts → `asset_stale` |
| `POST /campaigns/publish/{id}/approve` | owner | Explicit owner approval | binds caption hash + asset hashes; re-checks asset verification → 409 `asset_not_verified`/`asset_stale` |
| `POST /campaigns/publish/{id}/execute` | owner | Execute approved publication | re-checks eligibility at execution time (→ 409 `approval_stale` if caption/artifact changed after approval); mock mode: only sandbox (+wa.me), real posts → 409 `mock_publish_blocked` |
| `GET /campaigns/{id}/publish/export` | owner | Manual-ready export bundle | |

## Live verification

Live calls are enabled by `TITAN_MODE=live` plus the provider key — there is no
separate verification toggle. `backend/smoke_live.py` makes one real call per
integration (and a TTS → STT round trip) and prints PASS/FAIL with the
normalized error code. Update the registry above from its output.

## Known limits / caveats

- Mock providers are used **only** in `TITAN_MODE=mock` and are always labelled
  (`is_mock`). In live mode an unconfigured or failing provider is an error.
- ASR round-trip in mock mode reports `NEEDS_REVIEW` (disclosed limitation),
  never a pass.
- OCR (`tesseract`) is optional: without it, poster checks record the
  limitation as `NEEDS_REVIEW`; the compositor registry remains authoritative.
- Certificate seal is HMAC (symmetric); **not** a public-key signature.
- Owner isolation currently relies on the explicit `owner_uid` parameter —
  production deployment requires Firebase ID-token verification before any
  public use (see OPERATIONS.md).
