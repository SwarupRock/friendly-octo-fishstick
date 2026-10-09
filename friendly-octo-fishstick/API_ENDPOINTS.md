# API_ENDPOINTS — Titan

Status vocabulary (handoff §8):
`IMPLEMENTED_AND_LIVE_VERIFIED` | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `MOCK_ONLY` | `UNAVAILABLE` | `UNSUPPORTED`

## Integration registry

| Integration | Status | Notes |
| --- | --- | --- |
| Agnes 3.0 Flash (LLM: extraction/planning/copy) | `IMPLEMENTED_NOT_LIVE_VERIFIED` | Real client `POST {base}/chat/completions`, model `agnes-3.0-flash`, bearer auth. Gated behind `TITAN_AGNES_API_*` + `TITAN_AGNES_INTERFACE_VERIFIED=1`. Offline mode uses deterministic token-safe mock planner. No live call has been made. |
| Agnes Image 2.5 Flash | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `POST {base}/images/generations`; `response_format` under `extra_body`. Art failures degrade to labelled Pillow fallback. Never used for critical typography. |
| Agnes Video 2.5 | `IMPLEMENTED_NOT_LIVE_VERIFIED` | Async `POST {base}/videos` + poll; slot exists in config. FFmpeg compositor is the reliable core (used by default). |
| Sarvam Saaras v4 STT | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `POST /speech-to-text`, model `saaras:v4`, `api-subscription-key` header. Mock STT labelled `is_mock` in offline mode. |
| Sarvam voice cloning | `IMPLEMENTED_NOT_LIVE_VERIFIED` | `POST /voices/create` → persist `voice_id`; `POST /voices/clone` (text ≤1000 chars, sentence-split chunking); base64 audio decode + WAV probe. Mocks labelled `mock_cloned_voice`. |
| Windsor.ai MCP | `IMPLEMENTED_NOT_LIVE_VERIFIED` | Streamable HTTP JSON-RPC `tools/call` (`get_current_user`, `get_connectors`, `list_actions`, `execute_action`). Mock mode never calls social endpoints. Only organic writes. Docs to re-verify: `https://mcp.windsor.ai/llms-full.txt`. |
| Firebase Auth/Firestore/Storage | `UNAVAILABLE` (release blocker) | Not implemented. Production data layer is SQLAlchemy/SQLite + filesystem storage, per source-of-truth §61 (kept for the hackathon). Handoff §1 marks Firebase as blocking prerequisite for a production release — see OPERATIONS.md "Release blockers". |
| faster-whisper local STT fallback | `IMPLEMENTED_NOT_LIVE_VERIFIED` | Lazy-load; typed input remains the final fallback. |

## Endpoints (all under `/api`)

| Method & path | Auth | Description | Limits/state |
| --- | --- | --- | --- |
| `GET /health`, `GET /modes` | none | Health; provider/fallback status | truthful labels |
| `POST /campaigns` | none (dev) | Typed text or base64 audio → STT → extraction | audio ≤25 MB; auto-extract; graceful manual-entry fallback |
| `GET /campaigns`, `GET /campaigns/{id}` | none (dev) | List/detail with factsheet + audit | limit ≤200 |
| `POST /campaigns/{id}/extract` | none (dev) | Re-extract (409 if locked) | |
| `GET/PATCH/POST /factsheets/{id}[/lock]` | none (dev) | Edit → renormalize → rehash; idempotent lock | seal secret required for lock (503 otherwise) |
| `POST /campaigns/{id}/plan` | none (dev) | CampaignPlan (409 if unlocked or seal-invalid) | persisted, idempotent per factsheet version |
| `GET /campaigns/{id}/plan` | none (dev) | Plan + substituted copy (master + localized) | fails closed on unresolved tokens |
| `POST /campaigns/{id}/assets/posters` | none (dev) | Compose posters (registry + checksum) | budget `TITAN_MAX_POSTERS` |
| `POST /campaigns/{id}/assets/captions` | none (dev) | Materialize substituted captions | |
| `GET /campaigns/{id}/assets` | none (dev) | Assets + verification matrix | |
| `GET /campaigns/assets/{id}/file` | none (dev) | Asset bytes | PNG |
| `POST /voice-profiles` | owner_uid (dev) | Create profile; consent REQUIRED (422 without) | reference audio ≤50 MB; `voice_id` persisted & reused |
| `GET/DELETE /voice-profiles[/{id}]` | owner_uid (dev) | List/get/delete (deletes reference audio) | owner isolation |
| `POST /campaigns/{id}/voice` | owner_uid (dev) | Localized cloned voice asset | 5 languages; unsupported → 422; chunks ≤1000 chars; WAV probe |
| `POST /campaigns/{id}/videos/jobs` | none (dev) | Queue reel job (needs poster; budget-capped) | FFmpeg core; job states persisted |
| `POST /campaigns/videos/jobs/{id}/run` | none (dev) | Drive job to terminal state | idempotent for COMPLETED |
| `POST /campaigns/{id}/verify` | none (dev) | Guardian over all assets | deterministic-first |
| `POST /assets/{id}/repair` | none (dev) | Bounded repair (≤2 auto attempts) | manual review after |
| `POST /campaigns/{id}/certificate` | none (dev) | Verification Certificate (HMAC seal) | seal secret required |
| `GET /campaigns/{id}/certificate/html` | none (dev) | Readable HTML certificate | |
| `POST /demo/sabotage/{asset_id}` | flag+owner (dev) | Sabotage demo on a COPY | requires `TITAN_ENABLE_DEMO_SABOTAGE=true` AND mock mode; original untouched |
| `GET /campaigns/{id}/publish/capabilities` | none (dev) | Discover connectors/actions | only organic writes |
| `POST /campaigns/{id}/publish/prepare` | owner_uid (dev) | Bind asset+caption→destination | schema-validated |
| `POST /campaigns/publish/{id}/approve` | none (dev) | Explicit owner approval | binds caption hash + asset hashes |
| `POST /campaigns/publish/{id}/execute` | none (dev) | Execute approved publication | mock mode: only sandbox (+wa.me); real posts need live config |
| `GET /campaigns/{id}/publish/export` | none (dev) | Manual-ready export bundle | |

## Live-verification procedure (to move a row to LIVE_VERIFIED)

1. Configure credentials in the environment (never in files).
2. Set the corresponding `_INTERFACE_VERIFIED=1` toggle only after re-checking the
   official docs and one recorded smoke call.
3. Record the request/response evidence in `IMPLEMENTATION_PLAN.md`.

## Known limits / caveats

- Every AI/media provider currently degrades to an honestly labelled mock when
  unconfigured — the UI/API never implies a live model produced output.
- ASR round-trip in mock mode reports `NEEDS_REVIEW` (disclosed limitation),
  never a pass.
- OCR (`tesseract`) is optional: without it, poster checks record the
  limitation as `NEEDS_REVIEW`; the compositor registry remains authoritative.
- Certificate seal is HMAC (symmetric); **not** a public-key signature.
- Owner isolation currently relies on the explicit `owner_uid` parameter —
  production deployment requires Firebase ID-token verification before any
  public use (see OPERATIONS.md).
