import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { EntryCard } from '@/components/entry-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ageOf, formatDate } from '@/lib/date';
import { useClassStore } from '@/store/class-store';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getStudent, entriesOfStudent, statsOfStudent, role } = useClassStore();
  const theme = useTheme();
  const student = id ? getStudent(id) : undefined;

  if (!student) {
    return (
      <Screen withTabBar={false}>
        <EmptyState icon={'person-outline'} title={'Không tìm thấy học sinh'} />
        <Button label={'Quay lại'} variant={'soft'} onPress={() => router.back()} />
      </Screen>
    );
  }

  const entries = entriesOfStudent(student.id);
  const stats = statsOfStudent(student.id);
  const age = ageOf(student.birthDate);

  return (
    <Screen withTabBar={false}>
      <Button label={'Quay lại'} variant={'ghost'} size={'sm'} icon={'chevron-back'} onPress={() => router.back()} style={styles.back} />
      <Card style={styles.profile}>
        <Avatar name={student.name} size={72} />
        <Text style={[styles.name, { color: theme.text }]}>{student.name}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {[student.code, student.position, student.group].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          {'Sinh ngày ' + formatDate(student.birthDate) + (age !== null ? ' (' + age + ' tuổi)' : '')}
        </Text>
      </Card>

      <View style={styles.grid}>
        <StatCard label={'Điểm thi đua'} value={stats.points} icon={'ribbon-outline'} tone={'success'} />
        <StatCard label={'Thành tích'} value={stats.achievements} icon={'trophy-outline'} tone={'accent'} />
      </View>
      <View style={styles.grid}>
        <StatCard label={'Hoạt động'} value={stats.activities} icon={'sparkles-outline'} tone={'purple'} />
        <StatCard label={'Chờ duyệt'} value={stats.pending} icon={'time-outline'} tone={'warning'} />
      </View>

      <View style={styles.actions}>
        {role === 'teacher' ? (
          <Button label={'Sửa hồ sơ'} variant={'soft'} icon={'create-outline'} style={styles.flex} onPress={() => router.push({ pathname: '/student-form', params: { id: student.id } } as never)} />
        ) : null}
        <Button label={'Ghi thành tích'} icon={'add'} style={styles.flex} onPress={() => router.push({ pathname: '/entry-form', params: { studentId: student.id } } as never)} />
      </View>

      <SectionHeader title={'Thành tích & hoạt động'} subtitle={entries.length + ' mục'} />
      {entries.length === 0 ? (
        <EmptyState title={'Chưa có mục nào'} message={'Hãy ghi thành tích đầu tiên cho học sinh này.'} />
      ) : (
        entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onPress={() => router.push({ pathname: '/entry-form', params: { id: entry.id } } as never)} />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  profile: { alignItems: 'center', gap: Spacing.one },
  name: { fontSize: 22, fontWeight: '800', marginTop: Spacing.two },
  grid: { flexDirection: 'row', gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
