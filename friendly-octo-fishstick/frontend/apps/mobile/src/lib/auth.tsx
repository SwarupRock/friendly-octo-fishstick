import { GoogleSignin } from '@react-native-google-signin/google-signin';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider, onAuthStateChanged, PhoneAuthProvider, signInWithCredential, signInWithPopup,
  signOut as firebaseSignOut, type User,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { loadProfile, saveProfile, type Profile } from './campaigns';
import { config, firebaseConfigured } from './config';
import { auth } from './firebase';
import { DEFAULT_SPEAKER } from './providers/sarvam';

type AuthValue = {
  user: User | null;
  profile: Profile | null;
  /** True until Firebase has restored (or ruled out) a saved session. */
  checking: boolean;
  /** Opens Google's account picker. Resolves false when the owner backs out. */
  signInWithGoogle: () => Promise<boolean>;
  /**
   * Text a 6-digit code to `phone` (E.164). `recaptchaToken` comes from the
   * security check in `PhoneCaptcha`. Resolves to the handle `confirmPhoneCode` needs.
   */
  sendPhoneCode: (phone: string, recaptchaToken: string) => Promise<string>;
  confirmPhoneCode: (verificationId: string, code: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const SEND_CODE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode';

/** Identity Toolkit's error names → the `auth/…` codes `authErrorMessage` explains. */
const SEND_CODE_ERRORS: [string, string][] = [
  ['INVALID_PHONE_NUMBER', 'auth/invalid-phone-number'],
  ['MISSING_PHONE_NUMBER', 'auth/missing-phone-number'],
  ['TOO_MANY_ATTEMPTS', 'auth/too-many-requests'],
  ['QUOTA_EXCEEDED', 'auth/quota-exceeded'],
  ['CAPTCHA_CHECK_FAILED', 'auth/captcha-check-failed'],
  ['INVALID_APP_CREDENTIAL', 'auth/invalid-app-credential'],
  ['BILLING_NOT_ENABLED', 'auth/billing-not-enabled'],
  ['region enabled', 'auth/region-not-allowed'],
  ['OPERATION_NOT_ALLOWED', 'auth/operation-not-allowed'],
];

function profileFrom(user: User, extra: Partial<Profile> = {}): Profile {
  return {
    displayName: user.displayName ?? '',
    businessName: '',
    businessLocation: '',
    // An account that signed in by phone has a number instead of an address.
    email: user.email ?? user.phoneNumber ?? '',
    speaker: DEFAULT_SPEAKER,
    createdAt: Date.now(),
    ...extra,
  };
}

/** Google's account picker on the device; resolves to a Google ID token, or null when dismissed. */
async function googleIdToken(): Promise<string | null> {
  if (!config.google.webClientId) {
    throw new Error('Google sign-in is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to apps/mobile/.env.');
  }
  GoogleSignin.configure({ webClientId: config.google.webClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;
  if (!result.data.idToken) throw new Error('Google did not return a sign-in token. Please try again.');
  return result.data.idToken;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured) return undefined;
    return onAuthStateChanged(auth(), async (next) => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setChecking(false);
        return;
      }
      try {
        setProfile((await loadProfile(next.uid)) ?? profileFrom(next));
      } catch {
        // Offline or rules not deployed yet: the account still works.
        setProfile(profileFrom(next));
      }
      setChecking(false);
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      await signInWithPopup(auth(), new GoogleAuthProvider());
      return true;
    }
    const idToken = await googleIdToken();
    if (!idToken) return false;
    await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
    return true;
  }, []);

  const sendPhoneCode = useCallback(async (phone: string, recaptchaToken: string) => {
    let response: Response;
    try {
      response = await fetch(`${SEND_CODE_URL}?key=${encodeURIComponent(config.firebase.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, recaptchaToken }),
      });
    } catch {
      throw Object.assign(new Error('No connection.'), { code: 'auth/network-request-failed' });
    }
    const body = await response.json().catch(() => null);
    if (response.ok && typeof body?.sessionInfo === 'string') return body.sessionInfo as string;
    const message = String(body?.error?.message ?? '');
    const known = SEND_CODE_ERRORS.find(([name]) => message.includes(name));
    throw Object.assign(new Error(message || 'The code could not be sent.'), { code: known?.[1] ?? '' });
  }, []);

  const confirmPhoneCode = useCallback(async (verificationId: string, code: string) => {
    await signInWithCredential(auth(), PhoneAuthProvider.credential(verificationId, code));
  }, []);

  const update = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return;
      setProfile((current) => (current ? { ...current, ...patch } : current));
      await saveProfile(user.uid, patch);
    },
    [user],
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth());
    // Forget the Google account too, so the next sign-in shows the picker again.
    if (Platform.OS !== 'web') await GoogleSignin.signOut().catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, profile, checking, signInWithGoogle, sendPhoneCode, confirmPhoneCode, updateProfile: update, signOut }),
    [user, profile, checking, signInWithGoogle, sendPhoneCode, confirmPhoneCode, update, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
