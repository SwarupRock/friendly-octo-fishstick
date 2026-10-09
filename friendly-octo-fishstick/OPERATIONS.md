# OPERATIONS — Titan runbook

## Provider states

`GET /api/modes` returns the live status of every provider slot: `configured`,
`available`, `verified`, plus circuit-breaker snapshots. Mock providers are
always labelled (`is_mock: true`); live slots report `verified: false` until
deliberately flipped via `_INTERFACE_VERIFIED=1` after a documented smoke test
of the official API.

### Enabling a provider for real

1. Set credentials only as environment variables (or your secret manager).
2. Re-read the provider's official docs (links in `API_ENDPOINTS.md`) and
   confirm the request/response contract.
3. Run one recorded smoke call, compare against docs, then set
   `TITAN_AGNES_INTERFACE_VERIFIED=1` / `TITAN_SARVAM_INTERFACE_VERIFIED=1`.
4. Record the evidence in `IMPLEMENTATION_PLAN.md`.

## Stuck jobs

- Video jobs persist `queued → running → completed|failed` in the `jobs` table.
  A crash mid-run leaves a `running` row; restart the run against the same job
  id (`POST /api/campaigns/videos/jobs/{id}/run` re-drives it; COMPLETED is
  idempotent).
- In production, run jobs from a durable queue worker (Cloud Tasks → Cloud Run
  worker, `TITAN_TASKS_MODE=cloud_tasks`), not in-process asyncio tasks.
- Symprom: repeated `ffmpeg_failed` → check FFmpeg availability
  (`ffmpeg -version`), input sizes, and disk space.

## Retry policy

- Transient provider errors (429, 5xx, network): exponential backoff, max 2
  retries for LLM/STT, max 1 for media synthesis (costly, billed per call).
- 401/403 and 4xx request errors: never retried.
- Publishing: `PUBLISHED` is terminal and idempotent; an ambiguous provider
  outcome is stored as `FAILED` with the raw response and requires review
  before any retry — Titan never auto-re-executes an external write.

## Log privacy

- Voice recordings, transcripts, and owner identifiers are never logged.
- Errors carry stable machine codes; provider payloads are truncated
  (stderr snippets capped at ~500 chars).
- HMAC secrets, provider API keys and Firebase credentials are never logged,
  returned over HTTP, or embedded into assets.

## Secret rotation

- `TITAN_SEAL_SECRET` (fact-lock seal + certificate HMAC):
  1. Generate a new long random secret.
  2. Old artifacts keep their old seal; verification of *old* certificates
     requires the old secret (keep it as `TITAN_SEAL_SECRET_PREVIOUS` during a
     rotation window; re-issue certificates on new runs going forward).
  3. Fact locks made before the rotation are still hash-verifiable — the fact
     hash is unkeyed; only the seal is keyed.
- Provider keys: rotate in the provider dashboard, then update the
  environment. Never place keys in `.env` under version control.
- Firebase service-account JSON: local-only, untracked; prefer Application
  Default Credentials on Cloud Run.

## Sabotage demo safety

- Requires `TITAN_ENABLE_DEMO_SABOTAGE=true` **and** `TITAN_MODE=mock`.
- Corrupts only an in-memory copy; the authoritative asset and facts are never
  written. The demo record is deleted after collection.
- The endpoint refuses to run in live mode by design.

## Release blockers (to call Titan production-ready)

Per handoff §1, §7 and §9, still open:

1. **Firebase adoption in production paths** — Auth (verify ID tokens server-
   side on every protected endpoint), Firestore persistence, Cloud Storage for
   media with restrictive rules. Current layer is SQLite/filesystem per the
   LOCKED source-of-truth architecture; a production release requires the
   migration plus server-side owner isolation (never trust client `owner_uid`).
2. **Owner identity** — replace the development `owner_uid` request parameter
   with the verified Firebase UID from the auth dependency.
3. **Live provider verification** — no Agnes/Sarvam/Windsor call has been
   live-verified (each requires credentials + smoke evidence).
4. **Durable task queue** — Cloud Tasks wiring for video/composition jobs in
   production (`TITAN_TASKS_MODE=cloud_tasks` is plumbed but unexercised).
5. **Secrets manager** — move `TITAN_SEAL_SECRET` + provider keys into Secret
   Manager for deployed environments.

## Incident playbook (quick)

| Symptom | Check | Action |
| --- | --- | --- |
| Lock returns 503 `seal_unavailable` | `TITAN_SEAL_SECRET` set? | Set the secret; no unsigned locks are ever produced |
| Plan returns 409 `seal_invalid` | Factsheet tampered? | Investigate how storage mutated; re-lock from a draft version |
| STT unavailable | `TITAN_STT_PROVIDER`, faster-whisper installed? | Use typed input fallback |
| Voice 409 `voice_id_missing` | Profile created with reference audio? | Recreate profile; `voice_id` is required (never improvised) |
| Video `ffmpeg_unavailable` | `ffmpeg -version` | Install FFmpeg; job can be re-run |
| OCR NEEDS_REVIEW spam | `tesseract --version` | Install Tesseract or accept disclosed limitation |
