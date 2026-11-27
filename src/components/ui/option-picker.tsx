import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type Option<T extends string> = {
  value: T;
  label: string;
  icon?: IoniconName;
};

type OptionPickerProps<T extends string> = {
  label?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Render the options in a wrapping grid instead of a scrolling row. */
  layout?: 'row' | 'grid';
  columns?: 2 | 3;
};

/**
 * Single-choice selector rendered as pills. Used for kind, category, level,
 * gender and every other small enum in the forms.
 */
export function OptionPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  layout = 'grid',
  columns = 2,
}: OptionPickerProps<T>) {
  const theme = useTheme();

  const renderOption = (option: Option<T>) => {
    const selected = option.value === value;
    const color = selected ? theme.accentText : theme.textSecondary;

    return (
      <Pressable
        key={option.value}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [
          styles.option,
          layout === 'grid' && {
            width: columns === 3 ? '31.5%' : '48.5%',
          },
          {
            backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
            borderColor: selected ? theme.accent : 'transparent',
          },
          pressed && styles.pressed,
        ]}>
        {option.icon ? <Ionicons name={option.icon} size={15} color={color} /> : null}
        <Text numberOfLines={1} style={[styles.optionLabel, { color }]}>
          {option.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      {layout === 'row' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rowContent}>
          {options.map(renderOption)}
        </ScrollView>
      ) : (
        <View style={styles.grid}>{options.map(renderOption)}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowContent: { gap: Spacing.two, paddingRight: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  optionLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  pressed: { opacity: 0.8 },
});
