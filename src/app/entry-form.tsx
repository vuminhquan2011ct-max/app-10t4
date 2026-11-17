import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_KIND_LIST,
  ENTRY_LEVELS,
  ENTRY_LEVEL_LIST,
} from '@/constants/entry-meta';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { suggestedPoints } from '@/lib/stats';
import { useClassStore } from '@/store/class-store';
import type { EntryCategory, EntryKind, EntryLevel } from '@/types/models';

export default function EntryFormScreen() {
  const { id, studentId } = useLocalSearchParams<{ id?: string; studentId?: string }>();
  const { getEntry, addEntry, updateEntry, students, role, currentStudent } = useClassStore();
  const theme = useTheme();
  const existing = id ? getEntry(id) : undefined;
  const isStudent = role === 'student';

  const [owner, setOwner] = useState<string | null>(
    existing?.studentId ?? (isStudent ? (currentStudent?.id ?? null) : (studentId ?? null)),
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(existing?.kind ?? 'achievement');
  const [category, setCategory] = useState<EntryCategory>(existing?.category ?? 'study');
  const [level, setLevel] = useState<EntryLevel>(existing?.level ?? 'school');
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [points, setPoints] = useState(String(existing?.points ?? suggestedPoints('school')));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [proofUrl, setProofUrl] = useState(existing?.proofUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const changeLevel = (next: EntryLevel) => {
    setLevel(next);
    if (!existing) setPoints(String(suggestedPoints(next)));
  };

  const save = () => {
    if (!owner) {
      setError('Hãy chọn học sinh');
      return;
    }
    if (!title.trim()) {
      setError('Hãy nhập tên thành tích / hoạt động');
      return;
    }
    const numeric = Number.parseInt(points, 10);
    const data = {
      studentId: owner,
      title,
      kind,
      category,
      level,
      date,
      description,
      proofUrl,
      points: Number.isFinite(numeric) ? numeric : 0,
    };
    if (existing) updateEntry(existing.id, data);
    else addEntry({ ...data, submittedBy: role });
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={existing ? 'Sửa mục' : 'Ghi thành tích'}
        subtitle={isStudent ? 'Sẽ chờ giáo viên duyệt' : 'Giáo viên ghi trực tiếp'}
        actionLabel={'Lưu'}
        onAction={save}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {isStudent ? null : (
            <OptionPicker
              label={'Học sinh'}
              layout={'row'}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              value={owner}
              onChange={(v) => { setOwner(v); setError(null); }}
            />
          )}
          <OptionPicker
            label={'Loại'}
            options={ENTRY_KIND_LIST.map((k) => ({ value: k, label: ENTRY_KINDS[k].label, icon: ENTRY_KINDS[k].icon }))}
            value={kind}
            onChange={setKind}
          />
          <TextField label={'Tên thành tích / hoạt động'} icon={'trophy-outline'} value={title} onChangeText={(v) => { setTitle(v); setError(null); }} placeholder={'Giải Nhất Olympic Toán cấp trường'} error={error} />
          <OptionPicker
            label={'Lĩnh vực'}
            columns={3}
            options={ENTRY_CATEGORY_LIST.map((c) => ({ value: c, label: ENTRY_CATEGORIES[c].label, icon: ENTRY_CATEGORIES[c].icon }))}
            value={category}
            onChange={setCategory}
          />
          <OptionPicker
            label={'Cấp độ'}
            columns={3}
            options={ENTRY_LEVEL_LIST.map((l) => ({ value: l, label: ENTRY_LEVELS[l].label }))}
            value={level}
            onChange={changeLevel}
          />
          <DatePickerField label={'Ngày diễn ra'} value={date} onChange={setDate} />
          <TextField label={'Điểm thi đua'} icon={'ribbon-outline'} value={points} onChangeText={setPoints} keyboardType={'number-pad'} hint={'Gợi ý theo cấp độ, giáo viên có thể điều chỉnh khi duyệt.'} />
          <TextField label={'Mô tả'} icon={'document-text-outline'} value={description} onChangeText={setDescription} multiline />
          <TextField label={'Link minh chứng'} icon={'share-outline'} value={proofUrl} onChangeText={setProofUrl} autoCapitalize={'none'} placeholder={'https://...'} />
          <Button label={existing ? 'Lưu thay đổi' : 'Gửi lên'} icon={'checkmark-circle'} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six, maxWidth: 780, width: '100%', alignSelf: 'center' },
});
