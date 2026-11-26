/**
 * Supabase client (auth + database).
 *
 * - Uses an SSR-safe synchronous `window.localStorage` adapter on Web so PKCE
 *   `code_verifier` survives full-page OAuth & password-recovery redirects reliably.
 * - Uses `AsyncStorage` on iOS/Android native builds.
 * - When the two env vars are missing, `isSupabaseConfigured` is false and the
 *   app degrades gracefully to local-only mode.
 */

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { AppState, Platform } from 'react-native';

export const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const webStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota or restricted-mode errors.
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  },
};

const READ_TIMEOUT_MS = 10_000;
const WRITE_TIMEOUT_MS = 15_000;

function resolveRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request && input.method) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  if (typeof AbortController === 'undefined') {
    return fetch(input, init);
  }

  const method = resolveRequestMethod(input, init);
  const timeoutMs = method === 'GET' || method === 'HEAD' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  const controller = new AbortController();
  const callerSignal =
    init?.signal ??
    (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    global: {
      fetch: fetchWithTimeout,
    },
    auth: {
      storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // OAuth on native returns tokens in the deep link, not the URL fragment.
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  },
);

// Keep the session fresh while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Deep link / origin URL that OAuth & email-confirmation flows redirect back to. */
export function authRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  return makeRedirectUri({ scheme: 'app10t4', path: 'auth-callback' });
}

/** Redirect URL for password recovery emails (`?auth_action=recovery`). */
export function authResetPasswordRedirectUrl(): string {
  const base = authRedirectUrl();
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}auth_action=recovery`;
}
