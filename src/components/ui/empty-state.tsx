import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type EmptyStateProps = {
  icon?: IoniconName;
  title: string;
  message?: string;
};

/** Friendly placeholder shown when a list has nothing to display. */
export function EmptyState({ icon = 'sparkles-outline', title, message }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <View style={[styles.halo, { backgroundColor: theme.accentSoft }]}>
        <View style={[styles.iconBox, { backgroundColor: theme.card }]}>
          <Ionicons name={icon} size={30} color={theme.accent} />
        </View>
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  halo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
