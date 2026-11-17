import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { ENTRY_LEVELS, ENTRY_STATUSES } from '@/constants/entry-meta';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import { useClassStore } from '@/store/class-store';

export default function FeedScreen() {
  const { entries, role, getStudent, setEntryStatus } = useClassStore();
  const theme = useTheme();
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen>
      <SectionHeader title={'Nhật ký thành tích'} subtitle={sorted.length + ' mục, mới nhất ở trên'} />
      <Button label={'Ghi thành tích mới'} icon={'add'} onPress={() => router.push('/entry-form' as never)} />
      {sorted.length === 0 ? (
        <EmptyState title={'Chưa có thành tích nào'} message={'Các mục học sinh gửi lên sẽ hiện ở đây.'} />
      ) : (
        sorted.map((entry) => {
          const status = ENTRY_STATUSES[entry.status];
          return (
            <Card key={entry.id} style={styles.card} onPress={() => router.push({ pathname: '/entry-form', params: { id: entry.id } } as never)}>
              <View style={styles.badges}>
                <Badge label={status.label} color={status.color} soft={status.soft} icon={status.icon} />
                <Badge label={ENTRY_LEVELS[entry.level].label} color={'accentText'} soft={'accentSoft'} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>{entry.title}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {(getStudent(entry.studentId)?.name ?? 'Học sinh đã xoá') + ' · ' + formatDate(entry.date) + ' · ' + entry.points + ' điểm'}
              </Text>
              {role === 'teacher' && entry.status === 'pending' ? (
                <View style={styles.actions}>
                  <Button label={'Duyệt'} size={'sm'} icon={'checkmark-circle'} onPress={() => setEntryStatus(entry.id, 'approved')} />
                  <Button label={'Từ chối'} size={'sm'} variant={'danger'} onPress={() => setEntryStatus(entry.id, 'rejected')} />
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  badges: { flexDirection: 'row', gap: Spacing.two },
  title: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
});
