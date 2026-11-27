import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: IoniconName;
  rightLabel?: string;
  onRightPress?: () => void;
};

/** Editorial top bar for full-page utility screens outside the main tabs. */
export function PageHeader({
  title,
  subtitle,
  rightIcon,
  rightLabel,
  onRightPress,
}: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={({ pressed }) => [
          styles.backBtn,
          Shadow.card,
          { backgroundColor: theme.card, borderColor: theme.border },
          pressed && styles.pressed,
        ]}>
        <Ionicons name="chevron-back" size={20} color={theme.text} />
      </Pressable>

      <View style={styles.texts}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {onRightPress && (rightIcon || rightLabel) ? (
        <Pressable
          onPress={onRightPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.rightBtn,
            {
              backgroundColor: theme.accentSoft,
              borderColor: `${theme.accent}33`,
            },
            pressed && styles.pressed,
          ]}>
          {rightIcon ? <Ionicons name={rightIcon} size={16} color={theme.accentText} /> : null}
          {rightLabel ? (
            <Text style={[styles.rightText, { color: theme.accentText }]}>{rightLabel}</Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 4 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, fontWeight: '600' },
  rightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  rightText: { fontSize: 12.5, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
