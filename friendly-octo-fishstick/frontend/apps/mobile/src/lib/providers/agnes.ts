/**
 * Agnes AI (https://wiki.agnes-ai.com) — text and image.
 *
 *  - Text:  POST {base}/chat/completions — OpenAI-compatible. No JSON mode is
 *           documented, so JSON is asked for in the prompt and parsed here.
 *  - Image: POST {base}/images/generations — `size` is a tier (`1K`), `ratio`
 *           an aspect ratio, and `response_format` lives under `extra_body`.
 */

import { config } from '../config';
import { AppError, errorDetail, fetchWithTimeout, readJson, withRetries } from '../http';

const PROVIDER = 'Agnes';

function headers(): Record<string, string> {
  if (!config.agnes.key) {
    throw new AppError('Agnes is not configured: EXPO_PUBLIC_AGNES_API_KEY is missing.', 'provider_not_configured');
  }
  return { Authorization: `Bearer ${config.agnes.key}`, 'Content-Type': 'application/json' };
}

async function failure(response: Response): Promise<AppError> {
  const detail = await errorDetail(response);
  const status = response.status;
  const options = { status, retryable: status === 429 || status >= 500 };
  if (status === 401 || status === 403) {
    const quota = /quota|balance|credit/i.test(detail);
    return new AppError(
      quota ? `The Agnes account is out of credits. ${detail}`.trim() : `Agnes rejected the API key. ${detail}`.trim(),
      quota ? 'provider_quota_exceeded' : 'provider_auth_error',
      { status },
    );
  }
  if (status === 429) return new AppError('Agnes is rate limiting requests. Try again in a moment.', 'provider_rate_limited', options);
  return new AppError(`Agnes returned HTTP ${status}. ${detail}`.trim(), 'provider_unavailable', options);
}

/** Pull the first JSON object out of a model reply (code fences and prose tolerated). */
export function extractJsonObject(text: string): Record<string, any> {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AppError('The model did not return JSON.', 'llm_bad_output');
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to the error below
  }
  throw new AppError('The model returned malformed JSON.', 'llm_bad_output');
}

export async function completeJson(
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<Record<string, any>> {
  const { maxTokens = 2000, temperature = 0.4, timeoutMs = 60_000 } = options;
  const body = JSON.stringify({
    model: config.agnes.textModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  const data = await withRetries(async () => {
    const response = await fetchWithTimeout(
      `${config.agnes.base}/chat/completions`,
      { method: 'POST', headers: headers(), body },
      timeoutMs,
      PROVIDER,
    );
    if (!response.ok) throw await failure(response);
    return readJson(response, PROVIDER);
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AppError('Agnes returned an empty reply.', 'llm_bad_output');
  }
  return extractJsonObject(content);
}

/** Appended to every art prompt: the app sets all text itself. */
const NO_TEXT_SUFFIX =
  ' ABSOLUTELY NO TEXT, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY, NO LOGOS, NO WATERMARK anywhere in the image.';

/** Text-free poster artwork. Resolves to an https URL or a `data:` URI. */
export async function generateArt(prompt: string, ratio = '3:4'): Promise<string> {
  const body = JSON.stringify({
    model: config.agnes.imageModel,
    prompt: prompt + NO_TEXT_SUFFIX,
    size: '1K',
    ratio,
    extra_body: { response_format: 'url' },
  });
  const data = await withRetries(async () => {
    const response = await fetchWithTimeout(
      `${config.agnes.base}/images/generations`,
      { method: 'POST', headers: headers(), body },
      360_000, // image generation is documented at 60–360 s
      PROVIDER,
    );
    if (!response.ok) throw await failure(response);
    return readJson(response, PROVIDER);
  }, 2);
  const item = data?.data?.[0];
  if (typeof item?.url === 'string' && item.url.startsWith('http')) return item.url;
  if (typeof item?.b64_json === 'string' && item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new AppError('Agnes returned no image.', 'image_bad_response');
}
