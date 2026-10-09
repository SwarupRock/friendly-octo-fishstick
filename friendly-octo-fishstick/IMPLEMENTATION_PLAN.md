# IMPLEMENTATION PLAN

Execution tracker for `TITAN_SOURCE_OF_TRUTH.md`. 

---

## PHASE 5B+ HANDOFF PREFLIGHT AUDIT (GPT-6 Astra, October 2026)

Audited against `TITAN_PHASE_5B_ONWARD_IMPLEMENTATION.md`. Actual facts:

| Question | Finding |
| --- | --- |
| Phase 5A voice creation/consent/ownership/Sarvam voice_id | **NOT IMPLEMENTED.** No voice_profiles table, no voice routes, no Sarvam code. |
| Firebase Auth/Firestore/Storage in production paths | **NO.** Backend is SQLAlchemy + SQLite (`backend/app/db.py`) and a filesystem `AssetStorage` (`backend/app/storage.py`). No Firebase SDK anywhere. |
| Protected-API token verification / ownership | **NO.** No auth dependency; `_ensure_default_shop` implicitly shares one shop across all callers. All endpoints are unauthenticated. |
| Sarvam Saaras v4 wired into STT | **NO.** STT is `mock` (deterministic, labelled) or local `faster-whisper`. No Sarvam client, no request-id/language/provider fallback provenance. |
| Agnes gateway live-capable | **MOCK/UNVERIFIED.** Gateway registers an Agnes slot with `interface_verified=False`; calls raise `ProviderUnavailableError`. No real API request has ever been made. |
| Phase 3 CampaignPlan | **NOT STARTED.** No campaign_brain/copywriter/localizer code. `substitute_tokens()` exists and is tested but unused. |
| Phase 4 poster generation | **NOT STARTED.** No assets/models beyond the tracker's statement; no Pillow, no OCR, no rendered-fact registry. |
| What tests prove | 140 pytest tests pass (verified live this session: `140 passed, 1 warning in 2.36s` with `TITAN_SEAL_SECRET` set). They prove fact extraction/normalization/lock/seal/tokens + API contract in mock mode only; no provider integration is live-verified. |
| Uncommitted changes | Repo cloned fresh at commit `a1c0985` ("ini phase 1"); working tree clean. |

**Resolution decision (per the handoff's own fallback rule):** live provider credentials (`AGNES_API_KEY`, `SARVAM_API_KEY`, Firebase project, Windsor OAuth) are NOT available in this environment. Every provider is therefore implemented as a *real network client behind an auth/session boundary* with a fully tested mock/fake path, and the live integration is marked **UNVERIFIED** in `API_ENDPOINTS.md` — per the handoff: never fabricate a successful call. Firebase Auth/Firestore/Storage: implemented as swappable adapters (config-gated); the demo and CI run on SQLite/filesystem with tenant-scoped ownership enforcement that is identical in both modes. The missing-credential gap is recorded in `API_ENDPOINTS.md` as the standing release blocker, not hidden. This file records completed
work, test evidence, and outstanding issues. It is not the architecture
contract — the source of truth remains authoritative.

---

## Status overview

| Phase | Scope | State |
| --- | --- | --- |
| **1 — Titan Foundation** | project setup, DB, gateway, STT foundation, initial screen, tests | ✅ Complete |
| **2 — Fact Extraction, FactSheet & Fact Lock** | extraction, versioned FactSheet, human edits, deterministic lock, Fact Tokens, tests | ✅ Complete |
| 3 | Deterministic poster composition + Guardian + OCR | ⬜ Not started |
| 4 | Voice / TTS / ASR round-trip / video | ⬜ Not started |
| 5 | Publishing, export, verification certificate | ⬜ Not started |

> Work **stopped after Phase 2** as instructed. No Phase 3 code exists.
> 
> **UPDATE (October 2026, Phase 5B→9 handoff execution):** Phases 3–9 have now
> been implemented on top of the Phase 2 foundation, offline/mock-first, with
> live provider integrations behind verification gates. Evidence below.

## Phase 5B–9 execution record (October 2026)

**Baseline verified:** 140 tests passed at session start (commit `a1c0985`, clean tree).

### What was built

| Phase | Delivered (files) |
| --- | --- |
| Preflight | Audit table above (written into this file); `.env.example` extended for Agnes/Sarvam/Windsor/budgets/flags (`backend/app/config.py` now validates all new vars) |
| 3 — Campaign brain | `app/services/agnes.py` (real Agnes LLM/image clients, gated + mock), `app/services/campaign_brain.py` (tokenized plan, copy for 8 channels, LocalizationSpecs for en-IN/hi-IN/kn-IN/ta-IN/te-IN), `app/api/plans.py`; literal-fact firewall: plans contain only `{{TOKEN}}` names; seal re-check before planning |
| 4 — Posters | `app/services/poster.py` (Pillow compositor, deterministic fallback art, rendered-fact registry, layout versioning), `app/services/assets_service.py`, `app/api/assets.py`; provenance = factsheet id + fact_hash + sha256 + provider/model + mock/fallback labels |
| 5A/5B — Voice | `app/services/sarvam.py` (`/speech-to-text` saaras:v4, `/voices/create`, `/voices/clone`, 1000-char sentence-safe chunking, base64/WAV validation), `app/services/voice_service.py` + `app/api/voice_profiles.py` (consent mandatory → 422, owner isolation → 404, voice_id reused, deletion removes reference audio) |
| 6 — Video | `app/services/video_service.py` (persisted job states, budget cap, FFmpeg Ken-Burns reel from verified poster + voice via argv-array subprocess, ffprobe validation, failure → FAILED with reason) + `app/api/videos.py`; Agnes Video kept as gated slot |
| 7 — Guardian | `app/guardian/checks_text.py` (numeric parity incl. Indic-digit immunity pre-lock, day-count safe derivation, weekday parity, token residue, 13 unsupported-claim patterns with locked-condition allowlist), `app/guardian/runner.py` (registry-vs-token, OCR cross-check, ASR round-trip as NEEDS_REVIEW in mock, bounded repair ≤2), `app/guardian/certificate.py` (JSON+HTML certificate, HMAC seal, recompute-on-check tamper detection), `app/api/guardian_api.py` (verify/repair/certificate/sabotage demo — copy-only, flag-gated, original untouched) |
| 8 — Publishing | `app/services/windsor.py` (MCP `tools/call` client for Streamable HTTP; mock registry organic-only; schema validation; wa.me rule), `app/services/publisher_service.py` + `app/api/publisher.py` (prepare→approve→execute states, mock blocks social destinations, idempotent PUBLISHED, manual/export fallback for Facebook/X) |
| 9 — Hardening/docs | `API_ENDPOINTS.md` (registry + verification state), `OPERATIONS.md` (secrets rotation, stuck jobs, privacy, release blockers), README rewrite, `requirements.txt` updated (pillow/httpx) |
| Frontend | `Studio.tsx` workspace: plan → posters/captions → voice (profile + language) → Guardian verify → certificate → sandbox publish, with mock/mock-fallback labelling |

### Test evidence (this session)

```text
Backend:  176 passed, 1 warning  (was 140; +36 new tests across
          test_campaign_brain.py, test_assets.py, test_voice.py,
          test_video.py, test_guardian.py, test_publisher.py)
Frontend: tsc --noEmit → clean
Vite:     ✓ built in 471ms (dist 169.62 kB js / 9.11 kB css)
```

Key green-path proof points (covered by tests):
- lock → plan persisted once (no dup); plan GET decodes + substitutes deterministically;
- seal-tampered factsheet → 409 `seal_invalid`, planning refused;
- poster registry draws only token-map values; budget `TITAN_MAX_POSTERS` enforced;
- voice: consent refused without flag (422), cross-owner use → 404, unsupported language → 422,
  missing voice_id → 409, mock labels `mock_cloned_voice`, script contains substituted locked facts;
- video: failure of ffmpeg recorded as job FAILED with reason; success → reel probed by ffprobe,
  checksum bound; voice provenance carried into the reel;
- Guardian: 20→25 FAIL, Saturday→Monday FAIL, "first 50 customers"+"best in town" FAIL,
  locked-condition allowlist works, sabotage demo corrupts only a copy and the original is shown untouched;
- certificate: HMAC seal verified, asset bytes tamper → `tampered[]` non-empty;
- publish: Facebook→MANUAL_REQUIRED (per live capability limits), approval REQUIRED,
  mock blocks real socials, sandbox post only after tool response success, wa.me link prepared.

### Live-provider verification status

All live integrations remain **UNVERIFIED** — credentials were not available in
this environment, and no real provider call was made (per handoff: never
fabricate successes). Each client gates network calls behind configuration AND
an explicit `*_INTERFACE_VERIFIED=1` toggle. See `API_ENDPOINTS.md` for the
per-integration registry and the verification procedure.

### Release blockers (unchanged, explicit)

1. Firebase Auth/Firestore/Storage adoption in production paths + Firebase-ID-verified
   owner identity (replacing the dev `owner_uid` parameter).
2. Live verification of Agnes / Sarvam / Windsor integrations.
3. Durable task queue for production video jobs (`TITAN_TASKS_MODE=cloud_tasks` plumbed but unexercised).
4. Secrets-manager placement of `TITAN_SEAL_SECRET` and provider keys for deployments.

### Known limitations (honest)

- OCR: Tesseract is optional; without it poster OCR checks honestly report
  `NEEDS_REVIEW` (registry stays authoritative). Indic-script OCR is excluded
  with the limitation recorded.
- ASR round-trip in mock mode is a disclosed fixture, reported `NEEDS_REVIEW`, never a pass.
- Agnes semantic critic: advisory slot exists but is not wired to a live model;
  deterministic checks carry all verdicts (per handoff: advisory cannot override).
- Sabotage demo handles the three documented mutations (discount/day/claim) —
  extended mutations would need new `corrupt_text` modes.

---

## Phase 1 — completed work (condensed)

- Repository inspection; `backend/` (FastAPI) + `frontend/` (React + TS + Vite)
  layout; `.env.example`, `.gitignore`, `README.md`.
- Backend foundation: env settings, SQLAlchemy engine/session, `init_db()`,
  error envelope `{"error": {code, message, details}}`, traversal-safe
  filesystem `AssetStorage`, health + modes endpoints, campaign create/list/get.
- Provider gateway: `ProviderStatus`, normalized errors, circuit breaker,
  retry/backoff, `TITAN_MODE=live|mock`, unverified provider slots.
- STT: `STTProvider` interface, lazy `faster-whisper`, labelled mock provider,
  typed-text fallback, raw audio + transcript hash preservation.
- Frontend: record/stop with timer, typed alternative, transcript preview,
  loading/error states, backend health badge.
- 31 tests at the time (now expanded).

---

## Phase 2 — completed work

### 1. Fact extraction
- `app/services/extraction.py` — provider abstraction:
  - `AgnesExtractionProvider` is routed through the existing gateway
    (`agnes_llm` slot). The slot is `verified=false`, so live calls raise a
    normalized `ProviderUnavailableError` with a clear reason
    (`not_configured` / `interface_unverified`). **No undocumented API is
    invented and no live result is faked.**
  - `MockExtractionProvider` — deterministic, rule-based extraction (regex +
    small vocabularies) of discount %, flat discount, price, quantity, product,
    audience, days, times, conditions, location and languages. It is explicitly
    labelled (`is_mock=True`) and reported in the API/UI as "mock extraction".
  - Conflicts (e.g. "20% off … also 25% off") leave the field `null` and are
    recorded in `ambiguities` with candidates — never silently resolved.
  - `"weekend"` infers Saturday+Sunday and marks `offer.days` as `inferred`.
  - Extraction runs automatically on campaign create when a transcript exists,
    and can be re-run via `POST /api/campaigns/{id}/extract`.
- When extraction is unavailable the campaign keeps a *truthful empty* draft
  sheet (business name only) and the API answers with
  `extraction.status="unavailable"`, `fallback="manual_entry"` — the owner
  enters facts manually. Nothing is fabricated.

### 2. Database & API
- New versioned `fact_sheets` table (`FactSheetRecord`): `campaign_id`,
  `version`, `status` (`draft|locked|superseded`), `parent_id`, `draft_json`,
  `facts_json`, `tokens_json`, `extraction_json`, `fact_hash`, `seal`,
  `created_at`, `updated_at`, `locked_at`, unique `(campaign_id, version)`.
- Safe initialization: `init_db()` uses `create_all`, which **creates only the
  missing table** on an existing Phase 1 SQLite file — existing data is
  preserved, no destructive migration.
- Endpoints:
  - `GET /api/campaigns/{id}` — now returns the active `factsheet`, all
    `factsheet_versions` metadata, and `facts` mirror.
  - `POST /api/campaigns/{id}/extract` — re-extracts from the stored transcript
    (409 when facts are locked, 422 when there is no transcript).
  - `GET /api/factsheets/{id}` — version + seal verification (`seal_valid`).
  - `PATCH /api/factsheets/{id}` — validated human edits. Editing a **locked**
    version creates a new draft version (old → `superseded`); locked rows are
    never mutated. Editing a superseded version returns 409.
  - `POST /api/factsheets/{id}/lock` — deterministic lock (idempotent when
    already locked).
- Campaign state follows §36: `extracted` once a draft exists, `locked` after a
  successful lock, back to `extracted` when a new draft version is created.

### 3. Deterministic Fact Engine
`app/services/fact_engine.py` + `app/services/normalize.py`:
- Number normalization: English number words, Hinglish numerals, Indic digits
  (Devanagari/Bengali/Gujarati/Gurmukhi/Tamil/Telugu/Kannada/Malayalam),
  currency/percent/noise stripping.
- Time normalization: `4 PM → 16:00`; `noon/midnight`; a colon means explicit
  24-hour notation (`12:00`, `4:30`); a bare hour (`4`) is rejected as
  ambiguous. Day normalization: English + abbreviations, Romanized Hindi
  (shanivar), Devanagari (शनिवार); deduped and weekday-ordered.
- Date normalization: ISO → ISO; `10 October 2026 → 2026-10-10`;
  `10th October → 10 October`; ambiguous numeric `10/11/2026` rejected.
- Language aliases (`kn → Kannada`); unknown languages are preserved.
- Canonical JSON: sorted keys, compact separators, UTF-8, list order made
  deterministic (days by weekday, other lists case-insensitively sorted),
  integral floats coerced to ints.
- **Hash coverage (exactly):** `business.name`, `business.location`,
  `offer.product`, `offer.discount_percent`, `offer.discount_flat`,
  `offer.price`, `offer.quantity`, `offer.audience`, `offer.days`,
  `offer.date_start`, `offer.date_end`, `offer.start_time`, `offer.end_time`,
  `offer.conditions`, `offer.location`, `languages`.
  `extraction_confidence`, `inferred`, `ambiguities` and `missing` are excluded.
- `fact_hash = sha256:<hex>` over canonical bytes;
  `seal = hmac-sha256:<hex>` over the same bytes with `TITAN_SEAL_SECRET`.
  Verification uses `hmac.compare_digest`. **Missing secret → lock is refused
  with 503 `seal_unavailable` and nothing is persisted.** The secret is never
  logged, returned, or sent to the frontend.
- Required-for-lock validation: a non-empty product **and** at least one of
  discount percent / flat discount / price; otherwise 422 `incomplete_factsheet`
  with the missing paths.

### 4. Fact Tokens
- `{{PRODUCT}} {{DISCOUNT}} {{PRICE}} {{DAYS}} {{WINDOW}} {{AUDIENCE}}
  {{CONDITIONS}} {{LOCATION}}`.
- Compiled deterministically at lock time from the canonical payload; only
  tokens supported by available facts are produced (`PRICE`/`LOCATION` omitted
  when absent). `WINDOW` renders 12-hour (`4 PM–8 PM`); `DAYS` joins with `&`.
- `substitute_tokens()` validates templates: unknown tokens and known-but-
  unresolved tokens raise `TokenError` with details. No display value is ever
  invented for an absent fact.

### 5. Frontend
- `FactSheetView.tsx` — business/offer/languages form with:
  - per-field confidence values and `inferred` / `missing` indicators;
  - ambiguity warnings with candidates and a missing-information summary;
  - editable values before locking; `Save draft`, `Re-extract`,
    `Lock these facts`;
  - after locking: read-only fields, `LOCKED` chip, visible `fact_hash`, seal
    + `verified` state, lock timestamp, compiled Fact Token map;
  - `Edit facts (new version)` → `Save as new draft` (creates v+1);
  - clear inline errors (validation, normalization, `seal_unavailable`,
    `incomplete_factsheet`, network) and success notices.
- Mock extraction is visibly labelled; extraction-unavailable shows the manual
  entry callout. Existing visual design and typed-input fallback preserved.

### 6. Tests
- New: `tests/test_normalize.py`, `tests/test_fact_engine.py`,
  `tests/test_extraction.py`, `tests/test_factsheet.py`.
- Updated: `test_campaigns.py` (create now auto-extracts),
  `test_db.py` (fact_sheets table), `test_health.py` (unchanged coverage).
- Fixtures: seal secret set for the suite; `env_override`, `no_seal_secret`.

---

## Test evidence

### Backend — `pytest`
```text
140 passed, 1 warning in 2.57s
```
Phase 2 coverage includes: schema validation & unknown fields, missing and
conflicting facts, inferred vs explicit days, number/time/day/date/language
normalization (incl. Devanagari and Hinglish), canonical serialization
determinism and order independence, hash stability + per-field sensitivity,
HMAC create/verify/tamper/wrong-secret/missing-secret, token compilation,
substitution, unknown/unresolved tokens, locked-version immutability, edit →
new version → re-lock workflow, idempotent lock, superseded conflicts,
missing-secret lock safety, extraction mock labeling and unavailable-provider
fallback, manual-entry workflow, and DB persistence via the API.

### Frontend — typecheck + production build
```text
tsc --noEmit   -> clean
vite build     -> ✓ built in 478ms
  dist/index.html                 0.49 kB
  dist/assets/index-*.css         9.11 kB
  dist/assets/index-*.js        163.63 kB (gzip 52.44 kB)
```

### End-to-end smoke test (live servers, mock mode + smoke seal secret)
- `POST /api/campaigns` (typed) → `201`, status `extracted`, mock draft with
  `discount=20`, days `Saturday/Sunday`.
- `PATCH` languages → normalized `["English","Hindi"]`.
- `POST …/lock` → `locked`, `sha256:…` hash, `seal_valid=True`, tokens
  `{PRODUCT, DISCOUNT, DAYS, WINDOW, AUDIENCE, LOCATION}`.
- Second lock → identical hash/seal (idempotent).
- `PATCH` locked → version 2 draft; old version `superseded` with unchanged
  hash/seal (still verifiable).
- Browser: extracted FactSheet rendered with confidence/inferred/missing
  indicators; locked via UI; fields became read-only; seal panel showed
  `VERIFIED`; token map rendered. No console errors (one transient 500 came
  from the Vite proxy while the backend was deliberately restarted — the UI
  degraded to `offline` and recovered).

### Regression found and fixed during verification
A real browser submission (`12 to 9 PM`) exposed that `normalize_time("12:00")`
rejected its own output as "ambiguous". Fixed: an explicit colon means 24-hour
notation, so normalized values are always re-normalizable (idempotent), while a
bare hour (`4`) is still refused. Regression tests added for `12:00`, `4:30`,
shared-meridiem ranges and plural product vocabulary.

---

## Changed / created files (Phase 2)

```text
# New backend
backend/app/services/normalize.py
backend/app/services/fact_schemas.py
backend/app/services/fact_engine.py
backend/app/services/extraction.py
backend/app/services/factsheet_service.py
backend/app/api/factsheets.py
backend/tests/test_normalize.py
backend/tests/test_fact_engine.py
backend/tests/test_extraction.py
backend/tests/test_factsheet.py

# Modified backend
backend/app/config.py          (extraction provider, seal secret, version 0.2.0)
backend/app/errors.py          (conflict/normalization/seal/extraction/token errors)
backend/app/models.py          (FactSheetRecord + statuses)
backend/app/schemas.py         (FactSheetRead, versions, extraction status, modes)
backend/app/api/campaigns.py   (auto-extraction + /extract endpoint + factsheet in GET)
backend/app/api/health.py      (extraction + seal status in /api/modes)
backend/app/main.py            (factsheets router)
backend/tests/conftest.py      (seal secret, no_seal_secret fixture)
backend/tests/test_campaigns.py, test_db.py

# New/modified frontend
frontend/src/components/FactSheetView.tsx   (new)
frontend/src/App.tsx                        (FactSheet integration + refresh)
frontend/src/lib/types.ts, lib/api.ts       (Phase 2 types + endpoints)
frontend/src/index.css                      (FactSheet styles)

# Docs
.env.example, README.md, IMPLEMENTATION_PLAN.md
```

---

## Exact run commands

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

# Required for locking (choose your own value):
python -c "import secrets; print(secrets.token_hex(32))"
$env:TITAN_SEAL_SECRET = "<paste-secret>"

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
.\.venv\Scripts\python.exe -m pytest

# Frontend
cd frontend
npm install
npm run dev
npm run typecheck
npm run build
```

---

## Deliberate decisions (aligned with the source of truth)

- **`fact_sheets` is versioned** rather than a single mutable row. A locked
  version is immutable; edits create v+1 and supersede the old row. This is the
  implementation of §15/§16 ("edit → normalize → rehash → draft → re-lock").
- **Hash covers authoritative facts only.** Confidence/inferred/ambiguity
  metadata is mutable and excluded, as required; documented above and pinned by
  tests.
- **Locking requires `TITAN_SEAL_SECRET`.** No unsigned "locked" state is ever
  produced; a missing secret returns 503 and leaves the draft untouched.
- **Time convention:** colon form is 24-hour (`12:00` is noon); bare hours are
  ambiguous and rejected. Keeps normalization idempotent and never guesses.
- **Mock extraction is not a model.** It is a deterministic rule engine labelled
  `is_mock`; it reports missing/conflicting fields instead of guessing. The
  Agnes provider remains status-only until its real interface is confirmed.
- **`facts.extracted` audit event** records the extraction status (ok /
  unavailable / error) for every attempt.
- **`missing` is recomputed deterministically** on every write (hard +
  soft gaps), so it always reflects the current draft.
- **Human-edited fields lose model metadata:** changing a path removes it from
  `inferred` and `extraction_confidence`.

---

## Outstanding issues / risks

1. **Agnes integration unverified.** The extraction slot routes through the
   gateway but performs no HTTP call. Once the real API + credentials exist,
   implement `AgnesExtractionProvider.extract`, flip `interface_verified`, and
   add contract tests against a recorded fixture.
2. **Mock extraction vocabulary is limited.** Products/audiences outside the
   vocabulary are reported as missing rather than extracted (safe, but the demo
   benefit is limited to common items). Plurals are handled; synonyms are not.
3. **Date normalization is conservative.** Numeric `DD/MM` vs `MM/DD` is
   rejected as ambiguous; multilingual date words beyond month names are not
   parsed.
4. **`faster-whisper` remains opt-in** (Phase 1 note); STT confidence/segments
   may be `null`.
5. **Base64 audio transport** unchanged from Phase 1 (§46 contract).
6. **Seal key management is env-only.** Fine for the hackathon; a real
   deployment needs a secret manager and key rotation.
7. **No copywriter yet.** `substitute_tokens()` exists and is tested but is not
   yet used to generate campaign copy (Phase 3).
8. **Concurrency.** SQLite + a single process is fine for the demo; version
   creation is not protected against concurrent PATCHes (no row locking).

---

## Next phase (do not start until instructed)

Per §62: Agnes campaign brain → token-based copy → localization → deterministic
poster composition → Guardian checks → verified assets. The token map produced
at lock time is the input for the copywriter (`{{PRODUCT}}`, `{{DISCOUNT}}`, …),
and `canonical_payload`/`fact_hash` are the provenance anchors for the future
verification certificate.

---

## Integrity repair pass (post-audit)

Scope: fix the five confirmed P0 defects from the audit plus the P1 cleanup, add
regression tests, re-verify. No new features, no rebuild.

### P0 fixes

| # | Defect (audit) | Fix | Where |
| --- | --- | --- | --- |
| 1 | Voice checksums were truncated (16 hex) while the certificate computed the full digest → false `bytes_unchanged: false` "tamper" on untouched audio | One shared full SHA-256 utility (`sha256:<64 hex>`) used at asset creation, verification and certificate recomputation | `app/services/checksums.py` (new), `voice_service.py`, `assets_service.py`, `video_service.py`, `poster.py`, `windsor.caption_hash`, `guardian/certificate.py` |
| 2 | Certificate verdicts were derived from "the last verification row", hiding a real critical FAIL | The runner persists an `aggregate` verification row per attempt; certificates and the publish gate read that row as authoritative (asset status is only a legacy fallback). A real byte change additionally forces `FAILED` | `guardian/runner.py`, `guardian/certificate.py` |
| 3 | A `FAILED` asset could be prepared, approved and published | Server-side gate in `prepare`, `approve` **and** `execute`: only `verified`/`human_verified` publish; `asset_not_verified` for failed/unresolved, `asset_stale` when the locked fact hash moved on, `approval_stale` when the bound caption/artifact changed after approval | `services/publisher_service.py` |
| 4 | The ASR leg never ran: `asr.py` imported a non-existent `_run_coro` and an undefined `get_stt_provider`, masking the failure as "ASR unavailable" | Rewrote against the real STT abstraction and the shared loop bridge: live transcripts are checked against locked facts (mutation → FAIL), mock transcripts are NEEDS_REVIEW *with the provider disclosed*, disabled/crashed STT is NEEDS_REVIEW *with the reason* | `services/asr.py` |
| 5 | Mock `Scene 1:`–`Scene 4:` labels tripped numeric parity and failed the reel script | Scene/storyboard labels are internal production metadata: the label token is stripped before analysis (recorded as `scene_labels_ignored` evidence) while the rest of the line — including fabricated prices/percentages/dates/times/quantities — is checked unchanged | `guardian/checks_text.py` |

### P1 cleanup

- Removed the five dead helpers + one dead constant: `_strip_literal_numbers`,
  `_validate_template_strict`, `check_semantic_drift_stub`, `compute_sha256`,
  `_PUBLISH_CAPABLE_TOOL_PREFIX`, `_A`.
- Consolidated three duplicate async loop bridges (`campaign_brain._run`,
  `poster._run_coro`, `voice_service._run_coro`) into
  `services/async_bridge.run_sync` — the duplication that produced the broken
  ASR import.
- Removed the shadowed placeholder `CampaignPlanRecord` (+ its late import) and
  trimmed `parse_plan_json` to the parameters it uses.
- `api/plans.py` no longer opens its own sessions: plan/token loading now uses
  the FastAPI `Depends(get_db)` request session.
- Verified-unused imports and dead locals removed across the new code. The only
  remaining pyflakes finding is an intentional side-effect import:
  `app/db.py:61 from . import models` (registers mappers before `create_all`).

### Regression tests added (15 new; 176 → 191)

`tests/test_integrity_repairs.py` (new, 11 tests): full-digest format; an
untouched voice asset passes checksum comparison while a real byte change fails
it *and* fails the verdict; the certificate reports a critical FAIL even when a
later PASS row is appended; the publish gate rejects a failed asset at
prepare/approve/execute; ASR runs and discloses mock transcripts, PASSes a live
matching transcript, FAILs a mutated one and reports unavailable states; scene
metadata passes while fabricated numbers and claims inside scene lines still
fail; the generated mock reel script verifies PASS; and an asset edited after
issuance invalidates the certificate (`bytes_unchanged: false`, verdict
`FAILED`) just as it invalidates the approval.

`tests/test_publisher.py` (rewritten around the gate, +4 net): unverified asset
cannot be prepared; failed asset cannot be prepared or approved; stale-facts
asset rejected; a caption edited after approval cannot be executed; the
mock-mode test now asserts the real `mock_publish_blocked` response instead of
an unused-import check.

Test-count accounting: 176 (audit baseline) + 11 (new integrity file) + 4 (new
publisher gate tests) = 191. No test was weakened; two were repaired:

- `test_campaign_brain.py` asserted "no digits in templates" by iterating the
  dict **keys** (vacuous — it never looked at a template). It now checks
  `entry["template"]`, still allowing digits only inside `Scene N:` labels.
- `conftest.py::no_seal_secret` now also disables the `.env` loader: deleting
  the environment variable alone cannot express "no seal secret" on a machine
  with a repo-root `.env`, because settings are rebuilt from `.env` on every
  `get_settings()` call.

### Evidence (actual results)

```text
backend:  191 passed, 1 warning in 9.80s          (exit 0)
frontend: tsc --noEmit -> exit 0 ; vite build -> built in 461ms (exit 0)
pyflakes (app + tests): 1 finding (intentional side-effect import)
```

Live mock-mode golden path over real HTTP (uvicorn on 127.0.0.1:8013, scratch DB
and asset dir under `D:\titan-repair-run`): **21/21 steps PASS,
`FAILED_STEPS=none`**, no 5xx and no traceback in the server log:
create → lock (6 tokens, sealed) → plan (8 channels, mock) → poster + 33
captions → consented voice asset (sha256 length 71) → verify (no FAIL; reel
script PASS; poster NEEDS_REVIEW with the OCR limitation disclosed; voice
`asr_roundtrip` NEEDS_REVIEW with `provider=mock` and 35,084 audio bytes
actually transcribed) → aggregate row per asset → certificate (untouched voice
`bytes_unchanged: true`, verdict NEEDS_REVIEW) → gate rejects the unresolved
poster (`asset_not_verified`) → verified caption prepares/approves/publishes to
`wa.me` → a real destination is blocked (`mock_publish_blocked`) → sabotage demo
catches the corrupted copy with the original untouched → export (28 captions /
35 assets) → appending bytes to the voice WAV yields `bytes_unchanged: false`
and certificate verdict `FAILED`.

The server was stopped afterwards (0 listeners on 8013; post-kill HTTP `000`).

### Remaining limitations (unchanged by this pass)

- Live provider paths (Agnes/Sarvam/Windsor) remain
  `IMPLEMENTED_NOT_LIVE_VERIFIED` behind `*_INTERFACE_VERIFIED` gates; no live
  network call was made.
- Tesseract is not installed here, so posters stay `needs_review` and —
  correctly, under the new gate — cannot be published. With OCR present they
  verify and publish.
- Voice assets stay `needs_review` in mock mode by design: the mock STT fixture
  cannot confirm real audio, so the ASR leg discloses instead of passing.
- `human_verified` is accepted by the gate but nothing sets it yet (the human
  override path from §46 is still outstanding).
- Firebase production adoption remains the documented release blocker.

### State

All changes are left uncommitted in the working tree (no commit, no push). The
repo tree contains no run artifacts from this pass; the scratch DB/assets live
under `D:\titan-repair-run` and the driver script in the OS temp directory.
