import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useQueryClient} from '@tanstack/react-query';
import {api, client, isApiError} from '../api';
import type {RegisterInput} from '../api/endpoints';
import type {AuthResponse, Me} from '../api/types';
import {unregisterPushToken} from '../push/PushProvider';
import {qk} from '../query/keys';

const ME_CACHE_KEY = 'studyhub.me.v1';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn' | 'suspended';

interface AuthCtx {
  status: AuthStatus;
  me: Me | null;
  /** Boot failed because the server was unreachable and no cached profile exists. */
  bootError: string | null;
  retryBoot: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Replace the cached profile (after edit / avatar upload). */
  setMe: (me: Me) => void;
  refreshMe: () => Promise<void>;
  /** Right after sign-up: interests picker + email verification before the tabs. */
  pendingSetup: boolean;
  completeSetup: () => void;
  /** ACCOUNT_SUSPENDED reason (status === 'suspended'). */
  suspendedReason: string | null;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return v;
}

/** Signed-in user (screens behind the auth gate only). */
export function useMe(): Me {
  const {me} = useAuth();
  if (!me) {
    throw new Error('useMe used while signed out');
  }
  return me;
}

async function cacheMe(me: Me | null) {
  try {
    if (me) {
      await AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
    } else {
      await AsyncStorage.removeItem(ME_CACHE_KEY);
    }
  } catch {
    // non-critical cache
  }
}

async function readCachedMe(): Promise<Me | null> {
  try {
    const raw = await AsyncStorage.getItem(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [me, setMeState] = useState<Me | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [pendingSetup, setPendingSetup] = useState(false);
  const [suspendedReason, setSuspendedReason] = useState<string | null>(null);
  const mounted = useRef(true);

  const setMe = useCallback(
    (next: Me) => {
      setMeState(next);
      cacheMe(next);
      qc.setQueryData(qk.user(next.id), next);
    },
    [qc],
  );

  const clearSession = useCallback(async () => {
    await client.setTokens(null);
    await cacheMe(null);
    qc.clear();
    if (mounted.current) {
      setMeState(null);
      setStatus('signedOut');
    }
  }, [qc]);

  // Refresh-token rejected anywhere in the app → back to the login screen.
  useEffect(() => {
    mounted.current = true;
    const off = client.onSessionExpired(() => {
      cacheMe(null);
      qc.clear();
      setMeState(null);
      setStatus('signedOut');
    });
    const offSuspended = client.onSuspended(reason => {
      setSuspendedReason(reason);
      client.setTokens(null);
      cacheMe(null);
      qc.clear();
      setMeState(null);
      setStatus('suspended');
    });
    return () => {
      mounted.current = false;
      off();
      offSuspended();
    };
  }, [qc]);

  // Boot: restore tokens from the Keychain, then validate with /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootError(null);
      const hasSession = await client.restore();
      if (!hasSession) {
        if (!cancelled) {
          setStatus('signedOut');
        }
        return;
      }
      const cached = await readCachedMe();
      if (cached && !cancelled) {
        // Optimistic: show the app immediately, validate in the background.
        setMeState(cached);
        setStatus('signedIn');
      }
      try {
        const fresh = await api.auth.me();
        if (!cancelled) {
          setMe(fresh);
          setStatus('signedIn');
        }
      } catch (e) {
        if (cancelled) {
          return;
        }
        if (isApiError(e) && (e.status === 401 || e.code === 'UNAUTHORIZED')) {
          await clearSession();
        } else if (!cached) {
          setBootError(
            isApiError(e) ? e.message : 'Unable to reach the server.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootAttempt, clearSession, setMe]);

  const onAuth = useCallback(
    async (res: AuthResponse) => {
      qc.clear();
      await client.setTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
      setMe(res.user);
      setBootError(null);
      setStatus('signedIn');
    },
    [qc, setMe],
  );

  const login = useCallback(
    async (identifier: string, password: string) => {
      await onAuth(await api.auth.login(identifier.trim(), password));
    },
    [onAuth],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await onAuth(await api.auth.register(input));
      setPendingSetup(true);
    },
    [onAuth],
  );

  const logout = useCallback(async () => {
    await unregisterPushToken();
    const rt = client.refreshToken;
    if (rt) {
      // Best effort: revoke the refresh token server-side.
      api.auth.logout(rt).catch(() => undefined);
    }
    await clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    await unregisterPushToken();
    await api.users.deleteMe();
    await clearSession();
  }, [clearSession]);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.auth.me());
    } catch {
      // keep the cached profile
    }
  }, [setMe]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      me,
      bootError,
      retryBoot: () => setBootAttempt(a => a + 1),
      login,
      register,
      logout,
      deleteAccount,
      setMe,
      refreshMe,
      pendingSetup,
      completeSetup: () => setPendingSetup(false),
      suspendedReason,
    }),
    [
      status,
      me,
      bootError,
      login,
      register,
      logout,
      deleteAccount,
      setMe,
      refreshMe,
      pendingSetup,
      suspendedReason,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
