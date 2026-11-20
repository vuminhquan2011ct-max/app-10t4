import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useIsDark, useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const TAB_ITEMS: { name: string; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { name: 'index', label: 'Tổng quan', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'students', label: 'Học sinh', icon: 'people-outline', activeIcon: 'people' },
  { name: 'feed', label: 'Nhật ký', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'tools', label: 'Tiện ích', icon: 'apps-outline', activeIcon: 'apps' },
  { name: 'settings', label: 'Cài đặt', icon: 'settings-outline', activeIcon: 'settings' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Liquid Glass floating 5-tab pill dock shared by every platform.
 *
 * The active tab expands into a glowing gradient capsule with icon + label while
 * inactive tabs show crisp icons (plus a live pending count badge on Nhật ký).
 */
export function AppTabBar({
  state,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
}) {
  const theme = useTheme();
  const isDark = useIsDark();
  const gradient = useBrandGradient();
  const insets = useSafeAreaInsets();
  const { role, totals } = useClassStore();

  const barBg =
    Platform.OS === 'web'
      ? isDark
        ? 'rgba(15, 21, 35, 0.82)'
        : 'rgba(255, 255, 255, 0.86)'
      : isDark
        ? 'rgba(18, 24, 38, 0.96)'
        : 'rgba(255, 255, 255, 0.96)';

  const barBorder = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.95)';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
      <View
        style={[
          styles.bar,
          Shadow.floating,
          {
            backgroundColor: barBg,
            borderColor: barBorder,
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(26px) saturate(190%)',
              WebkitBackdropFilter: 'blur(26px) saturate(190%)',
            } as object),
        ]}>
        <View
          pointerEvents="none"
          style={[
            styles.topSpec,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.85)' },
          ]}
        />
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS.find((tab) => tab.name === route.name);
          if (!item) return null;
          const focused = state.index === index;
          const badgeCount = route.name === 'feed' && role === 'teacher' ? totals.pending : 0;

          const onPress = () => {
            if (focused) return;
            if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
            router.navigate((route.name === 'index' ? '/' : '/' + route.name) as never);
          };

          return (
            <AnimatedPressable
              key={route.key}
              layout={LinearTransition.springify().damping(20)}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={focused ? { selected: true } : {}}
              style={[
                styles.item,
                focused
                  ? [styles.itemActive, { shadowColor: gradient[0] }]
                  : styles.itemIdle,
              ]}>
              {focused ? (
                <LinearGradient
                  colors={gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={styles.iconBox}>
                <Ionicons
                  name={focused ? item.activeIcon : item.icon}
                  size={20}
                  color={focused ? '#FFFFFF' : theme.textMuted}
                />
                {badgeCount > 0 && !focused ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.danger, borderColor: theme.card },
                    ]}>
                    <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                  </View>
                ) : null}
              </View>
              {focused ? (
                <Text numberOfLines={1} style={styles.label}>
                  {item.label}
                </Text>
              ) : null}
              {focused && badgeCount > 0 ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                </View>
              ) : null}
            </AnimatedPressable>
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
    width: '100%',
    maxWidth: 488,
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 6,
    gap: 4,
    overflow: 'hidden',
  },
  topSpec: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
  },
  item: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  itemActive: {
    flex: 2.4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  itemIdle: { flex: 1 },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 1.5,
    paddingHorizontal: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900' },
  label: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', letterSpacing: -0.1 },
});
