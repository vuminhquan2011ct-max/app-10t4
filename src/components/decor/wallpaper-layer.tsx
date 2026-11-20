/**
 * High-craft SVG wallpaper patterns rendered behind every Screen.
 * Uses direct vector shapes (no SVG <pattern> IDs) so stacked routes never
 * collide on web browsers.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

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

const GRID_CROSSHAIRS: [number, number][] = [];
for (let y = 90; y <= 630; y += 90) {
  for (let x = 90; x <= 270; x += 90) {
    GRID_CROSSHAIRS.push([x, y]);
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

const CONSTELLATION_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 6],
  [4, 5],
  [5, 6],
  [8, 9],
  [9, 10],
  [11, 12],
  [12, 13],
  [14, 15],
  [15, 16],
  [17, 18],
  [18, 19],
  [20, 21],
];

const STAR_DUST: [number, number, number][] = [
  [82, 88, 1.3],
  [164, 78, 1.1],
  [264, 104, 1.4],
  [116, 194, 1.2],
  [222, 188, 1.1],
  [64, 294, 1.3],
  [184, 306, 1.4],
  [282, 288, 1.1],
  [134, 404, 1.3],
  [254, 398, 1.2],
  [86, 504, 1.4],
  [212, 518, 1.1],
  [298, 492, 1.3],
  [146, 618, 1.2],
  [248, 624, 1.4],
];

const WAVE_BANDS = [74, 162, 250, 338, 426, 514, 602, 686];

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

function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
}

function crosshairPath(cx: number, cy: number, arm: number): string {
  return `M${cx - arm},${cy} L${cx + arm},${cy} M${cx},${cy - arm} L${cx},${cy + arm}`;
}

function starPath(cx: number, cy: number, s: number): string {
  const r = 7 * s;
  const i = 2.4 * s;
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
  const secondaryInk = theme.purple;
  const opacity = isDark ? 0.13 : 0.11;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 720"
        preserveAspectRatio="xMidYMid slice">
        {pattern === 'dots'
          ? DOTS.map(([cx, cy], idx) => {
              const tone = idx % 3 === 0 ? secondaryInk : ink;
              if (idx % 6 === 0) {
                return (
                  <Circle
                    key={`ring-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill="none"
                    stroke={tone}
                    strokeWidth={1.1}
                    opacity={opacity * 1.15}
                  />
                );
              }
              if (idx % 7 === 3) {
                return (
                  <Path
                    key={`dia-${idx}`}
                    d={diamondPath(cx, cy, 3.1)}
                    fill={secondaryInk}
                    opacity={opacity * 1.1}
                  />
                );
              }
              return (
                <Circle
                  key={`dot-${idx}`}
                  cx={cx}
                  cy={cy}
                  r={idx % 4 === 0 ? 2.8 : 1.9}
                  fill={tone}
                  opacity={idx % 4 === 0 ? opacity * 1.05 : opacity * 0.78}
                />
              );
            })
          : null}

        {pattern === 'grid' ? (
          <>
            {Array.from({ length: 13 }).map((_, idx) => {
              const x = idx * 30;
              const isMajor = idx % 3 === 0;
              return (
                <Line
                  key={`v-${idx}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={720}
                  stroke={isMajor ? ink : secondaryInk}
                  strokeWidth={isMajor ? 1 : 0.75}
                  opacity={isMajor ? opacity * 0.85 : opacity * 0.45}
                />
              );
            })}
            {Array.from({ length: 25 }).map((_, idx) => {
              const y = idx * 30;
              const isMajor = idx % 3 === 0;
              return (
                <Line
                  key={`h-${idx}`}
                  x1={0}
                  y1={y}
                  x2={360}
                  y2={y}
                  stroke={isMajor ? ink : secondaryInk}
                  strokeWidth={isMajor ? 1 : 0.75}
                  opacity={isMajor ? opacity * 0.85 : opacity * 0.45}
                />
              );
            })}
            {GRID_CROSSHAIRS.map(([cx, cy], idx) => (
              <Path
                key={`cross-${idx}`}
                d={crosshairPath(cx, cy, 4)}
                stroke={idx % 2 === 0 ? ink : secondaryInk}
                strokeWidth={1.25}
                strokeLinecap="round"
                opacity={opacity * 1.35}
              />
            ))}
            {GRID_CROSSHAIRS.filter((_, idx) => idx % 3 === 0).map(([cx, cy], idx) => (
              <Rect
                key={`node-${idx}`}
                x={cx - 2}
                y={cy - 2}
                width={4}
                height={4}
                rx={1}
                fill="none"
                stroke={secondaryInk}
                strokeWidth={0.85}
                opacity={opacity * 1.1}
              />
            ))}
          </>
        ) : null}

        {pattern === 'stars' ? (
          <>
            {CONSTELLATION_PAIRS.map(([aIdx, bIdx], idx) => {
              const a = STARS[aIdx];
              const b = STARS[bIdx];
              if (!a || !b) return null;
              return (
                <Line
                  key={`constellation-${idx}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={idx % 2 === 0 ? ink : secondaryInk}
                  strokeWidth={0.8}
                  strokeDasharray="3 4"
                  opacity={opacity * 0.72}
                />
              );
            })}
            {STAR_DUST.map(([mx, my, r], idx) => (
              <Circle
                key={`dust-${idx}`}
                cx={mx}
                cy={my}
                r={r}
                fill={idx % 2 === 0 ? ink : secondaryInk}
                opacity={opacity * 0.85}
              />
            ))}
            {STARS.map(([cx, cy, s], idx) => {
              const tone = idx % 3 === 1 ? secondaryInk : ink;
              return (
                <Path
                  key={`star-${idx}`}
                  d={starPath(cx, cy, s)}
                  fill={tone}
                  opacity={opacity * 1.4}
                />
              );
            })}
            {STARS.filter(([_, __, s], idx) => s >= 1.0 || idx % 4 === 0).map(([cx, cy, s], idx) => (
              <Circle
                key={`halo-${idx}`}
                cx={cx}
                cy={cy}
                r={9.2 * s}
                fill="none"
                stroke={idx % 2 === 0 ? ink : secondaryInk}
                strokeWidth={0.85}
                opacity={opacity * 0.68}
              />
            ))}
          </>
        ) : null}

        {pattern === 'waves' ? (
          <>
            {WAVE_BANDS.map((y, idx) => (
              <Path
                key={`wave-main-${idx}`}
                d={`M-20,${y} C45,${y - 26} 115,${y + 26} 180,${y} C245,${y - 26} 315,${y + 26} 380,${y}`}
                fill="none"
                stroke={idx % 2 === 0 ? ink : secondaryInk}
                strokeWidth={idx % 2 === 0 ? 2 : 1.5}
                opacity={opacity * 1.15}
              />
            ))}
            {WAVE_BANDS.map((y, idx) => (
              <Path
                key={`wave-harmonic-${idx}`}
                d={`M-20,${y + 13} C60,${y + 32} 125,${y - 12} 195,${y + 11} C265,${y + 34} 325,${y - 10} 380,${y + 13}`}
                fill="none"
                stroke={idx % 2 === 0 ? secondaryInk : ink}
                strokeWidth={0.95}
                strokeDasharray={idx % 2 === 0 ? '5 5' : undefined}
                opacity={opacity * 0.65}
              />
            ))}
            {WAVE_BANDS.filter((_, idx) => idx % 2 === 0).map((y, idx) => (
              <Circle
                key={`wave-pearl-${idx}`}
                cx={90 + (idx % 3) * 85}
                cy={y - 6}
                r={2.1}
                fill={idx % 2 === 0 ? ink : secondaryInk}
                opacity={opacity * 0.95}
              />
            ))}
          </>
        ) : null}

        {pattern === 'hearts' ? (
          <>
            {HEARTS.map(([cx, cy, s], idx) => {
              const tone = idx % 2 === 0 ? ink : secondaryInk;
              const isOutline = idx % 4 === 1;
              return (
                <Path
                  key={`heart-${idx}`}
                  d={heartPath(cx, cy, s)}
                  fill={isOutline ? 'none' : tone}
                  stroke={isOutline ? tone : undefined}
                  strokeWidth={isOutline ? 1.35 : undefined}
                  opacity={opacity * 1.28}
                />
              );
            })}
            {HEARTS.filter((_, idx) => idx % 2 === 0).map(([cx, cy, s], idx) => (
              <Path
                key={`heart-sparkle-${idx}`}
                d={starPath(cx + 12 * s, cy - 9 * s, s * 0.45)}
                fill={idx % 2 === 0 ? secondaryInk : ink}
                opacity={opacity * 1.2}
              />
            ))}
          </>
        ) : null}
      </Svg>
    </View>
  );
});
