/**
 * Lightweight theme-aware skeleton shimmer primitives built on
 * `react-native-reanimated` with guaranteed `cancelAnimation` cleanup on unmount.
 */

import { useEffect } from 'react';
import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

export type SkeletonBlockProps = {
  /** Block width (number or percentage string; defaults to `'100%'`). */
  width?: DimensionValue;
  /** Block height in logical pixels (defaults to `14`). */
  height?: number;
  /** Corner radius (defaults to `Radius.xs`). */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({
  width = '100%',
  height = 14,
  borderRadius = Radius.xs,
  style,
}: SkeletonBlockProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.92, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const fillColor = isDark ? theme.border : theme.backgroundSelected;

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: fillColor,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

const LINE_WIDTHS: readonly DimensionValue[] = ['100%', '84%', '66%', '90%'];

export type SkeletonCardProps = {
  /** Number of body text lines to display below the header (defaults to `2`). */
  lines?: number;
  /** Show a leading circular avatar placeholder (defaults to `true`). */
  showAvatar?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonCard({
  lines = 2,
  showAvatar = true,
  style,
}: SkeletonCardProps) {
  const theme = useTheme();
  const lineCount = Math.max(0, Math.min(lines, 6));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải dữ liệu"
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        style,
      ]}>
      <View style={styles.headerRow}>
        {showAvatar ? (
          <SkeletonBlock width={40} height={40} borderRadius={Radius.pill} />
        ) : null}
        <View style={styles.headerText}>
          <SkeletonBlock width="58%" height={14} borderRadius={Radius.xs} />
          <SkeletonBlock width="36%" height={11} borderRadius={Radius.xs} />
        </View>
      </View>

      {lineCount > 0 ? (
        <View style={styles.bodyLines}>
          {Array.from({ length: lineCount }).map((_, idx) => (
            <SkeletonBlock
              key={idx}
              width={LINE_WIDTHS[idx % LINE_WIDTHS.length]}
              height={12}
              borderRadius={Radius.xs}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two + 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  bodyLines: {
    gap: 8,
  },
});
