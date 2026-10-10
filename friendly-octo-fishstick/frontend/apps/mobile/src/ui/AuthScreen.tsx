/**
 * Sign in or sign up — the same two ways the website offers: a Google account,
 * or a phone number confirmed by an SMS code. The first sign-in creates the
 * account, and the session is kept until the owner signs out.
 */

import { Link, Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { firebaseConfigured } from '@/lib/config';
import { authErrorMessage } from '@/lib/firebase';
import { fonts, useTheme } from '@/lib/theme';

import { AuthShell } from './AuthShell';
import { Field, PrimaryButton } from './kit';
import { PhoneCaptcha } from './PhoneCaptcha';

const RESEND_SECONDS = 30;
// The SMS security check needs a WebView, which the browser build does not have.
const PHONE_AVAILABLE = Platform.OS !== 'web';

/** `98765 43210` → `+919876543210`; a number already starting with `+` is kept. */
function toE164(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : `+91${digits.replace(/^0+/, '')}`;
}

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const { colors } = useTheme();
  const { user, signInWithGoogle, sendPhoneCode, confirmPhoneCode } = useAuth();
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [checking, setChecking] = useState(false); // the security check is open
  const [busy, setBusy] = useState<'' | 'google' | 'phone'>('');
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // Signed in: straight to the voice workspace.
  if (user) return <Redirect href="/workspace" />;

  const google = async () => {
    setError('');
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (problem) {
      setError(authErrorMessage(problem));
    } finally {
      setBusy('');
    }
  };

  const startPhone = () => {
    setError('');
    if (!/^\+[1-9]\d{6,14}$/.test(toE164(number))) {
      setError('Enter your full phone number.');
      return;
    }
    setBusy('phone');
    setChecking(true);
  };

  const onCaptcha = async (token: string) => {
    setChecking(false);
    const phone = toE164(number);
    try {
      setVerificationId(await sendPhoneCode(phone, token));
      setSentTo(phone);
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (problem) {
      setError(authErrorMessage(problem));
    } finally {
      setBusy('');
    }
  };

  const verify = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    setBusy('phone');
    try {
      await confirmPhoneCode(verificationId, code);
    } catch (problem) {
      setError(authErrorMessage(problem));
    } finally {
      setBusy('');
    }
  };

  const changeNumber = () => {
    setSentTo('');
    setVerificationId('');
    setCode('');
    setError('');
  };

  const signup = mode === 'signup';
  return (
    <AuthShell
      title={signup ? 'Create your Svarah.AI account' : 'Welcome back'}
      subtitle={signup ? 'Say your offer out loud. We turn it into a campaign.' : 'Sign in to pick up your offers where you left them.'}
      footer={
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
          {signup ? 'Already have an account? ' : 'New to Svarah.AI? '}
          <Link href={signup ? '/login' : '/signup'} replace style={{ color: colors.ink, fontFamily: fonts.bold }}>
            {signup ? 'Sign in' : 'Create an account'}
          </Link>
        </Text>
      }
    >
      <PrimaryButton
        label={signup ? 'Sign up with Google' : 'Continue with Google'}
        tone="primary"
        onPress={google}
        loading={busy === 'google'}
        disabled={!firebaseConfigured || busy !== ''}
      />

      {PHONE_AVAILABLE ? (
        <>
          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: colors.line }]} />
            <Text style={{ color: colors.muted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1 }}>OR</Text>
            <View style={[styles.rule, { backgroundColor: colors.line }]} />
          </View>

          {sentTo ? (
            <>
              <Field
                label={`Code sent to ${sentTo}`} icon="key" value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••" keyboardType="number-pad" autoComplete="one-time-code"
                textContentType="oneTimeCode" maxLength={6} autoFocus returnKeyType="go" onSubmitEditing={verify}
              />
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={changeNumber} hitSlop={10}>
                  <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 12.5 }}>Change number</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={startPhone} hitSlop={10} disabled={resendIn > 0 || busy !== ''}>
                  <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 12.5, opacity: resendIn > 0 ? 0.55 : 1 }}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Field
              label="Phone number" icon="phone" value={number} onChangeText={setNumber}
              placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel"
              textContentType="telephoneNumber" returnKeyType="go" onSubmitEditing={startPhone}
            />
          )}
        </>
      ) : null}

      {error ? <Text accessibilityRole="alert" style={{ color: colors.warnInk, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 }}>{error}</Text> : null}

      {PHONE_AVAILABLE ? (
        <PrimaryButton
          label={sentTo ? (signup ? 'Create account' : 'Sign in') : 'Send code'}
          icon="arrow-right"
          onPress={sentTo ? verify : startPhone}
          loading={busy === 'phone'}
          disabled={!firebaseConfigured || busy !== ''}
        />
      ) : null}

      <PhoneCaptcha
        visible={checking}
        onToken={onCaptcha}
        onError={(message) => {
          setChecking(false);
          setBusy('');
          setError(message);
        }}
        onCancel={() => {
          setChecking(false);
          setBusy('');
        }}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
