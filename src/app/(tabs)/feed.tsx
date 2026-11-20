import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_LEVELS,
  ENTRY_STATUSES,
} from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import type { EntryCategory, EntryStatus } from '@/types/models';

type Filter = 'all' | EntryStatus;
type CatFilter = 'all' | EntryCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
];

export default function FeedScreen() {
  const {
    entries,
    role,
    canViewAll,
    canEditClass,
    currentStudentId,
    getStudent,
    setEntryStatus,
    approveAllPending,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: entries.length, pending: 0, approved: 0, rejected: 0 };
    for (const entry of entries) result[entry.status] += 1;
    return result;
  }, [entries]);

  const sorted = useMemo(() => {
    const q = stripVietnamese(query);
    return entries
      .filter((entry) => {
        const matchStatus = filter === 'all' || entry.status === filter;
        const matchCat = catFilter === 'all' || entry.category === catFilter;
        const studentName = getStudent(entry.studentId)?.name ?? '';
        const matchQuery =
          !q ||
          stripVietnamese(`${entry.title} ${studentName} ${entry.description ?? ''}`).includes(q);
        return matchStatus && matchCat && matchQuery;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, filter, catFilter, query, getStudent]);

  const handleApproveAll = () => {
    approveAllPending();
    showToast(`Đã duyệt tất cả ${counts.pending} mục chờ duyệt!`);
  };

  const openProof = (url: string) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(target).catch(() => showToast('Không thể mở liên kết minh chứng', 'warning'));
  };

  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={canViewAll ? 'Nhật ký thành tích' : 'Bài đăng của tôi'}
          subtitle={
            canViewAll
              ? sorted.length + ' / ' + entries.length + ' mục toàn lớp · mới nhất ở trên'
              : sorted.length + ' mục của riêng bạn · Chỉ bạn & GVCN thấy'
          }
        />
      </FadeIn>

      <FadeIn index={1} style={styles.ctaRow}>
        <Button
          label={'Ghi thành tích mới'}
          icon={'add-circle'}
          style={styles.flex}
          onPress={() => router.push('/entry-form' as never)}
        />
        {role === 'teacher' && counts.pending > 0 ? (
          <Button
            label={`Duyệt hết (${counts.pending})`}
            variant={'soft'}
            icon={'checkmark-done'}
            onPress={handleApproveAll}
          />
        ) : null}
      </FadeIn>

      <FadeIn index={2}>
        <TextField
          icon={'search'}
          placeholder={'Tìm thành tích, tên học sinh...'}
          value={query}
          onChangeText={setQuery}
        />
      </FadeIn>

      {/* Status filter */}
      <FadeIn index={3}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => (
            <Chip
              key={item.value}
              label={item.label + ' · ' + counts[item.value]}
              selected={filter === item.value}
              onPress={() => setFilter(item.value)}
            />
          ))}
        </ScrollView>
      </FadeIn>

      {/* Category filter */}
      <FadeIn index={4}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip
            label={'Mọi lĩnh vực'}
            selected={catFilter === 'all'}
            onPress={() => setCatFilter('all')}
          />
          {ENTRY_CATEGORY_LIST.map((cat) => (
            <Chip
              key={cat}
              label={ENTRY_CATEGORIES[cat].label}
              icon={ENTRY_CATEGORIES[cat].icon}
              selected={catFilter === cat}
              onPress={() => setCatFilter(cat)}
            />
          ))}
        </ScrollView>
      </FadeIn>

      {sorted.length === 0 ? (
        <EmptyState
          title={'Chưa có mục phù hợp'}
          message={'Thử bỏ bộ lọc hoặc bấm "Ghi thành tích mới" để thêm nhé.'}
        />
      ) : (
        sorted.map((entry, i) => {
          const status = ENTRY_STATUSES[entry.status];
          const kind = ENTRY_KINDS[entry.kind];
          const category = ENTRY_CATEGORIES[entry.category];
          const canOpenForm =
            canEditClass || (entry.status === 'pending' && entry.studentId === currentStudentId);
          return (
            <FadeIn key={entry.id} index={Math.min(i + 5, 10)}>
              <Card
                style={styles.card}
                onPress={
                  canOpenForm
                    ? () => router.push({ pathname: '/entry-form', params: { id: entry.id } } as never)
                    : () =>
                        router.push({
                          pathname: '/student/[id]',
                          params: { id: entry.studentId },
                        } as never)
                }>
                <View style={styles.head}>
                  <View style={[styles.iconBox, { backgroundColor: theme[kind.soft] }]}>
                    <Ionicons name={kind.icon} size={20} color={theme[kind.color]} />
                  </View>
                  <View style={styles.headBody}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                      {entry.title}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {(getStudent(entry.studentId)?.name ?? 'Học sinh đã xoá') +
                        ' · ' +
                        formatDate(entry.date)}
                    </Text>
                  </View>
                  {entry.points > 0 ? (
                    <View style={[styles.points, { backgroundColor: theme[kind.soft] }]}>
                      <Text style={[styles.pointsValue, { color: theme[kind.color] }]}>
                        {'+' + entry.points}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {entry.description ? (
                  <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {entry.description}
                  </Text>
                ) : null}

                <View style={styles.badges}>
                  <Badge label={status.label} color={status.color} soft={status.soft} icon={status.icon} />
                  <Badge label={category.label} color={'purple'} soft={'purpleSoft'} icon={category.icon} />
                  <Badge label={ENTRY_LEVELS[entry.level].label} color={'accentText'} soft={'accentSoft'} />
                  {entry.proofUrl ? (
                    <Pressable
                      onPress={() => openProof(entry.proofUrl!)}
                      style={[styles.proofChip, { backgroundColor: theme.backgroundElement }]}>
                      <Ionicons name="link" size={12} color={theme.accentText} />
                      <Text style={[styles.proofText, { color: theme.accentText }]}>Minh chứng</Text>
                    </Pressable>
                  ) : null}
                </View>

                {entry.reviewNote ? (
                  <View style={[styles.noteBox, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color={theme.textSecondary} />
                    <Text style={[styles.noteText, { color: theme.textSecondary }]}>
                      {'GVCN: ' + entry.reviewNote}
                    </Text>
                  </View>
                ) : null}

                {role === 'teacher' && entry.status === 'pending' ? (
                  <View style={[styles.actions, { borderColor: theme.border }]}>
                    <Button
                      label={'Duyệt'}
                      size={'sm'}
                      icon={'checkmark-circle'}
                      style={styles.flex}
                      onPress={() => {
                        setEntryStatus(entry.id, 'approved');
                        showToast('Đã duyệt thành tích!');
                      }}
                    />
                    <Button
                      label={'Từ chối'}
                      size={'sm'}
                      variant={'danger'}
                      icon={'close-circle'}
                      style={styles.flex}
                      onPress={() => {
                        setEntryStatus(entry.id, 'rejected');
                        showToast('Đã từ chối mục này', 'warning');
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ctaRow: { flexDirection: 'row', gap: Spacing.two },
  filters: { gap: Spacing.two, paddingRight: Spacing.three },
  card: { gap: Spacing.two + 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  headBody: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  desc: { fontSize: 13, lineHeight: 19 },
  points: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  pointsValue: { fontSize: 14, fontWeight: '900' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  proofChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  proofText: { fontSize: 11, fontWeight: '700' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  noteText: { fontSize: 12, flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
