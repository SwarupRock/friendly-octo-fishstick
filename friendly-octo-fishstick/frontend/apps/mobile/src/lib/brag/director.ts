/**
 * Brag Director — the creative agent that storyboards the brag video.
 *
 * A port of the backend's `brag_director.py`: the same prompt, the same schema
 * and the same checks, run on the device against Agnes. The division of labour
 * is unchanged:
 *
 *  - the agent decides creative things only: mood, colours, type style, scene
 *    order, and short framing copy (hook, kicker, call to action);
 *  - it never writes a fact. Its copy may reference facts only as `{{TOKENS}}`
 *    and may not contain a digit; anything else is rejected here;
 *  - the template draws every fact from the locked token map.
 *
 * A storyboard that fails the checks is sent back once; what still fails falls
 * back, field by field, to a plain default that contains no facts either.
 */

import { templateIssues } from '../facts';
import { errorMessage } from '../http';
import { completeJson } from '../providers/agnes';

export const STYLES = ['bold', 'modern', 'elegant', 'friendly'] as const;
export const MOTIONS = ['pop', 'slide', 'rise'] as const;
const POSTER_LAYOUTS = ['badge', 'block'] as const;
const MIDDLE_SCENES = ['offer', 'when'] as const;
const MAX_ATTEMPTS = 2;

export type Storyboard = {
  concept: string;
  style: (typeof STYLES)[number];
  motion: (typeof MOTIONS)[number];
  palette: { bg: string; accent: string };
  poster: { layout: (typeof POSTER_LAYOUTS)[number]; kicker: string; cta: string };
  video: {
    hook: string;
    reveal_kicker: string;
    offer_caption: string;
    when_caption: string;
    cta: string;
    order: (typeof MIDDLE_SCENES)[number][];
  };
  /** Which model directed it, or why the default was used. */
  agent: { model: string | null; usedDefault: boolean; reason?: string; replaced?: string[] };
};

type Board = Omit<Storyboard, 'agent'>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const DIGIT = /\d/;
const TOKEN = /\{\{[A-Z_]+\}\}/g;
const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|percent|rupees?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|today|tomorrow|tonight)\b/i;

export function defaultStoryboard(): Board {
  return {
    concept: 'A warm neighbourhood offer, stated plainly.',
    style: 'bold',
    motion: 'pop',
    palette: { bg: '#16130f', accent: '#ffc53d' },
    poster: { layout: 'badge', kicker: 'This week only', cta: 'Come on in' },
    video: {
      hook: 'Your neighbourhood has news',
      reveal_kicker: 'Now serving',
      offer_caption: 'Yes, really',
      when_caption: 'Mark the days',
      cta: 'See you there',
      order: ['offer', 'when'],
    },
  };
}

const SYSTEM =
  "You are the Brag Director: you art-direct a short vertical launch video and a matching " +
  "poster for ONE local shop's offer. Work the brag-slim way:\n" +
  '- Shape: hook (first 2 seconds decide everything) -> reveal the product -> 2 sharp ' +
  'highlights (the offer, then when) -> outro with a call to action.\n' +
  '- Specific: it must feel made for this exact shop and product. No generic marketing ' +
  "language ('unlock', 'elevate', 'streamline', 'best in town').\n" +
  '- Readable: every line is short enough to read at a glance.\n' +
  '- Funny or warm only if it comes from the offer itself.\n' +
  '- One coherent look: a background colour and ONE accent colour that suit the product ' +
  'and mood (coffee -> deep browns/cream, pizza -> tomato red/basil, sweets -> festive, ' +
  'etc.). The accent must stand out strongly against the background.\n' +
  'HARD RULES:\n' +
  '1. You write framing copy only. NEVER write a number, price, percentage, date, time or ' +
  'day, in digits or in words. Banned words include: weekend, today, tonight, tomorrow, any weekday name, percent, half, and number words (one, two, ...). The renderer adds all facts itself.\n' +
  '2. You may mention the product or audience ONLY through the given {{TOKENS}}.\n' +
  '3. Never invent claims, scarcity, awards or guarantees.\n' +
  '4. Respect the word limits in the schema.\n' +
  'Return ONLY one JSON object matching the schema. No prose, no code fences.';

const SCHEMA = {
  concept: 'one sentence: the creative angle',
  style: 'one of: bold | modern | elegant | friendly',
  motion: 'one of: pop | slide | rise',
  palette: { bg: '#RRGGBB background', accent: '#RRGGBB accent' },
  poster: {
    layout: 'one of: badge | block',
    kicker: '<= 4 words above the headline',
    cta: '<= 4 words call to action',
  },
  video: {
    hook: '<= 7 words opening line that stops the scroll',
    reveal_kicker: '<= 3 words shown above the product name',
    offer_caption: '<= 4 words shown under the offer',
    when_caption: '<= 4 words shown above the days and times',
    cta: '<= 4 words closing call to action',
    order: "['offer','when'] or ['when','offer']",
  },
};

/** (group, key, max words) for every piece of agent-written copy. */
const COPY_FIELDS = [
  ['poster', 'kicker', 4],
  ['poster', 'cta', 4],
  ['video', 'hook', 7],
  ['video', 'reveal_kicker', 3],
  ['video', 'offer_caption', 4],
  ['video', 'when_caption', 4],
  ['video', 'cta', 4],
] as const;

const words = (value: string) => value.trim().split(/\s+/).length;
const tidy = (value: string) => value.trim().split(/\s+/).join(' ');

/** Why one line of copy cannot be used; empty when it is fine. */
function copyProblems(value: unknown, limit: number, tokens: Record<string, string>): string[] {
  if (typeof value !== 'string' || !value.trim()) return ['is required.'];
  const problems: string[] = [];
  const bare = value.replace(TOKEN, '');
  if (DIGIT.test(bare) || NUMBER_WORDS.test(bare)) {
    problems.push('must not state a number, price, day or time — the renderer adds facts.');
  }
  if (words(value) > limit + 1) problems.push(`is too long (max ${limit} words).`);
  return [...problems, ...templateIssues(value, tokens)];
}

const validOrder = (order: unknown): order is Board['video']['order'] =>
  Array.isArray(order) && [...order].sort().join() === [...MIDDLE_SCENES].sort().join();

/** Issues that make a storyboard unusable (empty list = usable). */
export function validateStoryboard(raw: any, tokens: Record<string, string>): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['The storyboard must be a JSON object.'];
  const issues: string[] = [];
  if (!STYLES.includes(raw.style)) issues.push(`style must be one of ${STYLES.join(', ')}.`);
  if (!MOTIONS.includes(raw.motion)) issues.push(`motion must be one of ${MOTIONS.join(', ')}.`);
  for (const name of ['bg', 'accent'] as const) {
    if (typeof raw.palette?.[name] !== 'string' || !HEX.test(raw.palette[name])) {
      issues.push(`palette.${name} must be a #RRGGBB colour.`);
    }
  }
  if (!POSTER_LAYOUTS.includes(raw.poster?.layout)) issues.push(`poster.layout must be one of ${POSTER_LAYOUTS.join(', ')}.`);
  if (!validOrder(raw.video?.order)) issues.push("video.order must list 'offer' and 'when' once each.");
  for (const [group, key, limit] of COPY_FIELDS) {
    issues.push(...copyProblems(raw[group]?.[key], limit, tokens).map((problem) => `${group}.${key} ${problem}`));
  }
  return issues;
}

/**
 * Keep every field of a storyboard that is valid on its own; only the failing
 * ones fall back to the default. Returns the board and what was replaced.
 */
export function salvage(raw: any, tokens: Record<string, string>): { board: Board; replaced: string[] } {
  const board = defaultStoryboard();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { board, replaced: ['everything'] };
  const replaced: string[] = [];
  if (STYLES.includes(raw.style)) board.style = raw.style;
  else replaced.push('style');
  if (MOTIONS.includes(raw.motion)) board.motion = raw.motion;
  else replaced.push('motion');
  const palette = raw.palette;
  if (typeof palette?.bg === 'string' && HEX.test(palette.bg) && typeof palette?.accent === 'string' && HEX.test(palette.accent)) {
    board.palette = { bg: palette.bg.toLowerCase(), accent: palette.accent.toLowerCase() };
  } else replaced.push('palette');
  if (POSTER_LAYOUTS.includes(raw.poster?.layout)) board.poster.layout = raw.poster.layout;
  else replaced.push('poster.layout');
  if (validOrder(raw.video?.order)) board.video.order = [...raw.video.order];
  else replaced.push('video.order');
  for (const [group, key, limit] of COPY_FIELDS) {
    const value = raw[group]?.[key];
    if (!copyProblems(value, limit, tokens).length) (board[group] as Record<string, unknown>)[key] = tidy(value);
    else replaced.push(`${group}.${key}`);
  }
  if (typeof raw.concept === 'string' && raw.concept.trim()) board.concept = raw.concept.slice(0, 200);
  return { board, replaced };
}

/** Ask the agent for a storyboard. Always resolves to a usable one. */
export async function direct(
  tokens: Record<string, string>,
  context: { businessName: string | null; planAngle: string | null; model: string },
): Promise<Storyboard> {
  const request = {
    business_name: context.businessName,
    campaign_angle: context.planAngle,
    // Values are context for taste (what is sold, to whom); copy must still
    // reference them only as {{TOKENS}}.
    locked_fact_tokens: tokens,
    available_token_names: Object.keys(tokens).sort(),
    schema: SCHEMA,
  };
  let issues: string[] = [];
  let reason = '';
  let last: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const payload = attempt
      ? {
          previous_storyboard_rejected_because: issues.slice(0, 8),
          instruction: 'Return a corrected, complete storyboard as ONE JSON object.',
          request,
        }
      : request;
    let raw: Record<string, any>;
    try {
      raw = await completeJson(SYSTEM, JSON.stringify(payload), { maxTokens: 600, temperature: 0.8 });
    } catch (error) {
      reason = errorMessage(error);
      if ((error as { code?: string })?.code === 'llm_bad_output') {
        issues = [reason];
        continue; // a garbled reply is worth one more try
      }
      break; // the provider is down or out of credits
    }
    last = raw;
    issues = validateStoryboard(raw, tokens);
    if (!issues.length) {
      // `salvage` on a valid board keeps every field and drops anything extra.
      return { ...salvage(raw, tokens).board, agent: { model: context.model, usedDefault: false } };
    }
    reason = issues.slice(0, 3).join('; ');
  }
  if (last !== null) {
    const { board, replaced } = salvage(last, tokens);
    // Most of the agent's direction survived: keep it.
    if (replaced.length < 6) return { ...board, agent: { model: context.model, usedDefault: false, replaced } };
  }
  return { ...defaultStoryboard(), agent: { model: null, usedDefault: true, reason: reason.slice(0, 300) } };
}
