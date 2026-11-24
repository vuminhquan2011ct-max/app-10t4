import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import {
  ENTRY_CATEGORIES,
  ENTRY_KINDS,
  ENTRY_LEVELS,
  ENTRY_STATUSES,
  formatSignedPoints,
} from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
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
  const isViolation = entry.kind === 'violation' || entry.points < 0;
  const isStudy = entry.kind === 'study';
  const isAcademic = entry.category === 'academic';
  const isDutyDiligence = entry.source === 'duty_diligence';
  const kind = ENTRY_KINDS[entry.kind] ?? ENTRY_KINDS.activity;
  const status = ENTRY_STATUSES[entry.status] ?? ENTRY_STATUSES.approved;
  const category = ENTRY_CATEGORIES[entry.category] ?? ENTRY_CATEGORIES.other;

  const iconBg = isViolation
    ? theme.dangerSoft
    : isStudy
      ? theme.successSoft
      : theme[kind.soft];
  const iconColor = isViolation
    ? theme.danger
    : isStudy
      ? theme.success
      : theme[kind.color];
  const iconName = isViolation ? 'alert-circle' : isStudy ? 'book' : kind.icon;
  const speechCount = isStudy ? Math.max(1, Math.round(entry.speechCount ?? 1)) : 0;

  const attributionLabel = isDutyDiligence
    ? 'Trực nhật · Chuyên cần'
    : entry.recordedByName
      ? entry.recordedByPosition
        ? `Ghi bởi ${entry.recordedByPosition}: ${entry.recordedByName}`
        : `Ghi bởi ${entry.recordedByName}`
      : entry.recordedByPosition
        ? `Ghi bởi ${entry.recordedByPosition}`
        : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        Shadow.card,
        {
          backgroundColor: theme.card,
          borderColor: isViolation
            ? `${theme.danger}55`
            : isStudy
              ? `${theme.success}44`
              : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {entry.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
            {[
              studentName,
              isStudy && entry.subject ? `Môn ${entry.subject}` : category.label,
              ENTRY_LEVELS[entry.level]?.label ?? 'Cấp lớp',
              formatDate(entry.date),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.badges}>
          {isStudy ? (
            <Badge
              label={`${speechCount === 1 ? '1 stamp' : `${speechCount} stamps`} · ${entry.subject || 'Học tập'}`}
              color={'success'}
              soft={'successSoft'}
              icon={'book'}
            />
          ) : null}
          {isAcademic ? (
            <Badge
              label={'Thành tích Học thuật'}
              color={'gold'}
              soft={'goldSoft'}
              icon={'school'}
            />
          ) : null}
          {isViolation ? (
            <Badge label={'Vi phạm'} color={'danger'} soft={'dangerSoft'} icon={'warning'} />
          ) : null}
          <Badge label={status.label} color={status.color} soft={status.soft} icon={status.icon} />
          {entry.points !== 0 ? (
            <Badge
              label={formatSignedPoints(entry.points)}
              color={entry.points < 0 ? 'danger' : kind.color}
              soft={entry.points < 0 ? 'dangerSoft' : kind.soft}
              icon={entry.points < 0 ? 'remove-circle-outline' : 'ribbon-outline'}
            />
          ) : null}
          {attributionLabel ? (
            <Badge
              label={attributionLabel}
              color={isDutyDiligence ? 'accentText' : 'purple'}
              soft={isDutyDiligence ? 'accentSoft' : 'purpleSoft'}
              icon={isDutyDiligence ? 'sparkles-outline' : 'shield-checkmark-outline'}
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
