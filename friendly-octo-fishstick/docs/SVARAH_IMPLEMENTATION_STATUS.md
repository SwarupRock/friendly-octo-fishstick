# Svarah.ai — Implementation Status

> This file is updated as each milestone lands. It records what is implemented,
> what is verified by tests, and what remains.

## Baseline (before this work)

Established by direct inspection of the repository on the `main` branch.

### Canonical trees

| Role | Path | Notes |
| --- | --- | --- |
| Backend (canonical) | `friendly-octo-fishstick/backend` | FastAPI + SQLAlchemy 2.0, Titan Fact Integrity engine, 9 routers, 17 test modules |
| Web frontend (canonical) | `friendly-octo-fishstick/frontend/apps/web` | React 18 + Vite 6, Svarah branding (`SvarahHero.jsx`, `svarah.css`), GSAP, WebGL ribbon shader, `src/lib/api.js` |
| Mobile (secondary) | `friendly-octo-fishstick/frontend/apps/mobile` | Expo app, not part of the campaign journey yet |
| Obsolete copy | `D:\GLM magic\apps`, `D:\GLM magic\packages` | Older "Forme" branding (`FormeHero.jsx`, `forme.css`), no `lib/api.js` |
| Obsolete copy | `wispr-flow-frontend (2)/wispr-flow-frontend (1)/wispr-rebuild` | Older "Forme" branding, contains its own nested `.git` under `apps/mobile` |

Determination: `friendly-octo-fishstick/` is the source of truth. The two other
trees are pre-rename snapshots; the canonical tree is a strict superset in
functionality (it adds `SvarahHero`, `svarah.css`, `lib/api.js`, a Vite config
with an `/api` proxy and a `.env.example`).

### Confirmed gaps

1. The web app called only `GET /api/health`. No campaign, factsheet, plan,
   asset, verification, approval or export call existed.
2. `Dashboard.jsx` was a simulated dictation studio: hardcoded stats, a
   `setTimeout` "transcription", and localStorage-only auth.
3. Backend endpoints accepted `owner_uid` in request bodies/query strings and
   trusted it as identity. `shops` and `campaigns` carried no owner column at
   all, so no ownership check was possible.
4. No `/api/auth` surface existed.

Status of each milestone is appended below as it completes.

---

## Final status

### Milestones

| # | Milestone | Outcome |
| --- | --- | --- |
| 1 | Canonical application | Resolved: `friendly-octo-fishstick/` is source of truth; one backend, one web app, documented startup |
| 2 | Frontend ↔ backend integration | Done: `src/lib/api.js` is the single client; workspace drives real endpoints |
| 2 | Auth & ownership | Done: token-derived identity; ownership enforced on every owned route |
| 3 | Campaign journey (A–H) | Done: capture → facts → lock → plan → assets → verify → approve → export |
| 4 | Connect every page | Public pages preserved; `/workspace` `/dashboard` `/app` `/account` → workspace; `/downloads` + platform copy now Android-only |
| 5 | AI/media pipelines | Mock + live provider paths preserved behind the gateway; FFmpeg compositor; labelled mocks |
| 6 | Security & reliability | Ownership, size limits, safe asset serving, publish gates, audit |
| 7 | Tests | 216 backend tests pass; web build passes; mobile typechecks |
| 8 | Local dev experience | Documented in `SVARAH_SETUP_AND_CONFIGURATION.md` |
| 9 | Final audit + docs | This file + 4 companion docs |

### Verified

**Automated**

- `pytest` — **226 passed** (includes `test_auth.py`, `test_human_verify.py`,
  `test_stt_stream.py` and `test_extraction_live.py`).
- `npm run build` (web, Vite) — success.
- `npx tsc --noEmit` (mobile) — exit 0.

**End-to-end over HTTP (throwaway database, live uvicorn)** — 39/39 checks:
auth gate 401, demo session, tampered token rejected, campaign creation,
factsheet extraction, planning refused while unlocked (409), edit, lock +
seal, **locked → new draft version** workflow (locked version preserved as
superseded), re-lock, planning, captions, posters, asset bytes, Guardian,
certificate with `integrity_seal`, export bundle, capabilities, and
cross-account isolation (campaign/assets/factsheet/bytes all 404 for another
account; the second account's list is empty).

**Through the real UI (browser)** — demo login → campaign created → fact review
(12 fields) → lock → plan with channel copy → poster composed and rendered →
verify → approve/publish screen. Console clean apart from the expected
"plan not yet generated" 404 before step 3.

**Publish chain (mock)** — verify → human-verify → `prepare` (201) → `approve`
(200) → `execute` (200, sandbox `PUBLISHED`) → `export` (200).

### Changed / created in this session

- `backend/app/api/guardian_api.py` — `POST /assets/{id}/human-verify`.
- `backend/app/api/stt_stream.py` — **new**: `WS /api/stt/stream` live
  transcription preview (auth in the first frame, not the query string).
- `backend/app/services/extraction.py` — **live Agnes extraction wired**
  (was a stub); mode/mock labelling corrected.
- `backend/app/services/sarvam.py` — BCP-47 language mapping; shadowing fix.
- `backend/app/services/campaign_brain.py` — plan provenance preserved on reload.
- `backend/app/main.py` — Svarah app title; root `/health` alias.
- `backend/tests/conftest.py` — the suite is now hermetic (a developer's `.env`
  can no longer leak live providers into assertions).
- `frontend/apps/web/src/voice/VoicePill.jsx`, `useMicRecorder.js`,
  `voice-pill.css` — React Bits press-and-hold mic (tap-to-toggle, hold-to-talk,
  canvas waveform, slide-to-cancel).
- `frontend/apps/web/src/workspace/VoiceWorkspace.jsx` + `voice-workspace.css` —
  the mic-and-thread experience (replaces the internal pipeline screens), live
  transcript preview, real dark/light theming, raised mic dock.
- `frontend/apps/web/src/Wordmark.jsx` + `wordmark.css` — one shared lockup.
- `frontend/apps/web/src/Login.jsx` / `Signup.jsx` — mode-aware demo box, copy.
- `frontend/apps/web/vite.config.js` — WebSocket proxying for the STT stream.

Earlier uncommitted work (auth surface, ownership, workspace UI, API client,
Svarah rebrand) was reviewed and validated rather than rewritten.

### Live provider enablement (2026-10-09)

The operator supplied real Agnes and Sarvam keys and set `TITAN_MODE=live`. Doing
so exposed a real defect: **live Agnes extraction was a stub**. It raised
`interface_unverified` unconditionally, so every campaign came back with an
empty FactSheet, fact-locking failed with `incomplete_factsheet`, and the whole
journey stalled — the app looked broken.

Fixed:

- `services/extraction.py` — `AgnesExtractionProvider.extract()` now calls the
  real LLM client (gated on mode + key + `TITAN_AGNES_INTERFACE_VERIFIED=1`),
  sends a schema-constrained prompt that forbids inventing values, trims the
  response to the fact schema, and passes it through `normalize_fact_data`. A
  non-JSON or wrongly-typed completion degrades to manual entry
  (`ProviderUnavailableError`), never to a fabricated fact. In mock mode it uses
  the deterministic rule-based extractor instead of echoing the mock LLM.
- `services/extraction.py` — `TITAN_EXTRACTION_PROVIDER=agnes` in mock mode now
  correctly reports the mock provider as available (was reporting `available=False`).
- `services/sarvam.py` — language hints are mapped to the BCP-47 codes Sarvam
  accepts (`en` → `en-IN`); unknown hints are dropped so the provider
  auto-detects instead of rejecting the request. Also removed a local variable
  shadowing bug in `create_voice`.
- `services/campaign_brain.py` — a re-read plan keeps its own
  `is_mock`/`provider`/`model` provenance instead of defaulting to
  `provider="unknown"`, so a mock plan can never be presented as live.
- `main.py` — root-level `GET /health` alias (external monitors probe it; the
  canonical endpoint stays `/api/health`).
- `Login.jsx` — the password-less demo box is only rendered when `/api/modes`
  reports mock mode, so live deployments never advertise a refused action.

Verified live against the operator's keys:

| Check | Result |
| --- | --- |
| Agnes extraction | facts returned: `Sunrise Cafe`, `cold coffee`, `20%`, `Sat/Sun`, `16:00–20:00` |
| Agnes planning | real channel copy (instagram + facebook), `provider=agnes` |
| Agnes image | poster asset `provider=agnes_image`, `is_mock=0`, `used_fallback=0` |
| Sarvam STT | real `request_id`, language `en-IN` |
| Guardian | 10/10 captions `PASS` (poster `NEEDS_REVIEW` — no Tesseract locally) |
| Certificate | `integrity_seal` present |
| Export | 200 |
| Browser | real-account login → workspace loads, no console errors |

Still not live-verified: Sarvam voice cloning, Agnes video, Windsor publishing.

### Provider mode

Mock mode remains the default and is fully offline. Live mode requires
`TITAN_MODE=live` plus per-provider keys; the interface toggles stay explicit so
credentials alone never enable a network call.


### Not verified / open items

- **No frontend test runner.** There is no Vitest/Jest suite, so UI behaviour is
  verified by build + browser driving only. Adding Vitest is the highest-value
  remaining test work.
- Live Agnes / Sarvam / Windsor paths are implemented but **not live-verified**
  (no credentials). Provider interface verification remains as recorded in
  `API_ENDPOINTS.md`.
- OCR cross-check needs Tesseract, which is **not installed here**; the check
  reports `NEEDS_REVIEW` by design.
- `Dashboard.jsx`, `VideoCarousel.jsx`, `DraggableWidgetGrid.jsx` are now
  **unreferenced** (superseded by the workspace). Left in place rather than
  discarded; safe to delete once confirmed.
- The mobile app connects via `src/constants/api.ts` but is not yet part of the
  campaign journey.
- Audio capture/upload works through `CaptureStep`, but the mock STT path is
  what is exercised locally.

### How to run the full demo

See `SVARAH_SETUP_AND_CONFIGURATION.md`. In short: start the backend on :8000,
`npm run dev` in `frontend/`, open :5173, sign in with **Demo Login**, and follow
the six steps. Everything above works with no API keys.

