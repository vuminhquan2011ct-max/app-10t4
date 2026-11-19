/**
 * Lightweight floating toast provider so quick actions (approving, rewarding,
 * copying reports, marking attendance) give instant tactile feedback.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const TONE_ICON: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  info: 'sparkles',
  warning: 'alert-circle',
  danger: 'close-circle',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        tone === 'danger'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, tone });
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, 2600);
  }, []);

  const toneColor = toast
    ? {
        success: theme.success,
        info: theme.accent,
        warning: theme.warning,
        danger: theme.danger,
      }[toast.tone]
    : theme.accent;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={[styles.host, { top: Math.max(insets.top + Spacing.two, Spacing.four) }]}>
          <Animated.View
            key={toast.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(180)}
            style={[
              styles.pill,
              Shadow.floating,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={[styles.dot, { backgroundColor: toneColor }]}>
              <Ionicons name={TONE_ICON[toast.tone]} size={16} color="#FFFFFF" />
            </View>
            <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
              {toast.message}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 420,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
});
