import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useIsDark, useTheme } from '@/hooks/use-theme';
import { isProVaultUnlocked, subscribeProVault } from '@/lib/pro-vault';
import { useClassStore } from '@/store/class-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const PRO_ACTIVE_GRADIENT = ['#92400E', '#D97706', '#F59E0B'] as const;

const TAB_ITEMS: { name: string; label: string; icon: IoniconName; activeIcon: IoniconName }[] = [
  { name: 'index', label: 'Tổng quan', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'bulletin', label: 'Thông tin', icon: 'newspaper-outline', activeIcon: 'newspaper' },
  { name: 'students', label: 'Học sinh', icon: 'people-outline', activeIcon: 'people' },
  { name: 'feed', label: 'Nhật ký', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { name: 'tools', label: 'Tiện ích', icon: 'apps-outline', activeIcon: 'apps' },
  { name: 'settings', label: 'Cài đặt', icon: 'settings-outline', activeIcon: 'settings' },
  { name: 'pro', label: 'Gói Pro', icon: 'diamond-outline', activeIcon: 'diamond' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SAWTOOTH_D = (() => {
  const parts: string[] = [];
  for (let x = 12; x <= 300; x += 12) {
    if (x >= 132 && x <= 180) continue; // leave central medallion space
    parts.push(`M${x},1 L${x + 6},6.5 L${x + 12},1`);
  }
  return parts.join(' ');
})();

/**
 * Royal Đông Sơn Bronze & Gold floating 7-tab pill dock shared by every platform.
 *
 * The active tab expands into a glowing gradient capsule with icon + label while
 * inactive tabs show crisp icons (plus live badges on Thông tin & Nhật ký and
 * a royal gold diamond + subtle lock dot on Gói Pro).
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
  const { role, totals, unreadAnnouncementsCount } = useClassStore();
  const proUnlocked = useSyncExternalStore(
    subscribeProVault,
    isProVaultUnlocked,
    isProVaultUnlocked,
  );

  const barBg = isDark ? 'rgba(26, 15, 9, 0.94)' : 'rgba(255, 250, 240, 0.95)';
  const barBorder = isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(180, 83, 9, 0.35)';
  const ornamentGold = isDark ? '#FBBF24' : '#B45309';
  const ornamentOpacity = isDark ? 0.55 : 0.42;
  const proIdleColor = isDark ? '#F59E0B' : '#B45309';

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
        {/* Subtle SVG Đông Sơn sawtooth & Chim Lạc golden ornamental line along top edge */}
        <View pointerEvents="none" style={styles.topOrnamentWrap}>
          <Svg width="100%" height={10} viewBox="0 0 320 10" preserveAspectRatio="xMidYMin slice">
            <Path
              d="M0,1 L320,1"
              stroke={ornamentGold}
              strokeWidth={1.2}
              opacity={ornamentOpacity}
            />
            <Path
              d={SAWTOOTH_D}
              stroke={ornamentGold}
              strokeWidth={0.85}
              fill="none"
              opacity={ornamentOpacity * 0.85}
            />
            {/* Left soaring Chim Lạc silhouette */}
            <Path
              d="M138,5.5 C142,2.5 147,2.5 151,5 C147,4.5 143,5.2 138,5.5 Z M144,4.2 L141,1.8"
              stroke={ornamentGold}
              strokeWidth={0.95}
              fill={ornamentGold}
              opacity={ornamentOpacity}
            />
            {/* Central Trống Đồng sun-star jewel */}
            <Circle
              cx={160}
              cy={4.8}
              r={3.2}
              stroke={ornamentGold}
              strokeWidth={0.95}
              fill="none"
              opacity={ornamentOpacity}
            />
            <Circle
              cx={160}
              cy={4.8}
              r={1.3}
              fill={ornamentGold}
              opacity={ornamentOpacity}
            />
            {/* Right soaring Chim Lạc silhouette */}
            <Path
              d="M182,5.5 C178,2.5 173,2.5 169,5 C173,4.5 177,5.2 182,5.5 Z M176,4.2 L179,1.8"
              stroke={ornamentGold}
              strokeWidth={0.95}
              fill={ornamentGold}
              opacity={ornamentOpacity}
            />
          </Svg>
        </View>
        {state.routes.map((route, index) => {
          const item = TAB_ITEMS.find((tab) => tab.name === route.name);
          if (!item) return null;
          const focused = state.index === index;
          const isPro = route.name === 'pro';
          const badgeCount =
            route.name === 'feed' && role === 'teacher'
              ? totals.pending
              : route.name === 'bulletin'
                ? unreadAnnouncementsCount
                : 0;

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
                  ? [
                      styles.itemActive,
                      {
                        shadowColor: isPro ? '#D97706' : gradient[0],
                        borderColor: isPro
                          ? 'rgba(254, 243, 199, 0.65)'
                          : 'rgba(253, 224, 71, 0.45)',
                      },
                    ]
                  : styles.itemIdle,
              ]}>
              {focused ? (
                <LinearGradient
                  colors={isPro ? PRO_ACTIVE_GRADIENT : gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={styles.iconBox}>
                <Ionicons
                  name={focused ? item.activeIcon : item.icon}
                  size={18}
                  color={focused ? '#FFFFFF' : isPro ? proIdleColor : theme.textMuted}
                />
                {isPro && !proUnlocked && !focused ? (
                  <View
                    style={[
                      styles.proLockDot,
                      {
                        backgroundColor: proIdleColor,
                        borderColor: barBg,
                      },
                    ]}>
                    <Ionicons name="lock-closed" size={7} color="#FFFBEB" />
                  </View>
                ) : null}
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
    paddingHorizontal: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 560,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    padding: 5,
    gap: 2,
    overflow: 'hidden',
  },
  topOrnamentWrap: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 10,
  },
  item: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  itemActive: {
    flex: 2.0,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.45)',
    shadowOpacity: 0.34,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  itemIdle: { flex: 1 },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  proLockDot: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  label: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800', letterSpacing: -0.15 },
});
