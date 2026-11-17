import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';

export default function StudentsScreen() {
  const { ranking, statsOfStudent, role } = useClassStore();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ranking.filter((row) => row.student.name.toLowerCase().includes(q)) : ranking;
  }, [ranking, query]);

  return (
    <Screen>
      <SectionHeader title={'Học sinh'} subtitle={rows.length + ' học sinh'} />
      {role === 'teacher' ? (
        <Button label={'Thêm học sinh'} icon={'person-add-outline'} onPress={() => router.push('/student-form' as never)} />
      ) : null}
      <TextField icon={'search'} placeholder={'Tìm theo tên...'} value={query} onChangeText={setQuery} />
      {rows.length === 0 ? (
        <EmptyState icon={'people-outline'} title={'Không tìm thấy học sinh'} />
      ) : (
        rows.map((row) => {
          const stats = statsOfStudent(row.student.id);
          return (
            <Card key={row.student.id} style={styles.row} onPress={() => router.push({ pathname: '/student/[id]', params: { id: row.student.id } } as never)}>
              <Avatar name={row.student.name} />
              <View style={styles.body}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {row.student.name}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {(row.student.position ?? 'Học sinh') + ' · ' + (row.student.group ?? '-') + ' · ' + stats.total + ' mục'}
                </Text>
              </View>
              <Text style={[styles.points, { color: theme.accentText }]}>{row.points + ' đ'}</Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  points: { fontSize: 15, fontWeight: '800' },
});
