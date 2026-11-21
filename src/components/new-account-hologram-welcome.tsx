/**
 * Full-Screen First-Boot "Xin chào" & Near-Full-Screen Crystalline Moving Heart + 10T4 Hologram Welcome Experience.
 *
 * Triggered exclusively when a brand-new account is registered (`canEnterApp && isNewAccountWelcomePending`).
 * Inspired by a brand-new smartphone's first-boot "Xin chào / Hello" screen, combined with:
 *  1. Near-full-screen 5-layer crystalline parametric heart curve drawn progressively with triple orbiting plasma comets
 *  2. Concentric holographic heart waves & volumetric heart aura expanding across 100% of the viewport
 *  3. Center "10T4" futuristic emblem with 5-layer chromatic aberration hologram movement,
 *     diagonal prism light shimmer sweep, flickering hologram scanlines, and Hologram ID "GVCN Ngô Vũ Hảo".
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';

import { useAuth } from '@/store/auth-store';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* -------------------------------------------------------------------------- */
/* High-Resolution Parametric Crystalline Heart Geometry (600x600 ViewBox)    */
/* -------------------------------------------------------------------------- */

const SVG_SIZE = 600;
const HEART_CX = 300;
const HEART_CY = 286;
const HEART_SCALE = 15.6;
const HEART_SAMPLE_COUNT = 240;

type HeartPoint = {
  x: number;
  y: number;
  len: number;
};

/**
 * Classic parametric heart curve:
 *   x(t) = 16 * sin^3(t)
 *   y(t) = -(13 * cos(t) - 5 * cos(2t) - 2 * cos(3t) - cos(4t))
 * for t in [0, 2π].
 */
function buildHeartGeometry(
  scaleFactor = HEART_SCALE,
  cyOffset = 0,
): {
  points: HeartPoint[];
  fullPath: string;
  totalLength: number;
} {
  const pts: HeartPoint[] = [];
  let runningLength = 0;

  for (let i = 0; i <= HEART_SAMPLE_COUNT; i++) {
    const t = (i / HEART_SAMPLE_COUNT) * Math.PI * 2;
    const rawX = 16 * Math.pow(Math.sin(t), 3);
    const rawY = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    const x = Number((HEART_CX + rawX * scaleFactor).toFixed(2));
    const y = Number((HEART_CY + cyOffset + rawY * scaleFactor).toFixed(2));

    if (i > 0) {
      const prev = pts[i - 1];
      runningLength += Math.hypot(x - prev.x, y - prev.y);
    }
    pts.push({ x, y, len: runningLength });
  }

  const fullPath =
    pts
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ') + ' Z';

  return {
    points: pts,
    fullPath,
    totalLength: Math.ceil(runningLength),
  };
}

// 5 Concentric Harmonic Heart Geometries for 3D Crystalline Hologram Depth
const OUTER_HALO_HEART = buildHeartGeometry(HEART_SCALE * 1.07);
const MAIN_HEART = buildHeartGeometry(HEART_SCALE);
const RIBBON_HEART = buildHeartGeometry(HEART_SCALE * 0.91);
const INNER_HEART = buildHeartGeometry(HEART_SCALE * 0.8);
const CORE_HEART = buildHeartGeometry(HEART_SCALE * 0.66);

const MINI_HEART_PATH =
  'M 12 21.35 l -1.45 -1.32 C 5.4 15.36 2 12.28 2 8.5 C 2 5.42 4.42 3 7.5 3 c 1.74 0 3.41 0.81 4.5 2.09 C 13.09 3.81 14.76 3 16.5 3 C 19.58 3 22 5.42 22 8.5 c 0 3.78 -3.4 6.86 -8.55 11.54 L 12 21.35 Z';

/**
 * Build crystalline facet ribs connecting harmonic vertices between outer, main, and inner heart rings
 * so the heart looks like an engineered 3D holographic crystal.
 */
function buildCrystalFacetRibsPath(): string {
  const step = 10;
  const parts: string[] = [];
  for (let i = 0; i < HEART_SAMPLE_COUNT; i += step) {
    const pMain = MAIN_HEART.points[i];
    const pInner = INNER_HEART.points[(i + 4) % HEART_SAMPLE_COUNT];
    const pPrevInner =
      INNER_HEART.points[(i - 4 + HEART_SAMPLE_COUNT) % HEART_SAMPLE_COUNT];
    if (pMain && pInner && pPrevInner) {
      parts.push(
        `M ${pPrevInner.x} ${pPrevInner.y} L ${pMain.x} ${pMain.y} L ${pInner.x} ${pInner.y}`,
      );
    }
  }
  return parts.join(' ');
}

/**
 * Build 3D glass specular highlight arcs along the upper-left and upper-right heart lobes.
 */
function buildHeartSegmentPath(
  points: HeartPoint[],
  startRatio: number,
  endRatio: number,
): string {
  const startIdx = Math.max(0, Math.floor(startRatio * (points.length - 1)));
  const endIdx = Math.min(points.length - 1, Math.floor(endRatio * (points.length - 1)));
  if (endIdx <= startIdx) return '';
  let d = `M ${points[startIdx].x} ${points[startIdx].y}`;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

const CRYSTAL_FACET_RIBS_PATH = buildCrystalFacetRibsPath();
const RIGHT_LOBE_SPECULAR_PATH = buildHeartSegmentPath(RIBBON_HEART.points, 0.05, 0.21);
const LEFT_LOBE_SPECULAR_PATH = buildHeartSegmentPath(RIBBON_HEART.points, 0.79, 0.95);

// Harmonic vertex indices around the outer halo heart for glowing jewel nodes
const HARMONIC_JEWEL_INDICES = Array.from({ length: 16 }, (_, idx) =>
  Math.floor((idx / 16) * HEART_SAMPLE_COUNT),
);

function buildPartialHeartPath(points: HeartPoint[], endIndex: number): string {
  const clamped = Math.max(1, Math.min(points.length - 1, endIndex));
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i <= clamped; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function buildTrailPath(
  points: HeartPoint[],
  headIndex: number,
  trailSpan: number,
  wrapAround: boolean,
): string {
  const total = points.length - 1;
  if (total <= 1) return '';
  const segments: string[] = [];
  for (let offset = trailSpan; offset >= 0; offset--) {
    let idx = headIndex - offset;
    if (idx < 0) {
      if (!wrapAround) continue;
      idx = ((idx % total) + total) % total;
    }
    const pt = points[idx];
    segments.push(`${segments.length === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`);
  }
  return segments.join(' ');
}

/* -------------------------------------------------------------------------- */
/* First-Boot Multilingual Greeting Cycle ("Xin chào / Hello")                */
/* -------------------------------------------------------------------------- */

const FIRST_BOOT_GREETINGS = [
  { primary: 'Xin chào', sub: 'Chào mừng thành viên mới gia nhập 10T4' },
  { primary: 'Hello · 10T4', sub: 'Không gian Hologram GVCN Ngô Vũ Hảo đã sẵn sàng' },
  { primary: 'Xin chào!', sub: 'Trái tim 10T4 kết nối toàn màn hình' },
  { primary: 'Chào mừng', sub: 'Tập thể lớp 10T4 · Khởi đầu hành trình mới' },
];

type FloatingMiniHeartConfig = {
  id: number;
  angleDeg: number;
  radiusRatio: number;
  size: number;
  delayMs: number;
  durationMs: number;
  color: string;
};

const FLOATING_MINI_HEARTS: FloatingMiniHeartConfig[] = [
  { id: 1, angleDeg: -75, radiusRatio: 0.48, size: 22, delayMs: 120, durationMs: 3100, color: '#FF2A85' },
  { id: 2, angleDeg: -38, radiusRatio: 0.54, size: 17, delayMs: 520, durationMs: 3400, color: '#00F5FF' },
  { id: 3, angleDeg: -8, radiusRatio: 0.52, size: 20, delayMs: 280, durationMs: 3000, color: '#FDE047' },
  { id: 4, angleDeg: 28, radiusRatio: 0.5, size: 24, delayMs: 740, durationMs: 3300, color: '#A855F7' },
  { id: 5, angleDeg: 64, radiusRatio: 0.47, size: 18, delayMs: 410, durationMs: 3500, color: '#FF2A85' },
  { id: 6, angleDeg: 104, radiusRatio: 0.49, size: 16, delayMs: 960, durationMs: 3200, color: '#00F5FF' },
  { id: 7, angleDeg: 142, radiusRatio: 0.53, size: 21, delayMs: 610, durationMs: 3450, color: '#FDE047' },
  { id: 8, angleDeg: 176, radiusRatio: 0.5, size: 17, delayMs: 850, durationMs: 3150, color: '#FB7185' },
  { id: 9, angleDeg: -148, radiusRatio: 0.52, size: 22, delayMs: 230, durationMs: 3350, color: '#38BDF8' },
  { id: 10, angleDeg: -112, radiusRatio: 0.55, size: 18, delayMs: 690, durationMs: 3250, color: '#C084FC' },
  { id: 11, angleDeg: -54, radiusRatio: 0.42, size: 15, delayMs: 1120, durationMs: 2950, color: '#00F5FF' },
  { id: 12, angleDeg: -128, radiusRatio: 0.43, size: 16, delayMs: 480, durationMs: 3050, color: '#FF2A85' },
];

/* -------------------------------------------------------------------------- */
/* Subcomponents: Expanding Full-Screen Heart Ring & Floating Mini Hearts     */
/* -------------------------------------------------------------------------- */

function ExpandingFullScreenHeartWave({
  index,
  totalWaves,
  maxScale,
  color,
  secondaryColor,
}: {
  index: number;
  totalWaves: number;
  maxScale: number;
  color: string;
  secondaryColor: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const initialDelay = 900 + index * 620;
    progress.value = withDelay(
      initialDelay,
      withRepeat(
        withTiming(1, {
          duration: 3800,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [index, progress]);

  const waveStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      progress.value,
      [0, 0.25, 0.72, 1],
      [0.42, 0.96, 1.85, maxScale],
    );
    const opacity = interpolate(
      progress.value,
      [0, 0.14, 0.55, 0.88, 1],
      [0, 0.78 - index * (0.11 / totalWaves), 0.42, 0.16, 0],
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.expandingWaveWrap, waveStyle]}>
      <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
        <Path
          d={MAIN_HEART.fullPath}
          fill="none"
          stroke={color}
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={INNER_HEART.fullPath}
          fill="none"
          stroke={secondaryColor}
          strokeOpacity={0.55}
          strokeWidth={1.3}
          strokeDasharray="10 8"
        />
      </Svg>
    </Animated.View>
  );
}

function FloatingMiniHeart({
  config,
  heartDisplaySize,
}: {
  config: FloatingMiniHeartConfig;
  heartDisplaySize: number;
}) {
  const floatVal = useSharedValue(0);

  useEffect(() => {
    floatVal.value = withDelay(
      config.delayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: config.durationMs,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: config.durationMs,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      ),
    );
  }, [config.delayMs, config.durationMs, floatVal]);

  const rad = (config.angleDeg * Math.PI) / 180;
  const radiusPx = heartDisplaySize * config.radiusRatio;
  const baseX = Math.cos(rad) * radiusPx;
  const baseY = Math.sin(rad) * radiusPx;

  const animatedStyle = useAnimatedStyle(() => {
    const driftY = interpolate(floatVal.value, [0, 1], [10, -26]);
    const driftX = interpolate(floatVal.value, [0, 0.5, 1], [-8, 10, -6]);
    const scale = interpolate(floatVal.value, [0, 0.5, 1], [0.8, 1.24, 0.86]);
    const opacity = interpolate(floatVal.value, [0, 0.5, 1], [0.38, 0.96, 0.44]);
    const rotate = interpolate(floatVal.value, [0, 1], [-16, 18]);

    return {
      opacity,
      transform: [
        { translateX: baseX + driftX },
        { translateY: baseY + driftY },
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.miniHeartParticle, animatedStyle]}>
      <Svg width={config.size} height={config.size} viewBox="0 0 24 24">
        <Path d={MINI_HEART_PATH} fill={config.color} />
      </Svg>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Component: NewAccountHologramWelcome                                  */
/* -------------------------------------------------------------------------- */

export function NewAccountHologramWelcome() {
  const { canEnterApp, isNewAccountWelcomePending } = useAuth();

  if (!canEnterApp || !isNewAccountWelcomePending) {
    return null;
  }

  return <NewAccountHologramWelcomeActive />;
}

function NewAccountHologramWelcomeActive() {
  const {
    dismissNewAccountWelcome,
    profile,
    loginId,
    accountRole,
  } = useAuth();

  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Frame-accurate progressive heart drawing & triple orbiting comet state (works identically on Web + iOS + Android)
  const [drawStepIndex, setDrawStepIndex] = useState(1);
  const [orbitHeadIndex, setOrbitHeadIndex] = useState(1);
  const [isHeartFullyDrawn, setIsHeartFullyDrawn] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  // Reanimated shared values
  const overlayOpacity = useSharedValue(0);
  const exitProgress = useSharedValue(0);
  const greetingAnim = useSharedValue(0);
  const heartDrawProgress = useSharedValue(0);
  const heartGrowScale = useSharedValue(0);
  const heartPulse = useSharedValue(0);
  const fullScreenBloom = useSharedValue(0);
  const holoPhase = useSharedValue(0);
  const holoShimmer = useSharedValue(0);
  const holoScanline = useSharedValue(0);
  const ctaReveal = useSharedValue(0);

  // Near-Full-Screen Heart Display Size ("kích thước trái tim to gần full màn hình")
  const heartDisplaySize = useMemo(() => {
    const maxByWidth = screenWidth * 0.98;
    const maxByHeight = screenHeight * 0.68;
    return Math.round(Math.max(380, Math.min(maxByWidth, maxByHeight, 780)));
  }, [screenWidth, screenHeight]);

  // Responsive typography size for the center "10T4" hologram core inside the near-full-screen heart
  const holoCoreFontSize = useMemo(
    () => Math.round(Math.min(76, Math.max(54, heartDisplaySize * 0.132))),
    [heartDisplaySize],
  );

  // Scale needed so the 600x600 heart waves expand beyond the entire screen diagonal
  const fullScreenMaxScale = useMemo(() => {
    const diagonal = Math.hypot(screenWidth, screenHeight);
    return Number(Math.max(2.6, (diagonal / 430) * 1.18).toFixed(2));
  }, [screenWidth, screenHeight]);

  // Trigger celebratory haptics on native
  const fireHaptic = useCallback((type: 'start' | 'complete' | 'enter') => {
    if (Platform.OS === 'web') return;
    if (type === 'start') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else if (type === 'complete') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  // Start full animation choreography when overlay mounts
  useEffect(() => {
    fireHaptic('start');

    overlayOpacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    greetingAnim.value = withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) });

    // Phase 1 (0s -> 2.3s): Progressive heart contour stroke drawing
    heartDrawProgress.value = withTiming(1, {
      duration: 2300,
      easing: Easing.inOut(Easing.cubic),
    });

    // Heart grows smoothly from 0.78x to full near-screen size (1.06x) as it draws & blooms
    heartGrowScale.value = withTiming(1, {
      duration: 2500,
      easing: Easing.out(Easing.cubic),
    });

    // Continuous 3D heart pulse & levitation
    heartPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1550, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1550, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    // Phase 2 (1.0s -> 3.6s): Heart energy expands to fill the entire screen gradually
    fullScreenBloom.value = withDelay(
      950,
      withTiming(1, {
        duration: 2600,
        easing: Easing.out(Easing.cubic),
      }),
    );

    // Center "10T4" continuous Hologram chromatic aberration & 3D tilt
    holoPhase.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    // Diagonal Hologram Light Beam Shimmer across "10T4" & "GVCN Ngô Vũ Hảo"
    holoShimmer.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );

    // Hologram Scanline flicker
    holoScanline.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 880, easing: Easing.linear }),
        withTiming(0.28, { duration: 620, easing: Easing.linear }),
      ),
      -1,
      true,
    );

    // CTA button entrance
    ctaReveal.value = withDelay(
      900,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.1)) }),
    );

    // 60fps requestAnimationFrame loop driving the progressive heart path & triple moving spark comets
    let rafId: number | null = null;
    const startTime = Date.now();
    const DRAW_DURATION_MS = 2300;
    const ORBIT_PERIOD_MS = 3200;
    let markedComplete = false;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed <= DRAW_DURATION_MS) {
        const rawT = Math.min(1, elapsed / DRAW_DURATION_MS);
        const eased =
          rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const idx = Math.max(
          1,
          Math.min(HEART_SAMPLE_COUNT, Math.round(eased * HEART_SAMPLE_COUNT)),
        );
        setDrawStepIndex(idx);
        setOrbitHeadIndex(idx);
      } else {
        if (!markedComplete) {
          markedComplete = true;
          setDrawStepIndex(HEART_SAMPLE_COUNT);
          setIsHeartFullyDrawn(true);
          fireHaptic('complete');
        }
        const orbitElapsed = elapsed - DRAW_DURATION_MS;
        const orbitT = (orbitElapsed % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS;
        const idx = Math.max(
          0,
          Math.min(HEART_SAMPLE_COUNT - 1, Math.floor(orbitT * HEART_SAMPLE_COUNT)),
        );
        setOrbitHeadIndex(idx);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Cycle "Xin chào / Hello" first-boot header subtitles
    const greetingInterval = setInterval(() => {
      setGreetingIndex((prev) => (prev + 1) % FIRST_BOOT_GREETINGS.length);
    }, 2400);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      clearInterval(greetingInterval);
    };
  }, [
    ctaReveal,
    fireHaptic,
    fullScreenBloom,
    greetingAnim,
    heartDrawProgress,
    heartGrowScale,
    heartPulse,
    holoPhase,
    holoScanline,
    holoShimmer,
    overlayOpacity,
  ]);

  // Smooth 400ms exit animation effect when user taps enter or skip
  useEffect(() => {
    if (!isDismissing) return;

    exitProgress.value = withTiming(1, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });

    const timer = setTimeout(() => {
      dismissNewAccountWelcome();
    }, 400);

    return () => clearTimeout(timer);
  }, [dismissNewAccountWelcome, exitProgress, isDismissing]);

  const handleDismiss = useCallback(() => {
    if (isDismissing) return;
    fireHaptic('enter');
    setIsDismissing(true);
  }, [fireHaptic, isDismissing]);

  /* ---------------- Animated Props & Styles ---------------- */

  const heartStrokeAnimatedProps = useAnimatedProps(() => {
    const dashOffset = interpolate(
      heartDrawProgress.value,
      [0, 1],
      [MAIN_HEART.totalLength, 0],
    );
    return {
      strokeDashoffset: dashOffset,
    };
  });

  const rootOverlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * (1 - exitProgress.value),
    transform: [{ scale: interpolate(exitProgress.value, [0, 1], [1, 1.12]) }],
  }));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: greetingAnim.value,
    transform: [
      {
        translateY: interpolate(greetingAnim.value, [0, 1], [-18, 0]),
      },
    ],
  }));

  // Near-full-screen center heart floating, growing & pulsing container
  const centerHeartAnimatedStyle = useAnimatedStyle(() => {
    const grow = interpolate(heartGrowScale.value, [0, 0.65, 1], [0.76, 1.01, 1.06]);
    const pulseDelta = interpolate(heartPulse.value, [0, 1], [-0.025, 0.045]);
    const translateY = interpolate(heartPulse.value, [0, 1], [6, -8]);
    const tiltZ = interpolate(holoPhase.value, [-1, 1], [-1.8, 1.8]);
    return {
      transform: [{ translateY }, { scale: grow + pulseDelta }, { rotateZ: `${tiltZ}deg` }],
    };
  });

  // Full-screen expanding heart backdrop aura ("hiện lên full màn hình dần")
  const fullScreenHeartBackdropStyle = useAnimatedStyle(() => {
    const baseScale = interpolate(
      fullScreenBloom.value,
      [0, 0.45, 1],
      [0.42, 1.15, fullScreenMaxScale * 0.92],
    );
    const breathDelta = interpolate(heartPulse.value, [0, 1], [-0.06, 0.12]);
    const opacity = interpolate(fullScreenBloom.value, [0, 0.3, 1], [0, 0.36, 0.54]);
    return {
      opacity,
      transform: [{ scale: baseScale + breathDelta }],
    };
  });

  // Near-full-screen secondary giant framing heart silhouette
  const nearFullScreenFrameHeartStyle = useAnimatedStyle(() => {
    const scale = interpolate(fullScreenBloom.value, [0, 0.6, 1], [0.55, 1.08, 1.34]);
    const pulse = interpolate(heartPulse.value, [0, 1], [-0.03, 0.04]);
    const opacity = interpolate(fullScreenBloom.value, [0, 0.35, 1], [0, 0.32, 0.58]);
    return {
      opacity,
      transform: [{ scale: scale + pulse }],
    };
  });

  // Hologram "10T4" + "GVCN Ngô Vũ Hảo" multi-layered chromatic aberration styles
  const holoContainerStyle = useAnimatedStyle(() => {
    const floatY = interpolate(heartPulse.value, [0, 1], [3, -6]);
    const scale = interpolate(heartPulse.value, [0, 1], [0.98, 1.04]);
    const rotateZ = interpolate(holoPhase.value, [-1, 1], [-2.1, 2.1]);
    return {
      transform: [{ translateY: floatY }, { scale }, { rotateZ: `${rotateZ}deg` }],
    };
  });

  const cyanGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoPhase.value, [-1, 0, 1], [0.88, 0.58, 0.92]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [-5, 5]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [-2.2, 2]) },
    ],
  }));

  const magentaGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoPhase.value, [-1, 0, 1], [0.9, 0.58, 0.88]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [5, -5]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [2.4, -2]) },
    ],
  }));

  const violetGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.28, 1], [0.45, 0.86]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [-2.8, 3]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [3.5, -3.5]) },
    ],
  }));

  const goldGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.28, 1], [0.38, 0.78]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [2.5, -2.5]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [-3.2, 2.8]) },
    ],
  }));

  const shimmerBeamStyle = useAnimatedStyle(() => {
    const translateX = interpolate(holoShimmer.value, [0, 1], [-180, 180]);
    const opacity = interpolate(
      holoShimmer.value,
      [0, 0.2, 0.5, 0.8, 1],
      [0, 0.88, 1, 0.88, 0],
    );
    return {
      opacity,
      transform: [{ translateX }, { rotateZ: '-24deg' }],
    };
  });

  const scanlineFlickerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.28, 1], [0.24, 0.68]),
    transform: [
      {
        translateY: interpolate(holoShimmer.value, [0, 1], [-22, 22]),
      },
    ],
  }));

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ctaReveal.value,
    transform: [
      {
        translateY: interpolate(ctaReveal.value, [0, 1], [28, 0]),
      },
      {
        scale: interpolate(ctaReveal.value, [0, 1], [0.94, 1]),
      },
    ],
  }));

  /* ---------------- Progressive Heart Path & Triple Spark Computations ---------------- */

  const partialHeartPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? MAIN_HEART.fullPath
        : buildPartialHeartPath(MAIN_HEART.points, drawStepIndex),
    [drawStepIndex, isHeartFullyDrawn],
  );

  const partialRibbonPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? RIBBON_HEART.fullPath
        : buildPartialHeartPath(
            RIBBON_HEART.points,
            Math.max(1, Math.floor(drawStepIndex * 0.92)),
          ),
    [drawStepIndex, isHeartFullyDrawn],
  );

  const primarySparkPoint =
    MAIN_HEART.points[Math.min(MAIN_HEART.points.length - 1, orbitHeadIndex)] ??
    MAIN_HEART.points[0];

  const primaryCometTrailPath = useMemo(
    () => buildTrailPath(MAIN_HEART.points, orbitHeadIndex, 34, isHeartFullyDrawn),
    [isHeartFullyDrawn, orbitHeadIndex],
  );

  const secondaryOrbitIndex =
    (orbitHeadIndex + Math.floor(HEART_SAMPLE_COUNT / 2)) % HEART_SAMPLE_COUNT;
  const secondarySparkPoint =
    MAIN_HEART.points[secondaryOrbitIndex] ?? MAIN_HEART.points[0];

  const secondaryCometTrailPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? buildTrailPath(MAIN_HEART.points, secondaryOrbitIndex, 28, true)
        : '',
    [isHeartFullyDrawn, secondaryOrbitIndex],
  );

  const tertiaryInnerIndex =
    (HEART_SAMPLE_COUNT - (orbitHeadIndex % HEART_SAMPLE_COUNT)) % HEART_SAMPLE_COUNT;
  const tertiaryInnerSparkPoint =
    INNER_HEART.points[tertiaryInnerIndex] ?? INNER_HEART.points[0];

  const tertiaryInnerTrailPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? buildTrailPath(INNER_HEART.points, tertiaryInnerIndex, 20, true)
        : '',
    [isHeartFullyDrawn, tertiaryInnerIndex],
  );

  const activeGreeting = FIRST_BOOT_GREETINGS[greetingIndex] ?? FIRST_BOOT_GREETINGS[0];
  const displayName = profile?.displayName?.trim() || 'Thành viên 10T4';
  const roleLabel =
    accountRole === 'teacher'
      ? 'GV Chủ nhiệm · 10T4'
      : accountRole === 'subject_teacher'
        ? `GV Bộ môn${profile?.subject ? ` (${profile.subject})` : ''}`
        : 'Học sinh · Tập thể 10T4';

  const drawPercentage = isHeartFullyDrawn
    ? 100
    : Math.min(99, Math.round((drawStepIndex / HEART_SAMPLE_COUNT) * 100));

  const crystallineRevealOpacity =
    drawStepIndex > HEART_SAMPLE_COUNT * 0.22
      ? Math.min(1, (drawStepIndex / HEART_SAMPLE_COUNT - 0.22) / 0.78)
      : 0;

  return (
    <Animated.View style={[styles.overlayRoot, rootOverlayAnimatedStyle]}>
      {/* Deep Cosmic OLED Background with Holographic Auroras */}
      <LinearGradient
        colors={['#02040A', '#060A1D', '#0E0522', '#030610']}
        locations={[0, 0.34, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient Top & Bottom Holographic Glow Orbs */}
      <View pointerEvents="none" style={styles.auroraTopLeft}>
        <LinearGradient
          colors={['rgba(0, 245, 255, 0.28)', 'rgba(168, 85, 247, 0.11)', 'transparent']}
          style={styles.auroraGradientFill}
        />
      </View>
      <View pointerEvents="none" style={styles.auroraBottomRight}>
        <LinearGradient
          colors={['rgba(255, 42, 133, 0.3)', 'rgba(253, 224, 71, 0.11)', 'transparent']}
          style={styles.auroraGradientFill}
        />
      </View>

      {/* Full-Screen Progressive Expanding Heart Field ("vẽ hình trái tim di chuyển hiện lên full màn hình dần") */}
      <View pointerEvents="none" style={styles.fullScreenHeartField}>
        {/* Giant Heart Aura that blooms gradually from center to cover 100% of the screen */}
        <Animated.View style={[styles.expandingWaveWrap, fullScreenHeartBackdropStyle]}>
          <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
            <Defs>
              <SvgLinearGradient id="fullScreenHeartAuraGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.34" />
                <Stop offset="48%" stopColor="#FF2A85" stopOpacity="0.28" />
                <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.24" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d={MAIN_HEART.fullPath}
              fill="url(#fullScreenHeartAuraGrad)"
              stroke="#FF2A85"
              strokeOpacity={0.5}
              strokeWidth={2.2}
            />
          </Svg>
        </Animated.View>

        {/* Near-Full-Screen Secondary Framing Heart Halo */}
        <Animated.View
          style={[
            { width: heartDisplaySize, height: heartDisplaySize, position: 'absolute' },
            nearFullScreenFrameHeartStyle,
          ]}>
          <Svg
            width={heartDisplaySize}
            height={heartDisplaySize}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
            <Path
              d={OUTER_HALO_HEART.fullPath}
              fill="none"
              stroke="rgba(0, 245, 255, 0.28)"
              strokeWidth={2}
              strokeDasharray="14 10"
            />
            <Path
              d={MAIN_HEART.fullPath}
              fill="none"
              stroke="rgba(255, 42, 133, 0.24)"
              strokeWidth={3.2}
            />
          </Svg>
        </Animated.View>

        {/* 5 Continuous Concentric Holographic Heart Waves expanding to full screen */}
        <ExpandingFullScreenHeartWave
          index={0}
          totalWaves={5}
          maxScale={fullScreenMaxScale}
          color="#00F5FF"
          secondaryColor="#FF2A85"
        />
        <ExpandingFullScreenHeartWave
          index={1}
          totalWaves={5}
          maxScale={fullScreenMaxScale}
          color="#FF2A85"
          secondaryColor="#FDE047"
        />
        <ExpandingFullScreenHeartWave
          index={2}
          totalWaves={5}
          maxScale={fullScreenMaxScale}
          color="#A855F7"
          secondaryColor="#00F5FF"
        />
        <ExpandingFullScreenHeartWave
          index={3}
          totalWaves={5}
          maxScale={fullScreenMaxScale}
          color="#FDE047"
          secondaryColor="#FF2A85"
        />
        <ExpandingFullScreenHeartWave
          index={4}
          totalWaves={5}
          maxScale={fullScreenMaxScale}
          color="#38BDF8"
          secondaryColor="#A855F7"
        />
      </View>

      {/* Main Content Layout */}
      <View
        style={[
          styles.contentContainer,
          {
            paddingTop: Math.max(insets.top + 8, 18),
            paddingBottom: Math.max(insets.bottom + 12, 20),
          },
        ]}>
        {/* Top Bar: First-Boot Status Pill + Skip Button */}
        <View style={styles.topBar}>
          <View style={styles.bootStatusPill}>
            <View style={styles.bootLiveDot} />
            <Text style={styles.bootStatusText}>
              {isHeartFullyDrawn
                ? 'HOLOGRAM HEART 10T4 · FULL SCREEN'
                : `ĐANG VẼ TRÁI TIM 10T4 · ${drawPercentage}%`}
            </Text>
          </View>

          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            style={({ pressed }) => [
              styles.skipPill,
              pressed && { opacity: 0.78, transform: [{ scale: 0.96 }] },
            ]}>
            <Text style={styles.skipPillText}>Bỏ qua</Text>
            <Ionicons name="chevron-forward" size={14} color="#E2E8F0" />
          </Pressable>
        </View>

        {/* Brand-New Phone First-Boot "Xin chào" Header Section */}
        <Animated.View style={[styles.greetingHeader, headerAnimatedStyle]}>
          <View style={styles.helloMultilingualPill}>
            <Ionicons name="sparkles" size={13} color="#00F5FF" />
            <Text style={styles.helloMultilingualText}>
              Hello · Xin chào · Chào mừng thành viên mới
            </Text>
          </View>

          <Text style={styles.xinChaoHeroTitle}>{activeGreeting.primary}</Text>
          <Text style={styles.xinChaoSubtitle}>{activeGreeting.sub}</Text>

          {/* New Account Identity Chip (Display Name + Login ID + Role) */}
          <View style={styles.accountBadgeRow}>
            <LinearGradient
              colors={['rgba(0, 245, 255, 0.16)', 'rgba(255, 42, 133, 0.16)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.accountIdentityChip}>
              <Ionicons name="person-circle-outline" size={17} color="#00F5FF" />
              <Text numberOfLines={1} style={styles.accountNameText}>
                {displayName}
              </Text>
              {loginId ? (
                <View style={styles.loginIdTag}>
                  <Text style={styles.loginIdTagText}>ID: {loginId}</Text>
                </View>
              ) : null}
              <View style={styles.roleTag}>
                <Text style={styles.roleTagText}>{roleLabel}</Text>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Center Stage: Near-Full-Screen Crystalline Moving Heart + Center "10T4" & "GVCN Ngô Vũ Hảo" Hologram */}
        <View style={styles.heartStageWrap}>
          {/* 12 Floating & Orbiting Mini Heart Particles scaled around the near-full-screen heart */}
          {FLOATING_MINI_HEARTS.map((item) => (
            <FloatingMiniHeart
              key={item.id}
              config={item}
              heartDisplaySize={heartDisplaySize}
            />
          ))}

          <Animated.View
            style={[
              styles.centerHeartCanvas,
              { width: heartDisplaySize, height: heartDisplaySize },
              centerHeartAnimatedStyle,
            ]}>
            <Svg
              width={heartDisplaySize}
              height={heartDisplaySize}
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
              <Defs>
                {/* 5-Stop Iridescent Master Hologram Heart Stroke Gradient */}
                <SvgLinearGradient id="heartHoloStroke" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#00F5FF" />
                  <Stop offset="26%" stopColor="#38BDF8" />
                  <Stop offset="52%" stopColor="#FF2A85" />
                  <Stop offset="78%" stopColor="#A855F7" />
                  <Stop offset="100%" stopColor="#FDE047" />
                </SvgLinearGradient>

                {/* Volumetric Outer Neon Glow Gradient */}
                <SvgLinearGradient id="heartOuterGlowGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.42" />
                  <Stop offset="50%" stopColor="#FF2A85" stopOpacity="0.48" />
                  <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.42" />
                </SvgLinearGradient>

                {/* Counter-Phased Ribbon Heart Gradient */}
                <SvgLinearGradient id="ribbonHoloStroke" x1="1" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#FDE047" stopOpacity="0.85" />
                  <Stop offset="50%" stopColor="#00F5FF" stopOpacity="0.75" />
                  <Stop offset="100%" stopColor="#FF2A85" stopOpacity="0.85" />
                </SvgLinearGradient>

                {/* Primary Comet Tail Gradient */}
                <SvgLinearGradient id="cometTrailGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="45%" stopColor="#00F5FF" stopOpacity="0.92" />
                  <Stop offset="80%" stopColor="#FF2A85" stopOpacity="0.55" />
                  <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.15" />
                </SvgLinearGradient>

                {/* Inner Holographic Glass Fill */}
                <SvgLinearGradient id="heartInnerFill" x1="0.15" y1="0" x2="0.85" y2="1">
                  <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.22" />
                  <Stop offset="48%" stopColor="#FF2A85" stopOpacity="0.18" />
                  <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.26" />
                </SvgLinearGradient>

                {/* Radial Volumetric Core Heart Glow */}
                <SvgRadialGradient
                  id="heartRadialCore"
                  cx="50%"
                  cy="47%"
                  rx="46%"
                  ry="46%">
                  <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.28" />
                  <Stop offset="45%" stopColor="#FF2A85" stopOpacity="0.18" />
                  <Stop offset="80%" stopColor="#A855F7" stopOpacity="0.09" />
                  <Stop offset="100%" stopColor="#040711" stopOpacity="0" />
                </SvgRadialGradient>

                {/* 3D Specular Glass Highlight Gradient */}
                <SvgLinearGradient id="lobeSpecularGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.78" />
                  <Stop offset="60%" stopColor="#67E8F9" stopOpacity="0.35" />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>

              {/* Layer 0: Outer Cyber-Hologram Halo Heart Track & Harmonic Jewel Nodes */}
              <Path
                d={OUTER_HALO_HEART.fullPath}
                fill="none"
                stroke="rgba(0, 245, 255, 0.24)"
                strokeWidth={1.6}
                strokeDasharray="6 9"
              />
              {HARMONIC_JEWEL_INDICES.map((ptIdx, idx) => {
                const pt = OUTER_HALO_HEART.points[ptIdx];
                if (!pt) return null;
                const isGold = idx % 3 === 0;
                const isMagenta = idx % 3 === 1;
                return (
                  <G key={`jewel-${ptIdx}`}>
                    <Circle
                      cx={pt.x}
                      cy={pt.y}
                      r={5.5}
                      fill={
                        isGold
                          ? 'rgba(253, 224, 71, 0.22)'
                          : isMagenta
                            ? 'rgba(255, 42, 133, 0.24)'
                            : 'rgba(0, 245, 255, 0.24)'
                      }
                    />
                    <Circle
                      cx={pt.x}
                      cy={pt.y}
                      r={2.2}
                      fill={isGold ? '#FDE047' : isMagenta ? '#FF2A85' : '#00F5FF'}
                    />
                  </G>
                );
              })}

              {/* Layer 1: Faint Blueprint Guide Track of the Main Heart */}
              <Path
                d={MAIN_HEART.fullPath}
                fill="none"
                stroke="rgba(255, 42, 133, 0.18)"
                strokeWidth={2}
                strokeDasharray="8 8"
              />

              {/* Layer 2: Crystalline Facet Ribs, Volumetric Radial Core & Inner Harmonic Hearts */}
              {crystallineRevealOpacity > 0 ? (
                <G opacity={crystallineRevealOpacity}>
                  {/* Volumetric Radial Core Glow & Iridescent Glass Fill */}
                  <Path d={MAIN_HEART.fullPath} fill="url(#heartInnerFill)" />
                  <Path d={MAIN_HEART.fullPath} fill="url(#heartRadialCore)" />

                  {/* Crystalline Geometric Facet Web connecting Main & Inner Heart Rings */}
                  <Path
                    d={CRYSTAL_FACET_RIBS_PATH}
                    fill="none"
                    stroke="rgba(0, 245, 255, 0.18)"
                    strokeWidth={1.1}
                  />

                  {/* Concentric Inner Heart Ring (0.80x) */}
                  <Path
                    d={INNER_HEART.fullPath}
                    fill="none"
                    stroke="rgba(0, 245, 255, 0.42)"
                    strokeWidth={1.8}
                    strokeDasharray="10 7"
                  />

                  {/* Deep Core Harmonic Heart Ring (0.66x) */}
                  <Path
                    d={CORE_HEART.fullPath}
                    fill="none"
                    stroke="rgba(255, 42, 133, 0.36)"
                    strokeWidth={1.5}
                  />

                  {/* 3D Glass Specular Highlights on Left & Right Heart Lobes */}
                  <Path
                    d={RIGHT_LOBE_SPECULAR_PATH}
                    fill="none"
                    stroke="url(#lobeSpecularGrad)"
                    strokeWidth={4.2}
                    strokeLinecap="round"
                  />
                  <Path
                    d={LEFT_LOBE_SPECULAR_PATH}
                    fill="none"
                    stroke="url(#lobeSpecularGrad)"
                    strokeWidth={4.2}
                    strokeLinecap="round"
                  />
                </G>
              ) : null}

              {/* Layer 3: Secondary Counter-Phased Holographic Ribbon Heart (0.91x) */}
              <Path
                d={partialRibbonPath}
                fill="none"
                stroke="url(#ribbonHoloStroke)"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Layer 4: Native UI-thread Animated Wide Bloom Stroke */}
              {Platform.OS !== 'web' ? (
                <AnimatedPath
                  d={MAIN_HEART.fullPath}
                  fill="none"
                  stroke="rgba(255, 42, 133, 0.22)"
                  strokeWidth={24}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${MAIN_HEART.totalLength} ${MAIN_HEART.totalLength}`}
                  animatedProps={heartStrokeAnimatedProps}
                />
              ) : null}

              {/* Layer 5: Progressive Drawn Outer Volumetric Neon Halo (100% Web + iOS + Android) */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="rgba(255, 42, 133, 0.25)"
                strokeWidth={22}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Layer 6: Progressive Drawn Mid Holographic Glow Stroke */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="url(#heartOuterGlowGrad)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Layer 7: Progressive Drawn Master 5-Stop Iridescent Hologram Heart Path */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="url(#heartHoloStroke)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Layer 8: Progressive Drawn High-Energy White/Cyan Plasma Filament Centerline */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="#F0F9FF"
                strokeOpacity={0.92}
                strokeWidth={2.1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Moving Comet Trail 1 (Primary Drawing Brush Comet) */}
              {primaryCometTrailPath ? (
                <Path
                  d={primaryCometTrailPath}
                  fill="none"
                  stroke="url(#cometTrailGrad)"
                  strokeWidth={10.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Moving Comet Trail 2 (Counter-orbiting cyan/gold energy stream on Main Heart) */}
              {secondaryCometTrailPath ? (
                <Path
                  d={secondaryCometTrailPath}
                  fill="none"
                  stroke="#00F5FF"
                  strokeOpacity={0.78}
                  strokeWidth={6.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Moving Comet Trail 3 (Inner Heart Ring Golden-Rose Energy Stream) */}
              {tertiaryInnerTrailPath ? (
                <Path
                  d={tertiaryInnerTrailPath}
                  fill="none"
                  stroke="#FDE047"
                  strokeOpacity={0.72}
                  strokeWidth={4.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Moving Spark / Comet Head 1 (Primary Plasma Orb) */}
              <G>
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={20}
                  fill="rgba(0, 245, 255, 0.24)"
                />
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={11.5}
                  fill="rgba(255, 42, 133, 0.72)"
                />
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={5.5}
                  fill="#FFFFFF"
                />
              </G>

              {/* Moving Spark / Comet Head 2 & 3 (Active once heart completes) */}
              {isHeartFullyDrawn ? (
                <G>
                  {/* Comet Head 2 on Main Heart */}
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={15}
                    fill="rgba(253, 224, 71, 0.28)"
                  />
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={8}
                    fill="#00F5FF"
                  />
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={3.8}
                    fill="#FFFFFF"
                  />

                  {/* Comet Head 3 on Inner Heart Ring */}
                  <Circle
                    cx={tertiaryInnerSparkPoint.x}
                    cy={tertiaryInnerSparkPoint.y}
                    r={11}
                    fill="rgba(255, 42, 133, 0.28)"
                  />
                  <Circle
                    cx={tertiaryInnerSparkPoint.x}
                    cy={tertiaryInnerSparkPoint.y}
                    r={5.5}
                    fill="#FDE047"
                  />
                  <Circle
                    cx={tertiaryInnerSparkPoint.x}
                    cy={tertiaryInnerSparkPoint.y}
                    r={2.5}
                    fill="#FFFFFF"
                  />
                </G>
              ) : null}
            </Svg>

            {/* Center "10T4" & "GVCN Ngô Vũ Hảo" with Moving Hologram Effect */}
            <Animated.View
              pointerEvents="none"
              style={[styles.centerHologramEmblem, holoContainerStyle]}>
              <View style={styles.holoFrameBox}>
                {/* Corner HUD Brackets */}
                <View style={[styles.hudCorner, styles.hudCornerTL]} />
                <View style={[styles.hudCorner, styles.hudCornerTR]} />
                <View style={[styles.hudCorner, styles.hudCornerBL]} />
                <View style={[styles.hudCorner, styles.hudCornerBR]} />

                {/* Top Micro Hologram Telemetry Label */}
                <View style={styles.holoTopTag}>
                  <View style={styles.holoCyanDot} />
                  <Text style={styles.holoTopTagText}>HOLOGRAM · CORE 10T4</Text>
                  <View style={styles.holoPinkDot} />
                </View>

                {/* Multi-Layered Chromatic Aberration "10T4" Typography */}
                <View style={styles.holoTypographyStage}>
                  {/* Layer 1: Electric Violet Prism Ghost */}
                  <Animated.Text
                    style={[
                      styles.holoTextBase,
                      { fontSize: holoCoreFontSize },
                      styles.holoTextViolet,
                      violetGhostStyle,
                    ]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 2: Gold Prism Ghost */}
                  <Animated.Text
                    style={[
                      styles.holoTextBase,
                      { fontSize: holoCoreFontSize },
                      styles.holoTextGold,
                      goldGhostStyle,
                    ]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 3: Cyan Hologram Shift */}
                  <Animated.Text
                    style={[
                      styles.holoTextBase,
                      { fontSize: holoCoreFontSize },
                      styles.holoTextCyan,
                      cyanGhostStyle,
                    ]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 4: Neon Magenta/Rose Hologram Shift */}
                  <Animated.Text
                    style={[
                      styles.holoTextBase,
                      { fontSize: holoCoreFontSize },
                      styles.holoTextMagenta,
                      magentaGhostStyle,
                    ]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 5: Luminous Core "10T4" Text */}
                  <Text
                    style={[
                      styles.holoTextBase,
                      { fontSize: holoCoreFontSize },
                      styles.holoTextCore,
                    ]}>
                    10T4
                  </Text>

                  {/* Continuous Diagonal Holographic Light Beam Sweep */}
                  <Animated.View style={[styles.shimmerBeamWrap, shimmerBeamStyle]}>
                    <LinearGradient
                      colors={[
                        'transparent',
                        'rgba(0, 245, 255, 0.38)',
                        'rgba(255, 255, 255, 0.82)',
                        'rgba(255, 42, 133, 0.38)',
                        'transparent',
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.shimmerBeamGradient}
                    />
                  </Animated.View>

                  {/* Flickering Hologram Scanline Overlay Bars */}
                  <Animated.View style={[styles.scanlineOverlay, scanlineFlickerStyle]}>
                    <View style={styles.scanlineBar} />
                    <View style={styles.scanlineBarThin} />
                    <View style={styles.scanlineBar} />
                    <View style={styles.scanlineBarThin} />
                  </Animated.View>
                </View>

                {/* Upgraded Hologram ID Badge: "GVCN Ngô Vũ Hảo" */}
                <LinearGradient
                  colors={[
                    'rgba(0, 245, 255, 0.22)',
                    'rgba(168, 85, 247, 0.22)',
                    'rgba(255, 42, 133, 0.24)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.holoTeacherBadge}>
                  <Ionicons name="shield-checkmark" size={13} color="#FDE047" />
                  <Text style={styles.holoTeacherBadgeText}>GVCN Ngô Vũ Hảo</Text>
                  <Ionicons name="sparkles" size={12} color="#00F5FF" />
                </LinearGradient>

                <Text style={styles.holoSubtitleSecondary}>
                  KỶ NGUYÊN 10T4 · TÀI KHOẢN MỚI KÍCH HOẠT
                </Text>
              </View>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Bottom Interactive Completion CTA */}
        <Animated.View style={[styles.footerSection, ctaAnimatedStyle]}>
          <Text style={styles.footerHintText}>
            Trái tim Hologram 10T4 · GVCN Ngô Vũ Hảo đã đồng bộ toàn màn hình cho tài khoản mới
          </Text>

          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.enterButtonPressable,
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
            ]}>
            <LinearGradient
              colors={['#00F5FF', '#A855F7', '#FF2A85', '#FDE047']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.enterButtonBorder}>
              <LinearGradient
                colors={['rgba(7, 11, 28, 0.9)', 'rgba(18, 9, 36, 0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.enterButtonInner}>
                <View style={styles.enterButtonIconWrap}>
                  <Ionicons name="heart" size={18} color="#FF2A85" />
                </View>
                <View style={styles.enterButtonTextCol}>
                  <Text style={styles.enterButtonTitle}>Chạm để bước vào lớp 10T4 ✨</Text>
                  <Text style={styles.enterButtonSub}>
                    GVCN Ngô Vũ Hảo · Khám phá không gian lớp ngay
                  </Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={26} color="#00F5FF" />
              </LinearGradient>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  overlayRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 99999,
    backgroundColor: '#030610',
    overflow: 'hidden',
  },
  auroraTopLeft: {
    position: 'absolute',
    top: -130,
    left: -110,
    width: 440,
    height: 440,
    borderRadius: 220,
    overflow: 'hidden',
  },
  auroraBottomRight: {
    position: 'absolute',
    bottom: -140,
    right: -110,
    width: 480,
    height: 480,
    borderRadius: 240,
    overflow: 'hidden',
  },
  auroraGradientFill: {
    width: '100%',
    height: '100%',
  },
  fullScreenHeartField: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandingWaveWrap: {
    position: 'absolute',
    width: SVG_SIZE,
    height: SVG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    zIndex: 10,
  },
  bootStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.32)',
  },
  bootLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00F5FF',
  },
  bootStatusText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#BAE6FD',
  },
  skipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 41, 59, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.25)',
  },
  skipPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  greetingHeader: {
    alignItems: 'center',
    marginTop: 2,
    zIndex: 10,
  },
  helloMultilingualPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 255, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.28)',
    marginBottom: 4,
  },
  helloMultilingualText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#67E8F9',
  },
  xinChaoHeroTitle: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 245, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  xinChaoSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    textAlign: 'center',
    marginTop: 1,
  },
  accountBadgeRow: {
    marginTop: 7,
    maxWidth: '100%',
  },
  accountIdentityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 133, 0.38)',
  },
  accountNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    maxWidth: 170,
  },
  loginIdTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.42)',
  },
  loginIdTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#00F5FF',
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 42, 133, 0.22)',
  },
  roleTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FDA4AF',
  },
  heartStageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  miniHeartParticle: {
    position: 'absolute',
    zIndex: 3,
  },
  centerHeartCanvas: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHologramEmblem: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '7%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holoFrameBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 24,
    backgroundColor: 'rgba(3, 6, 17, 0.56)',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 245, 255, 0.34)',
    overflow: 'hidden',
  },
  hudCorner: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderColor: '#00F5FF',
  },
  hudCornerTL: {
    top: 6,
    left: 6,
    borderTopWidth: 2.2,
    borderLeftWidth: 2.2,
  },
  hudCornerTR: {
    top: 6,
    right: 6,
    borderTopWidth: 2.2,
    borderRightWidth: 2.2,
  },
  hudCornerBL: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 2.2,
    borderLeftWidth: 2.2,
  },
  hudCornerBR: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 2.2,
    borderRightWidth: 2.2,
  },
  holoTopTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  holoCyanDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#00F5FF',
  },
  holoPinkDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF2A85',
  },
  holoTopTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: '#67E8F9',
  },
  holoTypographyStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  holoTextBase: {
    fontWeight: '900',
    letterSpacing: 3.5,
    textAlign: 'center',
  },
  holoTextCyan: {
    position: 'absolute',
    color: '#00F5FF',
    textShadowColor: 'rgba(0, 245, 255, 0.95)',
    textShadowOffset: { width: -2.5, height: 0 },
    textShadowRadius: 16,
  },
  holoTextMagenta: {
    position: 'absolute',
    color: '#FF2A85',
    textShadowColor: 'rgba(255, 42, 133, 0.95)',
    textShadowOffset: { width: 2.5, height: 0 },
    textShadowRadius: 16,
  },
  holoTextViolet: {
    position: 'absolute',
    color: '#A855F7',
    textShadowColor: 'rgba(168, 85, 247, 0.9)',
    textShadowOffset: { width: 0, height: 2.5 },
    textShadowRadius: 18,
  },
  holoTextGold: {
    position: 'absolute',
    color: '#FDE047',
  },
  holoTextCore: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 245, 255, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  shimmerBeamWrap: {
    position: 'absolute',
    top: -24,
    bottom: -24,
    width: 64,
  },
  shimmerBeamGradient: {
    flex: 1,
  },
  scanlineOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'space-evenly',
  },
  scanlineBar: {
    height: 1.5,
    backgroundColor: 'rgba(0, 245, 255, 0.38)',
  },
  scanlineBarThin: {
    height: 1,
    backgroundColor: 'rgba(255, 42, 133, 0.3)',
  },
  holoTeacherBadge: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(253, 224, 71, 0.55)',
  },
  holoTeacherBadgeText: {
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#FEF08A',
    textShadowColor: 'rgba(0, 245, 255, 0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  holoSubtitleSecondary: {
    marginTop: 5,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#E0F2FE',
  },
  footerSection: {
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  footerHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  enterButtonPressable: {
    width: '100%',
    maxWidth: 420,
  },
  enterButtonBorder: {
    padding: 1.8,
    borderRadius: 999,
  },
  enterButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    gap: 12,
  },
  enterButtonIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 42, 133, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 133, 0.45)',
  },
  enterButtonTextCol: {
    flex: 1,
  },
  enterButtonTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  enterButtonSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#67E8F9',
    marginTop: 1,
  },
});
