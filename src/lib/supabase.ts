/**
 * Supabase client (auth + database).
 *
 * When the two env vars are missing the app still runs in local-only mode:
 * `isSupabaseConfigured` is false and every auth screen offers an offline
 * preview instead of failing.
 */

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // OAuth on native returns tokens in the deep link, not the URL fragment.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

// Keep the session fresh while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Deep link the OAuth provider should come back to. */
export function authRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  return 'app10t4://auth-callback';
}
