# TITAN — PHASE 5B THROUGH RELEASE
## Full Implementation Handoff for GPT-6 Astra

**Repository:** `https://github.com/SwarupRock/friendly-octo-fishstick`  
**Architecture source of truth:** `TITAN_SOURCE_OF_TRUTH.md`  
**Progress tracker:** `IMPLEMENTATION_PLAN.md`  
**Scope:** Finish Phase 5B and implement Phases 6–9.  
**Secrets:** All credentials below are placeholders. Configure them locally or in a secret manager. Never paste secrets into prompts/chat, commit them, return them to the frontend, or print them in logs.

---

# 0. INSTRUCTIONS TO GPT-6 ASTRA

You are the senior engineer completing Titan Marketing OS. Read `TITAN_SOURCE_OF_TRUTH.md`, `IMPLEMENTATION_PLAN.md`, and relevant code/tests before editing. Inspect the actual repository; do not assume a phase is complete merely because an earlier summary says so.

Implement in order: **preflight → Phase 5B → Phase 6 → Phase 7 → Phase 8 → Phase 9**. After each phase, run its tests, the full backend suite, frontend type-check/build, and update `IMPLEMENTATION_PLAN.md` with evidence. Continue only when the phase's acceptance criteria pass. If credentials are unavailable, complete tested mocks/fakes where safe and mark live integration `UNVERIFIED`; never fabricate successful calls.

Do not ask the developer to paste API keys into chat. Give them exact environment-variable names. Do not commit, push, force-push, deploy billable cloud resources, or overwrite user changes without explicit authorization.

## Locked architecture

- Frontend: React + TypeScript + Vite.
- Backend: Python + FastAPI.
- Production data: Firebase Authentication + Cloud Firestore.
- Production media: Firebase Cloud Storage.
- Deployment target: Google Cloud Run; use a durable task queue for long-running jobs where needed.
- Campaign intelligence: Agnes 3.0 Flash.
- STT: Sarvam Saaras v4 primary, faster-whisper local fallback, typed input final fallback.
- Voice cloning/TTS: Sarvam voice cloning API where supported.
- Images: Agnes Image 2.5 Flash for artwork + deterministic Pillow composition.
- Videos: Agnes Video 2.5 optional; FFmpeg compositor is the reliable path.
- Verification: deterministic Guardian first; OCR/ASR as perceptual checks; Agnes semantic critic advisory only.
- Publishing: Windsor.ai hosted MCP, dynamically discovered write actions, exact human approval, manual/export fallback.

Do not add another database/framework. If actual production paths still use SQLite/local storage, complete the Firebase migration before calling Titan production-ready. Firebase Admin SDK has privileged access and bypasses Firebase client Security Rules, so FastAPI must enforce authorization and owner isolation itself.

---

# 1. PREFLIGHT AUDIT AND BLOCKERS

Inspect and report these actual facts in `IMPLEMENTATION_PLAN.md`:

- Is Phase 5A voice creation/consent/profile ownership/Sarvam `voice_id` persistence complete?
- Are Firebase Auth, Firestore, and Storage implemented in production paths, or is the application still SQLite/filesystem-backed?
- Does every protected API verify the Firebase ID token and enforce campaign/shop/asset/profile ownership?
- Is Sarvam Saaras v4 wired into STT with request ID, language, provider, and fallback provenance?
- Is the Agnes gateway live-capable or mock-only? Have real requests ever been verified?
- Does Phase 3 `CampaignPlan` reference the correct locked FactSheet ID/version/hash/token map?
- Does Phase 4 poster generation/composition/validation exist and work?
- What do tests prove versus what remains mocked/unverified?
- What uncommitted changes must be preserved?

If Firebase is incomplete, make this a blocking prerequisite: implement Firestore persistence and Cloud Storage before continuing into release hardening. Store data metadata in Firestore and binary audio/image/video files in Storage. Prefer Application Default Credentials on Cloud Run; use a local service-account JSON only for development and never commit it. Add a real migration utility if existing data needs preservation; do not silently discard it. Deploy only with explicit user authorization.

---

# 2. CONFIGURATION PLACEHOLDERS

Create/update `.env.example`. Keep secrets blank or obviously placeholder-only:

```dotenv
TITAN_MODE=mock
APP_ENV=development
PUBLIC_APP_URL=http://localhost:5173
PUBLIC_API_URL=http://localhost:8000
LOG_LEVEL=INFO

# Agnes AI
AGNES_API_KEY=
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
AGNES_TEXT_MODEL=agnes-3.0-flash
AGNES_IMAGE_MODEL=agnes-image-2.5-flash
AGNES_VIDEO_MODEL=agnes-video-2.5

# Sarvam AI
SARVAM_API_KEY=
SARVAM_BASE_URL=https://api.sarvam.ai
SARVAM_STT_MODEL=saaras:v4

# Firebase / Google Cloud
FIREBASE_PROJECT_ID=REPLACE_WITH_FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET=REPLACE_WITH_STORAGE_BUCKET
GOOGLE_APPLICATION_CREDENTIALS=
# On Cloud Run prefer Application Default Credentials and a service identity.

# Fact Integrity
TITAN_HMAC_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET

# Media
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
TESSERACT_CMD=tesseract
ASSET_MAX_UPLOAD_MB=50
SIGNED_URL_TTL_SECONDS=900

# Durable jobs (optional for local development, expected for production long tasks)
TASKS_MODE=local
GOOGLE_CLOUD_PROJECT=REPLACE_WITH_GCP_PROJECT_ID
CLOUD_TASKS_LOCATION=REPLACE_WITH_REGION
CLOUD_TASKS_QUEUE=REPLACE_WITH_QUEUE_NAME
CLOUD_RUN_WORKER_URL=
CLOUD_TASKS_SERVICE_ACCOUNT=

# Windsor.ai MCP
WINDSOR_MCP_URL=https://mcp.windsor.ai/
WINDSOR_AUTH_MODE=oauth
WINDSOR_API_KEY=
WINDSOR_CONNECTOR_CACHE_SECONDS=300

# Optional fallback LLM (disabled unless deliberately configured)
FALLBACK_LLM_ENABLED=false
FALLBACK_LLM_BASE_URL=
FALLBACK_LLM_API_KEY=
FALLBACK_LLM_MODEL=

# Safety/feature flags
ENABLE_AGNES_VIDEO=true
ENABLE_VOICE_CLONING=true
ENABLE_WINDSOR_PUBLISHING=true
ENABLE_DEMO_SABOTAGE=false
```

Validate config at startup. Report provider state without returning secret values. Missing keys mean `NOT_CONFIGURED`; never mark a provider live because its slot exists. Do not enable/alter billing or deploy cloud resources automatically. Document any Firebase/Cloud Storage billing prerequisites accurately.

---

# 3. PHASE 5B — MULTILINGUAL CLONED-VOICE GENERATION

## Goal
Use a saved, consented shopkeeper voice profile to produce localized campaign voice ads while preserving the exact locked offer facts.

## Official Sarvam references — re-check before coding

- Overview: `https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/overview`
- Create voice: `https://docs.sarvam.ai/api-reference/voice-cloning/create-voice`
- Generate speech: `https://docs.sarvam.ai/api-reference/voice-cloning/clone`
- Supported languages: `https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/supported-languages`
- STT: `https://docs.sarvam.ai/api-reference/speech-to-text/transcribe`

**Current documented API contract:** Base URL `https://api.sarvam.ai`; auth header `api-subscription-key: $SARVAM_API_KEY`. Voice creation is `POST /voices/create`, multipart with `file`, `name`, and reference `language`. Save `data.voice_id` and returned `reference_text`. A clean, single-speaker clip of 10–15 seconds is recommended; current documented create upload maximum is 50 MB.

Cloned speech generation is `POST /voices/clone`, multipart. Pass `text`, `language_code`, and exactly one of saved `voice_id` or `ref_audio`; prefer a saved voice. Current docs set the request text maximum to 1,000 characters. The JSON response contains base64 `audio` and `request_id`; decode and validate the media. Split longer scripts at sentence boundaries and concatenate in order. Re-check all limits and the response schema against live official docs before implementing.

Initial target languages:
- English `en-IN`
- Hindi `hi-IN`
- Kannada `kn-IN`
- Tamil `ta-IN`
- Telugu `te-IN`

Use native script and appropriate `language_code`. Cross-lingual cloning is documented, but do not promise equal pronunciation quality across languages. Explicit consent and profile ownership are mandatory.

## Pipeline

```text
Locked FactSheet + validated CampaignPlan
                  ↓
        Owned, consented VoiceProfile
                  ↓
      Phase 3 LocalizationSpec/script
                  ↓
       Deterministic Fact Token substitution
                  ↓
             Script validation
                  ↓
          Sarvam voice synthesis
                  ↓
      Decode → probe → store audio in Storage
                  ↓
       Saaras ASR or faster-whisper round-trip
                  ↓
        Compare normalized claims to FactSheet
                  ↓
          VERIFIED / FAILED / NEEDS_REVIEW
```

## Requirements

1. Reuse Phase 5A provider/profile services; do not create a new voice profile per language/campaign.
2. Every profile must belong to an authenticated owner/shop and have explicit recorded consent. Do not clone a voice without authority to use it. Provide deletion that removes profile references and requests provider-side deletion when supported.
3. Persist campaign, owner, voice profile ID, FactSheet ID/version/hash, locale, region/audience, script/template hash, provider/model/request ID, Storage object path, SHA-256 checksum, generation state, validation verdict, mock/fallback markers, and audit event.
4. Keep audio private in Firebase Storage. Use short-lived signed URLs only when required; do not expose voice reference audio publicly.
5. Reuse Phase 3 localization instead of introducing a new serial AI agent. Adapt idiom, formality, pace, and tone without stereotypes, forced slang, invented claims or offers.
6. Script must be generated as tokenized templates. Validate tokens, numerics and unsupported claims before synthesis. Substitute authoritative values in deterministic code.
7. ASR round-trip must check price, discount, product/inclusions, validity dates/days/times, eligibility and conditions. If ASR fails, is low-confidence, or cannot support a language, mark `NEEDS_REVIEW`; never falsely pass it.
8. Maximum two automatic repair attempts. Each repair requires new synthesis and full applicable re-verification. After repeated failure, require human review.
9. Store voice similarity only if the provider supplies a real metric; otherwise don't invent a score. Keep similarity, pronunciation, language quality and fact integrity as different fields.
10. Use bounded retries for transient network/5xx/429 errors only. Do not retry 401/403 or invalid requests blindly. Stable idempotency keys must prevent duplicate billed synthesis on refresh/retry where practical.
11. TTS fallback must not be labelled as the shopkeeper's cloned voice. All mock/prebaked audio must be clearly labelled and provenance recorded.
12. Add authenticated routes for localized voice generation, list/get audio assets, controlled playback/download, regeneration and validation report. Match existing API conventions.
13. Extend Voice Studio with locale/region/audience selection, play/download, progress, provider info and verification status.

## Tests / exit gate

Test profile ownership/consent, supported-language routing, saved voice reuse, chunk ordering/limits, base64 decode, bad audio, tokens/claims, ASR fact mutations, low-confidence/unavailable ASR, provider 401/403/429/5xx/timeouts, Storage failure, mock labels, idempotency and deletion. Full backend/frontend regression checks pass. Without keys, test with fakes and mark live provider as unverified.

**Phase 5B is done** when the system can synthesize at least one supported localized campaign voice asset from a locked campaign using an owned, consented saved voice ID, with provenance and an honest Guardian verdict.

---

# 4. PHASE 6 — VIDEO GENERATION + FFmpeg COMPOSITION

## Goal
Deliver a verified promotional reel reliably. Agnes Video is an enhancement; FFmpeg is the dependable core.

## Official Agnes references — re-check request/response schemas before coding

- Video: `https://wiki.agnes-ai.com/en/docs/agnes-video-25`
- Image: `https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash`

Current documented endpoints:

- Create: `POST https://apihub.agnes-ai.com/v1/videos`
- Model: `agnes-video-2.5`
- Poll/retrieve: `GET https://apihub.agnes-ai.com/agnesapi?video_id={VIDEO_ID}&model_name=agnes-video-2.5`
- Auth: `Authorization: Bearer $AGNES_API_KEY`

The API is asynchronous. Persist `video_id`; task `id`/`task_id` are not a replacement for `video_id` when retrieving results. Poll with bounded interval/backoff until the status is `completed` or `failed`; on completion retrieve and validate the actual output URL/file. Follow the latest official schema; do not assume a task-creation response means the video exists.

## Architecture

```text
CampaignPlan + locked facts + validated scripts/art
                            ↓
                       Versioned VideoSpec
                            ↓
           ┌────────────────┴─────────────────┐
           ↓                                  ↓
 Optional Agnes Video clips          FFmpeg reliable core
           ↓                          art/stills + motion
           └────────────────┬─────────────────┘
                            ↓
 FFmpeg overlays + subtitles + voiceover + optional music + end card
                            ↓
                ffprobe + OCR + ASR + Guardian
                            ↓
                   verified video asset
```

## Requirements

- Create a versioned `VideoSpec`: target duration/aspect ratio, scene order/timing, source assets, motion, overlays, language, selected voice asset, subtitles, CTA and end card.
- Support configurable 9:16 vertical as default and optional 1:1/16:9 outputs when feasible.
- Call Agnes Video only when enabled/configured and within a budget. Respect current rate/quota limits. Use a persistent video task queue and bounded concurrency.
- Poll asynchronously with backoff; record job ID, provider task ID, attempts, next poll time, error, timestamps and final URL/object path. Recover tasks after process restart and avoid duplicate submissions.
- Compose a polished fallback reel from art/posters using FFmpeg (Ken Burns movement, clean transitions, deterministic factual overlays, captions, voiceover, optional background music and end card).
- Never rely on generative visual model typography for critical data. Use deterministic overlays for shop name, product, price/discount, dates, times, eligibility, CTA and contact information.
- Mix music below speech and normalize audio. If TTS/voice fails, provide a captioned silent or music-only reel and label its voice status accurately.
- Use FFmpeg/ffprobe through subprocess argument arrays, never shell-concatenated commands. Validate/probe inputs, limit duration/resolution/file sizes, clean temporary files, and handle process timeouts.
- Store media in Firebase Storage; metadata in Firestore. For media references consumed by an external provider, provide only the necessary short-lived accessible URL where supported.
- Persist prompt/spec hash, facts hash/version, provider/model, all source asset IDs, output checksum, overlay registry, voice asset ID, mock/fallback markers and verification status.
- Prebaked demo output is allowed only as an explicit, visibly labelled fallback.

## Jobs

States: `QUEUED`, `RUNNING`, `COMPOSING`, `VALIDATING`, `RETRYING`, `COMPLETED`, `FAILED`, `NEEDS_REVIEW`, `CANCELLED`.

Use Firestore-persisted status and stable IDs. In production, do not rely solely on an in-memory `asyncio.create_task()`. Use authenticated Cloud Tasks → Cloud Run worker or an equally durable mechanism for long tasks. Ensure idempotent processing and prevent concurrent workers from completing the same job twice.

## Tests / exit gate

Test live-client request/response mapping with fakes, timeouts/rate limits/retries, polling to terminal state, interrupted/restarted tasks, duplicate jobs, FFmpeg success/failure/timeout/invalid media, overlay substitution, final frame OCR, ASR mismatch, missing voice/music, Storage failure, and mock labels. Full tests/builds pass.

**Phase 6 is done** when the system delivers a playable saved reel through either Agnes Video or the deterministic FFmpeg path and does not claim success until the actual file is available and validated.

---

# 5. PHASE 7 — GUARDIAN, REPAIR, CERTIFICATE, CAMPAIGN WORKSPACE

## Goal
Make fact integrity demonstrable across captions, translations, posters, voice ads and videos. Guardian is deterministic-first. Agnes is advisory only and cannot override a deterministic failure.

## Required text checks
- Correct locked FactSheet ID/version/hash for each asset.
- Required tokens present before substitution; no unresolved tokens after substitution.
- Required fact presence and parity: price, discount, product, quantity, days, times, date, eligibility, conditions, business identity and CTA as applicable.
- Detect all numeric values and map each to an explicit locked fact or a defined safe derivation. Unmapped numbers fail.
- Detect unsupported claims: fabricated scarcity, first-N-customers claims, freebies, guarantees, superlatives, fabricated reviews/testimonials, awards/certifications, invented URLs/phone numbers, unsupported urgency and unapproved commercial conditions.
- Enforce localized semantic preservation and channel constraints.
- Any locked-fact mutation is a critical failure.

Use structured claim provenance when possible. Do not assume numeric validation catches every unsupported factual statement. Maintain deterministic patterns/rules plus an advisory semantic critic; uncertain unknown claims become `NEEDS_REVIEW`.

## Poster checks
- Registry records every string the deterministic compositor intended to draw.
- Validate registry against locked values and token map.
- OCR controlled fact zones after crop/grayscale/upscale/threshold.
- Compare OCR against expected render with conservative normalizers/fuzzy match, particularly around `0/O`, currency symbols and Indic scripts.
- The registry records intended text; OCR checks pixels. They are complementary, not two independent cryptographic proofs.
- If OCR is unavailable/weak for a script, record that limitation and use the defined policy; never silently report a skipped critical check as passed.

## Voice checks
- Validate exact token-substituted script before synthesis.
- ASR round-trip, normalize recognized text and compare critical facts.
- Low-confidence/unavailable ASR → `NEEDS_REVIEW`; critical mismatch → `FAILED`.

## Video checks
- Verify file via `ffprobe`, dimensions, duration and audio stream.
- Sample final frames and frames around overlay transitions; OCR deterministic fact zones.
- ASR final mixed audio; compare against facts and approved voice script.
- Check subtitle/overlay registry and end card. A correct intermediate script does not prove the final muxed media is correct.

## Verdicts and trust score
Use `PASS`, `FAIL`, `WARN`, `NEEDS_REVIEW`; asset statuses should include `PENDING`, `GENERATING`, `VALIDATING`, `VERIFIED`, `FAILED`, `NEEDS_REVIEW`, `APPROVED`, `HUMAN_VERIFIED`, and `SUPERSEDED` as appropriate.

- Any critical integrity failure → `FAILED`, no matter the aggregate score.
- Required check unavailable/low confidence → `NEEDS_REVIEW`.
- Only all required checks passing with no unresolved critical warnings → `VERIFIED`.
- If using an aggregate trust score, normalize over applicable checks only. It is informational and never replaces hard gates.
- Record check method/version, evidence, confidence, timestamp, expected and detected values, and failure explanation.

## Repair loop

- Maximum two automatic repair/regeneration attempts.
- Repair only failing assets when safe.
- Persist diagnostics and every attempt.
- Re-run the full applicable check set after repair.
- Repeated failure → manual edit/review; never bypass Guardian.
- Any human edit changes the artifact checksum and invalidates its previous validation/approval/certificate. Re-verify after every edit.

## Cross-asset consistency

Every asset must bind to one FactSheet version. Compare offer, price, days, times, dates, products, conditions, audience restrictions and CTA across channel copy, poster, audio, video and all locales. Localized wording may differ, but business meaning must not change.

## Verification Certificate

Generate JSON and readable HTML containing:
- certificate schema/version;
- campaign/owner IDs;
- FactSheet ID/version/hash and seal reference;
- CampaignPlan ID/version;
- all asset IDs, SHA-256 checksums, provider/model, `is_mock`/fallback states;
- Guardian version and per-check verdicts/evidence/timestamps/confidence;
- repair history;
- final verdict and issuance time.

Call this a **Verification Certificate** and **HMAC integrity seal**, not a public-key digital signature. The HMAC secret must never leave the backend. Verification should recompute hashes and detect changed files/assets.

## Sabotage demo

Keep `ENABLE_DEMO_SABOTAGE=false` by default and reject the feature in production. It must corrupt a copy/test artifact, never authoritative facts or an approved stored artifact. Fixtures should mutate `20% → 25%`, `Saturday → Sunday`, and add `first 50 customers`. Show deterministic diagnostics, repair, newly generated checksum and re-verification. Never let the sabotage endpoint change source-of-truth records.

## Campaign workspace

Finish screens/routes for campaign strategy, channel copy, poster/video/voice preview, asset verdicts, verification matrix, repair log, audit timeline, owner approval, asset regeneration/edit, export ZIP, certificate/report download. Approval must bind to exact asset hashes, destination/account and caption hash. Any change invalidates affected approvals.

## Tests / exit gate

Test mutations, invented claims, missing facts, localization drift, unavailable OCR/ASR, bounded repair, stale approval invalidation, certificate hash/HMAC verification and tamper detection, ownership, and export integrity. Full regression suite passes.

**Phase 7 is done** when every supported final asset has a truthful, traceable verification result and no failed/uncertain asset can be silently approved.

---

# 6. PHASE 8 — WINDSOR.AI MCP PUBLISHING

## Goal
Publish approved content only through a write action that the authenticated Windsor connector actually exposes and supports. Unsupported platforms/media always fall back to manual/export.

## Official docs — re-check during implementation

- `https://mcp.windsor.ai/`
- `https://mcp.windsor.ai/llms.txt`
- `https://mcp.windsor.ai/llms-full.txt`
- `https://mcp.windsor.ai/datasources`
- `https://mcp.windsor.ai/actions`
- OAuth discovery: `https://mcp.windsor.ai/.well-known/oauth-authorization-server`

Current published service details:
- Hosted MCP URL: `https://mcp.windsor.ai/`
- Streamable HTTP: `POST /`
- SSE endpoint: `GET /sse/`
- OAuth 2.0 is recommended; bearer API-key auth is documented as an alternative.
- Tools include `get_current_user`, `get_connectors`, `get_connector_connect_info`, `get_connector_authorization_url`, `list_actions`, `execute_action`.

**Capability warning:** current docs explicitly list Instagram image-post creation/comments as organic write actions. Facebook Organic/X Organic appearing as data connectors does not prove they have organic publishing write actions. Do not assume Instagram Reels/video publishing either. Discover actual tools/actions and JSON schemas live for the connected account before enabling a capability.

## Integration rules

1. Use a real MCP client SDK and its supported transport/protocol. Do not pretend MCP tools are generic REST endpoints or hard-code guessed tool schemas.
2. Prefer OAuth flow; otherwise use a Windsor API key as a backend-only bearer secret where supported. Do not ask users to paste social passwords/cookies into Titan.
3. Call `get_current_user`/`get_connectors` and then `list_actions` as applicable. Cache discovery briefly and refresh after capability errors and before publication when needed.
4. Validate payloads against discovered action schemas locally before asking the tool to execute.
5. Show the exact connected account, channel, asset preview, caption and action to the user. Require explicit owner approval for that exact publication operation.
6. Only report `PUBLISHED` after a successful action response; save the response/request/platform ID where exposed. Tool invocation or task creation is not publication success.
7. Make retries idempotent where provider supports it. If not, track attempted operations and require review before retrying ambiguous outcomes.
8. Never let publishing mutate assets/facts/approvals. Bind approvals to checksums, caption hash, destination and action ID/schema.
9. If an action/type isn't supported, set `MANUAL_REQUIRED`, offer ready-to-post ZIP/caption/preview and a safe link if supported.
10. For multi-tenant use, verify whether Windsor's auth and connected-account model safely isolates shops. Don't share an unrelated shop's account by default.
11. Do not implement or execute paid advertising spend, campaign budgets, bidding, or boost actions in this scope. Organic publishing only.

## Publisher interface

Keep provider-independent interface, e.g.:
- `capabilities(account)`
- `prepare_payload(asset, destination)`
- `validate_payload(payload, discovered_schema)`
- `publish(payload, approval_id, idempotency_key)`
- `status(job_id)` when supported.

`WindsorPublisher` should dynamically discover supported connectors/actions, validate schema, enforce approval, execute and persist response metadata. Keep all MCP operations server-side.

## Platform policy

- Instagram: enable image/video types only where live action schemas explicitly permit; current documented organic write action is image-post creation/comments.
- Facebook: publish only when a live organic write action is available for that account/media type; otherwise manual/export.
- X: publish only if a genuine authorized write action is listed and tested; otherwise manual/export.
- WhatsApp: always allow a URL-encoded `wa.me` prepared message where applicable. It opens the app for the user to review/send; it is not unattended WhatsApp Business broadcasting.
- Do not present read/analytics connectors as write capability.

States: `NOT_CONNECTED`, `ACTION_UNAVAILABLE`, `READY_FOR_REVIEW`, `APPROVED`, `QUEUED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, `MANUAL_REQUIRED`, `CANCELLED`.

Persist owner/shop ID, account identifier, destination, approved asset hashes, caption hash, discovered action ID/schema, approval event, provider result IDs, timestamps, status and safe errors in Firestore.

## Tests / exit gate

Test missing auth/accounts, connector/action discovery, unsupported action, schema validation, approval required, stale approval, duplicate/retry, successful tool response, failed/ambiguous action, account isolation, secret redaction, `wa.me` encoding, and export fallback. Mock MCP in CI; live Windsor smoke test only with configured authorization. Full suites pass.

**Phase 8 is done** when supported writes work through Windsor with explicit approval, and every unsupported/unavailable channel has a usable manual/export path without false-success reporting.

---

# 7. PHASE 9 — HARDENING, DEPLOYMENT, AND RELEASE VALIDATION

## End-to-end golden path

Test the actual integrated flow:

1. User authenticates.
2. Shop profile selected/created.
3. Owner speaks or types the offer.
4. Sarvam STT → faster-whisper fallback → typed input if required.
5. Agnes fact extraction; user edits/approves the FactSheet.
6. Deterministic lock, canonical hash, HMAC seal and token map.
7. Agnes creates CampaignPlan/localization specs.
8. Poster art + deterministic overlays.
9. Consented voice profile produces localized voice assets.
10. Video job uses Agnes Video when configured or FFmpeg fallback.
11. Guardian validates all applicable assets.
12. Bounded repair/reverification.
13. Owner approves exact assets/destination.
14. Windsor executes only a discovered and authorized action, or export/manual fallback.
15. ZIP, audit trail and verification certificate are generated.

## Security and tenancy

- Verify Firebase ID tokens on every protected endpoint.
- Enforce ownership server-side for shops, campaigns, factsheets, plans, assets, jobs, voice profiles, reports, exports and publish operations.
- Never trust user/owner IDs received as ordinary request fields.
- Restrict Firestore/Storage rules; Admin SDK privileged calls bypass them.
- Keep Cloud Storage objects private by default; use short-lived signed URLs when necessary.
- Secrets in server environment/Secret Manager only. Never expose them in `VITE_*`, source, errors, logs or API responses.
- Use HTTPS, CORS allowlist, request size/rate limits, authentication throttles, upload content validation and secure temporary-file cleanup.
- Safely invoke FFmpeg without shell string interpolation. Protect against path traversal, malformed media and resource exhaustion.
- Redact personal voice recordings/transcripts from logs by default; implement deletion/retention behavior for voice profile assets and derived voice data.
- Keep HMAC key separate from all provider keys and support secret rotation procedures.

## Durable jobs

- Production video/media work must not depend solely on in-memory `asyncio.create_task()`.
- Use Firestore-persisted status and Cloud Tasks → authenticated Cloud Run worker (or a justified durable equivalent) for long-running tasks.
- Ensure bounded retries, ownership checks, stable IDs, idempotency, stale-lease recovery and restart/resume.
- Do not execute an external publish twice automatically after an ambiguous timeout; show `NEEDS_REVIEW` unless the provider exposes safe deduplication/status retrieval.
- SSE clients must reconnect and refetch canonical campaign state; Firebase listeners may be used where they simplify frontend synchronization without weakening backend authorization.

## Cost controls and safety

- Default generation budget is small and configurable; deduplicate requests and cache only when all facts/spec/provider/voice inputs match.
- Display which steps are live, mock, cached, or fallback.
- Ask for confirmation before paid/expensive generation and before any external write.
- No ad spend, boosting, billing or automated paid campaigns.
- `TITAN_MODE=mock` must never call social publishing endpoints.
- Add cancellation for queued jobs where feasible.

## Offline/mock demo

Create deterministic seeded data: demo shop, transcript, FactSheet, plan, licensed/background assets, demo voice/video, mock Windsor action registry, Guardian reports and certificate. Mock outputs must be visually labeled. In mock mode, never call real social accounts or imply a live post was made. The sabotage demo only works on copied fixture assets with `ENABLE_DEMO_SABOTAGE=true` in development.

## Tests

Run all existing suites and add end-to-end tests for authentication/ownership; Firestore/Storage via emulator/fakes; Sarvam fallback chain; fact lock/HMAC tampering; plan/token integrity; voice cloning/ASR; poster OCR; video jobs/retrieval/FFmpeg; Guardian repair loop; certificate tampering; Windsor discovery/schema/approval; retries/idempotency/restart; mock/offline path; ZIP consistency.

CI tests must not require paid external provider calls. Live smoke tests are optional and must be separately labelled.

## Deployment deliverables

Create/update:
- `Dockerfile` for FastAPI with FFmpeg/Tesseract if required.
- `.dockerignore`.
- Firebase Auth/Firestore/Storage setup instructions and restrictive rules/indexes.
- Cloud Run deployment guide and service identity configuration.
- Cloud Tasks queue/worker setup guide if used.
- Windows PowerShell local-development instructions.
- `.env.example` with placeholders only.
- `API_ENDPOINTS.md` tracking endpoint/model/auth/limits/capabilities and live verification state.
- `OPERATIONS.md` for provider outages, stuck jobs, retry operations, log privacy and secret rotation.
- Updated README and `IMPLEMENTATION_PLAN.md`.

Do not execute cloud commands that create paid resources without explicit authorization. Provide commands and preflight checks instead; don't claim deployment succeeded unless it was actually deployed and smoke-tested.

## Release gate

- Backend tests pass.
- Frontend type-check and production build pass.
- Firebase production adapters, auth and ownership are verified or remaining work is explicitly a release blocker.
- No secrets are committed.
- Critical fact integrity failures cannot be approved/published.
- Asset outputs have provenance/checksums and truthful mock/fallback labels.
- Windsor only invokes dynamically discovered, supported, approved actions.
- Unsupported platform/media types fall back to manual export.
- Offline/mock demo completes with no external write calls.
- Missing required live configuration fails safely.
- Documentation matches code and actual test evidence.

Update `IMPLEMENTATION_PLAN.md` with commands executed, pass/fail outcomes, live provider verification, known limitations, and exact remaining blockers. Stop after Phase 9 acceptance criteria; do not invent Phase 10 scope.

---

# 8. PROVIDER/API REGISTRY

Create `API_ENDPOINTS.md` and track each integration as one of:
`IMPLEMENTED_AND_LIVE_VERIFIED`, `IMPLEMENTED_NOT_LIVE_VERIFIED`, `MOCK_ONLY`, `UNAVAILABLE`, `UNSUPPORTED`.

## Agnes 3.0 Flash
- Base: `https://apihub.agnes-ai.com/v1`
- `POST /chat/completions`
- Model: `agnes-3.0-flash`
- Auth: `Authorization: Bearer ${AGNES_API_KEY}`
- Reuse the Phase 3 documented request fields/behavior unless the official docs now differ.
- Docs: `https://wiki.agnes-ai.com/en/docs/agnes-30-flash`

## Agnes Image 2.5 Flash
- `POST https://apihub.agnes-ai.com/v1/images/generations`
- Model: `agnes-image-2.5-flash`
- Required fields documented for text-to-image include `model`, `prompt`, `size`.
- For URL output, current docs place `response_format: "url"` under `extra_body`, not top-level.
- Docs: `https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash`

## Agnes Video 2.5
- Create: `POST https://apihub.agnes-ai.com/v1/videos`
- Model: `agnes-video-2.5`
- Retrieve: `GET https://apihub.agnes-ai.com/agnesapi?video_id={VIDEO_ID}&model_name=agnes-video-2.5`
- Asynchronous; store `video_id`, poll until terminal state, retrieve/download and validate output.
- Docs: `https://wiki.agnes-ai.com/en/docs/agnes-video-25`

## Sarvam STT
- Base: `https://api.sarvam.ai`
- `POST /speech-to-text`, model `saaras:v4`, auth `api-subscription-key`.
- Multipart audio; preserve `transcript`, `language_code`, `request_id`.
- Synchronous endpoint is for quick requests under 30 seconds; use current documented batch flow for long recordings.
- faster-whisper local fallback; typed input final fallback.
- Docs: `https://docs.sarvam.ai/api-reference/speech-to-text/transcribe`

## Sarvam voice cloning
- Create voice: `POST /voices/create` (Phase 5A).
- Generate: `POST /voices/clone`.
- Optional stream: `POST /voices/clone/stream` if the product requires it.
- Codes include `en-IN`, `hi-IN`, `kn-IN`, `ta-IN`, `te-IN`; re-check live supported-language docs.
- Non-streaming response includes base64 `audio` and `request_id`.
- Docs: `https://docs.sarvam.ai/api-reference/voice-cloning/create-voice`, `https://docs.sarvam.ai/api-reference/voice-cloning/clone`, `https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/supported-languages`

## Windsor.ai MCP
- URL: `https://mcp.windsor.ai/`
- Streamable HTTP: `POST /`
- SSE: `GET /sse/`
- OAuth recommended; bearer API key is documented alternative.
- Discover actual tools and schemas using `get_connectors`, `list_actions`, then invoke `execute_action` only after approval.
- Do not assume the current account supports Facebook/X organic writes or Instagram video/Reels; use current live action registry.
- Docs: `https://mcp.windsor.ai/`, `https://mcp.windsor.ai/llms-full.txt`, `https://mcp.windsor.ai/actions`

## Firebase
- Python Firebase Admin SDK; use ADC on Cloud Run.
- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET` are configuration values, not secrets.
- Service-account JSON files are local-only and untracked.
- Verify Firebase ID tokens server-side; enforce owner isolation in FastAPI.
- Docs: `https://firebase.google.com/docs/admin/setup`, `https://firebase.google.com/docs/firestore/quickstart-server`, `https://firebase.google.com/docs/storage`

---

# 9. ASSET PROVENANCE CONTRACT

Every asset record should contain these fields (adapt names to the existing Pydantic/Firestore schema instead of creating duplicate incompatible models):

```json
{
  "campaign_id": "PLACEHOLDER_CAMPAIGN_ID",
  "owner_uid": "FIREBASE_AUTH_UID",
  "factsheet_id": "PLACEHOLDER_FACTSHEET_ID",
  "factsheet_version": 1,
  "fact_hash": "sha256:...",
  "campaign_plan_id": "PLACEHOLDER_PLAN_ID",
  "provider": "provider_name",
  "model": "model_name",
  "provider_request_id": null,
  "is_mock": false,
  "used_fallback": false,
  "asset_status": "pending",
  "storage_path": "users/UID/campaigns/CAMPAIGN_ID/assets/ASSET_ID.ext",
  "sha256": null,
  "created_at": "UTC_TIMESTAMP"
}
```

Use canonical hash inputs and preserve the original locked FactSheet version. Superseding facts does not rewrite old facts or past asset provenance. Include only minimum data needed by providers; never send HMAC secrets, Firebase credentials, unnecessary personal data or unrelated user identifiers to model providers.

---

# 10. DEVELOPER SETUP AND SECRETS

The developer will fill placeholders locally/in the deployment secret manager:

- `AGNES_API_KEY`: Agnes dashboard/key management.
- `SARVAM_API_KEY`: Sarvam dashboard/key management.
- `TITAN_HMAC_SECRET`: generate a long random secret locally.
- `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET`: Firebase project setup.
- `GOOGLE_APPLICATION_CREDENTIALS`: local-only service account path, if needed; on Cloud Run prefer ADC.
- Windsor OAuth in browser, or `WINDSOR_API_KEY` if the developer deliberately chooses the supported API-key path.
- Cloud Tasks/Cloud Run placeholders only when deployment is explicitly configured.

Never include real secrets in any Markdown, source file, screenshot, test snapshot, frontend bundle or commit. In final reports, list missing variable names only; never print values.

---

# 11. FINAL DEFINITION OF DONE

Titan is ready for the scoped release when:

- Firebase Auth, Firestore and Storage are used in production paths, or any gap is explicitly a release blocker.
- Sarvam STT works through primary/fallback routing with accurate provenance.
- Consenting users can generate cross-lingual cloned-voice campaign audio, with honest ASR verdicts.
- Videos are queued/recoverable and FFmpeg reliably produces the core output when configured inputs/dependencies are available.
- Critical textual facts are composed deterministically and protected against mutations.
- Guardian catches changed facts and unsupported claims across text, posters, audio and videos.
- Repair is bounded and outputs are re-verified.
- Certificates prove asset/fact hashes and remain invalid after unauthorized changes.
- Windsor only executes live-discovered, authorized, supported actions after explicit approval.
- Unsupported publishing capabilities yield a useful manual-ready export, never a fake success.
- Owner/account isolation and secret-handling tests pass.
- Mock/offline demo works and every mock asset/action is visibly labelled.
- All tests/builds and documentation accurately reflect actual behavior.

**Engineering mantra:** Agents decide. Code guarantees. Facts stay locked. Every media transformation is audited. Humans authorize publication.

**END OF HANDOFF**
