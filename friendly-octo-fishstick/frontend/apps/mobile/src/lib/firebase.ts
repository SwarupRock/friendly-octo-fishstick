/**
 * Firebase — the app's backend.
 *
 *  - Auth:      Google and phone-number sign-in (session kept in AsyncStorage,
 *               so the owner stays signed in until they sign out).
 *  - Firestore: `users/{uid}` profile and `users/{uid}/campaigns/{id}`.
 *  - Storage:   `users/{uid}/campaigns/{id}/…` for posters, voice-overs, videos.
 *
 * Access is owner-only; the rules live in `firebase/firestore.rules` and
 * `firebase/storage.rules`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { config, firebaseConfigured } from './config';

let app: FirebaseApp | null = null;
let authInstance: FirebaseAuth.Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

function ensureApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error('Firebase is not configured. Add the EXPO_PUBLIC_FIREBASE_* values to apps/mobile/.env.');
  }
  if (!app) app = getApps().length ? getApp() : initializeApp(config.firebase);
  return app;
}

export function auth(): FirebaseAuth.Auth {
  if (authInstance) return authInstance;
  const instance = ensureApp();
  if (Platform.OS === 'web') {
    authInstance = FirebaseAuth.getAuth(instance);
    return authInstance;
  }
  // `getReactNativePersistence` exists only in the React Native build of the
  // SDK, which Metro resolves at bundle time but the web typings do not list.
  const reactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;
  try {
    authInstance = FirebaseAuth.initializeAuth(instance, {
      persistence: reactNativePersistence ? reactNativePersistence(AsyncStorage) : undefined,
    });
  } catch {
    // Already initialized (fast refresh re-runs this module).
    authInstance = FirebaseAuth.getAuth(instance);
  }
  return authInstance;
}

export function db(): Firestore {
  if (dbInstance) return dbInstance;
  const instance = ensureApp();
  try {
    // Campaign documents are assembled piece by piece, so absent pieces are
    // simply left out instead of failing the write.
    dbInstance = initializeFirestore(instance, { ignoreUndefinedProperties: true });
  } catch {
    dbInstance = getFirestore(instance);
  }
  return dbInstance;
}

export function storage(): FirebaseStorage | null {
  if (!config.firebase.storageBucket) return null;
  if (!storageInstance) storageInstance = getStorage(ensureApp());
  return storageInstance;
}

/** Firebase's `auth/…` codes (and Google Sign-In's) in plain words. */
export function authErrorMessage(error: unknown): string {
  const code = String((error as { code?: string | number })?.code ?? '');
  switch (code) {
    case 'auth/invalid-phone-number': return 'That phone number does not look right. Include the country code, e.g. +91 98765 43210.';
    case 'auth/missing-phone-number': return 'Enter your phone number.';
    case 'auth/invalid-verification-code': return 'That code is not correct. Check the SMS and try again.';
    case 'auth/code-expired':
    case 'auth/session-expired': return 'That code has expired. Request a new one.';
    case 'auth/quota-exceeded': return 'The SMS limit for today has been reached. Try again later or use Google.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential': return 'The security check failed. Please try again.';
    case 'auth/billing-not-enabled': return 'This Firebase project needs billing enabled before it can send SMS codes.';
    case 'auth/region-not-allowed': return 'SMS codes are not enabled for this country yet. Use Google instead.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    case 'auth/account-exists-with-different-credential': return 'This email is already linked to another sign-in method.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'The Google window was closed before sign-in finished.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled for the Firebase project yet (Authentication → Sign-in method).';
    // Google Sign-In on Android.
    case 'DEVELOPER_ERROR':
    case '10':
      return 'Google sign-in is not set up for this build: register its SHA-1 fingerprint in the Firebase project (Project settings → Your apps → Android).';
    case 'PLAY_SERVICES_NOT_AVAILABLE': return 'Google Play services is missing or out of date on this device.';
    case 'IN_PROGRESS': return 'A Google sign-in is already open.';
    default:
      return (error as Error)?.message || 'Something went wrong. Please try again.';
  }
}
