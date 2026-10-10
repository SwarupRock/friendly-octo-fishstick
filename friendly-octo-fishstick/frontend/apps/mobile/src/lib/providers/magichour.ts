/**
 * Magic Hour text-to-video (https://docs.magichour.ai).
 *
 *   POST {base}/v1/text-to-video        → { id }
 *   GET  {base}/v1/video-projects/{id}  → status queued|rendering|complete|
 *        error|canceled, downloads[{ url }], error{ message }
 *
 * Several keys may be configured. Creating a video walks them in order and
 * moves on when a key is rejected (401) or out of credits (402). The key that
 * accepted the task is recorded in the task id (`mh<index>:<id>`), because a
 * project can only be read back with the key that created it.
 */

import { config } from '../config';
import { AppError, errorDetail, fetchWithTimeout, readJson } from '../http';

const PROVIDER = 'Magic Hour';
const KEY_SCOPED = [401, 402];

export type VideoStatus = 'queued' | 'rendering' | 'complete' | 'failed';
export type VideoTask = { taskId: string; status: VideoStatus; url: string | null; error: string | null };

const STATUS: Record<string, VideoStatus> = {
  draft: 'queued', queued: 'queued', rendering: 'rendering', complete: 'complete',
  error: 'failed', canceled: 'failed',
};

async function failure(response: Response): Promise<AppError> {
  const detail = await errorDetail(response);
  const status = response.status;
  const text =
    status === 401 ? 'Magic Hour rejected the API key.'
    : status === 402 ? 'The Magic Hour account is out of credits.'
    : status === 404 ? 'Magic Hour does not know this video.'
    : status === 400 || status === 422 ? 'Magic Hour rejected the video request.'
    : status === 429 ? 'Magic Hour is rate limiting requests.'
    : `Magic Hour returned HTTP ${status}.`;
  return new AppError(`${text} ${detail}`.trim(), 'provider_unavailable', { status });
}

function call(method: string, path: string, key: string, body?: unknown): Promise<Response> {
  return fetchWithTimeout(
    `${config.magicHour.base}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    45_000,
    PROVIDER,
  );
}

export async function createVideo(
  prompt: string,
  options: { seconds?: number; aspectRatio?: '9:16' | '16:9' | '1:1' } = {},
): Promise<VideoTask> {
  const keys = config.magicHour.keys;
  if (!keys.length) {
    throw new AppError('Magic Hour is not configured: EXPO_PUBLIC_MAGICHOUR_API_KEYS is missing.', 'provider_not_configured');
  }
  const body: Record<string, unknown> = {
    name: 'Svarah campaign video',
    end_seconds: options.seconds ?? 5,
    aspect_ratio: options.aspectRatio ?? '9:16',
    style: { prompt },
  };
  if (config.magicHour.model !== 'default') body.model = config.magicHour.model;
  if (config.magicHour.resolution) body.resolution = config.magicHour.resolution;

  let last: AppError | null = null;
  for (let index = 0; index < keys.length; index += 1) {
    const response = await call('POST', '/v1/text-to-video', keys[index], body);
    if (response.ok) {
      const data = await readJson(response, PROVIDER);
      if (typeof data?.id !== 'string' || !data.id) {
        throw new AppError('Magic Hour accepted the request but returned no video id.', 'video_bad_response');
      }
      return { taskId: `mh${index}:${data.id}`, status: 'queued', url: null, error: null };
    }
    last = await failure(response);
    // Anything but a key-scoped refusal is about the request; other keys will not help.
    if (!KEY_SCOPED.includes(response.status)) throw last;
  }
  throw last ?? new AppError('Magic Hour refused every configured key.', 'provider_unavailable');
}

export async function retrieveVideo(taskId: string): Promise<VideoTask> {
  const [head, projectId] = taskId.split(':');
  const index = /^mh\d+$/.test(head) ? Number(head.slice(2)) : -1;
  const key = config.magicHour.keys[index];
  if (!projectId || !key) {
    throw new AppError('This video was created with a Magic Hour key that is no longer configured.', 'video_not_found');
  }
  const response = await call('GET', `/v1/video-projects/${projectId}`, key);
  if (!response.ok) throw await failure(response);
  const data = await readJson(response, PROVIDER);
  const status = STATUS[String(data?.status ?? '').toLowerCase()];
  if (!status) throw new AppError(`Magic Hour returned an unknown status "${data?.status}".`, 'video_bad_response');
  const candidate = data?.downloads?.[0]?.url;
  const url = typeof candidate === 'string' && candidate.startsWith('https://') ? candidate : null;
  const message = data?.error?.message || data?.error?.code || null;
  return {
    taskId,
    status,
    url,
    error: status === 'failed' ? String(message || `Magic Hour reported the video as ${data.status}.`) : null,
  };
}
