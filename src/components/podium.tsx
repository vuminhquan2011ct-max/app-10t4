import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  { color: ThemeColor; soft: ThemeColor; avatar: number; bar: number }
> = {
  1: { color: 'gold', soft: 'goldSoft', avatar: 68, bar: 92 },
  2: { color: 'silver', soft: 'silverSoft', avatar: 54, bar: 66 },
  3: { color: 'bronze', soft: 'bronzeSoft', avatar: 54, bar: 50 },
};

/** Interactive Top-3 podium: 1st place in the middle, gracefully adapts for 1–3 students. */
export function Podium({ entries, onPressEntry }: PodiumProps) {
  const theme = useTheme();

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
        const first = entry.rank === 1;

        return (
          <Pressable
            key={entry.id}
            onPress={() => onPressEntry?.(entry.id)}
            style={({ pressed }) => [styles.col, pressed && styles.pressed]}>
            {first ? <Ionicons name="trophy" size={22} color={color} style={styles.crown} /> : null}
            <View style={[styles.avatarWrap, { borderColor: color }]}>
              <Avatar name={entry.name} size={slot.avatar} ring />
            </View>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={[styles.points, { color: theme.textSecondary }]}>
              {entry.points + ' điểm'}
            </Text>
            <View
              style={[
                styles.bar,
                { height: slot.bar, backgroundColor: theme[slot.soft], borderColor: color },
              ]}>
              <Text style={[styles.rankNum, { color }]}>{entry.rank}</Text>
            </View>
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
    gap: Spacing.two,
  },
  col: { flex: 1, alignItems: 'center', gap: 2, maxWidth: 160 },
  crown: { marginBottom: -2 },
  avatarWrap: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    marginBottom: Spacing.one,
  },
  name: { fontSize: 13, fontWeight: '800', maxWidth: '100%' },
  points: { fontSize: 11, fontWeight: '600', marginBottom: Spacing.one },
  bar: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    borderTopWidth: 3,
  },
  rankNum: { fontSize: 28, fontWeight: '900' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
