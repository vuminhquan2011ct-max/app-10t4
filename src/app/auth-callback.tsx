/**
 * OAuth & Password-Recovery callback landing route (`app10t4://auth-callback` / `/auth-callback`).
 *
 * Completes PKCE/implicit token exchange from the incoming URL and immediately
 * redirects to `/` so Expo Router never shows an unmatched-route screen on deep links.
 */

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { clearWebAuthUrlParams, completeSupabaseAuthFromUrl } from '@/lib/supabase-auth';

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const linkedUrl = Linking.useURL();

  useEffect(() => {
    let active = true;
    let isRecovery = false;
    void (async () => {
      try {
        const incomingUrl =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.href
            : (linkedUrl ?? (await Linking.getInitialURL()) ?? '');

        if (incomingUrl) {
          const res = await completeSupabaseAuthFromUrl(incomingUrl);
          isRecovery = res.isRecovery;
          if (!res.isRecovery) {
            clearWebAuthUrlParams();
          }
        }
      } catch {
        // Fallback smoothly to root where AuthGate displays any recovery/error state.
      } finally {
        if (active) {
          const target = isRecovery && Platform.OS === 'web' ? '/?auth_action=recovery' : '/';
          router.replace(target as never);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [linkedUrl]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.accent} />
      <Text style={[styles.title, { color: theme.text }]}>
        Đang hoàn tất xác thực Lớp 10T4...
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Hệ thống đang đồng bộ hồ sơ của bạn
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});
