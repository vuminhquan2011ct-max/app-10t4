import { StyleSheet, Text, View } from 'react-native';

import { avatarPalette, initialsOf } from '@/lib/utils';

type AvatarProps = {
  name: string;
  size?: number;
};

/** Circle with the student's initials on a stable pastel background. */
export function Avatar({ name, size = 44 }: AvatarProps) {
  const palette = avatarPalette(name);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}>
      <Text style={{ color: palette.fg, fontSize: size * 0.38, fontWeight: '700' }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
