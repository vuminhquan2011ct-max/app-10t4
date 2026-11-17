import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { GENDERS, GENDER_LIST, GROUP_PRESETS, POSITION_PRESETS } from '@/constants/entry-meta';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';
import type { Gender } from '@/types/models';

export default function StudentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getStudent, addStudent, updateStudent, removeStudent } = useClassStore();
  const theme = useTheme();
  const existing = id ? getStudent(id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [gender, setGender] = useState<Gender>(existing?.gender ?? 'male');
  const [birthDate, setBirthDate] = useState<string | null>(existing?.birthDate ?? null);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [position, setPosition] = useState(existing?.position ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (!name.trim()) {
      setError('Vui lòng nhập họ và tên');
      return;
    }
    const data = { name, gender, birthDate, phone, email, address, group, position, note };
    if (existing) updateStudent(existing.id, data);
    else addStudent(data);
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    removeStudent(existing.id);
    router.dismissAll();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={existing ? 'Sửa học sinh' : 'Thêm học sinh'}
        subtitle={existing?.code}
        actionLabel={'Lưu'}
        onAction={save}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          <TextField label={'Họ và tên'} icon={'person-add-outline'} value={name} onChangeText={(v) => { setName(v); setError(null); }} placeholder={'Nguyễn Văn A'} error={error} />
          <OptionPicker
            label={'Giới tính'}
            columns={3}
            options={GENDER_LIST.map((g) => ({ value: g, label: GENDERS[g].label, icon: GENDERS[g].icon }))}
            value={gender}
            onChange={setGender}
          />
          <DatePickerField label={'Ngày sinh'} value={birthDate} onChange={setBirthDate} clearable onClear={() => setBirthDate(null)} />
          <OptionPicker
            label={'Tổ'}
            layout={'row'}
            options={GROUP_PRESETS.map((g) => ({ value: g, label: g }))}
            value={group || null}
            onChange={setGroup}
          />
          <OptionPicker
            label={'Chức vụ'}
            layout={'row'}
            options={POSITION_PRESETS.map((p) => ({ value: p, label: p }))}
            value={position || null}
            onChange={(p) => setPosition(position === p ? '' : p)}
          />
          <TextField label={'Số điện thoại'} icon={'call-outline'} value={phone} onChangeText={setPhone} keyboardType={'phone-pad'} />
          <TextField label={'Email'} icon={'mail-outline'} value={email} onChangeText={setEmail} keyboardType={'email-address'} autoCapitalize={'none'} />
          <TextField label={'Địa chỉ'} icon={'location-outline'} value={address} onChangeText={setAddress} />
          <TextField label={'Ghi chú của giáo viên'} icon={'document-text-outline'} value={note} onChangeText={setNote} multiline />
          <Button label={existing ? 'Lưu thay đổi' : 'Thêm học sinh'} icon={'checkmark-circle'} onPress={save} />
          {existing ? (
            <Button label={confirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá học sinh'} variant={'danger'} icon={'trash-outline'} onPress={remove} />
          ) : null}
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
