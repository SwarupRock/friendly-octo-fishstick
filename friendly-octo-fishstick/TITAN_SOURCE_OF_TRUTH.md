# TITAN — SOURCE OF TRUTH
## Repo Brain / Implementation Contract

> **Status:** LOCKED — implementation source of truth  
> **Project:** Titan Marketing OS  
> **Problem:** HR26-AI-02 — Marketing Campaigns  
> **Primary intelligence:** Agnes 3.0 Flash  
> **Core differentiator:** Fact Integrity Engine  
> **Architecture:** FastAPI + React/Vite + SQLite + filesystem  
> **Document role:** This file is the authoritative implementation contract for the repository.

---

# 0. HOW THIS FILE MUST BE USED

This file is the **brain of the repository**.

Any coding agent, AI assistant, developer, or future implementation session must read this file before making architectural changes.

## Source-of-truth hierarchy

When information conflicts:

1. **Locked business facts** are the source of truth for customer-facing offer information.
2. **This document** is the source of truth for product architecture and implementation.
3. Existing code is the source of truth for already-implemented behavior only when it does not conflict with this document.
4. AI-generated suggestions are never authoritative.

## Change rule

Do not silently redesign the architecture.

A proposed architectural change must:

- explain why the existing decision is insufficient;
- identify affected components;
- update this document before becoming the new implementation contract;
- preserve the core Fact Integrity guarantees.

## Absolute product rule

> **Generation is allowed to be creative. Facts are not.**

---

# 1. PRODUCT VISION

Titan is a **voice-first autonomous marketing campaign system for small businesses**.

A shopkeeper should be able to speak naturally about their business and an offer. Titan converts that spoken input into a complete, multilingual, multi-channel campaign package containing:

- verified marketing copy;
- social captions;
- posters;
- short promotional videos;
- voice advertisements;
- multilingual voice variants;
- culturally and regionally adapted campaign variants;
- WhatsApp-ready content;
- optional social publishing payloads;
- validation evidence;
- a verification certificate.

The owner should not need to understand marketing terminology or manually create a campaign brief.

The core experience is:

```text
SHOPKEEPER VOICE
        ↓
UNDERSTAND
        ↓
LOCK THE FACTS
        ↓
PLAN THE CAMPAIGN
        ↓
GENERATE CREATIVE ASSETS
        ↓
VERIFY EVERY ASSET
        ↓
REPAIR FAILURES
        ↓
OWNER APPROVAL
        ↓
PUBLISH / EXPORT
```

---

# 2. THE PRODUCT'S REAL USP

Titan is **not** primarily an ad generator.

Ad generation is commodity functionality.

Titan's core differentiator is the:

# FACT INTEGRITY ENGINE

Titan must be able to demonstrate that important business facts remain correct across:

- text;
- translation;
- posters;
- video overlays;
- generated voice;
- captions;
- regional variants;
- multilingual variants;
- publishing payloads.

The pitch should be:

> **"Titan lets AI create the marketing, while the business owner controls the truth."**

Stronger technical framing:

> **"We use agents where intelligence helps and code where guarantees matter."**

---

# 3. OFFICIAL HR26 ALIGNMENT

The official HR26-AI-02 Marketing Campaigns brief requires:

- coherent campaigns adapted to audiences, languages, and channels;
- campaign performance prediction and optimization;
- preservation of exact business intent while adapting messaging;
- Agnes 3.0 Flash for campaign planning, multilingual copy, and locked offer-facts checking;
- Agnes Image 2.5 Flash for posters/social creatives;
- Agnes Video 2.5 / Flash for short promotional clips.

Official brief:

`HR26: Agentic Voice AI — Marketing Campaigns`

Important platform constraints from the brief:

- Agnes 3.0 Flash does not directly accept speech.
- Voice interfaces therefore require separate STT/TTS components.
- Video generation is asynchronous.
- Video should be queued and retried with backoff.
- Saved demo outputs are explicitly acceptable as demo fallback when labeled.

Titan must be designed around those constraints rather than assuming unlimited or synchronous generation.

---

# 4. FINAL ARCHITECTURE

```text
                         ┌─────────────────────────────┐
                         │        REACT + VITE         │
                         │                             │
                         │ Record → FactSheet → Studio │
                         │ → Verify → Publish/Export   │
                         │                             │
                         │ SSE live progress           │
                         └──────────────┬──────────────┘
                                        │ REST + SSE
                                        ▼
                         ┌─────────────────────────────┐
                         │        FASTAPI APP          │
                         │        one process          │
                         │                             │
                         │ API + Orchestrator + Jobs   │
                         │ SSE bus + Provider Gateway  │
                         └──────────────┬──────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             │                          │                          │
             ▼                          ▼                          ▼
   ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │ FACT INTEGRITY   │       │   AI GATEWAY     │       │ CREATIVE / MEDIA │
   │ ENGINE           │       │                  │       │                  │
   │                  │       │ Agnes 3.0 Flash  │       │ Image generation │
   │ extract/normalize│       │ + fallbacks      │       │ Pillow           │
   │ lock/hash/seal   │       │ + mock mode      │       │ FFmpeg           │
   │ token map        │       │ + circuit breaker│       │ TTS              │
   └──────────────────┘       └──────────────────┘       └──────────────────┘
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │     GUARDIAN     │
                              │                  │
                              │ deterministic    │
                              │ text checks      │
                              │ OCR              │
                              │ ASR              │
                              │ semantic critic  │
                              │ trust score      │
                              └────────┬─────────┘
                                       │
                         ┌─────────────┼─────────────┐
                         ▼                           ▼
                   AUTO-REPAIR                    HUMAN GATE
                         │                           │
                         └─────────────┬─────────────┘
                                       ▼
                           ┌──────────────────────┐
                           │ PUBLISHER / EXPORTER│
                           │                      │
                           │ Sandbox              │
                           │ wa.me                │
                           │ Agent Reach adapter  │
                           │ ZIP + certificate   │
                           └──────────────────────┘

                       SQLite + /assets filesystem
```

---

# 5. ARCHITECTURAL PRINCIPLES

## 5.1 Do not build 12 sequential agents

The final architecture uses a small number of intelligent model calls and deterministic engines.

Primary intelligent stages:

1. Agnes 3.0 Flash — fact extraction.
2. Agnes 3.0 Flash — campaign brain / copy / localization / creative specifications.
3. Optional Agnes advisory critic — semantic drift only.

Deterministic engines handle:

- fact normalization;
- locking;
- hashes;
- HMAC integrity seal;
- token substitution;
- text auditing;
- poster composition;
- video composition;
- OCR;
- ASR round-trip;
- trust scoring;
- export;
- job persistence.

---

# 6. THE FACT FIREWALL

Facts need intelligence for extraction, but after locking they must be protected from free-form generation.

Use three conceptual levels.

## Level 0 — AUTHORITATIVE FACTS

Examples:

- price;
- discount;
- date;
- day;
- time;
- product;
- quantity;
- location;
- contact information;
- offer conditions;
- explicit business claims.

These are protected.

## Level 1 — SEMANTIC DESCRIPTORS

Examples:

- iced coffee;
- cozy cafe;
- students;
- local neighborhood;
- family audience;
- premium;
- casual;
- festive.

These may be used by Agnes and creative models to produce appropriate marketing.

## Level 2 — CREATIVE PRESENTATION

Examples:

- lighting;
- scene composition;
- visual mood;
- storytelling;
- headline style;
- camera movement;
- music style.

These are creative.

### Rule

Generative models may control Levels 1 and 2.

Generative models must not freely alter Level 0.

---

# 7. VOICE-FIRST INPUT

## STT architecture

STT must be provider-abstracted.

Interface:

```python
class STTProvider:
    async def transcribe(self, audio) -> Transcript:
        ...
```

Provider hierarchy:

```text
Primary sponsor / selected STT provider
        ↓
faster-whisper local fallback
        ↓
typed input fallback
```

The exact primary provider may be swapped based on hackathon access and tested reliability.

Local fallback:

- faster-whisper;
- preferably int8/efficient local configuration.

Store:

- raw audio;
- raw transcript;
- normalized transcript;
- timestamps;
- detected language;
- segment confidence where available;
- transcript hash.

The raw transcript is immutable.

---

# 8. VOICE IDENTITY / VOICE CLONING

Titan supports an optional **Voice Identity** layer.

The shopkeeper may provide a short consenting reference recording.

The system creates a reusable voice profile.

## Voice profile

Conceptual schema:

```json
{
  "voice_profile_id": "shop_001_owner",
  "reference_audio_path": "voices/shop_001/reference.wav",
  "owner_consent": true,
  "reference_transcript": "...",
  "supported_languages": ["en", "hi", "kn", "ta", "te"],
  "preferred_delivery": {
    "warmth": 0.8,
    "energy": 0.7,
    "pace": "medium",
    "formality": "friendly"
  }
}
```

### Consent is mandatory

Do not clone or synthesize a real person's voice without explicit consent.

For the hackathon demo, use:

- your own voice; or
- a teammate's consenting voice.

## Voice provider abstraction

```python
class VoiceProvider:
    async def clone_voice(self, reference_audio) -> VoiceProfile:
        ...

    async def synthesize(
        self,
        text,
        language,
        voice_profile,
        delivery_spec
    ) -> AudioAsset:
        ...
```

Potential provider hierarchy:

```text
Primary multilingual voice-cloning provider
        ↓
Indic-capable provider for unsupported languages
        ↓
Local/configurable TTS fallback
        ↓
silent-fail / prerecorded demo fallback
```

Do not hard-code the assumption that one provider has equal quality across every Indian language.

Language/provider support must be tested.

---

# 9. MULTILINGUAL VOICE CAMPAIGNS

The same voice identity should be reusable across supported languages.

Initial target language set:

- English;
- Hindi;
- Kannada;
- Tamil;
- Telugu.

The system architecture must support additional languages without changing the campaign core.

Example:

```text
Voice Profile
      │
      ├── English
      ├── Kannada
      ├── Hindi
      ├── Tamil
      └── Telugu
```

The important distinction is:

```text
LANGUAGE ≠ REGION ≠ CULTURE
```

These must be independently represented.

---

# 10. CULTURAL + REGIONAL ADAPTATION

Titan should not merely translate English into another language.

Agnes must generate a structured **LocalizationSpec**.

Example:

```json
{
  "locale": "kn-IN",
  "language": "Kannada",
  "region": "Bengaluru",
  "audience": "college_students",
  "tone": [
    "friendly",
    "local",
    "conversational"
  ],
  "delivery": {
    "pace": "energetic",
    "warmth": "high",
    "formality": "low"
  },
  "avoid": [
    "textbook wording",
    "unnatural literal translation",
    "forced slang"
  ]
}
```

Regions may include:

- Bengaluru;
- Mysuru;
- Chennai;
- Hyderabad;
- Mumbai;
- Delhi;
- or future arbitrary regions.

Audience/cultural styles may include:

- college students;
- office workers;
- families;
- neighborhood customers;
- premium consumers;
- festive audiences;
- local-community audiences.

Agnes adapts:

- idiom;
- phrasing;
- cultural references;
- CTA tone;
- pacing;
- formality;
- audience framing.

Locked facts remain identical unless a localized representation is explicitly required.

---

# 11. VOICE LOCALIZATION PIPELINE

```text
LOCKED FACTS
      ↓
AGNES CAMPAIGN BRAIN
      ↓
LocalizationSpec
      ↓
localized script
      ↓
Voice Provider
      ↓
same voice identity
      ↓
audio
      ↓
faster-whisper ASR
      ↓
re-extract facts
      ↓
compare against locked FactSheet
```

Example failure:

```text
LOCKED:
20% OFF

GENERATED KANNADA AUDIO:
25% OFF

Guardian:
FAIL

Action:
REGENERATE
```

This is a core part of the voice demo.

---

# 12. VOICE QUALITY CHECKS

Voice assets should record:

```json
{
  "voice_similarity_score": 0.94,
  "language_quality_score": 0.91,
  "fact_integrity_score": 1.0
}
```

Do not claim absolute speaker identity guarantees unless the provider exposes a reliable metric.

Use similarity as an engineering signal, not an absolute identity proof.

---

# 13. AGNES 3.0 FLASH — CAMPAIGN BRAIN

Agnes 3.0 Flash is the central reasoning/model layer.

Use it for:

- fact extraction;
- ambiguity detection;
- campaign strategy;
- audience strategy;
- creative direction;
- copy;
- multilingual adaptation;
- regional adaptation;
- localization specifications;
- poster specifications;
- video storyboards;
- voice scripts;
- performance prediction;
- optimization recommendations;
- advisory semantic checking.

Do not create a separate serial "agent" for each of these.

A single structured Agnes call should produce the campaign specification needed for the parallel downstream work whenever possible.

---

# 14. FACT EXTRACTION

Fact extraction proposes.

It never locks.

Input:

- transcript;
- shop profile;
- locale.

Output:

```json
{
  "offer": {
    "product": [],
    "discount_percent": null,
    "discount_flat": null,
    "price": null,
    "quantity": null,
    "audience": [],
    "days": [],
    "date_start": null,
    "date_end": null,
    "start_time": null,
    "end_time": null,
    "conditions": [],
    "location": null
  },
  "extraction_confidence": {},
  "inferred": [],
  "ambiguities": []
}
```

Rules:

- never invent;
- never silently correct;
- normalize numbers;
- normalize times;
- mark inference;
- report ambiguity;
- preserve code-mixed language;
- return strict JSON.

---

# 15. HUMAN FACT CONFIRMATION

Before expensive asset generation:

```text
I UNDERSTOOD

Business: ...
Offer: ...
Price: ...
Validity: ...
Audience: ...
Languages: ...
Conditions: ...

[Edit]
[Lock these facts]
```

The owner must confirm.

This is not friction.

It is a core safety feature.

If facts are edited:

```text
edit
 ↓
normalize
 ↓
rehash
 ↓
status=draft
 ↓
re-lock
```

---

# 16. FACT LOCK

Fact locking is deterministic code, never an LLM action.

Process:

```text
draft facts
    ↓
normalize
    ↓
canonical JSON
    ↓
SHA-256
    ↓
HMAC seal
    ↓
compile Fact Tokens
```

Example:

```text
FACT-001 → DISCOUNT
FACT-002 → PRODUCT
FACT-003 → DAYS
FACT-004 → WINDOW
FACT-005 → AUDIENCE
FACT-006 → CONDITIONS
```

---

# 17. FACT TOKENS

Once facts are locked, customer-facing copy is generated using immutable placeholders.

Example:

```text
"Students, this one's for you ☕
{{DISCOUNT}} off {{PRODUCT}}
{{DAYS}}, {{WINDOW}}."
```

The model is forbidden from writing literal values for:

- numbers;
- percentages;
- price;
- time;
- date;
- day;
- quantity;
- offer condition;
- protected product facts.

Code performs substitution.

Example:

```text
"20% off Cold Coffee —
Saturday & Sunday,
4 PM–8 PM."
```

This is **trust by construction**.

---

# 18. COPYWRITER

One structured Agnes call should generate all core channel templates.

Target outputs:

- Instagram;
- Facebook;
- X;
- WhatsApp;
- poster headline;
- poster subline;
- reel script;
- voice-ad script.

The copywriter receives:

- token map;
- brand DNA;
- campaign angle;
- channel constraints;
- localization specs.

It should not receive mutable raw fact values as free-form instructions for rewriting.

---

# 19. LOCALIZER

Localization preserves token identity exactly.

Input:

```text
{{DISCOUNT}} off {{PRODUCT}} — {{DAYS}}, {{WINDOW}}
```

Output may change the wording around tokens.

Tokens must remain byte-for-byte recognizable:

```text
{{DISCOUNT}}
{{PRODUCT}}
{{DAYS}}
{{WINDOW}}
```

Never translate token names.

Never add literal numbers or dates.

---

# 20. BRAND DNA

Each shop can have cached brand DNA:

```json
{
  "tone": ["friendly", "local", "warm"],
  "vocabulary": [],
  "emoji_set": [],
  "palette": ["#...", "#...", "#...", "#..."],
  "do_not": []
}
```

Brand DNA is creative context.

It does not override locked offer facts.

---

# 21. IMAGE GENERATION

Primary:

**Agnes Image 2.5 Flash**

Use it for:

- background art;
- visual concepts;
- lifestyle imagery;
- promotional scenes;
- creative variants.

Never rely on the image model for critical offer typography.

Image prompts must explicitly request:

```text
NO TEXT
NO LETTERS
NO NUMBERS
NO TYPOGRAPHY
NO WATERMARK
```

Then compose facts deterministically.

---

# 22. POSTER COMPOSITION

```text
Agnes Image
     ↓
background artwork
     ↓
Pillow / deterministic compositor
     ↓
brand header
headline
offer
fact strip
CTA
QR
     ↓
final poster
```

Every rendered string must be recorded:

```json
{
  "rendered_facts": {
    "DISCOUNT": "20%",
    "PRODUCT": "Cold Coffee",
    "DAYS": "Saturday & Sunday",
    "WINDOW": "4 PM–8 PM"
  }
}
```

This registry is the authoritative record of what the compositor intended to render.

OCR independently checks the final visual result.

---

# 23. VIDEO GENERATION

Primary:

- Agnes Video 2.5 / Flash where available and reliable.

Important:

The video model is an enhancement layer, not the reliability core.

Reliable core:

```text
art / image assets
     ↓
Ken Burns / pan / zoom
     ↓
deterministic overlays
     ↓
voiceover
     ↓
music
     ↓
captions
     ↓
FFmpeg
     ↓
verified reel
```

If Agnes Video fails:

```text
Agnes Video unavailable
        ↓
FFmpeg compositor
        ↓
polished deterministic reel
```

The user still receives a complete campaign.

---

# 24. VIDEO QUEUE

Video generation is asynchronous.

Jobs must have:

```text
job_id
campaign_id
stage
status
attempts
provider
model
created_at
started_at
completed_at
error
payload
```

Statuses:

```text
QUEUED
RUNNING
VALIDATING
REPAIRING
COMPLETED
FAILED
BLOCKED
CANCELLED
```

Never report video success until:

1. generation completed;
2. output was retrieved;
3. file exists;
4. validation completed.

Respect:

- rate limits;
- exponential backoff;
- provider circuit breakers;
- maximum retries.

---

# 25. TTS / VOICE AD

Voice script comes from Agnes.

Voice synthesis uses the selected Voice Profile and LocalizationSpec.

Pipeline:

```text
localized token script
        ↓
deterministic fact substitution
        ↓
voice synthesis
        ↓
audio
        ↓
ASR round trip
        ↓
fact re-extraction
        ↓
diff against locked facts
```

If the ASR output indicates fact mutation:

```text
FAIL → repair → synthesize again → verify again
```

---

# 26. GUARDIAN — VERIFICATION SYSTEM

Guardian is deterministic-first.

It is the centerpiece of Titan.

Checks include:

### Text

- numeric parity;
- unsourced numerics;
- time window;
- day match;
- product/entity presence;
- token lint;
- unsupported claims;
- channel constraints.

### Poster

- rendered fact registry;
- fact-zone OCR;
- numeric OCR;
- entity OCR.

### Video

- frame OCR;
- overlay registry;
- ASR;
- fact re-extraction;
- timeline consistency.

### Voice

- ASR;
- fact re-extraction;
- localized meaning checks.

### LLM critic

Agnes may provide semantic-drift advice.

It is advisory only.

It cannot override a deterministic failure.

---

# 27. UNSOURCED NUMERICS

This is a critical check.

Extract every number from final customer-facing text.

Every number must map to:

- a locked fact;
- or a safe derived value.

Examples of acceptable derived values:

```text
2 days
```

if the locked day set contains exactly two days.

Examples of forbidden unsourced values:

```text
first 50 customers
₹999
25% off
open until 11 PM
```

if those values do not exist in the locked facts.

Any unmapped number = FAIL.

---

# 28. UNSUPPORTED CLAIMS

Numbers are not the only danger.

Detect claims such as:

- limited stock;
- first N customers;
- guaranteed;
- No.1;
- best in town;
- award-winning;
- exclusive;
- free item;
- complimentary;
- while stocks last;
- today only;
- verified/certified;
- medical/health claims.

If a claim cannot be traced to an approved fact or allowed brand claim:

```text
FAIL or NEEDS_REVIEW
```

Do not allow the model to invent commercial conditions.

---

# 29. NORMALIZATION

All fact comparisons pass through one normalizer.

Examples:

```text
२० → 20
twenty → 20
4 PM → 16:00
16:00 → 16:00
Sat → Saturday
शनिवार → Saturday
shanivar → Saturday
```

Products can use:

- casefolding;
- diacritic normalization;
- transliteration;
- shop product vocabulary;
- similarity as a secondary match.

Normalization must never modify the locked facts themselves.

---

# 30. OCR STRATEGY

OCR should focus on controlled fact zones.

Poster:

```text
crop
→ grayscale
→ upscale
→ threshold
→ OCR
```

Known-font/high-contrast fact strips make OCR more reliable.

Important:

The compositor registry is the authoritative record of intended rendered text.

OCR is the perceptual audit of what actually appeared.

For Indic scripts, OCR quality may be weaker.

Do not falsely claim perfect OCR coverage.

Where OCR is weak:

- registry remains primary;
- OCR remains advisory where appropriate;
- state the limitation transparently.

---

# 31. ASR ROUND-TRIP

For voice and video audio:

```text
locked facts
     ↓
token script
     ↓
fact substitution
     ↓
TTS / voice clone
     ↓
audio
     ↓
faster-whisper ASR
     ↓
fact extraction
     ↓
normalized diff
     ↓
Guardian verdict
```

This creates a powerful demo:

> Titan audits the advertisement's own voice.

---

# 32. SEMANTIC CRITIC

Use Agnes as an advisory critic for problems that deterministic checks cannot fully express.

Examples:

```text
Locked:
"Valid for students only."

Generated:
"Everyone can enjoy 20% off."

```

The critic can flag semantic contradiction.

The critic cannot make a failed deterministic asset pass.

Recommended weight:

5% of trust score.

---

# 33. TRUST SCORE

Initial weights:

```python
weights = {
    "numeric_parity": 25,
    "unsourced_numerics": 20,
    "time_window": 10,
    "day_match": 10,
    "entity_presence": 15,
    "ocr_fact_zone": 10,
    "asr_roundtrip": 10,
    "semantic_drift": 5
}
```

Checks not applicable to an asset are excluded.

Any critical check failure:

```text
trust <= 60
verdict = FAILED
```

Suggested thresholds:

```text
>= 92  VERIFIED
75–91 NEEDS_REVIEW
< 75   FAILED
```

These thresholds are configurable.

---

# 34. AUTO-REPAIR

Flow:

```text
generate
  ↓
verify
  ↓
fail
  ↓
diagnostics
  ↓
repair only failed conditions
  ↓
verify
```

Maximum:

**2 automatic repair attempts**

If still failing:

```text
human editor
      ↓
edit
      ↓
re-verify
      ↓
human_verified
```

Never silently bypass the Guardian.

---

# 35. SABOTAGE / DEMO MODE

Titan must contain a demo-only corruption mechanism.

It should be capable of deliberately changing:

```text
20% → 25%
Saturday → Sunday
inject "first 50 customers"
```

Then show:

```text
FAIL
  ↓
diagnostic
  ↓
repair
  ↓
PASS
```

This should be implemented as a controlled test path and covered by automated tests.

Suggested endpoint:

```http
POST /api/assets/{id}/simulate-corruption
```

Never expose this as a normal user-facing production capability.

---

# 36. CAMPAIGN STATE MACHINE

Persist campaign state.

```text
captured
   ↓
extracted
   ↓
locked
   ↓
generating
   ↓
verified
   ↓
needs_review
   ↓
approved
   ↓
published
   ↓
exported
```

If generation fails:

```text
generating → needs_review
```

If repair is successful:

```text
generating → verified
```

Every transition must be persisted.

---

# 37. RESUMABLE JOB SYSTEM

Use a SQLite jobs table.

No Redis/Celery is required for the hackathon.

Jobs must survive backend restart.

At startup:

```text
queued unfinished jobs
        ↓
re-enqueue
```

This enables:

- resumable generation;
- kill-switch testing;
- fallback;
- seeded replay.

---

# 38. PROVIDER GATEWAY

All external AI providers must be accessed through a gateway.

Concept:

```text
Provider Gateway
    │
    ├── Primary
    ├── Fallback
    └── Mock
```

The gateway handles:

- timeout;
- retries;
- exponential backoff;
- circuit breaker;
- structured error normalization;
- provider status;
- usage metadata;
- mock mode.

Environment:

```text
TITAN_MODE=live
TITAN_MODE=mock
```

Every provider must expose its current mode/status to the UI.

---

# 39. FALLBACK PHILOSOPHY

Failures must degrade gracefully.

## STT

```text
primary STT
→ faster-whisper
→ typed input
```

## LLM

```text
Agnes 3.0 Flash
→ configured fallback model
→ deterministic template/mock mode
```

## Image

```text
Agnes Image 2.5
→ fallback image provider
→ prebaked background assets
```

## Video

```text
Agnes Video
→ FFmpeg deterministic reel
→ prebaked demo reel
```

## Voice

```text
primary voice provider
→ alternate multilingual provider
→ local/configurable TTS
→ prerecorded demo voice
```

## Publishing

```text
Agent Reach
→ supported official/provider adapter
→ sandbox
→ wa.me
→ export package
```

A fallback must be visibly labeled in internal status/audit information.

---

# 40. SOCIAL PUBLISHING

Publishing is an adapter layer.

It must never be required for campaign generation.

Interface:

```python
class SocialPublisher:
    def capabilities(self):
        ...

    async def validate(self, payload):
        ...

    async def publish(self, payload):
        ...

    async def status(self, job_id):
        ...
```

Initial modes:

```text
sandbox
wa.me
Agent Reach
future live platform APIs
```

Do not make the demo depend on real Meta/X OAuth.

If a live provider is unavailable:

- prepare the exact payload;
- show it;
- generate the media;
- generate the caption;
- provide a deep link/manual action;
- continue the campaign.

---

# 41. HUMAN PUBLISH APPROVAL

AI generation may be autonomous.

Final publishing requires explicit human approval.

UI:

```text
CAMPAIGN READY

✓ Facts verified
✓ Posters verified
✓ Videos verified
✓ Voice verified
✓ Translations verified

[APPROVE CAMPAIGN]
```

Then:

```text
[Publish Instagram]
[Publish Facebook]
[Publish X]
[Open WhatsApp]
[Export]
```

---

# 42. CAMPAIGN PACKAGE

Export:

```text
campaign/
├── campaign.json
│
├── source/
│   ├── transcript.txt
│   ├── normalized_transcript.txt
│   └── offer_facts.json
│
├── strategy/
│   ├── campaign_plan.json
│   └── localization_specs.json
│
├── copy/
│   ├── master_copy.json
│   ├── instagram.txt
│   ├── facebook.txt
│   ├── x.txt
│   └── whatsapp.txt
│
├── voices/
│   ├── english.mp3
│   ├── kannada.mp3
│   ├── hindi.mp3
│   ├── tamil.mp3
│   └── telugu.mp3
│
├── posters/
│   ├── poster_01.png
│   ├── poster_02.png
│   └── poster_03.png
│
├── videos/
│   ├── reel_01.mp4
│   └── reel_02.mp4
│
├── verification/
│   ├── validation_report.json
│   ├── validation_report.html
│   └── certificate.json
│
├── publishing/
│   └── publish_manifest.json
│
└── audit/
    └── audit_log.json
```

---

# 43. VERIFICATION CERTIFICATE

The certificate must contain:

```json
{
  "certificate_version": "1.0",
  "campaign_id": 42,
  "fact_hash": "sha256:...",
  "fact_seal": "hmac:...",
  "provenance_chain": {
    "transcript_hash": "sha256:...",
    "fact_hash": "sha256:...",
    "assets": [
      {
        "asset": "poster",
        "sha256": "...",
        "trust": 97.5
      }
    ]
  },
  "checks": [],
  "trust_score_overall": 96.8,
  "issued_at": "..."
}
```

Call this a:

**Verification Certificate**

not necessarily a public-key digital signature certificate.

---

# 44. DATABASE

Use SQLite for the hackathon.

Keep schema Postgres-compatible in design.

Core tables:

```text
shops
campaigns
fact_sheets
assets
verification_results
jobs
publish_records
voice_profiles
audit_events
```

Additional future tables can be introduced only when required.

---

# 45. RECOMMENDED SCHEMA

```sql
CREATE TABLE shops (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    handle TEXT,
    location TEXT,
    locale TEXT DEFAULT 'en',
    brand_json TEXT
);

CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL,
    transcript TEXT,
    transcript_hash TEXT,
    status TEXT NOT NULL DEFAULT 'captured',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fact_sheets (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    facts_json TEXT NOT NULL,
    draft_json TEXT,
    fact_hash TEXT,
    seal TEXT,
    status TEXT DEFAULT 'draft',
    locked_at TIMESTAMP
);

CREATE TABLE voice_profiles (
    id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL,
    profile_json TEXT NOT NULL,
    consent_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    locale TEXT DEFAULT 'en',
    text_content TEXT,
    storage_path TEXT,
    meta_json TEXT,
    status TEXT DEFAULT 'pending',
    trust_score REAL
);

CREATE TABLE verification_results (
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL,
    check_name TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence REAL,
    details_json TEXT,
    attempt INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER,
    stage TEXT NOT NULL,
    status TEXT DEFAULT 'queued',
    attempts INTEGER DEFAULT 0,
    error TEXT,
    payload_json TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE publish_records (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    mode TEXT,
    payload_json TEXT,
    response_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

# 46. API CONTRACT

Core routes:

```http
POST /api/campaigns
```

Input:

```json
{
  "audio_b64": "...",
  "text": null,
  "shop_id": 1
}
```

Runs:

```text
STT → extraction
```

Returns campaign + draft facts.

---

```http
GET /api/campaigns/{id}
```

Returns:

- campaign state;
- FactSheet;
- assets;
- verification results;
- trust scores;
- provider state;
- audit state.

---

```http
PATCH /api/factsheets/{id}
```

Edits facts.

Editing must:

```text
renormalize
rehash
return to draft
```

---

```http
POST /api/factsheets/{id}/lock
```

Locks and seals the facts.

---

```http
POST /api/campaigns/{id}/generate
```

Starts orchestration.

---

```http
GET /api/campaigns/{id}/events
```

SSE progress stream.

Example:

```text
event: stage
data: {"stage":"poster","status":"generating_art"}

event: check
data: {"asset":"instagram","check":"numeric_parity","verdict":"pass"}

event: repair
data: {
  "asset":"caption_x",
  "violation":"unsourced_numerics",
  "attempt":1
}

event: trust
data: {
  "asset":"poster",
  "score":97.5,
  "verdict":"VERIFIED"
}
```

---

```http
GET /api/assets/{id}/file
```

Serves the asset.

---

```http
POST /api/assets/{id}/approve
```

Human approval.

---

```http
POST /api/assets/{id}/edit
```

Human edit → re-substitution → re-verification.

---

```http
POST /api/assets/{id}/regenerate
```

Re-run a failed asset.

---

```http
POST /api/assets/{id}/simulate-corruption
```

Demo/test only.

---

```http
POST /api/campaigns/{id}/publish
```

Input:

```json
{
  "channels": ["sandbox", "whatsapp"]
}
```

---

```http
GET /api/campaigns/{id}/export
```

Returns ZIP.

---

```http
GET /api/health
GET /api/modes
```

Shows provider/fallback status.

---

# 47. FINAL FOLDER STRUCTURE

```text
titan/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py
│   │   │
│   │   ├── api/
│   │   │   ├── campaigns.py
│   │   │   ├── factsheets.py
│   │   │   ├── assets.py
│   │   │   ├── voice_profiles.py
│   │   │   ├── publish.py
│   │   │   └── export.py
│   │   │
│   │   ├── orchestrator/
│   │   │   ├── pipeline.py
│   │   │   ├── jobs.py
│   │   │   └── sse.py
│   │   │
│   │   ├── services/
│   │   │   ├── gateway.py
│   │   │   ├── stt.py
│   │   │   ├── llm.py
│   │   │   ├── tts.py
│   │   │   ├── voice.py
│   │   │   ├── fact_engine.py
│   │   │   ├── campaign_brain.py
│   │   │   ├── copywriter.py
│   │   │   ├── localizer.py
│   │   │   ├── creative.py
│   │   │   ├── video.py
│   │   │   ├── publisher.py
│   │   │   └── exporter.py
│   │   │
│   │   ├── guardian/
│   │   │   ├── normalize.py
│   │   │   ├── checks_text.py
│   │   │   ├── checks_media.py
│   │   │   ├── checks_audio.py
│   │   │   ├── critic.py
│   │   │   ├── scoring.py
│   │   │   └── certificate.py
│   │   │
│   │   └── prompts/
│   │       ├── extract.yaml
│   │       ├── campaign_brain.yaml
│   │       ├── copywrite.yaml
│   │       ├── localize.yaml
│   │       ├── voice_localize.yaml
│   │       ├── repair.yaml
│   │       ├── critic.yaml
│   │       ├── poster_art.yaml
│   │       └── brand_dna.yaml
│   │
│   ├── assets_store/
│   ├── tests/
│   │   ├── test_fact_engine.py
│   │   ├── test_guardian.py
│   │   ├── test_voice_integrity.py
│   │   ├── test_pipeline_mock.py
│   │   └── fixtures/
│   │
│   └── scripts/
│       ├── seed_demo.py
│       ├── prebake_fallbacks.py
│       └── smoke_providers.py
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Record.jsx
│       │   ├── FactSheet.jsx
│       │   ├── Studio.jsx
│       │   ├── Voice.jsx
│       │   └── Publish.jsx
│       │
│       ├── components/
│       │   ├── MicButton.jsx
│       │   ├── VoiceRecorder.jsx
│       │   ├── VoiceProfileCard.jsx
│       │   ├── FactTable.jsx
│       │   ├── LockSeal.jsx
│       │   ├── AssetCard.jsx
│       │   ├── VerificationMatrix.jsx
│       │   ├── TrustBadge.jsx
│       │   └── RepairLog.jsx
│       │
│       └── lib/
│           ├── api.js
│           └── sse.js
│
├── assets/
│
├── REPO_BRAIN.md
├── README.md
└── .env.example
```

---

# 48. FRONTEND EXPERIENCE

## Screen 1 — Record

```text
CREATE A CAMPAIGN

[ 🎙 Start speaking ]

Tell us about your offer.
```

Show:

- recording timer;
- detected language;
- transcript preview;
- typed fallback.

---

## Screen 2 — FactSheet

```text
I UNDERSTOOD

Business
Offer
Price
Validity
Audience
Conditions
Languages

Confidence
Inferred flags

[EDIT]
[LOCK FACTS]
```

Lock animation should show:

```text
Normalizing...
Canonicalizing...
SHA-256...
Sealing...
Compiling Fact Tokens...

✓ SOURCE OF TRUTH LOCKED
```

---

## Screen 3 — Studio

```text
CAMPAIGN GENERATING

✓ Understanding offer
✓ Facts locked
✓ Campaign strategy
✓ Captions
◉ Posters
◉ Voice ads
◉ Reel
◌ Verification
```

First verified captions should appear as early as possible.

---

## Screen 4 — Verification Matrix

This is the centerpiece.

```text
                    Caption  Poster  Voice  Reel
Discount               ✓       ✓       ✓      ✓
Days                   ✓       ✓       ✓      ✓
Time                   ✓       ✓       ✓      ✓
Unsourced claims       ✓       ✓       ✓      ✓
OCR                    —       ✓       —      ✓
ASR round trip         —       —       ✓      ✓
Semantic drift         ✓       ✓       ✓      ✓
```

---

## Screen 5 — Voice Studio

Show:

```text
VOICE IDENTITY

✓ Reference recorded
✓ Consent confirmed

LANGUAGES

✓ English
✓ Kannada
✓ Hindi
✓ Tamil
✓ Telugu
```

Each voice asset should show:

- play button;
- language;
- voice similarity;
- fact integrity;
- verification state.

---

## Screen 6 — Publish

```text
CAMPAIGN READY

✓ Facts verified
✓ Creative verified
✓ Voice verified
✓ Translation verified

WhatsApp
READY

Instagram
SANDBOX / READY

Facebook
SANDBOX / READY

X
SANDBOX / READY

[APPROVE CAMPAIGN]
```

---

# 49. LATENCY TARGET

Target:

```text
STT                         2–4s
Fact extraction             ~3s + user confirmation
Campaign/copy Agnes call    4–6s
Captions + verification     ~1s
Poster pipeline             15–20s
Voice generation + ASR      8–12s
Reel compositor             20–30s

Full verified package      <= 75–90s
```

Critical UX goal:

> First useful verified asset should appear in under ~15 seconds.

Generation should fan out in parallel.

---

# 50. COST / RESOURCE CONTROL

Default campaign budget:

```json
{
  "max_posters": 3,
  "max_videos": 2,
  "max_voice_variants": 5,
  "max_copy_variants": 3
}
```

Do not generate dozens of assets by default.

Every external generation request should have a deterministic request hash.

Cache duplicate requests.

---

# 51. TEST REQUIREMENTS

Minimum automated coverage:

## Fact Engine

- Hinglish numbers;
- English number words;
- Devanagari digits;
- ambiguous times;
- weekend inference;
- multiple products;
- conflicting facts.

## Guardian

- 20 → 25 mutation;
- Saturday → Sunday mutation;
- fabricated "50 customers";
- fabricated price;
- fabricated condition;
- time AM/PM mutation;
- multilingual numerals;
- token mutation;
- unsupported claim.

## Voice

- wrong spoken discount;
- wrong spoken day;
- wrong spoken time;
- cross-language fact mutation;
- ASR normalization.

## Media

- poster fact strip;
- OCR failure;
- video overlay mutation;
- voice audio missing;
- video provider failure.

## Pipeline

- provider timeout;
- provider rate limit;
- fallback activation;
- job resumption;
- backend restart;
- duplicate request;
- mock mode;
- asset regeneration.

---

# 52. DEMO MODE

There must be a seeded campaign that can run entirely without external providers.

Mock mode should have:

- seeded transcript;
- seeded FactSheet;
- seeded campaign plan;
- prebaked background images;
- prebaked voice;
- prebaked reel;
- deterministic captions;
- verification matrix;
- sabotage flow.

This is not a "fake" production mode.

It is the **demo reliability system**.

---

# 53. 36-HOUR DELIVERY PLAN

## 0–4h

Backend:
- FastAPI;
- SQLite;
- models;
- campaign routes;
- jobs table.

AI:
- gateway;
- STT;
- extraction.

Guardian:
- normalizer;
- fact engine;
- fixtures.

Frontend:
- React scaffold;
- microphone;
- typed fallback;
- SSE client.

Gate:

```text
typed text → extracted FactSheet
```

---

## 4–8h

Backend:
- orchestration;
- SSE;
- lock endpoint.

AI:
- token copywriter;
- structured schemas.

Guardian:
- numeric parity;
- unsourced numerics;
- time;
- day.

Frontend:
- FactSheet editor;
- confidence;
- inferred badges;
- lock animation.

Gate:

```text
text → lock → verified captions
```

---

## 8–12h

Image pipeline:

- Agnes Image;
- NO-TEXT prompt;
- Pillow compositor;
- OCR;
- fact registry.

Frontend:

- studio;
- asset cards;
- trust badges;
- verification matrix.

Gate:

```text
poster pipeline verified
```

---

## 12–18h

Voice:

- voice profile;
- TTS provider;
- multilingual routing;
- ASR round-trip.

Video:

- FFmpeg compositor;
- optional Agnes Video;
- overlays;
- subtitles.

Repair loop:

- diagnostics;
- regeneration;
- revalidation.

Gate:

```text
voice verified
reel < 30s where possible
```

---

## 18–24h

Publishing:

- sandbox;
- wa.me;
- Agent Reach adapter.

Export:

- ZIP;
- verification certificate.

Mock mode:

- every provider.

Feature freeze at 24h.

---

## 24–30h

Do not add major features.

Run kill-switch drills:

- disable STT;
- disable Agnes;
- disable image;
- disable video;
- disable voice;
- disable publishing.

Verify fallback behavior.

Run sabotage tests:

- 20 → 25;
- Saturday → Sunday;
- fabricated 50 customers.

---

## 30–36h

Rehearse.

Three clean full-stack runs.

Prepare:

- pitch;
- architecture explanation;
- Q&A;
- backup video;
- seeded campaign;
- backup laptop/phone/network path.

---

# 54. DEMO SCRIPT

## 0:00–0:30

Problem:

> "A café owner tells an AI '20% off.' The AI posts '25% off.' That mistake costs real money."

---

## 0:30–1:15

Voice input.

Show transcript.

Show FactSheet.

Highlight inferred fields.

Confirm.

Lock.

Say:

> "This hash is now our source of truth."

---

## 1:15–2:00

Campaign generation.

Captions appear.

Explain:

> "The AI writes the language, but it never gets to choose the numbers."

---

## 2:00–2:45

Sabotage.

Corrupt:

- 20% → 25%;
- Saturday → Sunday;
- inject "first 50 customers".

Guardian turns red.

Repair.

Guardian turns green.

Say:

> "Caught. Repaired. Re-verified."

---

## 2:45–3:30

Show:

- crisp poster;
- reel;
- voice ad;
- Kannada/Hindi/etc. voice;
- ASR round-trip.

Say:

> "The same owner's voice can deliver the campaign in multiple languages while the offer remains locked."

---

## 3:30–4:15

Approve.

Show:

- WhatsApp;
- sandbox social payload;
- export ZIP;
- certificate.

---

## 4:15–5:00

Close:

> "Generation is commodity. Integrity is not."

---

# 55. WOW MOMENTS

Priority order:

1. Sabotage catch + repair.
2. Multilingual same-voice campaign.
3. WhatsApp QR/deep link on judge's phone.
4. ASR round-trip.
5. Fact lock hash.
6. Live verification matrix.

---

# 56. RISKS

## Video API fails

Mitigation:

- FFmpeg core;
- saved fallback;
- queue;
- mock mode.

## STT mishears a number

Mitigation:

- confidence;
- human FactSheet confirmation;
- local fallback.

## OCR false negative

Mitigation:

- controlled fact zone;
- known font;
- preprocessing;
- registry;
- OCR advisory limitations.

## Fabricated claim

Mitigation:

- unsupported-claim check;
- semantic critic;
- human gate.

## Venue Wi-Fi fails

Mitigation:

- faster-whisper;
- FFmpeg;
- Tesseract;
- seeded mock mode;
- hotspot.

## OAuth fails

Mitigation:

- sandbox;
- wa.me;
- export.

## Scope creep

Mitigation:

- this document;
- feature freeze at 24h.

---

# 57. WHAT NOT TO BUILD

Do NOT add during the hackathon:

- Kubernetes;
- Redis unless genuinely needed;
- Kafka;
- microservices;
- complex auth;
- multi-tenant infrastructure;
- production analytics;
- live ad billing;
- real-time campaign learning;
- complicated agent frameworks;
- 12 sequential agents;
- unnecessary platform-specific AI pipelines;
- real Meta OAuth dependency;
- model-generated critical typography.

---

# 58. DEFINITION OF DONE

Titan is complete enough for the hackathon when this works:

```text
SHOPKEEPER VOICE
      ↓
STT
      ↓
AGNES FACT EXTRACTION
      ↓
FACTSHEET
      ↓
HUMAN CONFIRMATION
      ↓
FACT LOCK
      ↓
AGNES CAMPAIGN BRAIN
      ↓
COPY + LOCALIZATION + CREATIVE SPECS
      ↓
      ┌───────────────┬──────────────┬───────────────┐
      ↓               ↓              ↓
   CAPTIONS        POSTERS         VOICE / VIDEO
      │               │              │
      └───────────────┴──────────────┘
                      ↓
                  GUARDIAN
                      ↓
                AUTO-REPAIR
                      ↓
               VERIFIED PACKAGE
                      ↓
                HUMAN APPROVAL
                      ↓
            PUBLISH / WHATSAPP / ZIP
                      ↓
            VERIFICATION CERTIFICATE
```

And specifically:

- facts cannot be silently mutated;
- generated numbers cannot appear without provenance;
- generated commercial claims can be blocked;
- poster facts are deterministic;
- video facts are deterministic;
- voice facts are round-trip verified;
- multilingual variants preserve facts;
- cultural adaptation preserves business intent;
- same voice identity can be reused across supported languages;
- external providers can fail without collapsing the campaign;
- the system runs in mock mode;
- the system is demoable offline;
- the owner remains in control.

---

# 59. FUTURE ROADMAP

Do not implement during the hackathon unless time remains after all core requirements are stable.

## Week 1–4

- PostgreSQL;
- authentication;
- real OAuth;
- scheduling;
- brand memory;
- vertical templates;
- campaign history.

## Month 2–3

- WhatsApp Business API;
- redemption codes;
- campaign attribution;
- actual footfall/conversion feedback.

## Month 3–6

Productize:

# FACT INTEGRITY ENGINE AS AN API

Potential API:

```text
contract
→ construct
→ deterministic audit
→ perception audit
→ verification certificate
```

Use cases:

- social schedulers;
- website builders;
- AI copywriting tools;
- agencies;
- local business platforms.

---

# 60. FINAL ENGINEERING MANTRA

> **Agents decide.**
>
> **Code guarantees.**
>
> **Facts are locked.**
>
> **Creative assets are generated.**
>
> **Every transformation is audited.**
>
> **Humans approve publication.**

This is Titan.

---

# 61. CURRENT ARCHITECTURE STATUS

### LOCKED

- FastAPI
- React/Vite
- SQLite
- filesystem assets
- Agnes 3.0 Flash
- Fact Integrity Engine
- FactSheet
- SHA-256
- HMAC seal
- Fact Tokens
- deterministic poster composition
- deterministic video composition
- Guardian
- OCR
- ASR round-trip
- multilingual localization
- voice profile / consenting voice cloning
- regional/cultural adaptation
- human approval
- provider gateway
- fallback chain
- mock mode
- sandbox publishing
- wa.me
- Agent Reach adapter
- resumable jobs
- SSE
- verification certificate

### NOT LOCKED / PROVIDER-DEPENDENT

- exact STT provider used as hackathon primary;
- exact multilingual voice-cloning backend;
- exact Indic voice provider;
- exact Agnes Video availability/throughput;
- final Agent Reach capabilities at demo time.

These must be selected based on smoke tests and reliability.

---

# 62. FIRST IMPLEMENTATION TASK

Before writing major code:

1. Read this file completely.
2. Inspect the existing repository.
3. Identify current code that already satisfies this architecture.
4. Identify deviations.
5. Do not rewrite working code without reason.
6. Create/update `IMPLEMENTATION_PLAN.md` only if needed for execution tracking.
7. Build the smallest vertical slice first:

```text
typed input
→ Agnes extraction
→ FactSheet
→ lock
→ Agnes campaign/copy
→ deterministic poster
→ Guardian
→ verified result
```

Then add:

```text
voice input
→ multilingual voice
→ video
→ publishing
```

Do not attempt every feature simultaneously.

---

# 63. FINAL RULE FOR AI CODING AGENTS

When asked to implement something, first classify it:

```text
FACT
→ deterministic

CREATIVE REASONING
→ Agnes

MEDIA GENERATION
→ specialized provider

MEDIA COMPOSITION
→ deterministic

VERIFICATION
→ deterministic first

SEMANTIC REVIEW
→ Agnes advisory

PUBLISHING
→ adapter

FAILURE
→ fallback

AMBIGUITY
→ ask human
```

If a proposed implementation violates this classification, stop and reassess before coding.

---

**END OF SOURCE OF TRUTH**
