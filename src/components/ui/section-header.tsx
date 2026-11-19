import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Bigger page-title style used at the top of tab screens. */
  large?: boolean;
};

/** Title row above a block of content, with an optional action link. */
export function SectionHeader({ title, subtitle, actionLabel, onAction, large }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, large && styles.rowLarge]}>
      <View style={styles.texts}>
        <Text style={[styles.title, large && styles.titleLarge, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionWrap,
            { backgroundColor: theme.accentSoft },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.action, { color: theme.accentText }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.accentText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  rowLarge: { marginTop: Spacing.one },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  titleLarge: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { fontSize: 13 },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 999,
  },
  action: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
