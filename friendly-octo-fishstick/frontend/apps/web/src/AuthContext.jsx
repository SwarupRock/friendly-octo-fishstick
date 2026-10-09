import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './lib/api';

/**
 * Session state for the Svarah workspace.
 *
 * Identity comes from the backend: `login`/`signup`/`demoLogin` exchange
 * credentials for a signed token, and every subsequent API call carries it.
 * Nothing here invents a user — if the backend is unreachable or the token has
 * expired, `user` is null and the workspace routes send you to /login.
 */

const AuthContext = createContext(null);

/** Two-letter avatar initials from a display name or email. */
function initialsFor(value) {
  const source = (value || '').trim();
  if (!source) return 'SV';
  const words = source.includes('@') ? source.split('@')[0].split(/[._-]+/) : source.split(/\s+/);
  const letters = words.filter(Boolean).map((w) => w[0]).join('');
  return (letters || source[0]).toUpperCase().slice(0, 2);
}

function toUser(account) {
  if (!account) return null;
  return {
    ownerUid: account.owner_uid,
    email: account.email,
    name: account.display_name || account.email,
    avatar: initialsFor(account.display_name || account.email),
    isDemo: Boolean(account.is_demo),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `checking` covers the first round-trip that validates a stored token, so
  // protected routes can wait instead of bouncing a signed-in user to /login.
  const [checking, setChecking] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Validate any stored token against the backend on first mount. A token that
  // the backend rejects (restarted with a new ephemeral key, expired, account
  // deleted) is discarded rather than kept around to fail every later call.
  useEffect(() => {
    const stored = api.loadSession();
    if (!stored) {
      setChecking(false);
      return undefined;
    }
    const controller = new AbortController();
    api
      .getAccount(controller.signal)
      .then((account) => {
        if (!mounted.current) return;
        setUser(toUser(account));
      })
      .catch((error) => {
        if (!mounted.current || controller.signal.aborted) return;
        if (error instanceof api.ApiError && error.isOffline) {
          // The backend is down, not the session. Keep the token and say so.
          setSessionNotice('Backend unreachable — working offline until it returns.');
        } else {
          api.clearSession();
          if (error?.code === 'token_expired') {
            setSessionNotice('Your session expired. Sign in again.');
          }
        }
      })
      .finally(() => {
        if (mounted.current) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  const adopt = useCallback((session) => {
    const next = toUser(session.account);
    setUser(next);
    setSessionNotice(
      session.ephemeralSigningKey
        ? 'Demo session: the backend is signing tokens with a temporary key, so restarting it signs you out.'
        : '',
    );
    return next;
  }, []);

  const login = useCallback(
    async (email, password) => adopt(await api.login({ email, password })),
    [adopt],
  );

  const signup = useCallback(
    async (name, email, password) =>
      adopt(await api.register({ email, password, displayName: name })),
    [adopt],
  );

  const loginWithDemo = useCallback(async () => adopt(await api.demoLogin()), [adopt]);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
    setSessionNotice('');
  }, []);

  /**
   * Called by workspace screens when the backend rejects their credential
   * mid-session, so the whole app drops to signed-out in one place.
   */
  const handleAuthFailure = useCallback(() => {
    api.clearSession();
    setUser(null);
    setSessionNotice('Your session ended. Sign in again to continue.');
  }, []);

  const value = useMemo(
    () => ({ user, checking, sessionNotice, login, signup, loginWithDemo, logout, handleAuthFailure }),
    [user, checking, sessionNotice, login, signup, loginWithDemo, logout, handleAuthFailure],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
