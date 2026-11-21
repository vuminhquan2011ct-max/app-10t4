/**
 * Full-Screen First-Boot "Xin chào" & Moving Heart + 10T4 Hologram Welcome Experience.
 *
 * Triggered exclusively when a brand-new account is registered (`canEnterApp && isNewAccountWelcomePending`).
 * Inspired by a brand-new smartphone's first-boot "Xin chào / Hello" screen, combined with:
 *  1. Progressive moving heart path drawing (parametric heart curve + glowing comet tip & trail)
 *  2. Concentric holographic heart waves expanding outward to fill the entire screen
 *  3. Center "10T4" futuristic emblem with multi-layered chromatic aberration hologram movement,
 *     diagonal light shimmer sweep, and flickering hologram scanlines.
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
  Path,
  Stop,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';

import { useAuth } from '@/store/auth-store';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/* -------------------------------------------------------------------------- */
/* Parametric Mathematical Heart Curve Geometry (360x360 ViewBox)             */
/* -------------------------------------------------------------------------- */

const SVG_SIZE = 360;
const HEART_CX = 180;
const HEART_CY = 172;
const HEART_SCALE = 8.35;
const HEART_SAMPLE_COUNT = 220;

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
function buildHeartGeometry(scaleFactor = HEART_SCALE): {
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
    const y = Number((HEART_CY + rawY * scaleFactor).toFixed(2));

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

const MAIN_HEART = buildHeartGeometry(HEART_SCALE);
const INNER_HEART = buildHeartGeometry(HEART_SCALE * 0.84);
const CORE_HEART = buildHeartGeometry(HEART_SCALE * 0.68);
const MINI_HEART_PATH =
  'M 12 21.35 l -1.45 -1.32 C 5.4 15.36 2 12.28 2 8.5 C 2 5.42 4.42 3 7.5 3 c 1.74 0 3.41 0.81 4.5 2.09 C 13.09 3.81 14.76 3 16.5 3 C 19.58 3 22 5.42 22 8.5 c 0 3.78 -3.4 6.86 -8.55 11.54 L 12 21.35 Z';

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
  { primary: 'Hello · 10T4', sub: 'Chúng ta cùng nhau phát triển nhé' },
  { primary: 'Xin chào!', sub: 'Không gian lớp 10T4 đã sẵn sàng cho bạn' },
  { primary: 'Chào mừng', sub: 'GVCN: Ngô Vũ Hảo' },
];

type FloatingMiniHeartConfig = {
  id: number;
  angleDeg: number;
  radius: number;
  size: number;
  delayMs: number;
  durationMs: number;
  color: string;
};

const FLOATING_MINI_HEARTS: FloatingMiniHeartConfig[] = [
  { id: 1, angleDeg: -72, radius: 138, size: 18, delayMs: 200, durationMs: 3200, color: '#FF2A85' },
  { id: 2, angleDeg: -28, radius: 156, size: 15, delayMs: 650, durationMs: 3500, color: '#00F5FF' },
  { id: 3, angleDeg: 22, radius: 150, size: 20, delayMs: 420, durationMs: 3100, color: '#FDE047' },
  { id: 4, angleDeg: 68, radius: 136, size: 16, delayMs: 900, durationMs: 3400, color: '#A855F7' },
  { id: 5, angleDeg: 118, radius: 144, size: 17, delayMs: 520, durationMs: 3600, color: '#FF2A85' },
  { id: 6, angleDeg: 162, radius: 152, size: 14, delayMs: 1100, durationMs: 3300, color: '#00F5FF' },
  { id: 7, angleDeg: -150, radius: 148, size: 19, delayMs: 300, durationMs: 3450, color: '#FB7185' },
  { id: 8, angleDeg: -112, radius: 160, size: 15, delayMs: 820, durationMs: 3250, color: '#38BDF8' },
];

/* -------------------------------------------------------------------------- */
/* Subcomponents: Expanding Full-Screen Heart Ring & Floating Mini Hearts     */
/* -------------------------------------------------------------------------- */

function ExpandingFullScreenHeartWave({
  index,
  totalWaves,
  maxScale,
  color,
}: {
  index: number;
  totalWaves: number;
  maxScale: number;
  color: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Phase 2 begins around 1.5s as the center heart finishes drawing and expands outward to full screen
    const initialDelay = 1450 + index * 680;
    progress.value = withDelay(
      initialDelay,
      withRepeat(
        withTiming(1, {
          duration: 3600,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [index, progress]);

  const waveStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.25, 0.7, 1], [0.35, 1.05, 2.65, maxScale]);
    const opacity = interpolate(
      progress.value,
      [0, 0.14, 0.55, 0.88, 1],
      [0, 0.72 - index * (0.1 / totalWaves), 0.38, 0.14, 0],
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
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

function FloatingMiniHeart({ config }: { config: FloatingMiniHeartConfig }) {
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
  const baseX = Math.cos(rad) * config.radius;
  const baseY = Math.sin(rad) * config.radius;

  const animatedStyle = useAnimatedStyle(() => {
    const driftY = interpolate(floatVal.value, [0, 1], [8, -22]);
    const driftX = interpolate(floatVal.value, [0, 0.5, 1], [-6, 8, -4]);
    const scale = interpolate(floatVal.value, [0, 0.5, 1], [0.78, 1.18, 0.85]);
    const opacity = interpolate(floatVal.value, [0, 0.5, 1], [0.35, 0.92, 0.4]);
    const rotate = interpolate(floatVal.value, [0, 1], [-14, 16]);

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

  // Frame-accurate progressive heart drawing & orbiting comet state (works identically on Web + iOS + Android)
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
  const heartPulse = useSharedValue(0);
  const fullScreenBloom = useSharedValue(0);
  const holoPhase = useSharedValue(0);
  const holoShimmer = useSharedValue(0);
  const holoScanline = useSharedValue(0);
  const ctaReveal = useSharedValue(0);

  // Calculate scale needed so the 360x360 heart expands beyond the full screen diagonal
  const fullScreenMaxScale = useMemo(() => {
    const maxDim = Math.max(screenWidth, screenHeight, 840);
    return Number(Math.max(3.6, (maxDim / 195) * 1.15).toFixed(2));
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

    // Phase 1 (0s -> 2.4s): Progressive heart contour stroke drawing
    heartDrawProgress.value = withTiming(1, {
      duration: 2400,
      easing: Easing.inOut(Easing.cubic),
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

    // Phase 2 (1.6s -> 4.2s): Heart energy expands to fill the entire screen gradually
    fullScreenBloom.value = withDelay(
      1400,
      withTiming(1, {
        duration: 2600,
        easing: Easing.out(Easing.cubic),
      }),
    );

    // Center "10T4" continuous Hologram chromatic aberration & 3D tilt
    holoPhase.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1850, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 1850, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    // Diagonal Hologram Light Beam Shimmer across "10T4"
    holoShimmer.value = withRepeat(
      withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );

    // Hologram Scanline flicker
    holoScanline.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 920, easing: Easing.linear }),
        withTiming(0.25, { duration: 640, easing: Easing.linear }),
      ),
      -1,
      true,
    );

    // CTA button entrance
    ctaReveal.value = withDelay(
      950,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.1)) }),
    );

    // 60fps requestAnimationFrame loop driving the progressive heart path & moving spark comet
    let rafId: number | null = null;
    const startTime = Date.now();
    const DRAW_DURATION_MS = 2400;
    const ORBIT_PERIOD_MS = 3200;
    let markedComplete = false;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed <= DRAW_DURATION_MS) {
        const rawT = Math.min(1, elapsed / DRAW_DURATION_MS);
        // Smooth cubic ease-in-out for progressive drawing
        const eased =
          rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const idx = Math.max(1, Math.min(HEART_SAMPLE_COUNT, Math.round(eased * HEART_SAMPLE_COUNT)));
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

  // Animated strokeDashoffset for native SVG path alongside progressive path geometry
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

  // Center heart floating & pulsing container
  const centerHeartAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(heartPulse.value, [0, 1], [0.97, 1.05]);
    const translateY = interpolate(heartPulse.value, [0, 1], [5, -7]);
    const tiltZ = interpolate(holoPhase.value, [-1, 1], [-1.8, 1.8]);
    return {
      transform: [{ translateY }, { scale }, { rotateZ: `${tiltZ}deg` }],
    };
  });

  // Full-screen expanding heart backdrop aura ("hiện lên full màn hình dần")
  const fullScreenHeartBackdropStyle = useAnimatedStyle(() => {
    const baseScale = interpolate(
      fullScreenBloom.value,
      [0, 0.45, 1],
      [0.35, 1.35, fullScreenMaxScale * 0.88],
    );
    const breathDelta = interpolate(heartPulse.value, [0, 1], [-0.08, 0.14]);
    const opacity = interpolate(fullScreenBloom.value, [0, 0.3, 1], [0, 0.32, 0.48]);
    return {
      opacity,
      transform: [{ scale: baseScale + breathDelta }],
    };
  });

  // Hologram "10T4" multi-layered chromatic aberration styles
  const holoContainerStyle = useAnimatedStyle(() => {
    const floatY = interpolate(heartPulse.value, [0, 1], [3, -5]);
    const scale = interpolate(heartPulse.value, [0, 1], [0.98, 1.04]);
    const rotateZ = interpolate(holoPhase.value, [-1, 1], [-2.2, 2.2]);
    return {
      transform: [{ translateY: floatY }, { scale }, { rotateZ: `${rotateZ}deg` }],
    };
  });

  const cyanGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoPhase.value, [-1, 0, 1], [0.85, 0.55, 0.9]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [-4.5, 4.5]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [-2, 1.8]) },
    ],
  }));

  const magentaGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoPhase.value, [-1, 0, 1], [0.88, 0.55, 0.85]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [4.5, -4.5]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [2.2, -1.8]) },
    ],
  }));

  const violetGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.25, 1], [0.42, 0.82]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [-2.4, 2.8]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [3.2, -3.2]) },
    ],
  }));

  const goldGhostStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.25, 1], [0.35, 0.75]),
    transform: [
      { translateX: interpolate(holoPhase.value, [-1, 1], [2.2, -2.2]) },
      { translateY: interpolate(holoPhase.value, [-1, 1], [-3, 2.5]) },
    ],
  }));

  const shimmerBeamStyle = useAnimatedStyle(() => {
    const translateX = interpolate(holoShimmer.value, [0, 1], [-150, 150]);
    const opacity = interpolate(holoShimmer.value, [0, 0.2, 0.5, 0.8, 1], [0, 0.85, 1, 0.85, 0]);
    return {
      opacity,
      transform: [{ translateX }, { rotateZ: '-24deg' }],
    };
  });

  const scanlineFlickerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(holoScanline.value, [0.25, 1], [0.22, 0.65]),
    transform: [
      {
        translateY: interpolate(holoShimmer.value, [0, 1], [-18, 18]),
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

  /* ---------------- Progressive Heart Path & Spark Computations ---------------- */

  const partialHeartPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? MAIN_HEART.fullPath
        : buildPartialHeartPath(MAIN_HEART.points, drawStepIndex),
    [drawStepIndex, isHeartFullyDrawn],
  );

  const primarySparkPoint =
    MAIN_HEART.points[Math.min(MAIN_HEART.points.length - 1, orbitHeadIndex)] ??
    MAIN_HEART.points[0];

  const primaryCometTrailPath = useMemo(
    () => buildTrailPath(MAIN_HEART.points, orbitHeadIndex, 28, isHeartFullyDrawn),
    [isHeartFullyDrawn, orbitHeadIndex],
  );

  const secondaryOrbitIndex =
    (orbitHeadIndex + Math.floor(HEART_SAMPLE_COUNT / 2)) % HEART_SAMPLE_COUNT;
  const secondarySparkPoint =
    MAIN_HEART.points[secondaryOrbitIndex] ?? MAIN_HEART.points[0];

  const secondaryCometTrailPath = useMemo(
    () =>
      isHeartFullyDrawn
        ? buildTrailPath(MAIN_HEART.points, secondaryOrbitIndex, 22, true)
        : '',
    [isHeartFullyDrawn, secondaryOrbitIndex],
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

  return (
    <Animated.View style={[styles.overlayRoot, rootOverlayAnimatedStyle]}>
      {/* Deep Cosmic OLED Background with Holographic Auroras */}
      <LinearGradient
        colors={['#03050C', '#070B1E', '#0D0620', '#040711']}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient Top & Bottom Holographic Glow Orbs */}
      <View pointerEvents="none" style={styles.auroraTopLeft}>
        <LinearGradient
          colors={['rgba(0, 245, 255, 0.24)', 'rgba(168, 85, 247, 0.08)', 'transparent']}
          style={styles.auroraGradientFill}
        />
      </View>
      <View pointerEvents="none" style={styles.auroraBottomRight}>
        <LinearGradient
          colors={['rgba(255, 42, 133, 0.26)', 'rgba(253, 224, 71, 0.08)', 'transparent']}
          style={styles.auroraGradientFill}
        />
      </View>

      {/* Full-Screen Progressive Expanding Heart Field ("vẽ hình trái tim di chuyển hiện lên full màn hình dần") */}
      <View pointerEvents="none" style={styles.fullScreenHeartField}>
        {/* Giant Heart Aura that blooms gradually from center (0.35x) to full screen (4x+) */}
        <Animated.View style={[styles.expandingWaveWrap, fullScreenHeartBackdropStyle]}>
          <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
            <Defs>
              <SvgLinearGradient id="fullScreenHeartAuraGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.32" />
                <Stop offset="50%" stopColor="#FF2A85" stopOpacity="0.26" />
                <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.22" />
              </SvgLinearGradient>
            </Defs>
            <Path
              d={MAIN_HEART.fullPath}
              fill="url(#fullScreenHeartAuraGrad)"
              stroke="#FF2A85"
              strokeOpacity={0.42}
              strokeWidth={1.6}
            />
          </Svg>
        </Animated.View>

        {/* 4 Continuous Concentric Holographic Heart Waves expanding to full screen */}
        <ExpandingFullScreenHeartWave
          index={0}
          totalWaves={4}
          maxScale={fullScreenMaxScale}
          color="#00F5FF"
        />
        <ExpandingFullScreenHeartWave
          index={1}
          totalWaves={4}
          maxScale={fullScreenMaxScale}
          color="#FF2A85"
        />
        <ExpandingFullScreenHeartWave
          index={2}
          totalWaves={4}
          maxScale={fullScreenMaxScale}
          color="#A855F7"
        />
        <ExpandingFullScreenHeartWave
          index={3}
          totalWaves={4}
          maxScale={fullScreenMaxScale}
          color="#FDE047"
        />
      </View>

      {/* Main Content Layout */}
      <View
        style={[
          styles.contentContainer,
          {
            paddingTop: Math.max(insets.top + 12, 24),
            paddingBottom: Math.max(insets.bottom + 18, 28),
          },
        ]}>
        {/* Top Bar: First-Boot Status Pill + Skip Button */}
        <View style={styles.topBar}>
          <View style={styles.bootStatusPill}>
            <View style={styles.bootLiveDot} />
            <Text style={styles.bootStatusText}>
              {isHeartFullyDrawn
                ? 'HOLOGRAM HEART · FULL SCREEN ACTIVE'
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
              <Ionicons name="person-circle-outline" size={18} color="#00F5FF" />
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

        {/* Center Stage: Progressive Moving Heart Drawing + Center "10T4" Moving Hologram */}
        <View style={styles.heartStageWrap}>
          {/* Floating & Orbiting Mini Heart Particles */}
          {FLOATING_MINI_HEARTS.map((item) => (
            <FloatingMiniHeart key={item.id} config={item} />
          ))}

          <Animated.View style={[styles.centerHeartCanvas, centerHeartAnimatedStyle]}>
            <Svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
              <Defs>
                {/* Primary Neon Hologram Stroke Gradient */}
                <SvgLinearGradient id="heartHoloStroke" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#00F5FF" />
                  <Stop offset="35%" stopColor="#FF2A85" />
                  <Stop offset="70%" stopColor="#A855F7" />
                  <Stop offset="100%" stopColor="#FDE047" />
                </SvgLinearGradient>

                {/* Comet Tail Gradient */}
                <SvgLinearGradient id="cometTrailGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
                  <Stop offset="50%" stopColor="#00F5FF" stopOpacity="0.85" />
                  <Stop offset="100%" stopColor="#FF2A85" stopOpacity="0.2" />
                </SvgLinearGradient>

                {/* Inner Holographic Glass Fill */}
                <SvgLinearGradient id="heartInnerFill" x1="0.15" y1="0" x2="0.85" y2="1">
                  <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.18" />
                  <Stop offset="50%" stopColor="#FF2A85" stopOpacity="0.14" />
                  <Stop offset="100%" stopColor="#A855F7" stopOpacity="0.22" />
                </SvgLinearGradient>
              </Defs>

              {/* Faint Blueprint Guide Track of the Heart */}
              <Path
                d={MAIN_HEART.fullPath}
                fill="none"
                stroke="rgba(0, 245, 255, 0.15)"
                strokeWidth={1.5}
                strokeDasharray="5 7"
              />

              {/* Holographic Glass Fill & Inner Concentric Heart Grid (fades in as heart draws) */}
              {drawStepIndex > HEART_SAMPLE_COUNT * 0.35 ? (
                <G opacity={Math.min(1, (drawStepIndex / HEART_SAMPLE_COUNT - 0.35) / 0.65)}>
                  <Path d={MAIN_HEART.fullPath} fill="url(#heartInnerFill)" />
                  <Path
                    d={INNER_HEART.fullPath}
                    fill="none"
                    stroke="rgba(0, 245, 255, 0.32)"
                    strokeWidth={1.2}
                    strokeDasharray="6 6"
                  />
                  <Path
                    d={CORE_HEART.fullPath}
                    fill="none"
                    stroke="rgba(255, 42, 133, 0.28)"
                    strokeWidth={1}
                  />
                </G>
              ) : null}

              {/* Native UI-thread Animated Stroke Dash Layer */}
              {Platform.OS !== 'web' ? (
                <AnimatedPath
                  d={MAIN_HEART.fullPath}
                  fill="none"
                  stroke="rgba(255, 42, 133, 0.22)"
                  strokeWidth={14}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${MAIN_HEART.totalLength} ${MAIN_HEART.totalLength}`}
                  animatedProps={heartStrokeAnimatedProps}
                />
              ) : null}

              {/* Progressive Drawn Outer Neon Glow Stroke (100% Web + iOS + Android compatible) */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="rgba(255, 42, 133, 0.34)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Progressive Drawn Core Holographic Gradient Heart Path */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="url(#heartHoloStroke)"
                strokeWidth={4.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Progressive Drawn High-Energy White/Cyan Filament Centerline */}
              <Path
                d={partialHeartPath}
                fill="none"
                stroke="#E0F2FE"
                strokeOpacity={0.85}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Moving Comet Trail 1 (Follows drawing tip, then orbits continuously) */}
              {primaryCometTrailPath ? (
                <Path
                  d={primaryCometTrailPath}
                  fill="none"
                  stroke="url(#cometTrailGrad)"
                  strokeWidth={7.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Moving Comet Trail 2 (Counter-orbiting cyan/gold energy stream after draw completes) */}
              {secondaryCometTrailPath ? (
                <Path
                  d={secondaryCometTrailPath}
                  fill="none"
                  stroke="#00F5FF"
                  strokeOpacity={0.7}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Moving Spark / Comet Head 1 (Drawing Brush Tip) */}
              <G>
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={13}
                  fill="rgba(0, 245, 255, 0.25)"
                />
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={7.5}
                  fill="rgba(255, 42, 133, 0.65)"
                />
                <Circle
                  cx={primarySparkPoint.x}
                  cy={primarySparkPoint.y}
                  r={3.8}
                  fill="#FFFFFF"
                />
              </G>

              {/* Moving Spark / Comet Head 2 (Counter-orbiting spark once heart completes) */}
              {isHeartFullyDrawn ? (
                <G>
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={10}
                    fill="rgba(253, 224, 71, 0.26)"
                  />
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={5.2}
                    fill="#00F5FF"
                  />
                  <Circle
                    cx={secondarySparkPoint.x}
                    cy={secondarySparkPoint.y}
                    r={2.6}
                    fill="#FFFFFF"
                  />
                </G>
              ) : null}
            </Svg>

            {/* Center "10T4" with Moving Hologram Effect ("có chữ 10T4 ở giữa chuyển động hologram") */}
            <Animated.View
              pointerEvents="none"
              style={[styles.centerHologramEmblem, holoContainerStyle]}>
              {/* Hologram HUD Reticle Frame */}
              <View style={styles.holoFrameBox}>
                {/* Corner HUD Brackets */}
                <View style={[styles.hudCorner, styles.hudCornerTL]} />
                <View style={[styles.hudCorner, styles.hudCornerTR]} />
                <View style={[styles.hudCorner, styles.hudCornerBL]} />
                <View style={[styles.hudCorner, styles.hudCornerBR]} />

                {/* Top Micro Hologram Telemetry Label */}
                <View style={styles.holoTopTag}>
                  <View style={styles.holoCyanDot} />
                  <Text style={styles.holoTopTagText}>HOLOGRAM · CORE</Text>
                </View>

                {/* Multi-Layered Chromatic Aberration "10T4" Typography */}
                <View style={styles.holoTypographyStage}>
                  {/* Layer 1: Electric Violet Prism Ghost */}
                  <Animated.Text
                    style={[styles.holoTextBase, styles.holoTextViolet, violetGhostStyle]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 2: Gold Prism Ghost */}
                  <Animated.Text
                    style={[styles.holoTextBase, styles.holoTextGold, goldGhostStyle]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 3: Cyan Hologram Shift */}
                  <Animated.Text
                    style={[styles.holoTextBase, styles.holoTextCyan, cyanGhostStyle]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 4: Neon Magenta/Rose Hologram Shift */}
                  <Animated.Text
                    style={[styles.holoTextBase, styles.holoTextMagenta, magentaGhostStyle]}>
                    10T4
                  </Animated.Text>

                  {/* Layer 5: Luminous Core "10T4" Text */}
                  <Text style={[styles.holoTextBase, styles.holoTextCore]}>10T4</Text>

                  {/* Continuous Diagonal Holographic Light Beam Sweep */}
                  <Animated.View style={[styles.shimmerBeamWrap, shimmerBeamStyle]}>
                    <LinearGradient
                      colors={[
                        'transparent',
                        'rgba(0, 245, 255, 0.35)',
                        'rgba(255, 255, 255, 0.75)',
                        'rgba(255, 42, 133, 0.35)',
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

                {/* Subtitle Badges Under "10T4" */}
                <View style={styles.holoSubtitleBadge}>
                  <Text style={styles.holoSubtitlePrimary}>HOLOGRAM ID · KỶ NGUYÊN 10T4</Text>
                </View>
                <Text style={styles.holoSubtitleSecondary}>TÀI KHOẢN MỚI KÍCH HOẠT</Text>
              </View>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Bottom Interactive Completion CTA */}
        <Animated.View style={[styles.footerSection, ctaAnimatedStyle]}>
          <Text style={styles.footerHintText}>
            Trái tim hologram 10T4 đã đồng bộ toàn màn hình cho tài khoản mới của bạn
          </Text>

          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.enterButtonPressable,
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
            ]}>
            <LinearGradient
              colors={['#00F5FF', '#A855F7', '#FF2A85']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.enterButtonBorder}>
              <LinearGradient
                colors={['rgba(8, 13, 32, 0.88)', 'rgba(19, 10, 38, 0.88)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.enterButtonInner}>
                <View style={styles.enterButtonIconWrap}>
                  <Ionicons name="heart" size={18} color="#FF2A85" />
                </View>
                <View style={styles.enterButtonTextCol}>
                  <Text style={styles.enterButtonTitle}>Chạm để bước vào lớp 10T4 ✨</Text>
                  <Text style={styles.enterButtonSub}>Bắt đầu hành trình · Khám phá ngay</Text>
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
    backgroundColor: '#040711',
    overflow: 'hidden',
  },
  auroraTopLeft: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
    overflow: 'hidden',
  },
  auroraBottomRight: {
    position: 'absolute',
    bottom: -130,
    right: -100,
    width: 420,
    height: 420,
    borderRadius: 210,
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
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bootStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.28)',
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
    backgroundColor: 'rgba(30, 41, 59, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.22)',
  },
  skipPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  greetingHeader: {
    alignItems: 'center',
    marginTop: 4,
  },
  helloMultilingualPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.25)',
    marginBottom: 8,
  },
  helloMultilingualText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#67E8F9',
  },
  xinChaoHeroTitle: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 245, 255, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  xinChaoSubtitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#CBD5E1',
    textAlign: 'center',
    marginTop: 2,
  },
  accountBadgeRow: {
    marginTop: 10,
    maxWidth: '100%',
  },
  accountIdentityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 133, 0.35)',
  },
  accountNameText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#F8FAFC',
    maxWidth: 160,
  },
  loginIdTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.4)',
  },
  loginIdTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00F5FF',
  },
  roleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 42, 133, 0.2)',
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FDA4AF',
  },
  heartStageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 340,
  },
  miniHeartParticle: {
    position: 'absolute',
    zIndex: 2,
  },
  centerHeartCanvas: {
    width: SVG_SIZE,
    height: SVG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHologramEmblem: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holoFrameBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(4, 7, 17, 0.48)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.26)',
    overflow: 'hidden',
  },
  hudCorner: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderColor: '#00F5FF',
  },
  hudCornerTL: {
    top: 5,
    left: 5,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  hudCornerTR: {
    top: 5,
    right: 5,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  hudCornerBL: {
    bottom: 5,
    left: 5,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  hudCornerBR: {
    bottom: 5,
    right: 5,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  holoTopTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  holoCyanDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#00F5FF',
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
    paddingHorizontal: 10,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  holoTextBase: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
  },
  holoTextCyan: {
    position: 'absolute',
    color: '#00F5FF',
    textShadowColor: 'rgba(0, 245, 255, 0.9)',
    textShadowOffset: { width: -2, height: 0 },
    textShadowRadius: 14,
  },
  holoTextMagenta: {
    position: 'absolute',
    color: '#FF2A85',
    textShadowColor: 'rgba(255, 42, 133, 0.9)',
    textShadowOffset: { width: 2, height: 0 },
    textShadowRadius: 14,
  },
  holoTextViolet: {
    position: 'absolute',
    color: '#A855F7',
    textShadowColor: 'rgba(168, 85, 247, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  holoTextGold: {
    position: 'absolute',
    color: '#FDE047',
  },
  holoTextCore: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 245, 255, 0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  shimmerBeamWrap: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 56,
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
    backgroundColor: 'rgba(0, 245, 255, 0.36)',
  },
  scanlineBarThin: {
    height: 1,
    backgroundColor: 'rgba(255, 42, 133, 0.28)',
  },
  holoSubtitleBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 245, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.36)',
  },
  holoSubtitlePrimary: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#E0F2FE',
  },
  holoSubtitleSecondary: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#FDE047',
  },
  footerSection: {
    alignItems: 'center',
    gap: 10,
  },
  footerHintText: {
    fontSize: 12,
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
    paddingVertical: 12,
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
    borderColor: 'rgba(255, 42, 133, 0.42)',
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
