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

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
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
