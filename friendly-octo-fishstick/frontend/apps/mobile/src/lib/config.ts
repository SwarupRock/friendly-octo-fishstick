/**
 * Runtime configuration.
 *
 * Every value comes from an `EXPO_PUBLIC_*` variable in `apps/mobile/.env`
 * (git-ignored; see `.env.example`). Expo inlines these at build time, so each
 * one has to be read with a literal `process.env.EXPO_PUBLIC_…` expression.
 *
 * The provider keys are compiled into the app bundle: anyone holding the
 * installed app can extract them. Use keys you are prepared to rotate.
 */

const trimBase = (value: string | undefined, fallback: string) =>
  (value || fallback).replace(/\/+$/, '');

const csv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const config = {
  agnes: {
    base: trimBase(process.env.EXPO_PUBLIC_AGNES_API_BASE, 'https://apihub.agnes-ai.com/v1'),
    key: process.env.EXPO_PUBLIC_AGNES_API_KEY ?? '',
    textModel: process.env.EXPO_PUBLIC_AGNES_TEXT_MODEL || 'agnes-3.0-flash',
    imageModel: process.env.EXPO_PUBLIC_AGNES_IMAGE_MODEL || 'agnes-image-2.5-flash',
  },
  sarvam: {
    base: trimBase(process.env.EXPO_PUBLIC_SARVAM_API_BASE, 'https://api.sarvam.ai'),
    key: process.env.EXPO_PUBLIC_SARVAM_API_KEY ?? '',
    sttModel: process.env.EXPO_PUBLIC_SARVAM_STT_MODEL || 'saaras:v4',
  },
  magicHour: {
    base: trimBase(process.env.EXPO_PUBLIC_MAGICHOUR_API_BASE, 'https://api.magichour.ai'),
    /** Tried in order; the next key is used when one is rejected or out of credits. */
    keys: csv(process.env.EXPO_PUBLIC_MAGICHOUR_API_KEYS),
    model: process.env.EXPO_PUBLIC_MAGICHOUR_MODEL || 'default',
    resolution: process.env.EXPO_PUBLIC_MAGICHOUR_RESOLUTION || '',
  },
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  },
  google: {
    /** The Firebase project's Web OAuth client; Google sign-in tokens are issued for it. */
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
} as const;

export const firebaseConfigured = Boolean(
  config.firebase.apiKey && config.firebase.projectId && config.firebase.appId,
);
