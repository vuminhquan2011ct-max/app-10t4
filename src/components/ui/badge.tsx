import Ionicons from '@expo/vector-icons/Ionicons';
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

/** Small colored pill with a delicate 1px tinted border used for entry status, level and category. */
export function Badge({ label, color, soft, icon }: BadgeProps) {
  const theme = useTheme();
  const fg = theme[color];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: theme[soft],
          borderColor: `${fg}33`,
        },
      ]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
});
