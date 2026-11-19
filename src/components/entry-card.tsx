import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { ENTRY_CATEGORIES, ENTRY_KINDS, ENTRY_LEVELS, ENTRY_STATUSES } from '@/constants/entry-meta';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import type { Entry } from '@/types/models';

type EntryCardProps = {
  entry: Entry;
  /** Shown under the title when the list is not scoped to one student. */
  studentName?: string;
  onPress?: () => void;
};

/** Compact entry row reused by the feed, the student page and the search. */
export function EntryCard({ entry, studentName, onPress }: EntryCardProps) {
  const theme = useTheme();
  const kind = ENTRY_KINDS[entry.kind];
  const status = ENTRY_STATUSES[entry.status];
  const category = ENTRY_CATEGORIES[entry.category];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        Shadow.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.iconBox, { backgroundColor: theme[kind.soft] }]}>
        <Ionicons name={kind.icon} size={20} color={theme[kind.color]} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {entry.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
            {[studentName, category.label, ENTRY_LEVELS[entry.level].label, formatDate(entry.date)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.badges}>
          <Badge label={status.label} color={status.color} soft={status.soft} icon={status.icon} />
          {entry.points > 0 ? (
            <Badge
              label={`${entry.points} điểm`}
              color={kind.color}
              soft={kind.soft}
              icon="ribbon-outline"
            />
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} style={styles.chevron} color={theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.one },
  title: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  meta: { flexDirection: 'row' },
  metaText: { fontSize: 12, flex: 1 },
  badges: { flexDirection: 'row', gap: Spacing.one, marginTop: 2, flexWrap: 'wrap' },
  chevron: { alignSelf: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
