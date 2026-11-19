import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: IoniconName;
  rightLabel?: string;
  onRightPress?: () => void;
};

/** Clean top bar for full-page utility screens outside the main tabs. */
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
            { backgroundColor: theme.accentSoft },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 1 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, fontWeight: '600' },
  rightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  rightText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
