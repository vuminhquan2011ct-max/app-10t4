import { LinearGradient } from 'expo-linear-gradient';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';

import {
  INDEPENDENCE_EPOCH_MAP,
  type IndependenceEpochId,
} from '@/constants/vietnam-independence-meta';

export interface IndependenceDioramaProps {
  epochId: IndependenceEpochId;
  height?: number;
  interactive?: boolean;
  playing?: boolean;
  intensity?: 'normal' | 'cinematic';
  onBurstPress?: () => void;
}

const STAR_ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324] as const;
const DRUM_RAY_ANGLES = [
  0, 25.7, 51.4, 77.1, 102.8, 128.5, 154.2, 180, 205.7, 231.4, 257.1, 282.8, 308.5, 334.2,
] as const;
const CHIM_LAC_ORBIT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const SUNBEAM_ANGLES = [-68, -46, -24, -4, 18, 40, 62] as const;

function buildFivePointStarPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  return STAR_ANGLES.map((deg, idx) => {
    const r = idx % 2 === 0 ? outerR : innerR;
    const rad = ((deg - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function buildFourteenRayStarPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number
): string {
  const pts: string[] = [];
  const totalPoints = 28;
  for (let i = 0; i < totalPoints; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const rad = ((i * (360 / totalPoints) - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function buildSawtoothRingPoints(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  teethCount: number
): string {
  const pts: string[] = [];
  const steps = teethCount * 2;
  for (let i = 0; i < steps; i += 1) {
    const r = i % 2 === 0 ? innerR : outerR;
    const rad = (i * Math.PI) / teethCount;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function buildTangentialCircles(
  cx: number,
  cy: number,
  ringR: number,
  count: number
): { x: number; y: number; nx: number; ny: number }[] {
  const items: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const rad = (i * 2 * Math.PI) / count;
    const nextRad = ((i + 1) * 2 * Math.PI) / count;
    items.push({
      x: Number((cx + ringR * Math.cos(rad)).toFixed(1)),
      y: Number((cy + ringR * Math.sin(rad)).toFixed(1)),
      nx: Number((cx + ringR * Math.cos(nextRad)).toFixed(1)),
      ny: Number((cy + ringR * Math.sin(nextRad)).toFixed(1)),
    });
  }
  return items;
}

const MAIN_FLAG_STAR = buildFivePointStarPoints(54, 32, 15.5, 6.2);
const FLAG_RIBBON_CENTER_STAR = buildFivePointStarPoints(54, 53.5, 4.2, 1.7);
const FLAG_RIBBON_LEFT_STAR = buildFivePointStarPoints(36, 53.5, 3, 1.2);
const FLAG_RIBBON_RIGHT_STAR = buildFivePointStarPoints(72, 53.5, 3, 1.2);
const MINI_STAR_A = buildFivePointStarPoints(12, 8, 4.2, 1.7);
const DONG_SON_SUN_STAR = buildFourteenRayStarPoints(120, 120, 26, 10.5);
const SHIELD_DONG_SON_STAR = buildFourteenRayStarPoints(246, 145, 13.5, 5.6);
const SHIELD_SAWTOOTH_RING = buildSawtoothRingPoints(246, 145, 15.5, 19.5, 16);
const HUD_PILL_STAR = buildFourteenRayStarPoints(10, 10, 7.5, 3.2);

const DRUM_SAWTOOTH_OUTER = buildSawtoothRingPoints(120, 120, 99, 106, 36);
const DRUM_SAWTOOTH_INNER = buildSawtoothRingPoints(120, 120, 50, 57, 24);
const DRUM_TANGENTIAL_RING = buildTangentialCircles(120, 120, 86, 24);
const DRUM_INNER_TANGENTIAL_RING = buildTangentialCircles(120, 120, 37, 14);

const HALO_SAWTOOTH_RING = buildSawtoothRingPoints(140, 140, 124, 133, 44);
const HALO_TANGENTIAL_RING = buildTangentialCircles(140, 140, 114, 28);

const BA_DINH_BANNER_STARS = [194, 218, 242, 266, 290].map((sx, idx) =>
  buildFivePointStarPoints(sx, 166.5, idx === 2 ? 4.6 : 3.6, idx === 2 ? 1.85 : 1.45)
);

export function IndependenceDiorama({
  epochId,
  height = 236,
  interactive = true,
  playing = true,
  intensity = 'normal',
  onBurstPress,
}: IndependenceDioramaProps): JSX.Element {
  const epoch = INDEPENDENCE_EPOCH_MAP[epochId] ?? INDEPENDENCE_EPOCH_MAP.ba_dinh_1945;
  const isCinematic = intensity === 'cinematic';
  const [burstCount, setBurstCount] = useState(0);

  // Master continuous animation drivers (0..1)
  const drumSpin = useSharedValue(0);
  const auraPulse = useSharedValue(0);
  const flagWave = useSharedValue(0);
  const stageCycle = useSharedValue(0);
  const secondaryCycle = useSharedValue(0);
  const emberFloat = useSharedValue(0);
  const burstProgress = useSharedValue(0);
  const stageEntrance = useSharedValue(1);

  useEffect(() => {
    if (!playing) {
      drumSpin.value = 0.15;
      auraPulse.value = 0.5;
      flagWave.value = 0.35;
      stageCycle.value = 0.4;
      secondaryCycle.value = 0.6;
      emberFloat.value = 0.5;
      return;
    }

    drumSpin.value = 0;
    drumSpin.value = withRepeat(
      withTiming(1, { duration: isCinematic ? 28000 : 34000, easing: Easing.linear }),
      -1,
      false
    );

    auraPulse.value = 0;
    auraPulse.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    flagWave.value = 0;
    flagWave.value = withRepeat(
      withTiming(1, { duration: 1350, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    stageCycle.value = 0;
    stageCycle.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    secondaryCycle.value = 0;
    secondaryCycle.value = withRepeat(
      withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );

    emberFloat.value = 0;
    emberFloat.value = withRepeat(
      withTiming(1, { duration: 3800, easing: Easing.linear }),
      -1,
      false
    );
  }, [
    playing,
    isCinematic,
    drumSpin,
    auraPulse,
    flagWave,
    stageCycle,
    secondaryCycle,
    emberFloat,
  ]);

  // Smooth spring entrance when switching historical epoch
  useEffect(() => {
    stageEntrance.value = 0.86;
    stageEntrance.value = withSpring(1, {
      damping: 14,
      stiffness: 130,
      mass: 0.8,
    });
  }, [epochId, stageEntrance]);

  // Celebratory spark burst on epoch switch or user tap
  useEffect(() => {
    burstProgress.value = 0;
    burstProgress.value = withSequence(
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 150 })
    );
  }, [epochId, burstCount, burstProgress]);

  const handlePress = () => {
    if (!interactive) return;
    setBurstCount((prev) => prev + 1);
    onBurstPress?.();
  };

  // 1. Rotating Đông Sơn Bronze Drum & Outer Halo & Sunbeams
  const drumAnimatedStyle = useAnimatedStyle(() => {
    const rotateDeg = interpolate(drumSpin.value, [0, 1], [0, 360]);
    const scale = interpolate(
      auraPulse.value,
      [0, 0.5, 1],
      [0.96, isCinematic ? 1.08 : 1.04, 0.96]
    );
    return {
      opacity: interpolate(auraPulse.value, [0, 1], [0.48, isCinematic ? 0.74 : 0.62]),
      transform: [{ rotate: `${rotateDeg}deg` }, { scale }],
    };
  });

  const drumOuterHaloStyle = useAnimatedStyle(() => {
    const rotateDeg = interpolate(drumSpin.value, [0, 1], [360, 0]);
    const scale = interpolate(auraPulse.value, [0, 1], [0.98, 1.05]);
    return {
      opacity: interpolate(auraPulse.value, [0, 1], [0.22, isCinematic ? 0.42 : 0.34]),
      transform: [{ rotate: `${rotateDeg}deg` }, { scale }],
    };
  });

  const sunbeamAnimatedStyle = useAnimatedStyle(() => {
    const rotateDeg = interpolate(auraPulse.value, [0, 1], [-8, 8]);
    const scale = interpolate(auraPulse.value, [0, 1], [0.95, 1.08]);
    return {
      opacity: interpolate(auraPulse.value, [0, 1], [0.26, 0.52]),
      transform: [{ rotate: `${rotateDeg}deg` }, { scale }],
    };
  });

  // 2. Multi-segment Fluttering Red Flag with Golden Star (Cờ Đỏ Sao Vàng tung bay)
  const flagHoistStyle = useAnimatedStyle(() => {
    const ty = interpolate(flagWave.value, [0, 1], [-1.5, 2]);
    const rot = interpolate(flagWave.value, [0, 1], [-2.5, 2.5]);
    return {
      transform: [{ translateY: ty }, { rotate: `${rot}deg` }],
    };
  });

  const flagCenterClothStyle = useAnimatedStyle(() => {
    const ty = interpolate(flagWave.value, [0, 0.5, 1], [-3.5, 0, 4]);
    const rot = interpolate(flagWave.value, [0, 1], [-5, 5.5]);
    const scaleY = interpolate(flagWave.value, [0, 0.5, 1], [0.97, 1.03, 0.98]);
    return {
      transform: [{ translateY: ty }, { rotate: `${rot}deg` }, { scaleY }],
    };
  });

  const flagFlyTailStyle = useAnimatedStyle(() => {
    const ty = interpolate(flagWave.value, [0, 0.5, 1], [5, -1, -6]);
    const tx = interpolate(flagWave.value, [0, 1], [-2, 2.5]);
    const rot = interpolate(flagWave.value, [0, 1], [7, -8]);
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { rotate: `${rot}deg` }],
    };
  });

  // 3. Stage Entrance & Epoch-Specific Motion Styles
  const stageContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stageEntrance.value, [0.86, 1], [0.65, 1]),
    transform: [
      { scale: stageEntrance.value },
      { translateY: interpolate(stageEntrance.value, [0.86, 1], [10, 0]) },
    ],
  }));

  // Bạch Đằng waves & war dragon boat
  const waveBackStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(stageCycle.value, [0, 1], [-12, 12]) },
      { translateY: interpolate(stageCycle.value, [0, 1], [-2, 3]) },
    ],
  }));

  const waveFrontStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(stageCycle.value, [0, 1], [14, -14]) },
      { translateY: interpolate(flagWave.value, [0, 1], [3, -3]) },
    ],
  }));

  const dragonBoatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-10, 12]) },
      { translateY: interpolate(stageCycle.value, [0, 1], [-4.5, 4.5]) },
      { rotate: `${interpolate(stageCycle.value, [0, 1], [-3.2, 3.2])}deg` },
    ],
  }));

  // Ba Đình 1945 crowd flags & peace doves
  const crowdFlagsWaveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(flagWave.value, [0, 1], [-3.5, 2.5]) },
      { translateX: interpolate(flagWave.value, [0, 1], [-2, 2]) },
    ],
  }));

  const peaceDovesStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-18, 22]) },
      { translateY: interpolate(stageCycle.value, [0, 1], [5, -8]) },
      { scaleY: interpolate(flagWave.value, [0, 0.5, 1], [0.92, 1.08, 0.92]) },
    ],
  }));

  // Điện Biên 1954 supply bicycles, bunker victory flag & flares
  const bicycleConvoyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-8, 10]) },
      { translateY: interpolate(secondaryCycle.value, [0, 1], [3, -4]) },
    ],
  }));

  const bunkerFlagSoldierStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(flagWave.value, [0, 1], [-7, 8])}deg` },
      { translateY: interpolate(flagWave.value, [0, 1], [-2, 2]) },
    ],
  }));

  // Thống Nhất 1975 Liberation Tank 390 & Dinh Độc Lập fireworks
  const tank390AnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-14, 16]) },
      { translateY: interpolate(flagWave.value, [0, 0.5, 1], [-1.8, 1.6, -1.8]) },
      { rotate: `${interpolate(flagWave.value, [0, 1], [-1.2, 1.2])}deg` },
    ],
  }));

  const victoryFireworksStyle = useAnimatedStyle(() => {
    const scale = interpolate(stageCycle.value, [0, 0.5, 1], [0.82, 1.16, 0.88]);
    return {
      opacity: interpolate(stageCycle.value, [0, 0.5, 1], [0.55, 1, 0.6]),
      transform: [{ scale }, { translateY: interpolate(stageCycle.value, [0, 1], [3, -5]) }],
    };
  });

  // Kỷ Nguyên Mới shield crest & soaring Lạc birds
  const emblem10T4Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(stageCycle.value, [0, 1], [-6, 5]) },
      { scale: interpolate(auraPulse.value, [0, 1], [0.97, 1.06]) },
    ],
  }));

  const soaringBirdsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-12, 16]) },
      { translateY: interpolate(stageCycle.value, [0, 1], [4, -7]) },
    ],
  }));

  // Top Sky Gliding Pair of Golden Chim Lạc
  const skyChimLacPairStyle = useAnimatedStyle(() => ({
    opacity: interpolate(auraPulse.value, [0, 0.5, 1], [0.72, 0.96, 0.75]),
    transform: [
      { translateX: interpolate(secondaryCycle.value, [0, 1], [-10, 14]) },
      { translateY: interpolate(stageCycle.value, [0, 1], [-2.5, 3]) },
    ],
  }));

  // 4. Continuous Floating Embers & Interactive Tap Firework Burst
  const emberLayerAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(emberFloat.value, [0, 0.2, 0.8, 1], [0, 0.9, 0.85, 0]),
    transform: [
      { translateY: interpolate(emberFloat.value, [0, 1], [14, -46]) },
      { translateX: interpolate(stageCycle.value, [0, 1], [-6, 6]) },
    ],
  }));

  const emberLayerBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(auraPulse.value, [0, 0.5, 1], [0.35, 0.95, 0.4]),
    transform: [
      { translateY: interpolate(auraPulse.value, [0, 1], [8, -28]) },
      { translateX: interpolate(flagWave.value, [0, 1], [5, -5]) },
    ],
  }));

  const burstOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burstProgress.value, [0, 0.12, 0.75, 1], [0, 1, 0.75, 0]),
    transform: [
      { scale: interpolate(burstProgress.value, [0, 1], [0.35, isCinematic ? 1.55 : 1.35]) },
      { rotate: `${interpolate(burstProgress.value, [0, 1], [0, 42])}deg` },
    ],
  }));

  // Live HUD Equalizer Bars & Pulsing Star Pill
  const eqBar1Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(flagWave.value, [0, 1], [0.35, 1]) }],
  }));
  const eqBar2Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(stageCycle.value, [0, 1], [1, 0.3]) }],
  }));
  const eqBar3Style = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(auraPulse.value, [0, 1], [0.45, 0.95]) }],
  }));
  const hudStarPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(auraPulse.value, [0, 1], [0.75, 1]),
    transform: [
      { scale: interpolate(auraPulse.value, [0, 0.5, 1], [0.88, 1.14, 0.9]) },
      { rotate: `${interpolate(drumSpin.value, [0, 1], [0, 360])}deg` },
    ],
  }));

  return (
    <Pressable
      onPress={handlePress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : 'image'}
      accessibilityLabel={`Mô phỏng lịch sử đấu tranh giành độc lập Việt Nam: ${epoch.title}`}
      style={[styles.container, { height }]}>
      {/* Layer 1: Multi-stop Historical Sky Gradient */}
      <LinearGradient
        colors={[epoch.skyGradient[0], epoch.skyGradient[1], epoch.skyGradient[2]]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 2: Radiant Golden Sunbeams */}
      <Animated.View
        pointerEvents="none"
        style={[styles.sunbeamWrap, sunbeamAnimatedStyle]}>
        <Svg width={340} height={240} viewBox="0 0 340 240">
          <Defs>
            <SvgLinearGradient id="sunRayGrad" x1="0.5" y1="1" x2="0.5" y2="0">
              <Stop offset="0" stopColor="#FACC15" stopOpacity="0.45" />
              <Stop offset="0.6" stopColor={epoch.accentColor} stopOpacity="0.16" />
              <Stop offset="1" stopColor="#FFFBEB" stopOpacity="0" />
            </SvgLinearGradient>
            <RadialGradient id="horizonGlow" cx="50%" cy="72%" rx="50%" ry="45%">
              <Stop offset="0" stopColor="#FACC15" stopOpacity="0.42" />
              <Stop offset="0.55" stopColor={epoch.accentColor} stopOpacity="0.16" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="170" cy="168" r="145" fill="url(#horizonGlow)" />
          {SUNBEAM_ANGLES.map((angle, idx) => (
            <G key={`beam-${idx}`} origin="170, 175" rotation={angle}>
              <Polygon points="170,175 146,-20 194,-20" fill="url(#sunRayGrad)" />
            </G>
          ))}
        </Svg>
      </Animated.View>

      {/* Layer 3A: Subtle Outer 280x280 Trống Đồng Đông Sơn Halo Ring */}
      <Animated.View pointerEvents="none" style={[styles.drumOuterHaloWrap, drumOuterHaloStyle]}>
        <Svg width={280} height={280} viewBox="0 0 280 280">
          <Circle
            cx="140"
            cy="140"
            r="136"
            stroke="#F59E0B"
            strokeWidth="1.2"
            strokeOpacity="0.45"
            fill="none"
          />
          <Circle
            cx="140"
            cy="140"
            r="123"
            stroke="#FDE047"
            strokeWidth="1"
            strokeOpacity="0.4"
            fill="none"
          />
          {/* Outer Sawtooth Geometric Band (Hoa văn răng cưa) */}
          <Polygon
            points={HALO_SAWTOOTH_RING}
            stroke="#FDE047"
            strokeWidth="0.95"
            strokeOpacity="0.42"
            fill="none"
          />
          {/* Tangential Dotted Circles Band (Vòng tròn tiếp tuyến) */}
          {HALO_TANGENTIAL_RING.map((c, idx) => (
            <G key={`halo-tan-${idx}`}>
              <Line
                x1={c.x}
                y1={c.y}
                x2={c.nx}
                y2={c.ny}
                stroke="#FACC15"
                strokeWidth="0.6"
                strokeOpacity="0.32"
              />
              <Circle
                cx={c.x}
                cy={c.y}
                r="2.6"
                stroke="#FDE047"
                strokeWidth="0.8"
                strokeOpacity="0.45"
                fill="none"
              />
              <Circle cx={c.x} cy={c.y} r="0.9" fill="#FEF08A" fillOpacity="0.55" />
            </G>
          ))}
        </Svg>
      </Animated.View>

      {/* Layer 3B: Sacred Rotating Trống Đồng Đông Sơn (Intricate Bronze Drum Mandala) */}
      <Animated.View pointerEvents="none" style={[styles.drumWrap, drumAnimatedStyle]}>
        <Svg width={240} height={240} viewBox="0 0 240 240">
          <Defs>
            <RadialGradient id="drumCoreGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FDE047" stopOpacity="0.58" />
              <Stop offset="0.58" stopColor="#F59E0B" stopOpacity="0.22" />
              <Stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Circle cx="120" cy="120" r="114" fill="url(#drumCoreGlow)" />

          {/* Outer Concentric Đông Sơn Rim Rings */}
          <Circle
            cx="120"
            cy="120"
            r="110"
            stroke="#F59E0B"
            strokeWidth="1.5"
            strokeOpacity="0.55"
            fill="none"
          />
          <Circle
            cx="120"
            cy="120"
            r="106"
            stroke="#FACC15"
            strokeWidth="1.3"
            strokeOpacity="0.65"
            fill="none"
          />
          <Circle
            cx="120"
            cy="120"
            r="99"
            stroke="#FACC15"
            strokeWidth="1.1"
            strokeOpacity="0.55"
            fill="none"
          />

          {/* Outer Concentric Sawtooth Triangle Ring (Hoa văn răng cưa) */}
          <Polygon
            points={DRUM_SAWTOOTH_OUTER}
            stroke="#FDE047"
            strokeWidth="1.1"
            strokeOpacity="0.62"
            fill="none"
          />

          {/* Outer Tangential Dotted Circle Ring (Vòng tròn tiếp tuyến) */}
          <Circle
            cx="120"
            cy="120"
            r="92"
            stroke="#FDE047"
            strokeWidth="0.9"
            strokeOpacity="0.45"
            fill="none"
          />
          {DRUM_TANGENTIAL_RING.map((c, idx) => (
            <G key={`drum-tan-${idx}`}>
              <Line
                x1={c.x}
                y1={c.y}
                x2={c.nx}
                y2={c.ny}
                stroke="#FACC15"
                strokeWidth="0.7"
                strokeOpacity="0.45"
              />
              <Circle
                cx={c.x}
                cy={c.y}
                r="3.2"
                stroke="#FDE047"
                strokeWidth="0.95"
                strokeOpacity="0.65"
                fill="none"
              />
              <Circle cx={c.x} cy={c.y} r="1.1" fill="#FEF08A" fillOpacity="0.8" />
            </G>
          ))}
          <Circle
            cx="120"
            cy="120"
            r="80"
            stroke="#FACC15"
            strokeWidth="1.2"
            strokeOpacity="0.58"
            fill="none"
          />

          {/* Chim Lạc Orbit Band Ring (r = 58..80) */}
          <Circle
            cx="120"
            cy="120"
            r="60"
            stroke="#FACC15"
            strokeWidth="1.4"
            strokeOpacity="0.65"
            fill="none"
          />

          {/* Inner Sawtooth Triangle Ring (Hoa văn răng cưa nội tâm) */}
          <Polygon
            points={DRUM_SAWTOOTH_INNER}
            stroke="#FDE047"
            strokeWidth="1.05"
            strokeOpacity="0.58"
            fill="none"
          />
          <Circle
            cx="120"
            cy="120"
            r="49"
            stroke="#FACC15"
            strokeWidth="1.1"
            strokeOpacity="0.55"
            fill="none"
          />

          {/* Inner Tangential Dotted Circle Ring */}
          {DRUM_INNER_TANGENTIAL_RING.map((c, idx) => (
            <G key={`drum-inner-tan-${idx}`}>
              <Circle
                cx={c.x}
                cy={c.y}
                r="2.5"
                stroke="#FDE047"
                strokeWidth="0.85"
                strokeOpacity="0.55"
                fill="none"
              />
              <Circle cx={c.x} cy={c.y} r="0.9" fill="#FEF9C3" fillOpacity="0.75" />
            </G>
          ))}

          <Circle
            cx="120"
            cy="120"
            r="30"
            stroke="#FACC15"
            strokeWidth="1.6"
            strokeOpacity="0.82"
            fill="none"
          />

          {/* Radial Peacock Feather / Geometric Dividers */}
          {DRUM_RAY_ANGLES.map((deg, idx) => (
            <G key={`drum-ray-${idx}`} origin="120, 120" rotation={deg}>
              <Line
                x1="120"
                y1="14"
                x2="120"
                y2="92"
                stroke="#FDE047"
                strokeWidth="0.9"
                strokeOpacity="0.3"
              />
            </G>
          ))}

          {/* 8 Stylized Chim Lạc (Lạc Birds) Orbiting Counter-Clockwise Around the Drum Ring */}
          {CHIM_LAC_ORBIT_ANGLES.map((deg) => (
            <G key={`lac-bird-${deg}`} origin="120, 120" rotation={deg}>
              {/* Sweeping Outspread Wings */}
              <Path
                d="M102 52 Q112 43 120 49 Q128 43 138 52 L145 46 Q131 54 120 55 Q109 54 95 46 Z"
                fill="#FDE047"
                fillOpacity="0.85"
              />
              {/* Long Beak, Feathered Crest & Flowing Tail Plume */}
              <Path
                d="M118 49 L134 47 L125 52 Z M116 49 L106 43 L112 51 Z M117 54 L101 58 L108 53 Z"
                fill="#FACC15"
                fillOpacity="0.92"
              />
              <Circle cx="124" cy="49.5" r="1.1" fill="#FEF9C3" />
            </G>
          ))}

          {/* 14-Pointed Sacred Đông Sơn Sun Star in the Center */}
          <Polygon
            points={DONG_SON_SUN_STAR}
            fill="#FACC15"
            fillOpacity="0.9"
            stroke="#FEF08A"
            strokeWidth="1.1"
          />
          <Circle cx="120" cy="120" r="6.5" fill="#FEF9C3" />
          <Circle cx="120" cy="120" r="3" fill="#F59E0B" />
        </Svg>
      </Animated.View>

      {/* Layer 4: Prominent Multi-Layered Fluttering Cờ Đỏ Sao Vàng */}
      <View pointerEvents="none" style={styles.flagAssemblyWrap}>
        {/* Flagpole & Golden Finial */}
        <Svg width={18} height={154} viewBox="0 0 18 154" style={styles.flagPoleSvg}>
          <Defs>
            <SvgLinearGradient id="poleGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FDE047" />
              <Stop offset="0.5" stopColor="#FFFFFF" />
              <Stop offset="1" stopColor="#CA8A04" />
            </SvgLinearGradient>
          </Defs>
          <Circle cx="9" cy="8" r="5" fill="#FACC15" stroke="#FEF08A" strokeWidth="1.2" />
          <Polygon points="9,1 11,6 7,6" fill="#FEF9C3" />
          <Rect x="7.2" y="12" width="3.6" height="140" rx="1.8" fill="url(#poleGrad)" />
        </Svg>

        {/* Waving Flag Cloth Segment 3 (Billowing Fly Tail) */}
        <Animated.View style={[styles.flagSegmentTail, flagFlyTailStyle]}>
          <Svg width={66} height={68} viewBox="0 0 66 68">
            <Path
              d="M0 7 Q28 0 62 9 L56 33 L64 57 Q28 66 0 58 Z"
              fill="#B91C1C"
              stroke="#FACC15"
              strokeWidth="0.9"
              strokeOpacity="0.6"
            />
            <Path
              d="M2 15 Q30 9 56 16 L51 33 Q26 28 2 33 Z"
              fill="#DC2626"
              fillOpacity="0.65"
            />
          </Svg>
        </Animated.View>

        {/* Waving Flag Cloth Segment 1 (Hoist Attachment) */}
        <Animated.View style={[styles.flagSegmentHoist, flagHoistStyle]}>
          <Svg width={44} height={68} viewBox="0 0 44 68">
            <Path
              d="M0 6 Q22 2 44 7 L44 59 Q22 54 0 58 Z"
              fill="#C81E1E"
            />
          </Svg>
        </Animated.View>

        {/* Waving Flag Cloth Segment 2 (Main Crimson Body + Glowing 5-Pointed Golden Star & Sun Rays) */}
        <Animated.View style={[styles.flagSegmentCenter, flagCenterClothStyle]}>
          <Svg width={108} height={70} viewBox="0 0 108 70">
            <Defs>
              <SvgLinearGradient id="crimsonClothGrad" x1="0" y1="0" x2="1" y2="0.3">
                <Stop offset="0" stopColor="#DC2626" />
                <Stop offset="0.48" stopColor="#EF4444" />
                <Stop offset="0.78" stopColor="#B91C1C" />
                <Stop offset="1" stopColor="#DC2626" />
              </SvgLinearGradient>
              <RadialGradient id="starAura" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#FEF08A" stopOpacity="0.68" />
                <Stop offset="1" stopColor="#FACC15" stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* Half-blue bottom field when in 1975 Liberation banner mode */}
            <Path
              d="M2 7 Q36 1 70 8 Q92 12 104 7 L102 60 Q72 67 40 59 Q18 54 2 60 Z"
              fill="url(#crimsonClothGrad)"
              stroke="#FACC15"
              strokeWidth="1.1"
              strokeOpacity="0.75"
            />
            {epochId === 'thong_nhat_1975' ? (
              <Path
                d="M2 34 Q40 29 74 35 Q92 38 103 34 L102 60 Q72 67 40 59 Q18 54 2 60 Z"
                fill="#0284C7"
                fillOpacity="0.88"
              />
            ) : null}

            {/* Cloth Highlight Ripple Fold */}
            <Path
              d="M16 9 Q38 5 54 11 L50 58 Q32 53 14 58 Z"
              fill="#FFFFFF"
              fillOpacity="0.11"
            />

            {/* Pure Visual Golden Star Aura, Concentric Sun Ring & Radial Sun Rays */}
            <Circle cx="54" cy="32" r="24" fill="url(#starAura)" />
            <Circle
              cx="54"
              cy="32"
              r="18.5"
              stroke="#FDE047"
              strokeWidth="0.8"
              strokeDasharray="2 3"
              strokeOpacity="0.55"
              fill="none"
            />
            {STAR_ANGLES.map((deg) => {
              const rad = ((deg - 90) * Math.PI) / 180;
              const x1 = 54 + 17 * Math.cos(rad);
              const y1 = 32 + 17 * Math.sin(rad);
              const x2 = 54 + 22.5 * Math.cos(rad);
              const y2 = 32 + 22.5 * Math.sin(rad);
              return (
                <Line
                  key={`flag-ray-${deg}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#FEF08A"
                  strokeWidth="1"
                  strokeOpacity="0.65"
                  strokeLinecap="round"
                />
              );
            })}
            <Polygon
              points={MAIN_FLAG_STAR}
              fill="#FACC15"
              stroke="#FEF9C3"
              strokeWidth="1.1"
            />

            {/* Pure Visual Golden Đông Sơn Ribbon Crest Along Bottom of Flag */}
            <Line
              x1="16"
              y1="53.5"
              x2="31"
              y2="53.5"
              stroke="#FEF08A"
              strokeWidth="1.1"
              strokeOpacity="0.78"
            />
            <Line
              x1="77"
              y1="53.5"
              x2="92"
              y2="53.5"
              stroke="#FEF08A"
              strokeWidth="1.1"
              strokeOpacity="0.78"
            />
            <Polygon points={FLAG_RIBBON_LEFT_STAR} fill="#FDE047" />
            <Polygon points={FLAG_RIBBON_CENTER_STAR} fill="#FEF08A" />
            <Polygon points={FLAG_RIBBON_RIGHT_STAR} fill="#FDE047" />
          </Svg>
        </Animated.View>
      </View>

      {/* Layer 5: Epoch-Specific Animated Historical Stage */}
      <Animated.View
        pointerEvents="none"
        style={[styles.stageLayer, stageContainerStyle]}>
        {epochId === 'bach_dang' && (
          <View style={StyleSheet.absoluteFill}>
            {/* Distant Hạ Long / Tràng Kênh Limestone Karsts & River Horizon */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              <Path
                d="M0 175 L28 134 L54 152 L88 116 L124 148 L155 128 L188 158 L235 122 L272 150 L312 118 L352 146 L382 132 L400 155 L400 240 L0 240 Z"
                fill="#2A0C10"
                fillOpacity="0.65"
              />
            </Svg>

            {/* Back River Wave Layer + Angled Bạch Đằng Wooden Stakes */}
            <Animated.View style={[StyleSheet.absoluteFill, waveBackStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                <Path
                  d="M-20 182 Q45 168 110 182 T240 182 T370 182 T430 182 L430 240 L-20 240 Z"
                  fill="#451A1C"
                  fillOpacity="0.82"
                />
                {/* Iron-tipped Bạch Đằng Wooden Stakes rising at sharp angles */}
                <G>
                  {/* Stake 1 */}
                  <Polygon points="145,212 155,212 172,148 164,146" fill="#78350F" />
                  <Polygon points="164,146 172,148 173,134" fill="#E2E8F0" />
                  {/* Stake 2 */}
                  <Polygon points="212,216 223,216 242,142 233,140" fill="#92400E" />
                  <Polygon points="233,140 242,142 244,126" fill="#F8FAFC" />
                  {/* Stake 3 */}
                  <Polygon points="282,214 292,214 309,152 301,149" fill="#78350F" />
                  <Polygon points="301,149 309,152 311,137" fill="#E2E8F0" />
                  {/* Stake 4 */}
                  <Polygon points="338,218 348,218 366,146 357,144" fill="#92400E" />
                  <Polygon points="357,144 366,146 368,131" fill="#F1F5F9" />
                </G>
              </Svg>
            </Animated.View>

            {/* Gliding Ancient Vietnamese War Dragon-Boat with Warriors & Spears */}
            <Animated.View style={[StyleSheet.absoluteFill, dragonBoatStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {/* Dragon Boat Hull */}
                <Path
                  d="M92 178 Q175 198 264 176 L282 152 Q272 162 252 168 L112 168 Q98 160 86 144 Z"
                  fill="#450A0A"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                />
                {/* Carved Golden Dragon Head Prow */}
                <Path
                  d="M262 174 Q282 152 292 126 L304 124 L296 134 L308 136 L294 144 Q286 164 268 178 Z"
                  fill="#F59E0B"
                />
                <Circle cx="294" cy="129" r="2" fill="#FEF08A" />
                {/* Dragon Tail Stern */}
                <Path
                  d="M94 174 Q78 154 74 132 L82 138 Q86 154 100 168 Z"
                  fill="#D97706"
                />
                {/* Golden Battle Shields along Gunwale */}
                {[122, 146, 170, 194, 218, 242].map((cx) => (
                  <Circle
                    key={`shield-${cx}`}
                    cx={cx}
                    cy="173"
                    r="5.5"
                    fill="#B45309"
                    stroke="#FDE047"
                    strokeWidth="1.2"
                  />
                ))}
                {/* Dong A Battle Drum & Canopy on Deck */}
                <Rect x="132" y="152" width="18" height="15" rx="3" fill="#B91C1C" stroke="#FACC15" strokeWidth="1" />
                <Circle cx="141" cy="159.5" r="4.5" fill="#FACC15" />
                {/* Heroic Đại Việt Warriors Holding Raised Spears */}
                {[164, 186, 208, 230, 250].map((wx, idx) => (
                  <G key={`warrior-${wx}`}>
                    <Circle cx={wx} cy="151" r="4" fill="#1C1917" stroke="#F59E0B" strokeWidth="0.8" />
                    <Path
                      d={`M${wx - 5} 168 L${wx} 155 L${wx + 5} 168 Z`}
                      fill="#7F1D1D"
                    />
                    {/* Raised Spear */}
                    <Line
                      x1={wx + 3}
                      y1="168"
                      x2={wx + 12}
                      y2={122 + (idx % 2) * 5}
                      stroke="#FDE047"
                      strokeWidth="1.4"
                    />
                    <Polygon
                      points={`${wx + 12},${117 + (idx % 2) * 5} ${wx + 10},${124 + (idx % 2) * 5} ${wx + 15},${124 + (idx % 2) * 5}`}
                      fill="#F8FAFC"
                    />
                  </G>
                ))}
                {/* Oars cutting into the Bạch Đằng waves */}
                {[136, 160, 184, 208, 232].map((ox) => (
                  <Line
                    key={`oar-${ox}`}
                    x1={ox}
                    y1="175"
                    x2={ox - 12}
                    y2="196"
                    stroke="#FCD34D"
                    strokeWidth="1.6"
                  />
                ))}
              </Svg>
            </Animated.View>

            {/* Front Foaming River Waves */}
            <Animated.View style={[StyleSheet.absoluteFill, waveFrontStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                <Path
                  d="M-24 198 Q35 184 95 198 T215 198 T335 198 T424 198 L424 240 L-24 240 Z"
                  fill="#7C2D12"
                  fillOpacity="0.72"
                />
                <Path
                  d="M-10 212 Q55 200 120 212 T250 212 T380 212 L410 240 L-10 240 Z"
                  fill="#1C0A0A"
                  fillOpacity="0.9"
                />
                {/* Foaming water spray around stakes */}
                <Path
                  d="M150 196 Q165 189 178 196 M220 194 Q235 187 248 194 M290 197 Q305 190 318 197"
                  stroke="#FEF3C7"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.7"
                />
              </Svg>
            </Animated.View>
          </View>
        )}

        {epochId === 'ba_dinh_1945' && (
          <View style={StyleSheet.absoluteFill}>
            {/* Historic Ba Đình Square Tribune & Monument Silhouette (02/09/1945) */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              {/* Golden Glow Behind Ba Đình Tribune */}
              <Circle cx="242" cy="148" r="78" fill="#FACC15" fillOpacity="0.18" />

              {/* Grand Ba Đình Architecture Colonnade & Stepped Roof */}
              <Rect x="142" y="156" width="200" height="36" fill="#2A0A0A" />
              <Rect x="160" y="132" width="164" height="26" fill="#3B0D0D" stroke="#F59E0B" strokeWidth="1" />
              <Rect x="184" y="114" width="116" height="20" fill="#450A0A" stroke="#FACC15" strokeWidth="1.2" />

              {/* Iconic Columns & Red Vertical Draperies */}
              {[172, 196, 220, 264, 288, 312].map((colX) => (
                <G key={`col-${colX}`}>
                  <Rect x={colX} y="135" width="7" height="32" fill="#DC2626" />
                  <Circle cx={colX + 3.5} cy="145" r="2.2" fill="#FACC15" />
                </G>
              ))}

              {/* Central Independence Podium (Lễ đài Độc Lập) */}
              <Polygon
                points="224,134 260,134 266,168 218,168"
                fill="#991B1B"
                stroke="#FACC15"
                strokeWidth="1.3"
              />
              {/* Uncle Ho Silhouette Reading the Declaration of Independence at Microphones */}
              <Circle cx="242" cy="103" r="4.8" fill="#FEF08A" />
              <Path d="M234 118 Q242 108 250 118 L252 134 L232 134 Z" fill="#78350F" stroke="#FDE047" strokeWidth="0.9" />
              {/* Dual Vintage Microphones */}
              <Line x1="236" y1="114" x2="236" y2="134" stroke="#FDE047" strokeWidth="1.2" />
              <Circle cx="236" cy="113" r="1.8" fill="#FACC15" />
              <Line x1="248" y1="114" x2="248" y2="134" stroke="#FDE047" strokeWidth="1.2" />
              <Circle cx="248" cy="113" r="1.8" fill="#FACC15" />

              {/* Historic Crimson Banner Across Ba Đình Square with 5 Golden Stars & Đông Sơn Geometric Borders */}
              <Rect x="166" y="160" width="152" height="13" rx="3" fill="#B91C1C" stroke="#FACC15" strokeWidth="1.1" />
              <Line
                x1="170"
                y1="162.2"
                x2="314"
                y2="162.2"
                stroke="#FDE047"
                strokeWidth="0.75"
                strokeDasharray="3 2"
                strokeOpacity="0.8"
              />
              <Line
                x1="170"
                y1="170.8"
                x2="314"
                y2="170.8"
                stroke="#FDE047"
                strokeWidth="0.75"
                strokeDasharray="3 2"
                strokeOpacity="0.8"
              />
              {/* Left & Right Đông Sơn Lozenge Ornaments */}
              <Polygon points="174,166.5 178,163.8 182,166.5 178,169.2" fill="#F59E0B" stroke="#FEF08A" strokeWidth="0.6" />
              <Polygon points="302,166.5 306,163.8 310,166.5 306,169.2" fill="#F59E0B" stroke="#FEF08A" strokeWidth="0.6" />
              {/* Row of 5 Golden Five-Pointed Stars */}
              {BA_DINH_BANNER_STARS.map((pts, idx) => (
                <Polygon
                  key={`banner-star-${idx}`}
                  points={pts}
                  fill="#FACC15"
                  stroke="#FEF9C3"
                  strokeWidth="0.5"
                />
              ))}
            </Svg>

            {/* Animated White Peace Doves Soaring Over Ba Đình Square */}
            <Animated.View style={[StyleSheet.absoluteFill, peaceDovesStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {[
                  { x: 145, y: 74, s: 1 },
                  { x: 185, y: 56, s: 0.85 },
                  { x: 295, y: 66, s: 0.95 },
                  { x: 332, y: 84, s: 0.8 },
                  { x: 245, y: 48, s: 0.75 },
                ].map((dove, i) => (
                  <G
                    key={`dove-${i}`}
                    transform={`translate(${dove.x}, ${dove.y}) scale(${dove.s})`}>
                    <Path
                      d="M0 0 Q-10 -12 -20 -6 Q-12 0 -6 3 Q-14 8 -20 12 Q-8 10 2 4 Q10 2 14 0 Q10 -3 4 -2 Q0 -12 -10 -14 Q-4 -5 0 0 Z"
                      fill="#FFFBEB"
                      fillOpacity="0.92"
                    />
                  </G>
                ))}
              </Svg>
            </Animated.View>

            {/* Sea of Citizens Waving Miniature Red Flags in Unison */}
            <Animated.View style={[StyleSheet.absoluteFill, crowdFlagsWaveStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {/* Crowd Silhouettes */}
                <Path
                  d="M0 240 L0 198 Q15 186 30 198 Q45 184 60 198 Q75 186 90 198 Q105 183 120 198 Q135 185 150 198 Q165 184 180 198 Q195 186 210 198 Q225 182 240 198 Q255 185 270 198 Q285 184 300 198 Q315 186 330 198 Q345 184 360 198 Q375 186 400 198 L400 240 Z"
                  fill="#1F0707"
                />
                {/* Row of Waving Miniature Red Flags & Golden Stars */}
                {[28, 64, 102, 138, 174, 212, 248, 286, 324, 362].map((fx, idx) => {
                  const fy = 166 + (idx % 2) * 7;
                  return (
                    <G key={`mini-flag-${fx}`} transform={`translate(${fx}, ${fy})`}>
                      <Line x1="0" y1="0" x2="-4" y2="28" stroke="#FDE047" strokeWidth="1.4" />
                      <Rect
                        x="0"
                        y="0"
                        width="24"
                        height="15"
                        rx="1.5"
                        fill="#DC2626"
                        stroke="#FACC15"
                        strokeWidth="0.7"
                      />
                      <Polygon points={MINI_STAR_A} fill="#FACC15" />
                    </G>
                  );
                })}
              </Svg>
            </Animated.View>
          </View>
        )}

        {epochId === 'dien_bien_1954' && (
          <View style={StyleSheet.absoluteFill}>
            {/* Majestic Tây Bắc Mountain Range & Mường Thanh Valley */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              <Path
                d="M0 185 L48 118 L96 154 L156 96 L216 148 L278 104 L338 148 L378 116 L400 138 L400 240 L0 240 Z"
                fill="#111C2D"
                fillOpacity="0.78"
              />
              <Path
                d="M0 196 L72 138 L138 174 L210 132 L284 176 L354 136 L400 165 L400 240 L0 240 Z"
                fill="#1E293B"
                fillOpacity="0.85"
              />
              {/* Victory Flare Streaks Rising from Mường Thanh Valley */}
              <Line x1="126" y1="165" x2="112" y2="74" stroke="#FACC15" strokeWidth="1.8" strokeDasharray="4 4" strokeOpacity="0.75" />
              <Circle cx="112" cy="72" r="4" fill="#FEF08A" />
              <Line x1="322" y1="158" x2="338" y2="66" stroke="#FB923C" strokeWidth="1.8" strokeDasharray="4 4" strokeOpacity="0.75" />
              <Circle cx="338" cy="64" r="4.5" fill="#FDE047" />
            </Svg>

            {/* Animated Xe Đạp Thồ (Supply Bicycles) Climbing the Tây Bắc Slope */}
            <Animated.View style={[StyleSheet.absoluteFill, bicycleConvoyStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {[
                  { x: 58, y: 156, scale: 0.9 },
                  { x: 96, y: 138, scale: 0.82 },
                ].map((bike, idx) => (
                  <G
                    key={`bike-${idx}`}
                    transform={`translate(${bike.x}, ${bike.y}) rotate(-18) scale(${bike.scale})`}>
                    {/* Rear & Front Bicycle Wheels */}
                    <Circle cx="0" cy="14" r="7" stroke="#FDE047" strokeWidth="1.6" fill="none" />
                    <Circle cx="22" cy="14" r="7" stroke="#FDE047" strokeWidth="1.6" fill="none" />
                    {/* Heavy Supply Sacks on Frame */}
                    <Rect x="-2" y="0" width="24" height="11" rx="4" fill="#A16207" stroke="#FACC15" strokeWidth="1" />
                    {/* Dân Công Hỏa Tuyến Pushing Bicycle */}
                    <Circle cx="-10" cy="1" r="3.5" fill="#FEF08A" />
                    <Path d="M-15 16 L-10 5 L-2 8 L-7 18 Z" fill="#78350F" />
                  </G>
                ))}
              </Svg>
            </Animated.View>

            {/* Curved Roof of De Castries Bunker (Hầm Đờ Cát) & Heroic Soldiers */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              {/* Curved Corrugated Arch of Hầm Đờ Cát */}
              <Path
                d="M126 232 Q232 138 346 232 Z"
                fill="#1F2937"
                stroke="#F59E0B"
                strokeWidth="2"
              />
              {/* Corrugated Steel Ribs on Bunker Roof */}
              <Path
                d="M158 228 Q232 158 312 228 M184 228 Q232 176 286 228"
                stroke="#475569"
                strokeWidth="2"
                fill="none"
              />
              {/* Sandbag Fortifications */}
              {[142, 168, 194, 220, 246, 272, 298].map((sx) => (
                <Rect
                  key={`sandbag-${sx}`}
                  x={sx}
                  y="218"
                  width="22"
                  height="9"
                  rx="4"
                  fill="#78350F"
                  stroke="#B45309"
                  strokeWidth="0.9"
                />
              ))}

              {/* 3 Heroic Điện Biên Soldiers on Top of Hầm Đờ Cát */}
              {/* Left Soldier with Rifle Raised */}
              <Circle cx="206" cy="156" r="4.5" fill="#1E293B" stroke="#FACC15" strokeWidth="1" />
              <Path d="M198 184 L206 161 L214 184 Z" fill="#365314" />
              <Line x1="198" y1="168" x2="188" y2="142" stroke="#FDE047" strokeWidth="1.8" />

              {/* Center Lead Soldier Holding Flagstaff */}
              <Circle cx="232" cy="146" r="5" fill="#1E293B" stroke="#FACC15" strokeWidth="1.2" />
              <Path d="M223 180 L232 152 L242 180 Z" fill="#3F6212" />

              {/* Right Soldier Cheering */}
              <Circle cx="258" cy="158" r="4.5" fill="#1E293B" stroke="#FACC15" strokeWidth="1" />
              <Path d="M250 184 L258 163 L266 184 Z" fill="#365314" />
            </Svg>

            {/* Energetic Waving Victory Flag on Hầm Đờ Cát Roof */}
            <Animated.View style={[StyleSheet.absoluteFill, bunkerFlagSoldierStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                <Line x1="236" y1="176" x2="246" y2="96" stroke="#FEF08A" strokeWidth="2.2" />
                <Path
                  d="M246 98 Q276 90 304 100 L298 128 Q272 120 243 126 Z"
                  fill="#DC2626"
                  stroke="#FACC15"
                  strokeWidth="1.1"
                />
                <Polygon
                  points={buildFivePointStarPoints(273, 112, 8, 3.2)}
                  fill="#FACC15"
                />
              </Svg>
            </Animated.View>
          </View>
        )}

        {epochId === 'thong_nhat_1975' && (
          <View style={StyleSheet.absoluteFill}>
            {/* Celebratory Fireworks Above Dinh Độc Lập */}
            <Animated.View style={[StyleSheet.absoluteFill, victoryFireworksStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {[
                  { cx: 162, cy: 56, r: 22, color: '#FACC15' },
                  { cx: 326, cy: 52, r: 26, color: '#34D399' },
                  { cx: 244, cy: 38, r: 18, color: '#FB923C' },
                ].map((fw, idx) => (
                  <G key={`fw-${idx}`}>
                    {STAR_ANGLES.map((deg) => {
                      const rad = (deg * Math.PI) / 180;
                      const x2 = fw.cx + fw.r * Math.cos(rad);
                      const y2 = fw.cy + fw.r * Math.sin(rad);
                      return (
                        <Line
                          key={`fw-ray-${idx}-${deg}`}
                          x1={fw.cx}
                          y1={fw.cy}
                          x2={x2}
                          y2={y2}
                          stroke={fw.color}
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      );
                    })}
                    <Circle cx={fw.cx} cy={fw.cy} r="3.5" fill="#FEF9C3" />
                  </G>
                ))}
              </Svg>
            </Animated.View>

            {/* Detailed Facade of Dinh Độc Lập (Independence Palace) & Open Gates */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              {/* Palace Main Horizontal Modernist Wings */}
              <Rect x="154" y="128" width="212" height="58" rx="2" fill="#0F172A" stroke="#FACC15" strokeWidth="1.1" />
              <Rect x="166" y="106" width="188" height="24" fill="#1E293B" stroke="#FDE047" strokeWidth="1" />
              {/* Central Upper Tower of Dinh Độc Lập */}
              <Rect x="228" y="84" width="64" height="24" fill="#1E293B" stroke="#FACC15" strokeWidth="1.2" />
              {/* Rooftop Flagpole with Liberation Flag Flying */}
              <Line x1="260" y1="54" x2="260" y2="84" stroke="#FEF08A" strokeWidth="1.8" />
              <Rect x="260" y="54" width="22" height="7" fill="#DC2626" />
              <Rect x="260" y="61" width="22" height="7" fill="#0284C7" />
              <Circle cx="271" cy="61" r="3" fill="#FACC15" />

              {/* Iconic White Bamboo-Style Vertical Colonnade Screens */}
              {[176, 190, 204, 218, 232, 246, 260, 274, 288, 302, 316, 330, 344].map((lx) => (
                <Line
                  key={`screen-${lx}`}
                  x1={lx}
                  y1="108"
                  x2={lx}
                  y2="178"
                  stroke="#E2E8F0"
                  strokeWidth="2.2"
                  strokeOpacity="0.65"
                />
              ))}

              {/* Dinh Độc Lập Gate Pillars & Fallen/Open Iron Gates */}
              <Rect x="134" y="142" width="10" height="56" fill="#CBD5E1" stroke="#F59E0B" strokeWidth="1" />
              <Rect x="366" y="142" width="10" height="56" fill="#CBD5E1" stroke="#F59E0B" strokeWidth="1" />
              {/* Knocked-open Iron Gate Wing on the Ground */}
              <Polygon
                points="242,198 310,186 322,202 252,210"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.8"
              />
              {/* Ground Boulevard */}
              <Rect x="0" y="196" width="400" height="44" fill="#0B1320" />
            </Svg>

            {/* Animated Liberation Tank Rolling Through Dinh Độc Lập Gate */}
            <Animated.View style={[StyleSheet.absoluteFill, tank390AnimatedStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                <G transform="translate(116, 142)">
                  {/* Tank Caterpillar Track Assembly */}
                  <Rect
                    x="6"
                    y="38"
                    width="112"
                    height="20"
                    rx="10"
                    fill="#1E293B"
                    stroke="#FACC15"
                    strokeWidth="1.5"
                  />
                  {/* 5 Detailed Road Wheels */}
                  {[22, 42, 62, 82, 102].map((wx) => (
                    <G key={`wheel-${wx}`}>
                      <Circle
                        cx={wx}
                        cy="48"
                        r="7.5"
                        fill="#0F172A"
                        stroke="#94A3B8"
                        strokeWidth="1.8"
                      />
                      <Circle cx={wx} cy="48" r="2.5" fill="#FACC15" />
                    </G>
                  ))}

                  {/* Tank Sloped Armor Hull */}
                  <Polygon
                    points="0,38 18,22 108,22 124,38"
                    fill="#15803D"
                    stroke="#86EFAC"
                    strokeWidth="1.2"
                  />
                  {/* Rounded T-54B Turret */}
                  <Path
                    d="M34 22 Q40 4 74 4 Q94 6 98 22 Z"
                    fill="#166534"
                    stroke="#86EFAC"
                    strokeWidth="1.2"
                  />
                  {/* Bold Golden 5-Pointed Star Emblem on Hull & Turret */}
                  <Circle
                    cx="66"
                    cy="30"
                    r="6.8"
                    fill="#B91C1C"
                    stroke="#FEF08A"
                    strokeWidth="1"
                  />
                  <Polygon
                    points={buildFivePointStarPoints(66, 30, 5.8, 2.3)}
                    fill="#FACC15"
                    stroke="#FEF9C3"
                    strokeWidth="0.6"
                  />
                  <Line x1="48" y1="30" x2="57" y2="30" stroke="#FDE047" strokeWidth="1.4" strokeLinecap="round" />
                  <Line x1="75" y1="30" x2="84" y2="30" stroke="#FDE047" strokeWidth="1.4" strokeLinecap="round" />
                  <Polygon
                    points={buildFivePointStarPoints(66, 13, 6.2, 2.5)}
                    fill="#FACC15"
                    stroke="#FEF9C3"
                    strokeWidth="0.7"
                  />

                  {/* Main Tank Cannon Barrel Pointing Forward */}
                  <Rect
                    x="94"
                    y="10"
                    width="54"
                    height="5"
                    rx="2"
                    transform="rotate(-5 94 10)"
                    fill="#14532D"
                    stroke="#86EFAC"
                    strokeWidth="1"
                  />
                  <Rect
                    x="136"
                    y="4"
                    width="12"
                    height="7.5"
                    rx="2"
                    fill="#166534"
                    stroke="#FACC15"
                    strokeWidth="0.9"
                  />

                  {/* Heroic Liberation Soldier Atop Turret Waving Liberation Flag */}
                  <Circle cx="58" cy="-4" r="4.2" fill="#FEF08A" />
                  <Path d="M51 6 L58 -1 L66 6 Z" fill="#14532D" />
                  <Line x1="64" y1="4" x2="72" y2="-22" stroke="#FEF08A" strokeWidth="1.6" />
                  <Rect x="72" y="-22" width="22" height="6.5" fill="#DC2626" />
                  <Rect x="72" y="-15.5" width="22" height="6.5" fill="#0284C7" />
                  <Circle cx="83" cy="-15.5" r="2.8" fill="#FACC15" />
                </G>
              </Svg>
            </Animated.View>
          </View>
        )}

        {epochId === 'ky_nguyen_moi' && (
          <View style={StyleSheet.absoluteFill}>
            {/* Modern Vietnam Skyline + Heritage Khuê Văn Các & Glowing Digital Constellation */}
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 400 240"
              preserveAspectRatio="none">
              {/* Digital Constellation Circuit Lines in the Sky */}
              <Path
                d="M135 88 L178 62 L228 76 L278 48 L334 68 L368 42"
                stroke="#38BDF8"
                strokeWidth="1.3"
                strokeDasharray="4 4"
                fill="none"
                opacity="0.7"
              />
              {[
                { x: 135, y: 88 },
                { x: 178, y: 62 },
                { x: 228, y: 76 },
                { x: 278, y: 48 },
                { x: 334, y: 68 },
                { x: 368, y: 42 },
              ].map((pt, idx) => (
                <Circle
                  key={`node-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.2"
                  fill="#38BDF8"
                  stroke="#E0F2FE"
                  strokeWidth="1"
                />
              ))}

              {/* Heritage Khuê Văn Các Pavilion + Modern High-Tech Vietnam Towers & Cable Bridge */}
              {/* Cable-stayed bridge silhouette */}
              <Path
                d="M80 194 L118 134 L156 194 M118 134 L118 202"
                stroke="#38BDF8"
                strokeWidth="1.5"
                strokeOpacity="0.65"
                fill="none"
              />
              {/* Khuê Văn Các Heritage Silhouette */}
              <Path
                d="M158 164 L206 164 L198 154 L166 154 Z M164 178 L200 178 L200 164 L164 164 Z"
                fill="#B45309"
                stroke="#FACC15"
                strokeWidth="1"
              />
              <Circle cx="182" cy="171" r="5" stroke="#FEF08A" strokeWidth="1.4" fill="none" />

              {/* Modern Spire Skyscrapers */}
              <Polygon
                points="318,196 332,96 346,196"
                fill="#0F172A"
                stroke="#38BDF8"
                strokeWidth="1.3"
              />
              <Line x1="332" y1="74" x2="332" y2="96" stroke="#FACC15" strokeWidth="1.8" />
              <Rect
                x="352"
                y="132"
                width="24"
                height="64"
                fill="#1E293B"
                stroke="#38BDF8"
                strokeWidth="1"
              />
              <Rect x="0" y="194" width="400" height="46" fill="#090D16" />
            </Svg>

            {/* Soaring Golden Lạc Birds Rising Toward the Stars */}
            <Animated.View style={[StyleSheet.absoluteFill, soaringBirdsStyle]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                {[
                  { x: 152, y: 108, s: 1 },
                  { x: 196, y: 86, s: 0.85 },
                  { x: 294, y: 98, s: 0.9 },
                ].map((bird, idx) => (
                  <G
                    key={`future-bird-${idx}`}
                    transform={`translate(${bird.x}, ${bird.y}) scale(${bird.s})`}>
                    <Path
                      d="M-18 4 Q0 -10 18 4 L26 -3 Q8 10 0 11 Q-8 10 -26 -3 Z"
                      fill="#FACC15"
                    />
                  </G>
                ))}
              </Svg>
            </Animated.View>

            {/* Radiant Levitating Heritage & Future Shield Crest (Pure Visual Chim Lạc & Trống Đồng) */}
            <Animated.View style={[StyleSheet.absoluteFill, emblem10T4Style]}>
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 400 240"
                preserveAspectRatio="none">
                <Defs>
                  <RadialGradient id="crest10T4Glow" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset="0" stopColor="#FACC15" stopOpacity="0.52" />
                    <Stop offset="0.55" stopColor="#38BDF8" stopOpacity="0.24" />
                    <Stop offset="1" stopColor="#000000" stopOpacity="0" />
                  </RadialGradient>
                </Defs>
                <Circle cx="246" cy="128" r="58" fill="url(#crest10T4Glow)" />
                {/* Shield Emblem */}
                <Path
                  d="M210 96 L282 96 L282 134 Q282 164 246 176 Q210 164 210 134 Z"
                  fill="#172554"
                  fillOpacity="0.92"
                  stroke="#FACC15"
                  strokeWidth="2"
                />
                {/* Inner Đông Sơn Golden Shield Rim */}
                <Path
                  d="M215 101 L277 101 L277 133 Q277 159 246 170 Q215 159 215 133 Z"
                  fill="none"
                  stroke="#FDE047"
                  strokeWidth="0.9"
                  strokeDasharray="3 2"
                  strokeOpacity="0.7"
                />
                {/* Radiant Golden Chim Lạc Soaring Inside Top of Shield Crest */}
                <G transform="translate(246, 115)">
                  <Path
                    d="M-23 3 Q-10 -9 0 -2 Q10 -9 23 3 L30 -4 Q14 8 0 9 Q-14 8 -30 -4 Z"
                    fill="#FDE047"
                    stroke="#FEF9C3"
                    strokeWidth="0.7"
                  />
                  {/* Chim Lạc Head, Beak, Crest & Tail Plumes */}
                  <Path
                    d="M-2 -2 L14 -5 L4 1 Z M-4 -2 L-14 -8 L-8 0 Z M0 8 L-10 15 L-2 9 Z M0 8 L10 15 L2 9 Z"
                    fill="#FACC15"
                  />
                  <Circle cx="3" cy="-2.5" r="1.2" fill="#FFFBEB" />
                </G>

                {/* 14-Pointed Trống Đồng Đông Sơn Sun Star & Sawtooth Ring Inside Shield Crest */}
                <Circle
                  cx="246"
                  cy="145"
                  r="20.5"
                  stroke="#F59E0B"
                  strokeWidth="1"
                  strokeOpacity="0.75"
                  fill="none"
                />
                <Polygon
                  points={SHIELD_SAWTOOTH_RING}
                  stroke="#FDE047"
                  strokeWidth="0.85"
                  strokeOpacity="0.7"
                  fill="none"
                />
                <Circle
                  cx="246"
                  cy="145"
                  r="14.5"
                  stroke="#FEF08A"
                  strokeWidth="0.9"
                  strokeOpacity="0.8"
                  fill="none"
                />
                <Polygon
                  points={SHIELD_DONG_SON_STAR}
                  fill="#FACC15"
                  stroke="#FEF9C3"
                  strokeWidth="0.85"
                />
                <Circle cx="246" cy="145" r="3.5" fill="#FEF9C3" />
              </Svg>
            </Animated.View>
          </View>
        )}
      </Animated.View>

      {/* Layer 6: Continuous Floating Golden Embers & Heroic Stars */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, emberLayerAStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="none">
          <Circle cx="52" cy="186" r="2.2" fill="#FEF08A" />
          <Circle cx="128" cy="168" r="2.8" fill="#FACC15" />
          <Circle cx="214" cy="192" r="2" fill="#FDE047" />
          <Circle cx="292" cy="172" r="2.6" fill="#FACC15" />
          <Circle cx="358" cy="184" r="2.2" fill="#FEF08A" />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, emberLayerBStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 400 240" preserveAspectRatio="none">
          <Circle cx="88" cy="144" r="2" fill="#FDE047" />
          <Circle cx="174" cy="128" r="2.5" fill="#FEF9C3" />
          <Circle cx="264" cy="142" r="1.8" fill="#FACC15" />
          <Circle cx="332" cy="118" r="2.4" fill="#FEF08A" />
        </Svg>
      </Animated.View>

      {/* Layer 7: Interactive Touch / Epoch Transition Firework Spark Burst */}
      <Animated.View pointerEvents="none" style={[styles.burstWrap, burstOverlayStyle]}>
        <Svg width={220} height={220} viewBox="0 0 220 220">
          <Circle
            cx="110"
            cy="110"
            r="68"
            stroke="#FACC15"
            strokeWidth="2"
            strokeDasharray="6 6"
            fill="none"
          />
          <Circle
            cx="110"
            cy="110"
            r="44"
            stroke="#FEF08A"
            strokeWidth="1.5"
            fill="none"
            opacity="0.75"
          />
          {STAR_ANGLES.map((deg, idx) => {
            const rad = (deg * Math.PI) / 180;
            const rInner = 24;
            const rOuter = idx % 2 === 0 ? 88 : 66;
            const x1 = 110 + rInner * Math.cos(rad);
            const y1 = 110 + rInner * Math.sin(rad);
            const x2 = 110 + rOuter * Math.cos(rad);
            const y2 = 110 + rOuter * Math.sin(rad);
            return (
              <G key={`burst-spark-${deg}`}>
                <Line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#FDE047"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <Circle cx={x2} cy={y2} r="3.2" fill="#FEF9C3" />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* Bottom Cinematic Vignette Gradient */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', 'rgba(8,12,21,0.52)', 'rgba(8,12,21,0.85)']}
        locations={[0, 0.65, 1]}
        style={styles.bottomVignette}
      />

      {/* Layer 8A: Pair of Golden Chim Lạc Silhouettes Gliding Across the Top Sky */}
      <Animated.View
        pointerEvents="none"
        style={[styles.skyChimLacWrap, skyChimLacPairStyle]}>
        <Svg width={156} height={42} viewBox="0 0 156 42">
          {/* Lead Golden Chim Lạc */}
          <G transform="translate(96, 17)">
            <Path
              d="M-22 3 Q-9 -8 0 -1 Q10 -8 22 3 L29 -3 Q13 7 0 8 Q-13 7 -29 -3 Z"
              fill="#FDE047"
              fillOpacity="0.9"
            />
            <Path
              d="M0 -1 L15 -4 L5 2 Z M-3 -1 L-13 -7 L-7 1 Z M-2 6 L-18 11 L-9 5 Z"
              fill="#FACC15"
            />
            <Circle cx="4" cy="-1.5" r="1.1" fill="#FEF9C3" />
          </G>
          {/* Companion Golden Chim Lạc */}
          <G transform="translate(44, 24) scale(0.78)">
            <Path
              d="M-22 3 Q-9 -8 0 -1 Q10 -8 22 3 L29 -3 Q13 7 0 8 Q-13 7 -29 -3 Z"
              fill="#FACC15"
              fillOpacity="0.82"
            />
            <Path
              d="M0 -1 L15 -4 L5 2 Z M-3 -1 L-13 -7 L-7 1 Z M-2 6 L-18 11 L-9 5 Z"
              fill="#FDE047"
            />
          </G>
        </Svg>
      </Animated.View>

      {/* Layer 8B: Engraved Golden Đông Sơn Sawtooth & Spiral Corner Brackets (4 Corners) */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Top-Left Đông Sơn Corner Bracket */}
        <Svg width={56} height={56} viewBox="0 0 56 56" style={styles.cornerTopLeft}>
          <Path
            d="M4 44 L4 8 Q4 4 8 4 L44 4"
            stroke="#FACC15"
            strokeWidth="1.8"
            strokeOpacity="0.78"
            fill="none"
          />
          <Path
            d="M9 36 L9 11 L14 8 L19 11 L24 8 L29 11 L34 8 L38 11"
            stroke="#FDE047"
            strokeWidth="0.95"
            strokeOpacity="0.62"
            fill="none"
          />
          <Circle cx="10" cy="10" r="2.2" fill="#FACC15" />
        </Svg>

        {/* Top-Right Đông Sơn Corner Bracket */}
        <Svg width={56} height={56} viewBox="0 0 56 56" style={styles.cornerTopRight}>
          <Path
            d="M52 44 L52 8 Q52 4 48 4 L12 4"
            stroke="#FACC15"
            strokeWidth="1.8"
            strokeOpacity="0.78"
            fill="none"
          />
          <Path
            d="M47 36 L47 11 L42 8 L37 11 L32 8 L27 11 L22 8 L18 11"
            stroke="#FDE047"
            strokeWidth="0.95"
            strokeOpacity="0.62"
            fill="none"
          />
          <Circle cx="46" cy="10" r="2.2" fill="#FACC15" />
        </Svg>

        {/* Bottom-Left Đông Sơn Corner Bracket */}
        <Svg width={56} height={56} viewBox="0 0 56 56" style={styles.cornerBottomLeft}>
          <Path
            d="M4 12 L4 48 Q4 52 8 52 L44 52"
            stroke="#FACC15"
            strokeWidth="1.8"
            strokeOpacity="0.78"
            fill="none"
          />
          <Path
            d="M9 20 L9 45 L14 48 L19 45 L24 48 L29 45 L34 48 L38 45"
            stroke="#FDE047"
            strokeWidth="0.95"
            strokeOpacity="0.62"
            fill="none"
          />
          <Circle cx="10" cy="46" r="2.2" fill="#FACC15" />
        </Svg>

        {/* Bottom-Right Đông Sơn Corner Bracket */}
        <Svg width={56} height={56} viewBox="0 0 56 56" style={styles.cornerBottomRight}>
          <Path
            d="M52 12 L52 48 Q52 52 48 52 L12 52"
            stroke="#FACC15"
            strokeWidth="1.8"
            strokeOpacity="0.78"
            fill="none"
          />
          <Path
            d="M47 20 L47 45 L42 48 L37 45 L32 48 L27 45 L22 48 L18 45"
            stroke="#FDE047"
            strokeWidth="0.95"
            strokeOpacity="0.62"
            fill="none"
          />
          <Circle cx="46" cy="46" r="2.2" fill="#FACC15" />
        </Svg>
      </View>

      {/* Layer 8C: Top-Left Pure-Visual Animated 3-Bar Golden Equalizer + Pulsing Đông Sơn Star Pill */}
      <View pointerEvents="none" style={styles.topVisualPillWrap}>
        <View style={styles.simPill}>
          <View style={styles.equalizerWrap}>
            <Animated.View style={[styles.eqBar, { backgroundColor: epoch.accentColor }, eqBar1Style]} />
            <Animated.View style={[styles.eqBar, styles.eqBarTall, { backgroundColor: '#FACC15' }, eqBar2Style]} />
            <Animated.View style={[styles.eqBar, { backgroundColor: epoch.accentColor }, eqBar3Style]} />
          </View>
          <Animated.View style={hudStarPulseStyle}>
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Circle
                cx="10"
                cy="10"
                r="8.8"
                stroke="#FDE047"
                strokeWidth="0.9"
                strokeDasharray="2 2"
                strokeOpacity="0.75"
                fill="none"
              />
              <Polygon
                points={HUD_PILL_STAR}
                fill="#FACC15"
                stroke="#FEF9C3"
                strokeWidth="0.6"
              />
              <Circle cx="10" cy="10" r="2" fill="#FEF9C3" />
            </Svg>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1A090D',
  },
  sunbeamWrap: {
    position: 'absolute',
    top: -12,
    left: '50%',
    marginLeft: -170,
    width: 340,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drumOuterHaloWrap: {
    position: 'absolute',
    top: -38,
    right: -38,
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drumWrap: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagAssemblyWrap: {
    position: 'absolute',
    left: 16,
    top: 38,
    width: 145,
    height: 160,
  },
  flagPoleSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  flagSegmentHoist: {
    position: 'absolute',
    left: 10,
    top: 11,
  },
  flagSegmentCenter: {
    position: 'absolute',
    left: 11,
    top: 10,
  },
  flagSegmentTail: {
    position: 'absolute',
    left: 84,
    top: 12,
  },
  stageLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  burstWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 220,
    height: 220,
    marginTop: -110,
    marginLeft: -110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 68,
  },
  skyChimLacWrap: {
    position: 'absolute',
    top: 8,
    left: '34%',
    width: 156,
    height: 42,
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 2,
    left: 2,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 2,
    left: 2,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  topVisualPillWrap: {
    position: 'absolute',
    top: 12,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  simPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(26, 11, 7, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.48)',
  },
  equalizerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2.5,
    height: 12,
  },
  eqBar: {
    width: 2.6,
    height: 9.5,
    borderRadius: 2,
  },
  eqBarTall: {
    height: 12,
  },
});
