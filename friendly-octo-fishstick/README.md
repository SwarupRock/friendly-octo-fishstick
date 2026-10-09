# Svarah.ai — Marketing OS

Voice-first marketing system for small businesses with a **Fact Integrity Engine**:
AI creates the marketing, but code guarantees the facts. Every generated asset
(caption, poster, voice ad, reel) is verified against a locked, HMAC-sealed
FactSheet before its owner approves publication.

> **Architecture source of truth:** `TITAN_SOURCE_OF_TRUTH.md`
> **Progress/evidence:** `IMPLEMENTATION_PLAN.md`, `docs/SVARAH_IMPLEMENTATION_STATUS.md`
> **Endpoints & provider registry:** `API_ENDPOINTS.md`, `docs/SVARAH_API_INTEGRATION.md`
> **Runbook:** `OPERATIONS.md`, `docs/SVARAH_SETUP_AND_CONFIGURATION.md`
> **Security:** `docs/SVARAH_SECURITY_AND_DEPLOYMENT.md`

## Feature map (Phases 1–9)

| Phase | Delivered |
| --- | --- |
| 1–2 | FastAPI backend, provider gateway (mock/verified slots), STT chain, versioned FactSheet, deterministic lock (`sha256` + HMAC seal), Fact Tokens |
| 3 | CampaignPlan from the locked tokens: channel copy (`instagram/facebook/x/whatsapp/poster/reel/voice`) + LocalizationSpecs (en-IN/hi-IN/kn-IN/ta-IN/te-IN) — token-only templates, deterministic substitution, persisted per locked FactSheet version |
| 4 | Poster compositor: Agnes-art slot (gated; labelled fallback art otherwise) + Pillow overlays **only from the token map** + rendered-fact registry + SHA-256 provenance |
| 5A/5B | Voice profiles (explicit consent required, owner-isolated, `voice_id` persisted and reused) + multilingual cloned-voice assets: chunked sentence-safe synthesis, base64 decode, WAV probe, checksums, mock labels |
| 6 | Reel generation: persisted job states + deterministic FFmpeg Ken-Burns compositor (terms: budget-capped, idempotent re-run), Agnes Video kept as gated enhancement |
| 7 | **Guardian**: numeric parity, unsourced numerics, unsupported claims, weekday parity, token residue, poster registry + OCR cross-check, ASR round-trip; bounded repair (≤2, then human review); Verification Certificate (JSON + HTML, HMAC-sealed, tamper-detecting); sabotage demo on copies only |
| 8 | Windsor.ai MCP publishing: real MCP `tools/call` client (mock in offline mode), connector/action discovery, schema validation, **explicit approval bound to caption+asset hashes**, sandbox publish, wa.me deep link, manual/export fallback for unsupported platforms (Facebook/X organic writes are correctly NOT assumed) |
| 9 | Docs, budgets, safety flags; dev/demo operates fully offline. Firebase production migration remains a **release blocker** (see `OPERATIONS.md`). |

## Quickstart (Windows PowerShell)

```powershell
# Backend (from the repository root: friendly-octo-fishstick/)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
python -c "import secrets; print(secrets.token_urlsafe(48))"   # generate a secret
# Put the value in ../.env as TITAN_SEAL_SECRET (fact lock) and, separately,
# as TITAN_AUTH_SECRET (session signing). See .env.example for every knob.
.\.venv\Scripts\python.exe -m pytest                      # 216 tests
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Frontend (web) — from the repository root
cd ..\frontend
npm install
npm run dev      # http://localhost:5173

# Frontend (mobile, Expo)
npm run mobile
```

Open http://localhost:5173 and use **Demo Login** to enter the workspace with no
credentials. The full journey — capture → confirm facts → lock → plan → create →
verify → approve & export — runs offline against mock providers.

`.env.example` documents every knob (providers, budgets, flags). In mock mode
(default) the system runs fully offline with honestly labelled mocks and
**never** touches social endpoints.

## Golden path

```text
typed/voice input → STT chain → extraction → FactSheet edit → LOCK (hash+seal)
→ CampaignPlan (token templates) → posters + captions + voice + reel
→ Guardian verify → (bounded repair) → certificate → owner approval
→ sandbox publish / wa.me / manual export
```

## Engineering mantra

**Agents decide. Code guarantees. Facts are locked. Every transformation is
audited. Humans authorize publication.**
