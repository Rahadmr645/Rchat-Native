import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../network/authApi';
import { fetchMe, loginAccount, registerAccount } from '../network/authApi';
import { setChatAuthToken } from '../network/chatSocket';
import { syncExpoPushWithServer, unregisterExpoPushFromServer } from '../push/expoPushRegistration';

const TOKEN_KEY = 'rchat_auth_token';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reload `/me` from the server (e.g. after changing profile photo). */
  refreshUser: () => Promise<void>;
  setUserFromServer: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (!stored) {
          if (!cancelled) setReady(true);
          return;
        }
        const me = await fetchMe(stored);
        if (cancelled) return;
        setToken(stored);
        setUser(me);
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setChatAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void syncExpoPushWithServer(token);
  }, [ready, token]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user: u, token: t } = await loginAccount(email, password);
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { user: u, token: t } = await registerAccount(email, password, name);
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    const t = token;
    if (t) {
      await unregisterExpoPushFromServer(t);
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const me = await fetchMe(token);
    setUser(me);
  }, [token]);

  const setUserFromServer = useCallback((next: AuthUser) => {
    setUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      ready,
      signIn,
      signUp,
      signOut,
      refreshUser,
      setUserFromServer,
    }),
    [user, token, ready, signIn, signUp, signOut, refreshUser, setUserFromServer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

