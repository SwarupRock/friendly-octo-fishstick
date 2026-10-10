/**
 * Storyboard + locked facts → the page that plays the brag video.
 *
 * A port of `build_spec` in the backend's `brag_renderer.py`. The backend
 * screenshots the template frame by frame and encodes an MP4; a phone has no
 * headless browser or FFmpeg, so the app plays the very same template live in
 * a WebView instead.
 */

import { substituteTokens } from '../facts';

import type { Storyboard } from './director';
import { BRAG_TEMPLATE } from './template';

export const VIDEO_SIZE = { width: 720, height: 1280 };
const FACT_NAMES = ['PRODUCT', 'DISCOUNT', 'PRICE', 'DAYS', 'WINDOW', 'AUDIENCE', 'LOCATION', 'CONDITIONS'];

/** Seconds per scene before stretching to the voice-over. */
const SCENE_SECONDS: Record<string, number> = { hook: 2.6, reveal: 3.0, offer: 3.2, when: 3.4, outro: 3.2 };
const MAX_VIDEO_SECONDS = 22;
/** The voice-over starts this long after the first frame, as in the backend's mix. */
export const VOICE_DELAY_MS = 450;

// ── colour helpers: the agent picks colours, code guarantees legibility ──
function luminance(hex: string): number {
  const channel = (start: number) => {
    const x = parseInt(hex.slice(start, start + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const inkFor = (background: string) =>
  contrast(background, '#14110d') >= contrast(background, '#ffffff') ? '#14110d' : '#ffffff';

export type BragInput = {
  board: Storyboard;
  tokens: Record<string, string>;
  businessName: string;
  headline: string;
  /** The poster's text-free artwork (an https URL or a `data:` URI), if any. */
  art: string | null;
  voiceSeconds: number | null;
};

export function buildSpec({ board, tokens, businessName, headline, art, voiceSeconds }: BragInput) {
  const bg = board.palette.bg;
  let accent = board.palette.accent;
  // An accent that vanishes into the background is replaced.
  if (contrast(bg, accent) < 2.6) accent = luminance(bg) < 0.4 ? '#ffc53d' : '#c2341c';

  const facts: Record<string, string> = {};
  for (const name of FACT_NAMES) if (tokens[name]) facts[name] = tokens[name];
  // The app's DISCOUNT token is the whole phrase ("20% off"); the template sets
  // the figure huge and adds "OFF" beneath it, so the figure is handed over alone.
  if (facts.DISCOUNT) facts.DISCOUNT = facts.DISCOUNT.replace(/\s*off\s*$/i, '');
  const discount = facts.DISCOUNT ?? '';

  const names = ['hook', 'reveal', ...board.video.order, 'outro'].filter(
    (name) => name !== 'when' || facts.DAYS || facts.WINDOW,
  );
  const base = names.reduce((total, name) => total + SCENE_SECONDS[name], 0);
  // Stretch every scene evenly so the voice-over finishes before the end.
  const target = Math.min(MAX_VIDEO_SECONDS, Math.max(base, (voiceSeconds ?? 0) + 1));
  const scale = target / base;
  const text = (key: 'hook' | 'reveal_kicker' | 'offer_caption' | 'when_caption' | 'cta') =>
    substituteTokens(board.video[key], tokens);

  return {
    mode: 'video',
    W: VIDEO_SIZE.width,
    H: VIDEO_SIZE.height,
    style: board.style,
    motion: board.motion,
    bg,
    accent,
    ink: inkFor(bg),
    accentInk: inkFor(accent),
    art,
    business: businessName,
    headline,
    facts,
    discountNeedsOff: Boolean(discount) && !discount.trim().toLowerCase().endsWith('off'),
    poster: {
      layout: board.poster.layout,
      kicker: substituteTokens(board.poster.kicker, tokens),
      cta: substituteTokens(board.poster.cta, tokens),
    },
    video: {
      hook: text('hook'),
      reveal_kicker: text('reveal_kicker'),
      offer_caption: text('offer_caption'),
      when_caption: text('when_caption'),
      cta: text('cta'),
      timeline: names.map((name) => [name, Math.round(SCENE_SECONDS[name] * scale * 1000) / 1000]),
    },
  };
}

/**
 * Added to the template for live playback: the backend calls `render(t)` once
 * per frame from outside; here the page drives itself from the clock and
 * reports to the app. `width=720` makes the WebView scale the fixed-size stage
 * to whatever width it is given.
 */
const VIEWPORT = '<meta name="viewport" content="width=720, user-scalable=no">';
const PLAYER = `<script>
(function () {
  var post = function (message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  };
  var startedAt = 0, playing = false;
  function frame(now) {
    if (!playing) return;
    var t = (now - startedAt) / 1000;
    if (t >= window.DURATION) { render(window.DURATION - 0.001); playing = false; post({ type: 'ended' }); return; }
    render(t);
    requestAnimationFrame(frame);
  }
  window.bragPlay = function () { startedAt = performance.now(); playing = true; requestAnimationFrame(frame); };
  window.bragStop = function () { playing = false; render(0); };
  window.ready.then(function () { post({ type: 'ready', duration: window.DURATION }); })
    .catch(function (error) { post({ type: 'error', message: String(error) }); });
})();
</script>`;

/** The complete page for one brag video. */
export function buildBragHtml(input: BragInput): string {
  const payload = JSON.stringify(buildSpec(input)).replace(/<\//g, '<\\/');
  // Function replacements, so a `$` in the facts (or the spec) is never read as a pattern.
  return BRAG_TEMPLATE
    .replace('__SPEC__', () => payload)
    .replace('<meta charset="utf-8">', () => `<meta charset="utf-8">${VIEWPORT}`)
    .replace('</body>', () => `${PLAYER}</body>`);
}
