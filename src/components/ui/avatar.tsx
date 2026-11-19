import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { AVATAR_FRAME_LIST, type AvatarFrame } from '@/constants/decor-meta';
import { useIsDark } from '@/hooks/use-theme';
import { avatarPalette, initialsOf } from '@/lib/utils';

type AvatarProps = {
  name: string;
  size?: number;
  /** Draws a white ring so the avatar reads well on gradients / cards. */
  ring?: boolean;
  /** Optional profile photo URL (e.g. from Google Sign-In). */
  imageUrl?: string | null;
  /** Optional decorative avatar frame (crown, halo, neon, flower, cat, fire). */
  frame?: AvatarFrame;
};

/** Circle with the student's initials on a stable gradient background (or profile photo). */
export function Avatar({ name, size = 44, ring = false, imageUrl, frame = 'none' }: AvatarProps) {
  const palette = avatarPalette(name);
  const dark = useIsDark();
  const colors = dark ? palette.darkGradient : palette.gradient;
  const ringWidth = ring ? Math.max(2, Math.round(size / 18)) : 0;

  const core = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: dark ? 'rgba(255,255,255,0.22)' : '#FFFFFF',
        },
      ]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={{ color: dark ? '#FFFFFF' : palette.fg, fontSize: size * 0.38, fontWeight: '800' }}>
        {initialsOf(name)}
      </Text>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );

  if (!frame || frame === 'none') return core;

  const meta = AVATAR_FRAME_LIST.find((f) => f.key === frame);
  if (!meta) return core;

  const pad = Math.max(3, Math.round(size / 15));
  const outer = size + pad * 2;
  const badgeSize = Math.max(15, Math.round(size * 0.36));

  return (
    <View style={[styles.frameWrap, { width: outer, height: outer }]}>
      <LinearGradient
        colors={meta.ringColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.frameRing,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            padding: pad,
          },
        ]}>
        {core}
      </LinearGradient>
      <View
        pointerEvents="none"
        style={[
          styles.emblem,
          {
            top: -Math.round(badgeSize * 0.32),
            right: -Math.round(badgeSize * 0.18),
            minWidth: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
          },
        ]}>
        <Text style={{ fontSize: Math.max(10, Math.round(badgeSize * 0.68)) }}>{meta.emoji}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblem: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
