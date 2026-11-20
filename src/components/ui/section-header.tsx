import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Bigger page-title style used at the top of tab screens. */
  large?: boolean;
};

/** Editorial title row above a block of content, with an accent indicator bar and optional action pill. */
export function SectionHeader({ title, subtitle, actionLabel, onAction, large }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, large && styles.rowLarge]}>
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          {!large ? (
            <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
          ) : null}
          <Text style={[styles.title, large && styles.titleLarge, { color: theme.text }]}>
            {title}
          </Text>
        </View>
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
            {
              backgroundColor: theme.accentSoft,
              borderColor: `${theme.accent}2E`,
            },
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
  texts: { flex: 1, gap: 3 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  titleLarge: { fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  action: { fontSize: 12.5, fontWeight: '800' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
