import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { WallpaperLayer } from '@/components/decor/wallpaper-layer';
import { MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type ScreenProps = {
  children: ReactNode;
  /** Reserve room for the floating tab bar (tab screens only). */
  withTabBar?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Shorthand pull-to-refresh handler wired to a themed RefreshControl. */
  onRefresh?: () => Promise<void> | void;
  /** Optional lock when an embedded interactive canvas is being dragged. */
  scrollEnabled?: boolean;
};

const DEG_TO_RAD = Math.PI / 180;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = angleDeg * DEG_TO_RAD;
  return [
    Math.round((cx + r * Math.cos(rad)) * 100) / 100,
    Math.round((cy + r * Math.sin(rad)) * 100) / 100,
  ];
}

function buildCrownSunStar(cx: number, cy: number, outerR: number, innerR: number, points = 14): string {
  const step = 360 / points;
  const cmds: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const aOut = -90 + i * step;
    const aIn = aOut + step * 0.5;
    const [ox, oy] = polar(cx, cy, outerR, aOut);
    const [ix, iy] = polar(cx, cy, innerR, aIn);
    cmds.push(`${i === 0 ? 'M' : 'L'}${ox},${oy} L${ix},${iy}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

function buildArchSawtoothPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
  teeth: number,
): string {
  const step = (endDeg - startDeg) / teeth;
  const cmds: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a1 = startDeg + i * step;
    const aMid = a1 + step * 0.5;
    const a2 = a1 + step;
    const [x1, y1] = polar(cx, cy, innerR, a1);
    const [xm, ym] = polar(cx, cy, outerR, aMid);
    const [x2, y2] = polar(cx, cy, innerR, a2);
    cmds.push(`${i === 0 ? 'M' : 'L'}${x1},${y1} L${xm},${ym} L${x2},${y2}`);
  }
  return cmds.join(' ');
}

function buildArchTangentialCircles(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  count: number,
): [number, number][] {
  const step = (endDeg - startDeg) / (count - 1);
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    pts.push(polar(cx, cy, r, startDeg + i * step));
  }
  return pts;
}

const CROWN_SUN_STAR = buildCrownSunStar(200, -4, 34, 13, 14);
const CROWN_SAWTOOTH_ARCH = buildArchSawtoothPath(200, -4, 96, 108, 12, 168, 28);
const CROWN_OUTER_SAWTOOTH_ARCH = buildArchSawtoothPath(200, -4, 142, 152, 8, 172, 36);
const CROWN_TANGENTIAL_CIRCLES = buildArchTangentialCircles(200, -4, 125, 14, 166, 17);

const CROWN_CHIM_LAC_BODY =
  'M 22,-1 L 11,-2 C 6,-2.5 2,-4.5 -2,-3.6 C -8,-2.5 -14,-1.2 -24,-3 L -19,-0.4 L -26,1.4 L -18,2 L -23,4.5 C -13,3.2 -6,2.5 -1,2.2 C 4,2 9,1 12,0.3 Z';
const CROWN_CHIM_LAC_WING_UP =
  'M 3,-3 C 1,-10 -5,-17 -15,-22 C -10,-15 -6,-9 -4.5,-3 Z';
const CROWN_CHIM_LAC_WING_DOWN =
  'M 1,2 C -1,9 -6,15 -16,20 C -11,13 -7,8 -5.5,2 Z';
const CROWN_CHIM_LAC_CREST =
  'M 10,-2 C 5,-6 -1,-9.5 -9,-11.5 M 8,-1.5 C 2,-4.5 -4,-6.8 -11,-7.8';

/**
 * Scrollable page with safe-area padding and a centered, width-limited column.
 * A royal Đông Sơn Bronze-Gold & Crimson-Lacquer glow, SVG Chim Lạc & Trống Đồng
 * Crown Arch, and museum-grade Đông Sơn wallpaper tapestry sit behind every page.
 */
export function Screen({
  children,
  withTabBar = true,
  refreshControl,
  onRefresh,
  scrollEnabled = true,
}: ScreenProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const { wallpaper } = useDecor();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const effectiveRefresh =
    refreshControl ??
    (onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={theme.accent}
        colors={[theme.accent]}
      />
    ) : undefined);

  const bronzeGold = isDark ? '#F59E0B' : '#D97706';
  const brightGold = isDark ? '#FDE047' : '#B45309';
  const lacquerCrimson = '#B91C1C';
  const crownOpacity = isDark ? 0.25 : 0.18;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={styles.backdrop}>
        {/* Royal Đông Sơn Bronze-Gold & Crimson-Lacquer Linear Glow */}
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? ['#3B120C', '#2B180A', '#1A0F08', theme.background]
              : ['#FCE8E2', '#FEF3C7', '#F6E7C8', theme.background]
          }
          locations={[0, 0.32, 0.68, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.glow}
        />

        {/* Sacred Bronze-Gold & Crimson-Lacquer Ambient Orbs */}
        <View
          pointerEvents="none"
          style={[
            styles.orbTopCenter,
            {
              backgroundColor: bronzeGold,
              opacity: isDark ? 0.16 : 0.11,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.orbTopRight,
            {
              backgroundColor: lacquerCrimson,
              opacity: isDark ? 0.18 : 0.09,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.orbMidLeft,
            {
              backgroundColor: bronzeGold,
              opacity: isDark ? 0.13 : 0.08,
            },
          ]}
        />

        {/* Ornate SVG Chim Lạc & Trống Đồng Crown Arch at Top of Screen Backdrop */}
        <View pointerEvents="none" style={styles.crownArchWrap}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 400 210"
            preserveAspectRatio="xMidYMin slice">
            <G opacity={crownOpacity}>
              {/* Concentric Crown Arch Drum Rings centered at (200, -4) */}
              {[42, 68, 96, 108, 142, 152, 166].map((r, idx) => (
                <Circle
                  key={`crown-arc-${r}`}
                  cx={200}
                  cy={-4}
                  r={r}
                  fill="none"
                  stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
                  strokeWidth={idx === 2 || idx === 5 ? 1.4 : 0.95}
                />
              ))}

              {/* Radial Sunbeams from Top Crown Medallion */}
              {Array.from({ length: 19 }).map((_, idx) => {
                const angleDeg = 9 + idx * 9;
                const [x1, y1] = polar(200, -4, 44, angleDeg);
                const [x2, y2] = polar(200, -4, 94, angleDeg);
                return (
                  <Line
                    key={`crown-ray-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
                    strokeWidth={0.85}
                    strokeDasharray={idx % 2 === 0 ? undefined : '3 3'}
                  />
                );
              })}

              {/* 14-Pointed Trống Đồng Sun Star at Top Crown Center */}
              <Path
                d={CROWN_SUN_STAR}
                fill={brightGold}
                stroke={lacquerCrimson}
                strokeWidth={1.1}
              />

              {/* Inner & Outer Sawtooth Crown Arches (`Hoa văn răng cưa vòm`) */}
              <Path
                d={CROWN_SAWTOOTH_ARCH}
                fill="none"
                stroke={bronzeGold}
                strokeWidth={1.1}
              />
              <Path
                d={CROWN_OUTER_SAWTOOTH_ARCH}
                fill="none"
                stroke={lacquerCrimson}
                strokeWidth={0.95}
              />

              {/* Tangential Circle Chain along the Crown Arch */}
              {CROWN_TANGENTIAL_CIRCLES.map(([cx, cy], idx) => (
                <G key={`crown-tc-${idx}`}>
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={3.8}
                    fill="none"
                    stroke={bronzeGold}
                    strokeWidth={0.9}
                  />
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={1.2}
                    fill={idx % 2 === 0 ? brightGold : lacquerCrimson}
                  />
                </G>
              ))}

              {/* Pair of Royal Heralding Chim Lạc Birds Flanking the Crown Arch */}
              {/* Left Chim Lạc flying toward the central Trống Đồng Sun */}
              <G transform="translate(52, 54) rotate(-14) scale(1.15)">
                <Path d={CROWN_CHIM_LAC_WING_UP} fill={bronzeGold} />
                <Path d={CROWN_CHIM_LAC_WING_DOWN} fill={bronzeGold} />
                <Path
                  d={CROWN_CHIM_LAC_BODY}
                  fill={brightGold}
                  stroke={lacquerCrimson}
                  strokeWidth={0.8}
                />
                <Path
                  d={CROWN_CHIM_LAC_CREST}
                  fill="none"
                  stroke={lacquerCrimson}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                />
              </G>

              {/* Right Chim Lạc flying symmetrically toward the central Trống Đồng Sun */}
              <G transform="translate(348, 54) scale(-1.15, 1.15) rotate(-14)">
                <Path d={CROWN_CHIM_LAC_WING_UP} fill={bronzeGold} />
                <Path d={CROWN_CHIM_LAC_WING_DOWN} fill={bronzeGold} />
                <Path
                  d={CROWN_CHIM_LAC_BODY}
                  fill={brightGold}
                  stroke={lacquerCrimson}
                  strokeWidth={0.8}
                />
                <Path
                  d={CROWN_CHIM_LAC_CREST}
                  fill="none"
                  stroke={lacquerCrimson}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                />
              </G>
            </G>
          </Svg>
        </View>
      </View>
      <WallpaperLayer pattern={wallpaper} />
      <ScrollView
        style={styles.scroll}
        scrollEnabled={scrollEnabled}
        refreshControl={effectiveRefresh}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: withTabBar ? TabBarSpace : insets.bottom + Spacing.five,
          },
        ]}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  crownArchWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 210,
  },
  orbTopCenter: {
    position: 'absolute',
    top: -110,
    left: '22%',
    width: 260,
    height: 260,
    borderRadius: 999,
  },
  orbTopRight: {
    position: 'absolute',
    top: -70,
    right: -76,
    width: 280,
    height: 280,
    borderRadius: 999,
  },
  orbMidLeft: {
    position: 'absolute',
    top: 220,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 999,
  },
  scroll: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
});
