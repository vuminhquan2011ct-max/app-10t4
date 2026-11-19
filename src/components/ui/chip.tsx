import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ChipProps = {
  label: string;
  selected?: boolean;
  icon?: IoniconName;
  onPress?: () => void;
};

/** Filter / option pill. Highlighted with the accent color when selected. */
export function Chip({ label, selected = false, icon, onPress }: ChipProps) {
  const theme = useTheme();
  const color = selected ? '#FFFFFF' : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.accent : theme.card,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      {icon ? <Ionicons name={icon} size={15} color={color} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
