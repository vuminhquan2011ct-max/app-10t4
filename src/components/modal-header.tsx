import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ModalHeaderProps = {
  title: string;
  subtitle?: string;
  /** Right-hand action label; omitted when `onAction` is not provided. */
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  danger?: boolean;
};

/** Header used by every modal form: close button, title and save action. */
export function ModalHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  onClose,
  danger = false,
}: ModalHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + Spacing.two, borderColor: theme.border }]}>
      <Pressable
        onPress={onClose ?? (() => router.back())}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Đóng"
        accessibilityHint="Quay lại màn hình trước"
        style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="close" size={18} color={theme.text} />
      </Pressable>

      <View style={styles.titles}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.text }]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}>
          <Text style={[styles.actionText, { color: danger ? theme.danger : theme.accentText }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 11 },
  action: { minWidth: 56, minHeight: 36, justifyContent: 'center', alignItems: 'flex-end' },
  actionText: { fontSize: 15, fontWeight: '700' },
});
