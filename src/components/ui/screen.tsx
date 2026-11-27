import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native';
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
  /** Set to false on virtualized FlatList screens so the list owns scrolling without nesting inside a ScrollView. */
  scrollable?: boolean;
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

const CROWN_ARCH_RINGS = [42, 68, 96, 108, 142, 152, 166] as const;
const CROWN_SUNBEAMS = Array.from({ length: 19 }, (_, idx) => {
  const angleDeg = 9 + idx * 9;
  const [x1, y1] = polar(200, -4, 44, angleDeg);
  const [x2, y2] = polar(200, -4, 94, angleDeg);
  return { idx, x1, y1, x2, y2 };
});

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(217, 119, 6, ${alpha})`;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DongSonBackdrop = memo(function DongSonBackdrop({
  isDark,
  background,
  accent,
  accentSoft,
  gradientStart,
  gradientEnd,
}: {
  isDark: boolean;
  background: string;
  accent: string;
  accentSoft: string;
  gradientStart: string;
  gradientEnd: string;
}) {
  const normalizedAccent = accent.toUpperCase();
  const isHeritageAmber =
    (isDark && normalizedAccent === '#F59E0B') || (!isDark && normalizedAccent === '#B91C1C');

  const primaryRing = isHeritageAmber ? (isDark ? '#F59E0B' : '#D97706') : accent;
  const starFill = isHeritageAmber ? (isDark ? '#FDE047' : '#B45309') : gradientEnd;
  const secondaryRing = isHeritageAmber ? '#B91C1C' : gradientStart;
  const crownOpacity = isDark ? 0.25 : 0.18;

  const glowColors: [string, string, string, string] = isHeritageAmber
    ? isDark
      ? ['#3B120C', '#2B180A', '#1A0F08', background]
      : ['#FCE8E2', '#FEF3C7', '#F6E7C8', background]
    : isDark
      ? [
          hexToRgba(gradientStart, 0.28),
          hexToRgba(gradientEnd, 0.16),
          hexToRgba(accent, 0.08),
          background,
        ]
      : [
          accentSoft,
          hexToRgba(gradientEnd, 0.15),
          hexToRgba(gradientStart, 0.07),
          background,
        ];

  return (
    <View pointerEvents="none" style={styles.backdrop}>
      {/* Dynamic Accent / Đông Sơn Heritage Linear Glow */}
      <LinearGradient
        pointerEvents="none"
        colors={glowColors}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.glow}
      />

      {/* Ambient Theme-Tinted Orbs */}
      <View
        pointerEvents="none"
        style={[
          styles.orbTopCenter,
          {
            backgroundColor: primaryRing,
            opacity: isDark ? 0.16 : 0.11,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.orbTopRight,
          {
            backgroundColor: secondaryRing,
            opacity: isDark ? 0.18 : 0.09,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.orbMidLeft,
          {
            backgroundColor: primaryRing,
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
            {CROWN_ARCH_RINGS.map((r, idx) => (
              <Circle
                key={`crown-arc-${r}`}
                cx={200}
                cy={-4}
                r={r}
                fill="none"
                stroke={idx % 2 === 0 ? primaryRing : secondaryRing}
                strokeWidth={idx === 2 || idx === 5 ? 1.4 : 0.95}
              />
            ))}

            {/* Radial Sunbeams from Top Crown Medallion */}
            {CROWN_SUNBEAMS.map(({ idx, x1, y1, x2, y2 }) => (
              <Line
                key={`crown-ray-${idx}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={idx % 2 === 0 ? primaryRing : secondaryRing}
                strokeWidth={0.85}
                strokeDasharray={idx % 2 === 0 ? undefined : '3 3'}
              />
            ))}

            {/* 14-Pointed Trống Đồng Sun Star at Top Crown Center */}
            <Path
              d={CROWN_SUN_STAR}
              fill={starFill}
              stroke={secondaryRing}
              strokeWidth={1.1}
            />

            {/* Inner & Outer Sawtooth Crown Arches (`Hoa văn răng cưa vòm`) */}
            <Path
              d={CROWN_SAWTOOTH_ARCH}
              fill="none"
              stroke={primaryRing}
              strokeWidth={1.1}
            />
            <Path
              d={CROWN_OUTER_SAWTOOTH_ARCH}
              fill="none"
              stroke={secondaryRing}
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
                  stroke={primaryRing}
                  strokeWidth={0.9}
                />
                <Circle
                  cx={cx}
                  cy={cy}
                  r={1.2}
                  fill={idx % 2 === 0 ? starFill : secondaryRing}
                />
              </G>
            ))}

            {/* Pair of Royal Heralding Chim Lạc Birds Flanking the Crown Arch */}
            {/* Left Chim Lạc flying toward the central Trống Đồng Sun */}
            <G transform="translate(52, 54) rotate(-14) scale(1.15)">
              <Path d={CROWN_CHIM_LAC_WING_UP} fill={primaryRing} />
              <Path d={CROWN_CHIM_LAC_WING_DOWN} fill={primaryRing} />
              <Path
                d={CROWN_CHIM_LAC_BODY}
                fill={starFill}
                stroke={secondaryRing}
                strokeWidth={0.8}
              />
              <Path
                d={CROWN_CHIM_LAC_CREST}
                fill="none"
                stroke={secondaryRing}
                strokeWidth={1.1}
                strokeLinecap="round"
              />
            </G>

            {/* Right Chim Lạc flying symmetrically toward the central Trống Đồng Sun */}
            <G transform="translate(348, 54) scale(-1.15, 1.15) rotate(-14)">
              <Path d={CROWN_CHIM_LAC_WING_UP} fill={primaryRing} />
              <Path d={CROWN_CHIM_LAC_WING_DOWN} fill={primaryRing} />
              <Path
                d={CROWN_CHIM_LAC_BODY}
                fill={starFill}
                stroke={secondaryRing}
                strokeWidth={0.8}
              />
              <Path
                d={CROWN_CHIM_LAC_CREST}
                fill="none"
                stroke={secondaryRing}
                strokeWidth={1.1}
                strokeLinecap="round"
              />
            </G>
          </G>
        </Svg>
      </View>
    </View>
  );
});

/**
 * Scrollable page with safe-area padding, keyboard avoidance, and a centered, width-limited column.
 * A theme-adaptive Đông Sơn glow, SVG Chim Lạc & Trống Đồng Crown Arch, and
 * museum-grade Đông Sơn wallpaper tapestry sit behind every page.
 */
export function Screen({
  children,
  withTabBar = true,
  refreshControl,
  onRefresh,
  scrollEnabled = true,
  scrollable = true,
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

  const bottomPadding = withTabBar
    ? TabBarSpace + insets.bottom
    : Math.max(24, insets.bottom + Spacing.three);

  const body = scrollable ? (
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
          paddingBottom: bottomPadding,
        },
      ]}>
      <View style={styles.column}>{children}</View>
    </ScrollView>
  ) : (
    children
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <DongSonBackdrop
        isDark={isDark}
        background={theme.background}
        accent={theme.accent}
        accentSoft={theme.accentSoft}
        gradientStart={theme.gradientStart}
        gradientEnd={theme.gradientEnd}
      />
      <WallpaperLayer pattern={wallpaper} />
      {Platform.OS === 'web' ? (
        body
      ) : (
        <KeyboardAvoidingView
          style={styles.scroll}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {body}
        </KeyboardAvoidingView>
      )}
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
