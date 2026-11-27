/**
 * Compact horizontal countdown strip surfacing upcoming exams (`tag === 'exam'`)
 * and high-priority uncompleted deadlines (`priority === 'high'`).
 *
 * Returns `null` when there are 0 upcoming exams or urgent deadlines so the
 * dashboard stays completely clutter-free.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayMonth, isValidIsoDate, parseIsoDate, todayIso } from '@/lib/date';
import { useClassStore } from '@/store/class-store';

type CountdownItem = {
  id: string;
  kind: 'exam' | 'task';
  title: string;
  subject?: string | null;
  dateIso: string | null;
  daysLeft: number | null;
  countdownLabel: string;
  tone: 'danger' | 'warning' | 'accent';
  route: '/(tabs)/bulletin' | '/tasks';
};

const MAX_ITEMS = 4;
const EXAM_LOOKAHEAD_DAYS = 45;
const TASK_LOOKAHEAD_DAYS = 30;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Extract an explicit `YYYY-MM-DD`, `DD/MM/YYYY`, or `DD/MM` date from free text. */
function extractDateIsoFromText(text: string, refYear: number): string | null {
  const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  const dmyFull = /\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})\b/.exec(text);
  if (dmyFull) {
    const candidate = `${dmyFull[3]}-${pad2(Number(dmyFull[2]))}-${pad2(Number(dmyFull[1]))}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  const dmyShort = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
  if (dmyShort) {
    const day = Number(dmyShort[1]);
    const month = Number(dmyShort[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const sameYear = `${refYear}-${pad2(month)}-${pad2(day)}`;
      if (isValidIsoDate(sameYear)) return sameYear;
    }
  }

  return null;
}

function diffDaysFromToday(targetIso: string, todayDate: Date): number | null {
  const target = parseIsoDate(targetIso);
  if (!target) return null;
  return Math.round((target.getTime() - todayDate.getTime()) / 86_400_000);
}

function formatCountdownBadge(daysLeft: number | null): {
  label: string;
  tone: 'danger' | 'warning' | 'accent';
} {
  if (daysLeft === null) return { label: 'Lịch thi', tone: 'warning' };
  if (daysLeft <= 0) return { label: 'Hôm nay', tone: 'danger' };
  if (daysLeft === 1) return { label: 'Ngày mai', tone: 'warning' };
  if (daysLeft <= 3) return { label: `Còn ${daysLeft} ngày`, tone: 'warning' };
  return { label: `Còn ${daysLeft} ngày`, tone: 'accent' };
}

function softKeyOf(tone: 'danger' | 'warning' | 'accent'): ThemeColor {
  if (tone === 'danger') return 'dangerSoft';
  if (tone === 'warning') return 'warningSoft';
  return 'accentSoft';
}

export function ExamCountdownStrip() {
  const { announcements, tasks, doneTaskIds } = useClassStore();
  const theme = useTheme();

  const items = useMemo<CountdownItem[]>(() => {
    const today = todayIso();
    const todayDate = parseIsoDate(today) ?? new Date();
    const refYear = todayDate.getFullYear();
    const collected: CountdownItem[] = [];

    // 1. Upcoming or pinned exam announcements (`tag === 'exam'`)
    for (const ann of announcements) {
      if (ann.tag !== 'exam') continue;
      const directIso = ann.eventDate && isValidIsoDate(ann.eventDate) ? ann.eventDate : null;
      const dateIso = directIso ?? extractDateIsoFromText(`${ann.title} ${ann.content}`, refYear);

      if (dateIso) {
        const daysLeft = diffDaysFromToday(dateIso, todayDate);
        if (daysLeft === null || daysLeft < 0 || daysLeft > EXAM_LOOKAHEAD_DAYS) continue;
        const badge = formatCountdownBadge(daysLeft);
        collected.push({
          id: `exam:${ann.id}`,
          kind: 'exam',
          title: ann.title,
          subject: ann.subject,
          dateIso,
          daysLeft,
          countdownLabel: badge.label,
          tone: badge.tone,
          route: '/(tabs)/bulletin',
        });
      } else if (ann.pinned) {
        const badge = formatCountdownBadge(null);
        collected.push({
          id: `exam:${ann.id}`,
          kind: 'exam',
          title: ann.title,
          subject: ann.subject,
          dateIso: null,
          daysLeft: null,
          countdownLabel: badge.label,
          tone: badge.tone,
          route: '/(tabs)/bulletin',
        });
      }
    }

    // 2. High-priority uncompleted class tasks with upcoming `dueDate`
    for (const task of tasks) {
      if (task.priority !== 'high' || doneTaskIds[task.id]) continue;
      const dateIso = isValidIsoDate(task.dueDate)
        ? task.dueDate
        : task.eventDate && isValidIsoDate(task.eventDate)
          ? task.eventDate
          : null;
      if (!dateIso) continue;
      const daysLeft = diffDaysFromToday(dateIso, todayDate);
      if (daysLeft === null || daysLeft < 0 || daysLeft > TASK_LOOKAHEAD_DAYS) continue;
      const badge = formatCountdownBadge(daysLeft);
      collected.push({
        id: `task:${task.id}`,
        kind: 'task',
        title: task.title,
        subject: task.subject,
        dateIso,
        daysLeft,
        countdownLabel: badge.label,
        tone: badge.tone,
        route: '/tasks',
      });
    }

    return collected
      .sort((a, b) => {
        const da = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
        const db = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        if (a.kind !== b.kind) return a.kind === 'exam' ? -1 : 1;
        return a.title.localeCompare(b.title, 'vi');
      })
      .slice(0, MAX_ITEMS);
  }, [announcements, tasks, doneTaskIds]);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="timer-outline" size={14} color={theme.warning} />
          <Text style={[styles.headerText, { color: theme.textSecondary }]}>
            SẮP TỚI · LỊCH THI & HẠN CHÓT
          </Text>
        </View>
        <Text style={[styles.countText, { color: theme.textMuted }]}>
          {`${items.length} mục cần chú ý`}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}>
        {items.map((item) => {
          const softColor = theme[softKeyOf(item.tone)];
          const accentColor = theme[item.tone];
          const dateLabel = item.dateIso ? formatDayMonth(item.dateIso) : null;
          const a11yLabel = `${item.kind === 'exam' ? 'Lịch thi' : 'Hạn chót khẩn'}: ${item.title}, ${item.countdownLabel}`;

          return (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.route as never)}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel={a11yLabel}
              style={({ pressed }) => [
                styles.pill,
                Shadow.card,
                {
                  backgroundColor: theme.card,
                  borderColor: accentColor,
                },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.iconCircle, { backgroundColor: softColor }]}>
                <Ionicons
                  name={item.kind === 'exam' ? 'school' : 'flame'}
                  size={15}
                  color={accentColor}
                />
              </View>
              <View style={styles.pillBody}>
                <View style={styles.pillTopLine}>
                  <View style={[styles.countdownBadge, { backgroundColor: softColor }]}>
                    <Text style={[styles.countdownText, { color: accentColor }]}>
                      {item.countdownLabel}
                    </Text>
                  </View>
                  {dateLabel ? (
                    <Text style={[styles.dateText, { color: theme.textMuted }]}>{dateLabel}</Text>
                  ) : null}
                </View>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subject ? (
                  <Text style={[styles.subject, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.subject}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerText: {
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scrollRow: {
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  pill: {
    minHeight: 54,
    minWidth: 204,
    maxWidth: 264,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBody: {
    flex: 1,
    gap: 2,
  },
  pillTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: Radius.pill,
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '900',
  },
  dateText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  title: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  subject: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
});
