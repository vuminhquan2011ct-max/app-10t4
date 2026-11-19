import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GENDERS, GENDER_LIST, GROUP_PRESETS, POSITION_PRESETS } from '@/constants/entry-meta';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatBirthDateForInput, normalizeBirthDateInput } from '@/lib/date';
import { useClassStore } from '@/store/class-store';
import type { Gender } from '@/types/models';

export default function StudentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    getStudent,
    addStudent,
    updateStudent,
    removeStudent,
    saveStudentPrivate,
    saveStudentNote,
    isTeacher,
    canManagePrivate,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();
  const existing = id ? getStudent(id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [gender, setGender] = useState<Gender>(existing?.gender ?? 'male');
  const [birthDateInput, setBirthDateInput] = useState<string>(
    formatBirthDateForInput(existing?.birthDate),
  );
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [position, setPosition] = useState(existing?.position ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setError('Vui lòng nhập họ và tên');
      return;
    }
    const birthDate = normalizeBirthDateInput(birthDateInput);
    const publicData = { name, gender, birthDate, group, position };
    let targetId = existing?.id ?? '';

    if (existing) {
      updateStudent(existing.id, publicData);
    } else {
      targetId = addStudent(publicData);
    }

    if (canManagePrivate && targetId) {
      try {
        await Promise.all([
          saveStudentPrivate(targetId, { phone, email, address }),
          saveStudentNote(targetId, note),
        ]);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Lưu thông tin bảo mật thất bại', 'warning');
      }
    }

    showToast(existing ? 'Đã cập nhật hồ sơ học sinh!' : `Đã thêm học sinh ${name.trim()}!`);
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      showToast('Bấm lần nữa để xác nhận xoá học sinh', 'warning');
      return;
    }
    removeStudent(existing.id);
    showToast('Đã xoá học sinh', 'warning');
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          <TextField
            label={'Họ và tên'}
            icon={'person-add-outline'}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder={'Nguyễn Văn A'}
            error={error}
          />
          <OptionPicker
            label={'Giới tính'}
            columns={3}
            options={GENDER_LIST.map((g) => ({
              value: g,
              label: GENDERS[g].label,
              icon: GENDERS[g].icon,
            }))}
            value={gender}
            onChange={setGender}
          />
          <TextField
            label={'Ngày tháng năm sinh'}
            icon={'calendar-outline'}
            value={birthDateInput}
            onChangeText={setBirthDateInput}
            placeholder={'VD: 15/08/2010'}
          />
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

          {canManagePrivate ? (
            <>
              <Text style={[styles.privBanner, { color: theme.accentText }]}>
                🔒 Thông tin bên dưới lưu trong bảng bảo mật riêng (chỉ người có quyền thấy)
              </Text>
              <TextField
                label={'Số điện thoại'}
                icon={'call-outline'}
                value={phone}
                onChangeText={setPhone}
                keyboardType={'phone-pad'}
              />
              <TextField
                label={'Email'}
                icon={'mail-outline'}
                value={email}
                onChangeText={setEmail}
                keyboardType={'email-address'}
                autoCapitalize={'none'}
              />
              <TextField
                label={'Địa chỉ'}
                icon={'location-outline'}
                value={address}
                onChangeText={setAddress}
              />
              <TextField
                label={'Ghi chú riêng của giáo viên'}
                icon={'document-text-outline'}
                value={note}
                onChangeText={setNote}
                multiline
              />
            </>
          ) : (
            <Card>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                🔒 Thông tin liên hệ cá nhân (SĐT, Email, Địa chỉ) và Ghi chú giáo viên chỉ hiển thị
                với GVCN hoặc cán sự được cấp quyền bảo mật.
              </Text>
            </Card>
          )}

          <Button
            label={existing ? 'Lưu thay đổi' : 'Thêm học sinh'}
            icon={'checkmark-circle'}
            onPress={save}
          />
          {existing && isTeacher ? (
            <Button
              label={confirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá học sinh'}
              variant={'danger'}
              icon={'trash-outline'}
              onPress={remove}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  privBanner: { fontSize: 12, fontWeight: '800', marginTop: Spacing.one },
});
