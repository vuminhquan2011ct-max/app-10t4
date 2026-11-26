/**
 * Subtle global floating offline & pending-sync banner.
 * Renders ONLY when `syncStatus === 'offline' || hasPendingPush` (returns `null`
 * when healthy/synced so it adds zero visual noise).
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';

export function SyncStatusBanner() {
  const { syncStatus, hasPendingPush, pullNow } = useClassStore();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isOffline = syncStatus === 'offline';
  if (!isOffline && !hasPendingPush) return null;

  const isOfflineWithPending = isOffline && hasPendingPush;
  const isDangerTone = isOffline;
  const accentColor = isDangerTone ? theme.danger : theme.warning;
  const softBg = isDangerTone ? theme.dangerSoft : theme.warningSoft;

  const iconName: keyof typeof Ionicons.glyphMap = isOffline
    ? 'cloud-offline-outline'
    : 'cloud-upload-outline';

  const message = isOfflineWithPending
    ? 'Mất kết nối · Có thay đổi chờ đồng bộ'
    : isOffline
      ? 'Đang ngoại tuyến · Dữ liệu lưu trên máy'
      : 'Đang đồng bộ thay đổi lên lớp...';

  const actionLabel = isOfflineWithPending
    ? 'Thử lại'
    : isOffline
      ? 'Kết nối lại'
      : 'Đẩy ngay';

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await pullNow();
    } catch {
      // Sync state already reflects failure; banner stays visible for retry.
    } finally {
      if (mountedRef.current) {
        setRetrying(false);
      }
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: Math.max(insets.top + Spacing.one, Spacing.two) }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.pill,
          Shadow.floating,
          {
            backgroundColor: theme.card,
            borderColor: accentColor,
          },
        ]}>
        <View style={[styles.iconWrap, { backgroundColor: softBg }]}>
          <Ionicons name={iconName} size={15} color={accentColor} />
        </View>

        <Text style={[styles.message, { color: theme.text }]} numberOfLines={1}>
          {message}
        </Text>

        <Pressable
          disabled={retrying}
          onPress={() => void handleRetry()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: softBg, borderColor: `${accentColor}55` },
            pressed && styles.pressed,
            retrying && styles.disabled,
          ]}>
          {retrying ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <Text style={[styles.actionText, { color: accentColor }]}>{actionLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
    zIndex: 950,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: Radius.pill,
    borderWidth: 1.2,
    maxWidth: 460,
    width: '100%',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtn: {
    minHeight: 30,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 11.5,
    fontWeight: '900',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.6 },
});
