import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IoniconName;
  clearable?: boolean;
};

/** Labeled text input that follows the app palette and highlights on focus. */
export function TextField({
  label,
  hint,
  error,
  icon,
  clearable,
  style,
  value,
  onChangeText,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? theme.danger : focused ? theme.accent : theme.border;
  const iconColor = error ? theme.danger : focused ? theme.accent : theme.textMuted;
  const showClear = (clearable ?? icon === 'search') && typeof value === 'string' && value.length > 0 && Boolean(onChangeText);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: focused ? theme.card : theme.backgroundElement,
            borderColor,
          },
          focused && !error && { shadowColor: theme.accent, ...styles.focusGlow },
        ]}>
        {icon ? <Ionicons name={icon} size={18} color={iconColor} /> : null}
        <TextInput
          placeholderTextColor={theme.textMuted}
          value={value}
          onChangeText={onChangeText}
          style={[styles.input, { color: theme.text }, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {showClear ? (
          <Pressable
            onPress={() => onChangeText?.('')}
            hitSlop={8}
            accessibilityLabel={'Xoá nội dung tìm kiếm'}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.helper, { color: theme.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.helper, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one + 2 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    minHeight: 52,
  },
  focusGlow: {
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.three - 2,
    // Removes the default browser focus outline; the row draws its own.
    ...({ outlineStyle: 'none' } as object),
  },
  helper: { fontSize: 12, lineHeight: 16 },
});
