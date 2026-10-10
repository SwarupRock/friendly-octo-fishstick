/**
 * Voice → facts → plan. The same pipeline the website's backend runs, done on
 * the device: Sarvam hears the offer, Agnes proposes facts and writes
 * tokenized copy, and everything deterministic (normalization, token filling,
 * the number check) happens here without a model.
 */

import {
  applyPatch, changedFields, compileTokens, deterministicFindings, FIELD_PATHS, hasToken,
  normalizeFacts, substituteTokens, templateIssues, withoutTokens,
  type Facts, type Finding, type Validation,
} from './facts';
import { AppError, errorMessage } from './http';
import { completeJson } from './providers/agnes';

// ── extraction ──────────────────────────────────────────────────────────
const EXTRACTION_SYSTEM = `You extract structured facts from a small-business promotion.

Return ONLY a JSON object. Extract a value only when the speaker actually stated
it: never invent, guess, round, or embellish. Use null for unknown scalars and
[] for unknown lists, and do not add fields that were not stated.

{
  "business": {"name": string|null, "location": string|null},
  "offer": {
    "product": string[],
    "discount_percent": number|null,
    "discount_flat": number|null,
    "price": number|null,
    "quantity": number|null,
    "audience": string[],
    "days": string[],
    "date_start": string|null,
    "date_end": string|null,
    "start_time": string|null,
    "end_time": string|null,
    "conditions": string[],
    "location": string|null
  },
  "languages": string[]
}

Rules:
- The transcript may be in English or any Indian language. Write values in English,
  keeping proper names as spoken.
- product: the exact words used for what is on offer, e.g. ["cold coffee"].
- discount_percent: the number only, e.g. "20% off" -> 20.
- discount_flat: a flat amount, e.g. "50 off" -> 50.
- price: a stated price as a number, with no currency symbol.
- days: full English weekday names, e.g. ["Saturday","Sunday"]. "this weekend"
  means ["Saturday","Sunday"].
- date_start / date_end: YYYY-MM-DD, only when an explicit date is stated.
- start_time / end_time: 24-hour HH:MM, e.g. "4 to 8 PM" -> "16:00" and "20:00".
- conditions: stated conditions in the speaker's own words.
- languages: only languages explicitly asked for, e.g. ["Hindi"].
`;

export async function extractFacts(transcript: string, businessName?: string | null): Promise<Facts> {
  const envelope: Record<string, unknown> = { transcript };
  if (businessName) envelope.known_business_name = businessName;
  const parsed = await completeJson(EXTRACTION_SYSTEM, JSON.stringify(envelope), { maxTokens: 1200, temperature: 0.1 });
  const facts = normalizeFacts(parsed);
  // The owner's profile already knows the shop; the model must not invent a name.
  if (businessName && !facts.business.name) facts.business.name = businessName;
  return facts;
}

// ── validation ──────────────────────────────────────────────────────────
const SEMANTIC_SYSTEM = `You audit structured facts extracted from a shop owner's own words.

Compare FACTS with TRANSCRIPT and report only real problems:
- contradiction: a fact disagrees with the transcript or with another fact.
- unsupported_claim: a fact value that the transcript does not state.
- malformed_offer: an offer that cannot work as written (e.g. impossible
  discount, end before start, price and discount that do not fit together).
- inconsistency: values that are individually valid but do not fit together.
- missing_information: something the transcript clearly states that FACTS lack.

Rules:
- Never invent facts and never propose a value the transcript does not contain.
- An empty/null fact is NOT a problem unless the transcript states that value.
- The transcript may be in any Indian language while FACTS are in English; a
  faithful translation is not a problem.
- business.name comes from the owner's account profile, so it does not have to
  appear in the transcript. Report it only if the transcript names a DIFFERENT
  business.
- Days said relatively ("this weekend", "on Saturday") are correctly stored as
  weekday names; never ask for calendar dates that were not spoken.
- Do not report doubts about wording or how specific a product name is. Report
  only what would make a poster or caption state something untrue.
- "field" must be one of VALID_FIELDS, or "general".
- Return ONLY a JSON object, no prose, no code fences:

{"findings": [{"field": "...", "severity": "error|warning|info",
               "issue": "contradiction|unsupported_claim|malformed_offer|inconsistency|missing_information|other",
               "explanation": "one or two sentences, in English",
               "suggestion": "what the owner should do, or null"}],
 "summary": "one sentence"}

Return {"findings": [], "summary": "..."} when the facts are sound.`;

/** Deterministic rules, then the model's double-check against the spoken words. */
export async function validateFacts(facts: Facts, transcript: string): Promise<Validation> {
  const deterministic = deterministicFindings(facts);
  const failed = deterministic.some((item) => item.severity === 'error' && item.code !== 'missing_required');
  let semantic: Validation['semantic'];
  try {
    const parsed = await completeJson(
      SEMANTIC_SYSTEM,
      JSON.stringify({ TRANSCRIPT: transcript || null, FACTS: facts, VALID_FIELDS: FIELD_PATHS }),
      { maxTokens: 900, temperature: 0 },
    );
    const findings: Finding[] = (Array.isArray(parsed.findings) ? parsed.findings : [])
      .filter((item: any) => item && typeof item.explanation === 'string' && item.explanation.trim())
      .slice(0, 20)
      .map((item: any) => ({
        field: (FIELD_PATHS as readonly string[]).includes(item.field) ? item.field : 'general',
        severity: ['error', 'warning', 'info'].includes(item.severity) ? item.severity : 'warning',
        code: String(item.issue || 'other').toLowerCase().replace(/[^a-z_]/g, '') || 'other',
        message: item.explanation.trim().slice(0, 400),
        suggestion: typeof item.suggestion === 'string' ? item.suggestion.slice(0, 300) : null,
        source: 'agnes' as const,
      }));
    semantic = { status: 'ok', findings };
  } catch (error) {
    semantic = { status: 'unavailable', findings: [], message: errorMessage(error) };
  }
  return { status: failed ? 'failed' : 'ok', deterministic: { findings: deterministic }, semantic };
}

// ── spoken review ───────────────────────────────────────────────────────
export type Intent = 'confirm' | 'correct' | 'restart' | 'unclear';
export type Turn = { heard: string; reply: string; intent: Intent; changed: string[] };

/** A reply made only of these words is a plain "yes" (no model call needed). */
const AFFIRMATIVE = new Set(
  `yes yeah yep yup ya ok okay correct right confirm confirmed perfect fine great sure
  absolutely exactly done proceed continue good looks look sounds all everything that
  thats this it its is the go ahead make my posts post please do create generate
  haan han haa ha ji sahi hai theek thik bilkul howdu sari aam avunu sare
  हाँ हां जी सही है ठीक बिल्कुल ಹೌದು ಸರಿ ஆம் சரி అవును సరే`.split(/\s+/),
);
const RESTART_PHRASES = [
  'start over', 'start again', 'new offer', 'cancel this', 'discard this', 'scrap this',
  'begin again', 'naya offer', 'फिर से शुरू',
];

/** `confirm` / `restart` when the reply is unmistakable, else null. */
export function quickIntent(text: string): Intent | null {
  const lowered = text.toLowerCase().trim();
  if (RESTART_PHRASES.some((phrase) => lowered.includes(phrase))) return 'restart';
  // Split on spaces and punctuation only: Indic vowel signs are combining
  // marks, so a `\w+` tokenizer would cut words like "हाँ" in half.
  const words = lowered.replace(/'/g, '').split(/[\s,.!?;:।\-–—"“”‘’]+/).filter(Boolean);
  if (words.length && words.length <= 10 && words.every((word) => AFFIRMATIVE.has(word))) return 'confirm';
  return null;
}

const TURN_SYSTEM =
  "You interpret a shop owner's SPOKEN reply while they review the facts extracted from " +
  'their offer. The reply may be in English or any Indian language. Return ONLY one JSON ' +
  'object: {"intent": "confirm"|"correct"|"restart"|"unclear", "patch": {...}, "reply": "..."}.\n' +
  '- confirm: they agree the facts are right and ask for no change.\n' +
  '- correct: they change, add or remove a fact. Put ONLY the changed fields in `patch`, ' +
  'shaped as {"business": {"name", "location"}, "offer": {"product": [..], ' +
  '"discount_percent": number, "discount_flat": number, "price": number, "quantity": number, ' +
  '"audience": [..], "days": [full English weekday names], "date_start": "YYYY-MM-DD", ' +
  '"date_end": "YYYY-MM-DD", "start_time": "HH:MM" (24h), "end_time": "HH:MM", ' +
  '"conditions": [..], "location": string}, "languages": [English language names]}. ' +
  'A list replaces the whole list, so repeat the items that should stay. Use null to ' +
  'clear a value. Translate product names and places to English only when the speaker ' +
  'used a common word; keep proper names as spoken.\n' +
  '- restart: they want to throw this offer away and begin a new one.\n' +
  '- unclear: anything else, including silence or unrelated speech.\n' +
  'NEVER put a value in the patch that the speaker did not say. ' +
  '`reply` is one short English sentence saying what you changed or what you need.';

export type TurnResult = Turn & { facts?: Facts };

/** Work out what a spoken reply means; a correction comes back as new facts. */
export async function interpretTurn(heard: string, facts: Facts): Promise<TurnResult> {
  const result = (intent: Intent, reply: string, extra: Partial<TurnResult> = {}): TurnResult => ({
    heard, reply, intent, changed: [], ...extra,
  });
  if (!heard.trim()) return result('unclear', 'I did not catch anything. Hold the mic and say it again.');

  const quick = quickIntent(heard);
  if (quick === 'confirm') return result('confirm', 'Confirmed.');
  if (quick === 'restart') return result('restart', 'Starting a new offer.');

  let parsed: Record<string, any>;
  try {
    parsed = await completeJson(
      TURN_SYSTEM,
      JSON.stringify({ current_facts: facts, spoken_reply: heard }),
      { maxTokens: 700, temperature: 0 },
    );
  } catch (error) {
    return result('unclear', `I could not work that out: ${errorMessage(error)}`);
  }
  const intent = (['confirm', 'correct', 'restart', 'unclear'] as Intent[]).includes(parsed.intent)
    ? (parsed.intent as Intent)
    : 'unclear';
  const reply = typeof parsed.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  if (intent !== 'correct') return result(intent, reply || (intent === 'unclear' ? 'Say “yes” to confirm, or say what to change.' : ''));

  const patch = parsed.patch && typeof parsed.patch === 'object' ? parsed.patch : {};
  const next = applyPatch(facts, patch);
  const changed = changedFields(facts, next);
  if (!changed.length) {
    return result('unclear', 'I could not turn that into a change. Say it again, one detail at a time.');
  }
  return result('correct', reply || 'Updated.', { facts: next, changed });
}

// ── campaign plan ───────────────────────────────────────────────────────
const CHANNELS = [
  'instagram', 'facebook', 'x', 'whatsapp', 'poster_headline', 'poster_subline', 'reel_script', 'voice_script',
] as const;
export type Channel = (typeof CHANNELS)[number];
const REQUIRED_CHANNELS: Channel[] = ['instagram', 'whatsapp', 'poster_headline', 'voice_script'];
const PLAN_MAX_ATTEMPTS = 3;

const COPY_SYSTEM =
  "You are the Campaign Director for a local shop's marketing campaign. You " +
  'receive a locked FACT TOKEN MAP and a campaign brief. Decide the creative ' +
  'angle and write every deliverable in the schema.\n' +
  'HARD RULES:\n' +
  '1. NEVER write a literal number, percentage, price, date, time, weekday, ' +
  'quantity, condition, product name, audience or location. Use ONLY the ' +
  'provided {{TOKENS}} exactly as given, in double curly braces.\n' +
  '2. Use only token names listed in available_token_names.\n' +
  '3. Never invent offers, scarcity, guarantees, awards, prices or claims.\n' +
  '4. art_prompt and video prompt describe a scene only: no text, letters, ' +
  'numbers, logos or watermarks, and no tokens.\n' +
  '5. If the brief or facts lack something a good campaign needs, list it in ' +
  'missing_information instead of making it up.\n' +
  "6. Localized copy_templates are written in that language's own script, " +
  'still using the same {{TOKENS}}.\n' +
  '7. poster_headline states the offer itself, so it MUST contain at least ' +
  'one {{TOKEN}} (the product and, when available, the discount or price ' +
  'token). A slogan with no token is rejected.\n' +
  'Return ONLY one JSON object matching the schema. No prose, no code fences.';

const COPY_SCHEMA = {
  strategy: { angle: 'short creative angle', rationale: '1-2 sentences' },
  copy_templates: {
    instagram: 'caption using {{TOKENS}} only',
    facebook: 'caption using {{TOKENS}} only',
    x: 'one short line, <= 280 chars, {{TOKENS}} only',
    whatsapp: 'broadcast-style message with a call to action, {{TOKENS}} only',
    poster_headline: 'short headline that contains the offer {{TOKENS}} (never a token-less slogan)',
    poster_subline: 'supporting line, {{TOKENS}} only',
    reel_script: '3-5 scene lines, {{TOKENS}} only',
    voice_script: '20-40s spoken narration, {{TOKENS}} only',
  },
  poster_briefs: [
    {
      art_prompt: 'scene/mood only; NO TEXT, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY, NO WATERMARK',
      overlay_layout: 'top|center|bottom emphasis guidance',
    },
  ],
  video_brief: {
    concept: 'one sentence',
    prompt: '4-8 second shot description; scene/motion only, no text or numbers',
  },
  localization: [
    {
      language: 'one of the campaign languages',
      copy_templates: { instagram: '{{TOKENS}} version', whatsapp: '{{TOKENS}} version', voice_script: '{{TOKENS}} version' },
    },
  ],
  missing_information: ['what the owner should add to improve the campaign'],
};

export type Plan = {
  angle: string;
  rationale: string;
  /** Master copy (English), tokens already filled in. */
  copy: Partial<Record<Channel, string>>;
  /** language → channel → filled copy. */
  localized: Record<string, Partial<Record<Channel, string>>>;
  artPrompt: string;
  videoPrompt: string;
  videoConcept: string;
  missingInformation: string[];
  createdAt: number;
};

const ANY_DIGIT = /[0-9०-९௦-௯౦-౯೦-೯]/;

/** Why a template cannot be used; empty when it is fine. */
function copyIssues(label: string, template: unknown, tokens: Record<string, string>): string[] {
  if (typeof template !== 'string' || !template.trim()) return [`${label} is missing.`];
  const issues = templateIssues(template, tokens).map((issue) => `${label}: ${issue}`);
  if (ANY_DIGIT.test(withoutTokens(template))) {
    issues.push(`${label} contains a literal number; use a {{TOKEN}} instead.`);
  }
  return issues;
}

/** The plain offer line, built from token NAMES only (never a value). */
function offerHeadlineTemplate(tokens: Record<string, string>): string {
  if (!('DISCOUNT' in tokens)) return 'PRICE' in tokens ? '{{PRODUCT}} — {{PRICE}}' : '{{PRODUCT}}';
  return '{{DISCOUNT}} on {{PRODUCT}}';
}

function fillChannels(
  templates: any,
  tokens: Record<string, string>,
  required: Channel[],
  label: string,
): { copy: Partial<Record<Channel, string>>; issues: string[] } {
  const copy: Partial<Record<Channel, string>> = {};
  const issues: string[] = [];
  for (const channel of CHANNELS) {
    const template = templates?.[channel];
    const problems = copyIssues(`${label}.${channel}`, template, tokens);
    if (!problems.length) copy[channel] = substituteTokens(template, tokens).trim();
    else if (required.includes(channel)) issues.push(...problems);
    // An optional channel that breaks a rule is dropped, not shipped.
  }
  return { copy, issues };
}

/**
 * Ask the Campaign Director for a plan. A reply that breaks the token rules is
 * sent back with the reasons, up to `PLAN_MAX_ATTEMPTS` times; nothing that
 * still breaks them is ever stored.
 */
export async function createPlan(facts: Facts): Promise<Plan> {
  const tokens = compileTokens(facts);
  if (!tokens.PRODUCT) throw new AppError('The offer needs a product before a campaign can be planned.', 'facts_incomplete');
  const languages = facts.languages.length ? facts.languages : ['English'];
  const extraLanguages = languages.filter((name) => name !== 'English');
  const tokenLines = Object.keys(tokens).sort().map((name) => `{{${name}}}`).join('\n');
  const system = `${COPY_SYSTEM}\nAvailable tokens:\n${tokenLines}`;
  const envelope = {
    campaign_brief: { objective: 'footfall' },
    // Values are shown for grammar only; copy must reference them by {{TOKEN}}.
    locked_fact_tokens: tokens,
    available_token_names: Object.keys(tokens).sort(),
    business: facts.business,
    languages,
    schema: COPY_SCHEMA,
    constraints: [
      'Use ONLY {{TOKENS}} for any number/percent/price/day/time/date/quantity/condition/product/audience/location.',
      'Never write literal fact values; never invent claims, scarcity or guarantees.',
      'Art and video prompts must forbid text/typography and contain no tokens.',
      '{{DISCOUNT}} is already a finished phrase ending in "off" (see locked_fact_tokens): never write "off" after it.',
      extraLanguages.length
        ? `One localization entry for each of: ${extraLanguages.join(', ')}. copy_templates (the master) are in English.`
        : 'Leave `localization` empty: the campaign is in English only.',
    ],
  };

  let issues: string[] = [];
  for (let attempt = 0; attempt < PLAN_MAX_ATTEMPTS; attempt += 1) {
    const user = JSON.stringify(
      issues.length ? { ...envelope, previous_attempt_rejected_because: issues.slice(0, 12) } : envelope,
    );
    const raw = await completeJson(system, user, { maxTokens: 2600, temperature: 0.6, timeoutMs: 120_000 });
    const templates = raw.copy_templates && typeof raw.copy_templates === 'object' ? { ...raw.copy_templates } : {};
    // A token-less slogan is replaced by the plain offer line rather than rejected.
    if (typeof templates.poster_headline !== 'string' || !hasToken(templates.poster_headline)
      || copyIssues('headline', templates.poster_headline, tokens).length) {
      templates.poster_headline = offerHeadlineTemplate(tokens);
    }
    const master = fillChannels(templates, tokens, REQUIRED_CHANNELS, 'copy_templates');
    issues = master.issues;
    if (issues.length) continue;

    const localized: Plan['localized'] = {};
    for (const entry of Array.isArray(raw.localization) ? raw.localization : []) {
      const language = extraLanguages.find((name) => name.toLowerCase() === String(entry?.language ?? '').toLowerCase());
      if (!language) continue;
      const filled = fillChannels(entry.copy_templates, tokens, [], language).copy;
      if (Object.keys(filled).length) localized[language] = filled;
    }
    const brief = Array.isArray(raw.poster_briefs) ? raw.poster_briefs[0] : null;
    const clean = (value: unknown) => (typeof value === 'string' ? withoutTokens(value).replace(/\s+/g, ' ').trim() : '');
    // Strategy notes may mention tokens; fill them when they resolve, else drop them.
    const filled = (value: unknown) =>
      typeof value === 'string' && !templateIssues(value, tokens).length ? substituteTokens(value, tokens).trim() : clean(value);
    return {
      angle: filled(raw.strategy?.angle),
      rationale: filled(raw.strategy?.rationale),
      copy: master.copy,
      localized,
      artPrompt: clean(brief?.art_prompt),
      videoPrompt: clean(raw.video_brief?.prompt),
      videoConcept: clean(raw.video_brief?.concept),
      missingInformation: (Array.isArray(raw.missing_information) ? raw.missing_information : [])
        .filter((item: unknown) => typeof item === 'string')
        .slice(0, 5),
      createdAt: Date.now(),
    };
  }
  throw new AppError(
    'The campaign plan kept breaking the fact rules, so nothing was saved. Say “yes” to try again.',
    'plan_invalid',
    { details: { issues } },
  );
}

// ── media prompts ───────────────────────────────────────────────────────
const DEFAULT_ART_PROMPT =
  'Vibrant promotional photograph, cheerful small-shop scene, warm festive lighting, shallow depth of field.';

/** Scene brief + descriptive facts only. Numbers never go to an image model. */
export function buildArtPrompt(plan: Plan, facts: Facts): string {
  const tokens = compileTokens(facts);
  const parts = [plan.artPrompt || DEFAULT_ART_PROMPT];
  if (tokens.PRODUCT) parts.push(`Hero subject: ${tokens.PRODUCT}.`);
  if (tokens.AUDIENCE) parts.push(`Made to appeal to ${tokens.AUDIENCE}.`);
  if (tokens.LOCATION) parts.push(`Setting inspired by ${tokens.LOCATION}.`);
  parts.push('Vertical poster composition with calm, darker space in the lower third for a caption.');
  return parts.join(' ');
}

export function buildVideoPrompt(plan: Plan, facts: Facts): string {
  const tokens = compileTokens(facts);
  const parts = [
    plan.videoPrompt ||
      'Slow cinematic push-in on a welcoming small local shop, warm lighting, a happy customer being served.',
  ];
  if (tokens.PRODUCT) parts.push(`The shop is promoting ${tokens.PRODUCT}.`);
  if (tokens.AUDIENCE) parts.push(`The customers are ${tokens.AUDIENCE}.`);
  parts.push('No text, no captions, no logos, no watermark.');
  return parts.join(' ');
}

// ── the number check ────────────────────────────────────────────────────
export type CopyCheck = { channel: string; ok: boolean; stray: string[] };

const NUMBER = /\d+(?:[.,:]\d+)*/g;

/**
 * Every number in a piece of copy must be a number from the locked facts.
 * This is the on-device stand-in for the backend's Guardian: deterministic,
 * and it reports rather than guesses.
 */
export function checkCopy(copy: Record<string, string | undefined>, facts: Facts): CopyCheck[] {
  const tokens = compileTokens(facts);
  const allowed = new Set<string>();
  const collect = (text: string) => (text.match(NUMBER) ?? []).forEach((n) => allowed.add(n.replace(/[.,:]$/, '')));
  Object.values(tokens).forEach(collect);
  if (facts.business.name) collect(facts.business.name);
  return Object.entries(copy)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([channel, text]) => {
      const stray = (text.match(NUMBER) ?? []).map((n) => n.replace(/[.,:]$/, '')).filter((n) => !allowed.has(n));
      return { channel, ok: stray.length === 0, stray };
    });
}
