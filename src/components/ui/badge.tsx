import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type BadgeProps = {
  label: string;
  color: ThemeColor;
  soft: ThemeColor;
  icon?: IoniconName;
};

/** Small colored pill used for entry status, level and category. */
export function Badge({ label, color, soft, icon }: BadgeProps) {
  const theme = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: theme[soft] }]}>
      {icon ? <Ionicons name={icon} size={12} color={theme[color]} /> : null}
      <Text style={[styles.label, { color: theme[color] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
