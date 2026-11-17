import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';

export default function SettingsScreen() {
  const { role, setRole, classInfo, currentStudent, signInAs, students, resetDemoData } = useClassStore();
  const theme = useTheme();

  return (
    <Screen>
      <SectionHeader
        title={'Cài đặt'}
        subtitle={'Lớp ' + classInfo.name + ' · GVCN: ' + classInfo.teacherName}
      />

      <Card style={styles.card}>
        <Text style={[styles.label, { color: theme.text }]}>Vai trò hiện tại</Text>
        <View style={styles.row}>
          <Chip label={'Giáo viên'} icon={'school-outline'} selected={role === 'teacher'} onPress={() => setRole('teacher')} />
          <Chip label={'Học sinh'} icon={'people-outline'} selected={role === 'student'} onPress={() => setRole('student')} />
        </View>
        {role === 'student' ? (
          <View style={styles.row}>
            {students.slice(0, 8).map((s) => (
              <Chip key={s.id} label={s.name} selected={currentStudent?.id === s.id} onPress={() => signInAs(s.id)} />
            ))}
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={[styles.label, { color: theme.text }]}>Dữ liệu</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          Dữ liệu được lưu ngay trên máy. Bấm nút dưới để khôi phục dữ liệu mẫu.
        </Text>
        <Button label={'Khôi phục dữ liệu mẫu'} variant={'danger'} icon={'refresh-outline'} onPress={resetDemoData} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  label: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
