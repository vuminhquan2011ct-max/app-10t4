import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

type ProgressRingProps = {
  /** 0 - 1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Big text in the middle; defaults to the rounded percentage. */
  label?: string;
  caption?: string;
  trackColor?: string;
};

/** Circular progress indicator drawn with SVG. */
export function ProgressRing({
  progress,
  size = 96,
  strokeWidth = 9,
  color,
  label,
  caption,
  trackColor,
}: ProgressRingProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? theme.backgroundSelected}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ?? theme.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: theme.text, fontSize: size * 0.24 }]}>
          {label ?? `${Math.round(clamped * 100)}%`}
        </Text>
        {caption ? (
          <Text style={[styles.caption, { color: theme.textMuted }]}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontWeight: '800' },
  caption: { fontSize: 11, fontWeight: '600' },
});
