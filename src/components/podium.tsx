import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type PodiumEntry = {
  id: string;
  name: string;
  points: number;
  rank: number;
};

type PodiumProps = {
  /** Up to three entries, already sorted by rank. */
  entries: PodiumEntry[];
  onPressEntry?: (id: string) => void;
};

const SLOTS: Record<
  number,
  { color: ThemeColor; soft: ThemeColor; avatar: number; bar: number; icon: IoniconName }
> = {
  1: { color: 'gold', soft: 'goldSoft', avatar: 68, bar: 102, icon: 'trophy' },
  2: { color: 'silver', soft: 'silverSoft', avatar: 54, bar: 76, icon: 'medal' },
  3: { color: 'bronze', soft: 'bronzeSoft', avatar: 54, bar: 58, icon: 'ribbon' },
};

/** Interactive Top-3 3D gradient podium: 1st place in the middle, adapts for 1–3 students. */
export function Podium({ entries, onPressEntry }: PodiumProps) {
  const theme = useTheme();
  const isDark = useIsDark();

  // Visual order is 2nd, 1st, 3rd when there are multiple entries.
  const ordered =
    entries.length >= 2
      ? ([entries[1], entries[0], entries[2]].filter(Boolean) as PodiumEntry[])
      : entries;

  return (
    <View style={styles.row}>
      {ordered.map((entry) => {
        const slot = SLOTS[Math.min(entry.rank, 3)];
        const color = theme[slot.color];
        const soft = theme[slot.soft];
        const first = entry.rank === 1;
        const fadeEnd = isDark ? 'rgba(18, 24, 38, 0.25)' : 'rgba(255, 255, 255, 0.45)';

        return (
          <Pressable
            key={entry.id}
            onPress={() => onPressEntry?.(entry.id)}
            style={({ pressed }) => [styles.col, pressed && styles.pressed]}>
            <View
              style={[
                styles.headerMedal,
                { backgroundColor: soft, borderColor: `${color}55` },
              ]}>
              <Ionicons name={slot.icon} size={first ? 15 : 13} color={color} />
            </View>

            <View
              style={[
                styles.avatarWrap,
                {
                  borderColor: color,
                  backgroundColor: theme.card,
                  shadowColor: color,
                  shadowOpacity: first ? 0.35 : 0.15,
                },
              ]}>
              <Avatar name={entry.name} size={slot.avatar} ring />
              <View style={[styles.rankBadgePill, { backgroundColor: color, borderColor: theme.card }]}>
                <Text style={styles.rankBadgeText}>{`#${entry.rank}`}</Text>
              </View>
            </View>

            <Text style={[styles.name, first && styles.nameFirst, { color: theme.text }]} numberOfLines={1}>
              {entry.name}
            </Text>

            <View
              style={[
                styles.pointsCapsule,
                { backgroundColor: soft, borderColor: `${color}40` },
              ]}>
              <Text style={[styles.points, { color }]}>{`${entry.points} điểm`}</Text>
            </View>

            <LinearGradient
              colors={[soft, fadeEnd]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[
                styles.bar,
                {
                  height: slot.bar,
                  borderTopColor: color,
                  borderLeftColor: `${color}30`,
                  borderRightColor: `${color}30`,
                },
              ]}>
              <Text style={[styles.rankNum, { color }]}>{entry.rank}</Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.two + 2,
  },
  col: { flex: 1, alignItems: 'center', gap: 4, maxWidth: 164 },
  headerMedal: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
  },
  avatarWrap: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    marginBottom: 4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  rankBadgePill: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  name: { fontSize: 13, fontWeight: '800', maxWidth: '100%', marginTop: 2 },
  nameFirst: { fontSize: 14, fontWeight: '900' },
  pointsCapsule: {
    paddingHorizontal: 9,
    paddingVertical: 2.5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginBottom: 4,
  },
  points: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    borderTopWidth: 3,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  rankNum: { fontSize: 30, fontWeight: '900', opacity: 0.85 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
