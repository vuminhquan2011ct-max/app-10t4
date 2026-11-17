import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ITEMS: { name: string; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { name: 'index', label: 'Tổng quan', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'students', label: 'Học sinh', icon: 'people-outline', activeIcon: 'people' },
  { name: 'feed', label: 'Nhật ký', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'settings', label: 'Cài đặt', icon: 'settings-outline', activeIcon: 'settings' },
];

/**
 * Floating pill tab bar shared by every platform.
 *
 * Receives the navigation state from the router and renders four equal items
 * with an animated-feeling "selected" treatment (color + soft background).
 */
export function AppTabBar({
  state,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
      <View
        style={[
          styles.bar,
          Shadow.floating,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}>
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS.find((tab) => tab.name === route.name);
          if (!item) return null;
          const focused = state.index === index;

          const onPress = () => {
            if (focused) return;
            router.navigate((route.name === 'index' ? '/' : '/' + route.name) as never);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View
                style={[
                  styles.iconWrap,
                  focused && { backgroundColor: theme.accentSoft },
                ]}>
                <Ionicons
                  name={focused ? item.activeIcon : item.icon}
                  size={20}
                  color={focused ? theme.accentText : theme.textMuted}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: focused ? theme.accentText : theme.textMuted },
                  focused && styles.labelActive,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 520,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.one,
  },
  iconWrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.pill,
  },
  label: { fontSize: 10, fontWeight: '600' },
  labelActive: { fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
