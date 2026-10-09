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

- `pytest` — **216 passed** (includes `test_auth.py` and the new
  `test_human_verify.py`).
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

- `backend/app/api/guardian_api.py` — added `POST /assets/{id}/human-verify`
  (explicit, audited owner decision on an inconclusive verdict; refuses a hard
  `FAIL`; uses the latest aggregate verdict).
- `backend/tests/test_human_verify.py` — 7 new tests.
- `frontend/apps/web/src/lib/api.js` — `humanVerifyAsset`.
- `frontend/apps/web/src/workspace/VerifyStep.jsx` — human-decision UI.
- `.env.example` — documented `TITAN_AUTH_SECRET`, `TITAN_AUTH_TOKEN_TTL_HOURS`,
  `TITAN_ALLOW_DEMO_LOGIN`, `TITAN_MAX_REQUEST_BYTES`.
- Local `.env` (git-ignored) — added a random `TITAN_AUTH_SECRET` and the two
  auth toggles; **no existing value was changed**.
- `docs/SVARAH_PRODUCT_ARCHITECTURE.md`, `SVARAH_SETUP_AND_CONFIGURATION.md`,
  `SVARAH_API_INTEGRATION.md`, `SVARAH_SECURITY_AND_DEPLOYMENT.md` (new).

Earlier uncommitted work (auth surface, ownership, workspace UI, API client,
Svarah rebrand) was reviewed and validated rather than rewritten.

### Provider mode

`TITAN_MODE=mock`. **No live keys are configured**; every provider reports its
mock status via `GET /api/modes`. Placeholder keys are treated as unconfigured.

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

