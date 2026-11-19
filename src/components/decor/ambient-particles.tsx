/**
 * Global ambient particle effects (sakura petals, snow, sparkles, fireflies,
 * confetti) plus one-shot celebration confetti burst overlay.
 *
 * Pure Reanimated, 100% pointerEvents="none", lightweight (~11 particles) for
 * smooth 60fps across iOS, Android, and Web.
 */

import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { AmbientEffect } from '@/constants/decor-meta';

type ParticleSpec = {
  id: number;
  xPct: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  glyph: string;
  color: string;
};

const AMBIENT_GLYPHS: Record<Exclude<AmbientEffect, 'none'>, { glyphs: string[]; colors: string[] }> = {
  sakura: { glyphs: ['🌸', '❀', '✿'], colors: ['#F472B6', '#FB7185', '#FBCFE8'] },
  snow: { glyphs: ['❄️', '❅', '•'], colors: ['#BAE6FD', '#E0F2FE', '#93C5FD'] },
  sparkles: { glyphs: ['✦', '✨', '✧'], colors: ['#FBBF24', '#A78BFA', '#38BDF8'] },
  fireflies: { glyphs: ['●', '✦', '●'], colors: ['#FDE047', '#34D399', '#38BDF8'] },
  confetti: { glyphs: ['■', '▲', '●', '★'], colors: ['#F97316', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'] },
};

function buildParticles(effect: Exclude<AmbientEffect, 'none'>): ParticleSpec[] {
  const palette = AMBIENT_GLYPHS[effect];
  const count = 11;
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    xPct: ((i * 19 + 7) % 92) + 4,
    size: effect === 'fireflies' ? 10 + (i % 3) * 3 : 13 + (i % 4) * 3,
    delay: (i * 580) % 4200,
    duration: effect === 'fireflies' ? 4200 + (i % 4) * 700 : 6200 + (i % 5) * 1100,
    drift: (i % 2 === 0 ? 1 : -1) * (18 + (i % 3) * 12),
    glyph: palette.glyphs[i % palette.glyphs.length],
    color: palette.colors[i % palette.colors.length],
  }));
}

function FallingParticle({
  spec,
  screenHeight,
  screenWidth,
  floating,
}: {
  spec: ParticleSpec;
  screenHeight: number;
  screenWidth: number;
  floating: boolean;
}) {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0.3);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration, easing: Easing.linear }),
        -1,
        floating,
      ),
    );
    pulse.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(0.88, { duration: 1300 }),
          withTiming(0.25, { duration: 1300 }),
        ),
        -1,
        true,
      ),
    );
  }, [spec.delay, spec.duration, floating, progress, pulse]);

  const animStyle = useAnimatedStyle(() => {
    if (floating) {
      const baseY = ((spec.id * 97 + 60) % Math.max(240, screenHeight - 160)) + 40;
      const translateY = baseY - progress.value * 70;
      const translateX = Math.sin(progress.value * Math.PI * 2) * spec.drift;
      return {
        opacity: pulse.value,
        transform: [{ translateX }, { translateY }, { scale: 0.75 + pulse.value * 0.45 }],
      };
    }

    const translateY = -36 + progress.value * (screenHeight + 72);
    const translateX = Math.sin(progress.value * Math.PI * 2) * spec.drift;
    const rotate = `${Math.round(progress.value * 360)}deg`;
    const edgeFade =
      progress.value < 0.08
        ? progress.value / 0.08
        : progress.value > 0.88
          ? (1 - progress.value) / 0.12
          : 0.72;

    return {
      opacity: edgeFade,
      transform: [{ translateX }, { translateY }, { rotate }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: (spec.xPct / 100) * screenWidth },
        animStyle,
      ]}>
      <Text style={{ fontSize: spec.size, color: spec.color }}>{spec.glyph}</Text>
    </Animated.View>
  );
}

/* ---------- Celebration One-Shot Confetti Burst ---------- */

const BURST_COLORS = ['#F97316', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4'];
const BURST_GLYPHS = ['🎉', '✨', '★', '●', '▲', '💖', '✦'];

function BurstPiece({
  idx,
  width,
  height,
}: {
  idx: number;
  width: number;
  height: number;
}) {
  const prog = useSharedValue(0);
  const startX = width * 0.5 + ((idx % 7) - 3) * 28;
  const endX = ((idx * 37 + 13) % 92) * (width / 100);
  const peakY = height * (0.12 + (idx % 4) * 0.06);
  const endY = height * (0.68 + (idx % 4) * 0.08);
  const spin = (idx % 2 === 0 ? 1 : -1) * (240 + (idx % 3) * 140);

  useEffect(() => {
    prog.value = 0;
    prog.value = withDelay(
      (idx % 6) * 35,
      withTiming(1, { duration: 1550, easing: Easing.out(Easing.cubic) }),
    );
  }, [idx, prog]);

  const anim = useAnimatedStyle(() => {
    const t = prog.value;
    const x = startX + (endX - startX) * t;
    // Parabolic burst arc
    const y =
      t < 0.32
        ? height * 0.35 - (height * 0.35 - peakY) * (t / 0.32)
        : peakY + (endY - peakY) * ((t - 0.32) / 0.68);
    const opacity = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
    const scale = t < 0.15 ? 0.5 + (t / 0.15) * 0.7 : 1.15 - t * 0.25;
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${Math.round(spin * t)}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.burstPiece, anim]}>
      <Text
        style={{
          fontSize: idx % 3 === 0 ? 18 : 13,
          color: BURST_COLORS[idx % BURST_COLORS.length],
        }}>
        {BURST_GLYPHS[idx % BURST_GLYPHS.length]}
      </Text>
    </Animated.View>
  );
}

export const AmbientParticles = memo(function AmbientParticles({
  effect,
  celebrationTrigger,
}: {
  effect: AmbientEffect;
  celebrationTrigger: number;
}) {
  const { width, height } = useWindowDimensions();
  const [dismissedTrigger, setDismissedTrigger] = useState(0);

  useEffect(() => {
    if (celebrationTrigger <= 0) return undefined;
    const timer = setTimeout(() => setDismissedTrigger(celebrationTrigger), 1850);
    return () => clearTimeout(timer);
  }, [celebrationTrigger]);

  const burstKey = celebrationTrigger > 0 && celebrationTrigger !== dismissedTrigger ? celebrationTrigger : 0;
  const specs = effect === 'none' ? [] : buildParticles(effect);
  const isFloating = effect === 'fireflies' || effect === 'sparkles';

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {specs.map((spec) => (
        <FallingParticle
          key={`${effect}-${spec.id}`}
          spec={spec}
          screenWidth={width}
          screenHeight={height}
          floating={isFloating}
        />
      ))}

      {burstKey > 0
        ? Array.from({ length: 18 }).map((_, idx) => (
            <BurstPiece key={`${burstKey}-${idx}`} idx={idx} width={width} height={height} />
          ))
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    zIndex: 40,
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
  burstPiece: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
