/**
 * Sarvam AI (https://docs.sarvam.ai) — the only speech provider.
 *
 *  - STT: POST {base}/speech-to-text — multipart `file`, `model`,
 *         `language_code` (`unknown` auto-detects); header
 *         `api-subscription-key`. Meant for clips under ~30 s.
 *  - TTS: POST {base}/text-to-speech — JSON `text` (≤ 2500 chars),
 *         `language_code`, `speaker`, `model: bulbul:v3`; the reply carries
 *         `audios[0]` as base64 WAV.
 */

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

import { config } from '../config';
import { AppError, errorDetail, fetchWithTimeout, readJson, withRetries } from '../http';

const PROVIDER = 'Sarvam';

export const TTS_LANGUAGES: Record<string, string> = {
  English: 'en-IN', Hindi: 'hi-IN', Kannada: 'kn-IN', Tamil: 'ta-IN', Telugu: 'te-IN',
  Marathi: 'mr-IN', Bengali: 'bn-IN', Malayalam: 'ml-IN', Gujarati: 'gu-IN', Punjabi: 'pa-IN',
  Odia: 'od-IN',
};
export const LANGUAGE_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TTS_LANGUAGES).map(([name, code]) => [code, name]),
);
export const TTS_SPEAKERS = ['shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya'];
export const DEFAULT_SPEAKER = 'shubh';
const MAX_TTS_CHARS = 2500;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/3gpp': '3gp',
};

function key(): string {
  if (!config.sarvam.key) {
    throw new AppError('Sarvam is not configured: EXPO_PUBLIC_SARVAM_API_KEY is missing.', 'provider_not_configured');
  }
  return config.sarvam.key;
}

async function failure(response: Response, what: string): Promise<AppError> {
  const detail = await errorDetail(response);
  const status = response.status;
  if (status === 401 || status === 403) return new AppError(`Sarvam rejected the API key. ${detail}`.trim(), 'provider_auth_error', { status });
  if (status === 402) return new AppError('The Sarvam account is out of credits.', 'provider_quota_exceeded', { status });
  if (status === 429) return new AppError('Sarvam is rate limiting requests. Try again in a moment.', 'provider_rate_limited', { status, retryable: true });
  if (status === 400 || status === 422) return new AppError(`Sarvam could not process the ${what}. ${detail}`.trim(), 'provider_bad_request', { status });
  return new AppError(`Sarvam returned HTTP ${status}. ${detail}`.trim(), 'provider_unavailable', { status, retryable: status >= 500 });
}

export type Transcript = { text: string; languageCode: string | null };

/** Transcribe a finished recording (a local file URI, or a blob URL on web). */
export async function transcribe(uri: string, mime: string): Promise<Transcript> {
  const contentType = mime.split(';')[0].trim().toLowerCase() || 'audio/mp4';
  const filename = `audio.${EXTENSIONS[contentType] ?? 'm4a'}`;
  const apiKey = key();

  const data = await withRetries(async () => {
    // A FormData body is single-use, so it is rebuilt for every attempt.
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('file', blob, filename);
    } else {
      // React Native's multipart upload takes a file descriptor, not a Blob.
      form.append('file', { uri, name: filename, type: contentType } as unknown as Blob);
    }
    form.append('model', config.sarvam.sttModel);
    form.append('language_code', 'unknown'); // the documented auto-detect value
    const response = await fetchWithTimeout(
      `${config.sarvam.base}/speech-to-text`,
      { method: 'POST', headers: { 'api-subscription-key': apiKey }, body: form },
      90_000,
      PROVIDER,
    );
    if (!response.ok) throw await failure(response, 'recording');
    return readJson(response, PROVIDER);
  }, 2);

  return {
    text: typeof data?.transcript === 'string' ? data.transcript.trim() : '',
    languageCode: typeof data?.language_code === 'string' ? data.language_code : null,
  };
}

export type Speech = { uri: string; languageCode: string; speaker: string };

/** Speak `text`; resolves to a playable WAV (a cache file, or a data URI on web). */
export async function synthesize(text: string, language: string, speaker = DEFAULT_SPEAKER): Promise<Speech> {
  const languageCode = TTS_LANGUAGES[language];
  if (!languageCode) throw new AppError(`Sarvam cannot speak ${language}.`, 'language_unsupported');
  const body = JSON.stringify({
    text: text.slice(0, MAX_TTS_CHARS),
    language_code: languageCode,
    speaker,
    model: 'bulbul:v3',
    output_audio_codec: 'wav',
  });
  const apiKey = key();
  const data = await withRetries(async () => {
    const response = await fetchWithTimeout(
      `${config.sarvam.base}/text-to-speech`,
      { method: 'POST', headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' }, body },
      90_000,
      PROVIDER,
    );
    if (!response.ok) throw await failure(response, 'script');
    return readJson(response, PROVIDER);
  }, 2);

  const audio = data?.audios?.[0];
  if (typeof audio !== 'string' || !audio) throw new AppError('Sarvam returned no audio.', 'tts_bad_response');
  if (Platform.OS === 'web') {
    return { uri: `data:audio/wav;base64,${audio}`, languageCode, speaker };
  }
  const file = new File(Paths.cache, `svarah-voice-${Date.now()}.wav`);
  file.create({ overwrite: true });
  file.write(audio, { encoding: 'base64' });
  return { uri: file.uri, languageCode, speaker };
}
