/**
 * The FactSheet: the only place a number, price, day or time is allowed to
 * come from.
 *
 * A model *proposes* facts; `normalizeFacts` decides what survives. Copy is
 * written against `{{TOKENS}}` and filled in by `substituteTokens`, so the AI
 * never types a fact into a caption or onto a poster.
 */

import * as Crypto from 'expo-crypto';

export type BusinessFacts = { name: string | null; location: string | null };

export type OfferFacts = {
  product: string[];
  discount_percent: number | null;
  discount_flat: number | null;
  price: number | null;
  quantity: number | null;
  audience: string[];
  days: string[];
  date_start: string | null;
  date_end: string | null;
  start_time: string | null;
  end_time: string | null;
  conditions: string[];
  location: string | null;
};

export type Facts = { business: BusinessFacts; offer: OfferFacts; languages: string[] };

export type Finding = {
  field: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  suggestion?: string | null;
  source: 'schema' | 'agnes';
};

export type Validation = {
  status: 'ok' | 'failed';
  deterministic: { findings: Finding[] };
  semantic: { status: 'ok' | 'unavailable'; findings: Finding[]; message?: string };
};

export const FIELD_PATHS = [
  'business.name', 'business.location', 'offer.product', 'offer.discount_percent',
  'offer.discount_flat', 'offer.price', 'offer.quantity', 'offer.audience', 'offer.days',
  'offer.date_start', 'offer.date_end', 'offer.start_time', 'offer.end_time',
  'offer.conditions', 'offer.location', 'languages',
] as const;

const OFFER_LIST_FIELDS = ['product', 'audience', 'days', 'conditions'] as const;
const OFFER_NUMBER_FIELDS = ['discount_percent', 'discount_flat', 'price', 'quantity'] as const;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LANGUAGES = [
  'English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Malayalam',
  'Gujarati', 'Punjabi', 'Odia',
];

export function emptyFacts(): Facts {
  return {
    business: { name: null, location: null },
    offer: {
      product: [], discount_percent: null, discount_flat: null, price: null, quantity: null,
      audience: [], days: [], date_start: null, date_end: null, start_time: null, end_time: null,
      conditions: [], location: null,
    },
    languages: [],
  };
}

// ── normalization ───────────────────────────────────────────────────────
function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function cleanList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = cleanText(item, 120);
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  return out;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function cleanDays(value: unknown): string[] {
  const out: string[] = [];
  const add = (day: string) => {
    if (!out.includes(day)) out.push(day);
  };
  for (const item of cleanList(value)) {
    const lowered = item.toLowerCase();
    if (/week\s*end/.test(lowered)) {
      add('Saturday');
      add('Sunday');
    } else if (/every\s*day|daily|all days/.test(lowered)) {
      WEEKDAYS.forEach(add);
    } else if (/week\s*days?/.test(lowered)) {
      WEEKDAYS.slice(0, 5).forEach(add);
    } else {
      const day = WEEKDAYS.find((name) => lowered.startsWith(name.slice(0, 3).toLowerCase()));
      if (day) add(day);
    }
  }
  return out.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
}

/** `16:00`, `4 pm`, `4:30PM` → `HH:MM` (24h); anything else is dropped. */
function cleanTime(value: unknown): string | null {
  const text = cleanText(value, 16);
  if (!text) return null;
  const match = text.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cleanDate(value: unknown): string | null {
  const text = cleanText(value, 64);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanLanguages(value: unknown): string[] {
  const out: string[] = [];
  for (const item of cleanList(value)) {
    const known = LANGUAGES.find((name) => name.toLowerCase() === item.toLowerCase());
    if (known && !out.includes(known)) out.push(known);
  }
  return out;
}

/** Coerce anything (a model reply, a stored document) into a valid FactSheet. */
export function normalizeFacts(raw: any): Facts {
  const business = raw?.business && typeof raw.business === 'object' ? raw.business : {};
  const offer = raw?.offer && typeof raw.offer === 'object' ? raw.offer : {};
  const percent = cleanNumber(offer.discount_percent);
  const positive = (value: number | null) => (value !== null && value >= 0 ? value : null);
  const quantity = cleanNumber(offer.quantity);
  return {
    business: { name: cleanText(business.name), location: cleanText(business.location) },
    offer: {
      product: cleanList(offer.product),
      discount_percent: percent !== null && percent >= 0 && percent <= 100 ? percent : null,
      discount_flat: positive(cleanNumber(offer.discount_flat)),
      price: positive(cleanNumber(offer.price)),
      quantity: quantity !== null && quantity > 0 ? quantity : null,
      audience: cleanList(offer.audience),
      days: cleanDays(offer.days),
      date_start: cleanDate(offer.date_start),
      date_end: cleanDate(offer.date_end),
      start_time: cleanTime(offer.start_time),
      end_time: cleanTime(offer.end_time),
      conditions: cleanList(offer.conditions),
      location: cleanText(offer.location),
    },
    languages: cleanLanguages(raw?.languages),
  };
}

/**
 * Apply a partial edit. Only keys present in the patch change; `null` clears a
 * value and a list replaces the whole list. The result is re-normalized, so a
 * malformed patch can never produce a malformed sheet.
 */
export function applyPatch(facts: Facts, patch: any): Facts {
  const next: any = JSON.parse(JSON.stringify(facts));
  if (patch?.business && typeof patch.business === 'object') {
    for (const key of ['name', 'location']) {
      if (key in patch.business) next.business[key] = patch.business[key];
    }
  }
  if (patch?.offer && typeof patch.offer === 'object') {
    for (const key of Object.keys(next.offer)) {
      if (key in patch.offer) next.offer[key] = patch.offer[key];
    }
  }
  if (Array.isArray(patch?.languages)) next.languages = patch.languages;
  return normalizeFacts(next);
}

export function changedFields(before: Facts, after: Facts): string[] {
  const out: string[] = [];
  for (const group of ['business', 'offer'] as const) {
    for (const key of Object.keys(after[group])) {
      if (JSON.stringify((after[group] as any)[key]) !== JSON.stringify((before[group] as any)[key])) {
        out.push(`${group}.${key}`);
      }
    }
  }
  if (JSON.stringify(before.languages) !== JSON.stringify(after.languages)) out.push('languages');
  return out.sort();
}

/** True when nothing an offer could be built from was stated. */
export function isEmptyOffer(facts: Facts): boolean {
  const offer = facts.offer;
  return (
    OFFER_LIST_FIELDS.every((key) => offer[key].length === 0) &&
    OFFER_NUMBER_FIELDS.every((key) => offer[key] === null) &&
    !offer.start_time && !offer.end_time && !offer.location && !offer.date_start && !offer.date_end
  );
}

// ── validation ──────────────────────────────────────────────────────────
/** Paths that must be filled before the facts can be locked. */
export function lockBlockers(facts: Facts): string[] {
  const offer = facts.offer;
  const out: string[] = [];
  if (!offer.product.length) out.push('offer.product');
  const hasValue =
    offer.discount_percent !== null || offer.discount_flat !== null || offer.price !== null ||
    offer.conditions.length > 0;
  if (!hasValue) out.push('offer.discount_percent', 'offer.price');
  return out;
}

export function deterministicFindings(facts: Facts): Finding[] {
  const offer = facts.offer;
  const out: Finding[] = [];
  const add = (field: string, severity: Finding['severity'], code: string, message: string, suggestion?: string) =>
    out.push({ field, severity, code, message, suggestion: suggestion ?? null, source: 'schema' });

  for (const path of lockBlockers(facts)) {
    add(path, 'error', 'missing_required', 'This detail is required before the offer can be confirmed.');
  }
  if (offer.date_start && offer.date_end && offer.date_end < offer.date_start) {
    add('offer.date_end', 'error', 'date_range_inverted',
      `The end date (${offer.date_end}) is before the start date (${offer.date_start}).`);
  }
  if (offer.start_time && offer.end_time && offer.end_time <= offer.start_time) {
    add('offer.end_time', 'warning', 'time_window_inverted',
      `The closing time (${fmtTime(offer.end_time)}) is not after the opening time (${fmtTime(offer.start_time)}).`);
  } else if (Boolean(offer.start_time) !== Boolean(offer.end_time)) {
    add(offer.start_time ? 'offer.end_time' : 'offer.start_time', 'warning', 'time_window_incomplete',
      'Only one end of the time window is set, so no time window will be shown.');
  }
  if (offer.discount_percent !== null && offer.discount_flat !== null) {
    add('offer.discount_flat', 'warning', 'conflicting_discounts',
      'Both a percentage and a flat discount are set; only the percentage is used.');
  }
  if (offer.discount_percent === 0 || offer.discount_percent === 100) {
    add('offer.discount_percent', 'warning', 'discount_extreme', `A ${offer.discount_percent}% discount is unusual.`);
  }
  if (offer.discount_flat !== null && offer.price !== null && offer.discount_flat > offer.price) {
    add('offer.discount_flat', 'error', 'discount_exceeds_price', 'The flat discount is larger than the price.');
  }
  return out;
}

// ── tokens ──────────────────────────────────────────────────────────────
export const TOKEN_NAMES = ['PRODUCT', 'DISCOUNT', 'PRICE', 'DAYS', 'WINDOW', 'AUDIENCE', 'CONDITIONS', 'LOCATION'];
const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function fmtNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** `16:00` → `4 PM`. */
export function fmtTime(hhmm: string): string {
  const [hour, minute = '0'] = hhmm.split(':');
  const h = Number(hour);
  const m = Number(minute);
  const meridiem = h < 12 ? 'AM' : 'PM';
  const display = h % 12 || 12;
  return m ? `${display}:${String(m).padStart(2, '0')} ${meridiem}` : `${display} ${meridiem}`;
}

function joinList(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

/** Display values for the facts that exist. Absent facts get no token. */
export function compileTokens(facts: Facts): Record<string, string> {
  const { offer, business } = facts;
  const tokens: Record<string, string> = {};
  if (offer.product.length) tokens.PRODUCT = offer.product.join(', ');
  // DISCOUNT always reads as a finished phrase ("25% off"), so copy can use it as is.
  if (offer.discount_percent !== null) tokens.DISCOUNT = `${fmtNumber(offer.discount_percent)}% off`;
  else if (offer.discount_flat !== null) tokens.DISCOUNT = `₹${fmtNumber(offer.discount_flat)} off`;
  if (offer.price !== null) tokens.PRICE = `₹${fmtNumber(offer.price)}`;
  if (offer.days.length) tokens.DAYS = joinList(offer.days);
  if (offer.start_time && offer.end_time) tokens.WINDOW = `${fmtTime(offer.start_time)}–${fmtTime(offer.end_time)}`;
  if (offer.audience.length) tokens.AUDIENCE = offer.audience.join(', ');
  if (offer.conditions.length) tokens.CONDITIONS = offer.conditions.join(', ');
  const location = offer.location || business.location;
  if (location) tokens.LOCATION = location;
  return tokens;
}

/** Problems with a template: unknown tokens, or tokens the facts cannot fill. */
export function templateIssues(template: string, tokens: Record<string, string>): string[] {
  const issues: string[] = [];
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const name = match[1].toUpperCase();
    if (name in tokens) continue;
    issues.push(
      TOKEN_NAMES.includes(name) ? `{{${name}}} is not available for this offer.` : `Unknown token {{${name}}}.`,
    );
  }
  return issues;
}

export function hasToken(template: string): boolean {
  return new RegExp(TOKEN_PATTERN.source).test(template);
}

/** Text with every `{{TOKEN}}` removed — what the model wrote by itself. */
export function withoutTokens(template: string): string {
  return template.replace(TOKEN_PATTERN, ' ');
}

/** Deterministic fill. Throws rather than leaving a `{{TOKEN}}` in copy. */
export function substituteTokens(template: string, tokens: Record<string, string>): string {
  const issues = templateIssues(template, tokens);
  if (issues.length) throw new Error(issues.join(' '));
  return template.replace(TOKEN_PATTERN, (_, name: string) => tokens[name.toUpperCase()]);
}

// ── lock ────────────────────────────────────────────────────────────────
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as any)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 over the canonical facts; changes if any locked fact changes. */
export async function factHash(facts: Facts): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(facts));
  return `sha256:${digest}`;
}

// ── display ─────────────────────────────────────────────────────────────
export type FactRow = { label: string; value: string };

export function summarize(facts: Facts | null | undefined): FactRow[] {
  if (!facts) return [];
  const { business, offer } = facts;
  const rows: FactRow[] = [];
  if (business.name) rows.push({ label: 'Business', value: business.name });
  if (offer.product.length) rows.push({ label: 'Offer', value: offer.product.join(', ') });
  if (offer.discount_percent !== null) rows.push({ label: 'Discount', value: `${fmtNumber(offer.discount_percent)}% off` });
  if (offer.discount_flat !== null) rows.push({ label: 'Discount', value: `₹${fmtNumber(offer.discount_flat)} off` });
  if (offer.price !== null) rows.push({ label: 'Price', value: `₹${fmtNumber(offer.price)}` });
  if (offer.quantity !== null) rows.push({ label: 'Quantity', value: fmtNumber(offer.quantity) });
  if (offer.audience.length) rows.push({ label: 'For', value: offer.audience.join(', ') });
  if (offer.days.length) rows.push({ label: 'Days', value: offer.days.join(', ') });
  const dates = [offer.date_start, offer.date_end].filter(Boolean).join(' → ');
  if (dates) rows.push({ label: 'Dates', value: dates });
  const time = [offer.start_time, offer.end_time].filter(Boolean).map((t) => fmtTime(t as string)).join(' – ');
  if (time) rows.push({ label: 'Time', value: time });
  const where = offer.location || business.location;
  if (where) rows.push({ label: 'Where', value: where });
  if (offer.conditions.length) rows.push({ label: 'Conditions', value: offer.conditions.join(', ') });
  if (facts.languages.length) rows.push({ label: 'Languages', value: facts.languages.join(', ') });
  return rows;
}

/** Offer rows only (no business name) — used to decide whether anything was understood. */
export function offerRows(facts: Facts | null | undefined): FactRow[] {
  return summarize(facts).filter((row) => row.label !== 'Business' && row.label !== 'Languages');
}

export function pathLabel(path: string): string {
  return path.replace(/^(offer|business)\./, '').replace(/_/g, ' ');
}
