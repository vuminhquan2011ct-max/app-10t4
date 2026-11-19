/**
 * Subtle SVG wallpaper pattern rendered behind every Screen.
 * Uses direct vector shapes (no SVG <pattern> IDs) so stacked routes never
 * collide on web browsers.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { WallpaperPattern } from '@/constants/decor-meta';
import { useIsDark, useTheme } from '@/hooks/use-theme';

type WallpaperLayerProps = {
  pattern: WallpaperPattern;
};

const DOTS: [number, number][] = [];
for (let r = 0; r < 14; r += 1) {
  for (let c = 0; c < 8; c += 1) {
    DOTS.push([22 + c * 46 + (r % 2 === 0 ? 0 : 23), 24 + r * 52]);
  }
}

const STARS: [number, number, number][] = [
  [36, 48, 1.0],
  [124, 30, 0.7],
  [218, 66, 1.15],
  [310, 42, 0.8],
  [68, 148, 0.85],
  [176, 134, 1.2],
  [284, 158, 0.9],
  [340, 212, 0.75],
  [30, 244, 1.1],
  [140, 260, 0.8],
  [248, 240, 1.05],
  [92, 342, 0.95],
  [208, 368, 0.75],
  [316, 336, 1.15],
  [44, 446, 0.85],
  [162, 466, 1.1],
  [272, 444, 0.8],
  [104, 560, 1.0],
  [234, 580, 0.9],
  [330, 540, 0.8],
  [54, 650, 1.1],
  [182, 676, 0.85],
  [298, 660, 1.0],
];

const HEARTS: [number, number, number][] = [
  [52, 68, 0.9],
  [186, 44, 0.75],
  [306, 90, 1.0],
  [112, 182, 0.85],
  [254, 198, 0.95],
  [44, 304, 0.8],
  [178, 318, 1.05],
  [318, 308, 0.85],
  [98, 434, 0.9],
  [244, 448, 0.75],
  [52, 566, 1.0],
  [192, 580, 0.85],
  [312, 558, 0.9],
  [136, 680, 0.8],
  [272, 672, 0.95],
];

function starPath(cx: number, cy: number, s: number): string {
  const r = 7 * s;
  const i = 2.6 * s;
  return `M${cx},${cy - r} L${cx + i},${cy - i} L${cx + r},${cy} L${cx + i},${cy + i} L${cx},${cy + r} L${cx - i},${cy + i} L${cx - r},${cy} L${cx - i},${cy - i} Z`;
}

function heartPath(cx: number, cy: number, s: number): string {
  const k = 7.5 * s;
  return `M${cx},${cy + k * 0.75} C${cx - k * 1.35},${cy - k * 0.15} ${cx - k * 0.95},${cy - k * 1.15} ${cx},${cy - k * 0.35} C${cx + k * 0.95},${cy - k * 1.15} ${cx + k * 1.35},${cy - k * 0.15} ${cx},${cy + k * 0.75} Z`;
}

export const WallpaperLayer = memo(function WallpaperLayer({ pattern }: WallpaperLayerProps) {
  const theme = useTheme();
  const isDark = useIsDark();

  if (pattern === 'none') return null;

  const ink = theme.accent;
  const opacity = isDark ? 0.12 : 0.11;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 720"
        preserveAspectRatio="xMidYMid slice">
        {pattern === 'dots'
          ? DOTS.map(([cx, cy], idx) => (
              <Circle key={idx} cx={cx} cy={cy} r={idx % 3 === 0 ? 3 : 2} fill={ink} opacity={opacity} />
            ))
          : null}

        {pattern === 'grid' ? (
          <>
            {Array.from({ length: 13 }).map((_, idx) => {
              const x = idx * 30;
              return (
                <Line
                  key={`v-${idx}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={720}
                  stroke={ink}
                  strokeWidth={1}
                  opacity={opacity * 0.75}
                />
              );
            })}
            {Array.from({ length: 25 }).map((_, idx) => {
              const y = idx * 30;
              return (
                <Line
                  key={`h-${idx}`}
                  x1={0}
                  y1={y}
                  x2={360}
                  y2={y}
                  stroke={ink}
                  strokeWidth={1}
                  opacity={opacity * 0.75}
                />
              );
            })}
          </>
        ) : null}

        {pattern === 'stars'
          ? STARS.map(([cx, cy, s], idx) => (
              <Path key={idx} d={starPath(cx, cy, s)} fill={ink} opacity={opacity * 1.35} />
            ))
          : null}

        {pattern === 'waves'
          ? [80, 175, 270, 365, 460, 555, 650].map((y, idx) => (
              <Path
                key={idx}
                d={`M-20,${y} Q70,${y - 26} 160,${y} T380,${y}`}
                fill="none"
                stroke={ink}
                strokeWidth={2}
                opacity={opacity * 1.1}
              />
            ))
          : null}

        {pattern === 'hearts'
          ? HEARTS.map(([cx, cy, s], idx) => (
              <Path key={idx} d={heartPath(cx, cy, s)} fill={ink} opacity={opacity * 1.25} />
            ))
          : null}
      </Svg>
    </View>
  );
});
