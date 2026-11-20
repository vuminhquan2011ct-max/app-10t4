import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GENDERS, GENDER_LIST, GROUP_PRESETS, POSITION_PRESETS } from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatBirthDateForInput, normalizeBirthDateInput } from '@/lib/date';
import {
  MIN_STUDENT_PASSWORD_LENGTH,
  evaluatePasswordStrength,
  normalizeLoginIdDisplay,
  validateLoginId,
} from '@/lib/student-accounts';
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
    checkLoginIdTaken,
    suggestNextStudentCode,
    isTeacher,
    canViewAll,
    canEditClass,
    canAddStudents,
    canManagePrivate,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();
  const existing = id ? getStudent(id) : undefined;
  const isBlockedEdit = Boolean(existing && !canEditClass);

  const [name, setName] = useState(existing?.name ?? '');
  const [loginId, setLoginId] = useState(existing?.code ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [takenIdMatch, setTakenIdMatch] = useState<string | null>(null);

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
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-suggest an available Login ID when creating a new student
  useEffect(() => {
    if (existing) return;
    let active = true;
    suggestNextStudentCode()
      .then((suggested) => {
        if (active) setLoginId((prev) => (prev.trim() ? prev : suggested));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [existing, suggestNextStudentCode]);

  const cleanIdPreview = normalizeLoginIdDisplay(loginId);

  // Live duplicate-ID check
  useEffect(() => {
    if (!cleanIdPreview) return;
    let active = true;
    const timer = setTimeout(() => {
      checkLoginIdTaken(cleanIdPreview, existing?.id)
        .then((taken) => {
          if (active) setTakenIdMatch(taken ? cleanIdPreview : null);
        })
        .catch(() => {});
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cleanIdPreview, existing?.id, checkLoginIdTaken]);

  const idTaken = Boolean(cleanIdPreview) && takenIdMatch === cleanIdPreview;
  const idSyntaxError = cleanIdPreview ? validateLoginId(cleanIdPreview) : null;
  const strength = evaluatePasswordStrength(password);

  const handleSuggestId = async () => {
    setError(null);
    const suggested = await suggestNextStudentCode();
    setLoginId(suggested);
  };

  const save = async () => {
    if (saving) return;
    setError(null);

    if (existing && !canEditClass) {
      showToast('Chỉ GVCN mới được sửa hồ sơ học sinh.', 'warning');
      return;
    }
    if (!existing && !canAddStudents) {
      showToast('Bạn không có quyền thêm học sinh.', 'warning');
      return;
    }
    if (!name.trim()) {
      setError('Vui lòng nhập họ và tên học sinh');
      return;
    }

    const idErr = validateLoginId(loginId);
    if (idErr) {
      setError(idErr);
      return;
    }

    if (!existing) {
      if (password.trim().length < MIN_STUDENT_PASSWORD_LENGTH) {
        setError(`Vui lòng đặt mật khẩu riêng tối thiểu ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`);
        return;
      }
      if (password.trim() !== confirmPassword.trim()) {
        setError('Mật khẩu xác nhận không khớp. Vui lòng nhập lại!');
        return;
      }
    } else if (password.trim().length > 0 && password.trim().length < MIN_STUDENT_PASSWORD_LENGTH) {
      setError(`Mật khẩu mới cần tối thiểu ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`);
      return;
    }

    const birthDate = normalizeBirthDateInput(birthDateInput);
    const payload = {
      name,
      code: cleanIdPreview,
      password: password.trim() || undefined,
      gender,
      birthDate,
      group,
      position,
    };
    let targetId = existing?.id ?? '';

    setSaving(true);
    try {
      if (existing) {
        await updateStudent(existing.id, payload);
      } else {
        targetId = await addStudent(payload);
      }

      if (canManagePrivate && targetId) {
        try {
          await Promise.all([
            saveStudentPrivate(targetId, { phone, email, address }),
            saveStudentNote(targetId, note),
          ]);
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : 'Lưu thông tin bảo mật thất bại',
            'warning',
          );
        }
      }

      if (existing) {
        showToast(
          password.trim()
            ? 'Đã cập nhật hồ sơ & đặt lại mật khẩu học sinh!'
            : 'Đã cập nhật hồ sơ học sinh!',
        );
      } else if (canViewAll) {
        showToast(`Đã thêm ${name.trim()} (ID: ${cleanIdPreview}) với mật khẩu riêng!`);
      } else {
        showToast(
          `Đã tạo tài khoản ${name.trim()} (ID: ${cleanIdPreview})! Bạn có thể đăng xuất để đăng nhập vào ID này.`,
        );
      }
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu học sinh';
      setError(msg);
      showToast(msg, 'danger');
    } finally {
      setSaving(false);
    }
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
        title={existing ? 'Sửa học sinh' : 'Thêm tài khoản học sinh'}
        subtitle={existing ? `ID: ${existing.code}` : 'Đặt Số ID duy nhất & mật khẩu riêng'}
        actionLabel={isBlockedEdit ? undefined : saving ? 'Đang lưu...' : 'Lưu'}
        onAction={isBlockedEdit || saving ? undefined : save}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {error ? (
            <Card
              style={[
                styles.errBanner,
                { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
              ]}>
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <Text style={[styles.errText, { color: theme.danger }]}>{error}</Text>
            </Card>
          ) : null}

          <TextField
            label={'Họ và tên'}
            icon={'person-add-outline'}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder={'Nguyễn Văn A'}
          />

          {/* Account Credentials Card: Unique Login ID + Self-Chosen Password */}
          <Card style={[styles.credCard, { borderColor: theme.accent, borderWidth: 1 }]}>
            <View style={styles.credHead}>
              <View style={[styles.credIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="id-card" size={18} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.credTitle, { color: theme.text }]}>
                  Số ID & Mật khẩu riêng của học sinh
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Mỗi tài khoản chỉ thấy trang tên & bài đăng riêng của mình. Trùng Số ID sẽ báo
                  mật khẩu không đúng!
                </Text>
              </View>
            </View>

            {/* Unique Login ID field */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Số ID đăng nhập (duy nhất)
                </Text>
                {!existing ? (
                  <Pressable
                    onPress={handleSuggestId}
                    style={[styles.suggestPill, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="sparkles" size={12} color={theme.accentText} />
                    <Text style={[styles.suggestText, { color: theme.accentText }]}>Gợi ý ID</Text>
                  </Pressable>
                ) : null}
              </View>
              <View
                style={[
                  styles.inputBox,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor:
                      idTaken || idSyntaxError
                        ? theme.danger
                        : cleanIdPreview
                          ? theme.success
                          : theme.border,
                  },
                ]}>
                <Ionicons
                  name="id-card-outline"
                  size={18}
                  color={idTaken || idSyntaxError ? theme.danger : theme.accent}
                />
                <TextInput
                  value={loginId}
                  onChangeText={(v) => {
                    setLoginId(v);
                    setError(null);
                  }}
                  placeholder={'VD: 01, 10T4-01, HS05...'}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.rawInput, { color: theme.text }]}
                />
                {cleanIdPreview ? (
                  <Badge
                    label={
                      idSyntaxError ? 'Không hợp lệ' : idTaken ? 'Trùng ID' : 'Khả dụng'
                    }
                    color={idTaken || idSyntaxError ? 'danger' : 'success'}
                    soft={idTaken || idSyntaxError ? 'dangerSoft' : 'successSoft'}
                  />
                ) : null}
              </View>
              {idTaken ? (
                <Text style={{ color: theme.danger, fontSize: 11.5, fontWeight: '700' }}>
                  ⚠️ Số ID “{cleanIdPreview}” đã trùng với tài khoản khác — mật khẩu không đúng /
                  không thể tạo trùng ID!
                </Text>
              ) : idSyntaxError ? (
                <Text style={{ color: theme.danger, fontSize: 11.5, fontWeight: '700' }}>
                  {idSyntaxError}
                </Text>
              ) : null}
            </View>

            {/* Personal Password */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {existing
                    ? 'Đặt lại mật khẩu mới (tuỳ chọn)'
                    : 'Mật khẩu riêng tự đặt (bắt buộc)'}
                </Text>
                {password.length > 0 ? (
                  <Text
                    style={{
                      color: theme[strength.color],
                      fontSize: 11,
                      fontWeight: '800',
                    }}>
                    {strength.label}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.inputBox,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <Ionicons name="key-outline" size={18} color={theme.accent} />
                <TextInput
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError(null);
                  }}
                  placeholder={
                    existing
                      ? 'Để trống nếu giữ nguyên mật khẩu hiện tại...'
                      : 'Nhập mật khẩu riêng (tối thiểu 4 ký tự)...'
                  }
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.rawInput, { color: theme.text }]}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </View>
              {password.length > 0 ? (
                <View style={styles.strengthRow}>
                  {[1, 2, 3].map((step) => (
                    <View
                      key={step}
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            strength.score >= step ? theme[strength.color] : theme.border,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {!existing ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Nhập lại mật khẩu
                </Text>
                <View
                  style={[
                    styles.inputBox,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor:
                        confirmPassword.length > 0 && confirmPassword.trim() !== password.trim()
                          ? theme.danger
                          : theme.border,
                    },
                  ]}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={18}
                    color={
                      confirmPassword.length > 0 && confirmPassword.trim() === password.trim()
                        ? theme.success
                        : theme.textMuted
                    }
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      setError(null);
                    }}
                    placeholder={'Nhập lại mật khẩu riêng...'}
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.rawInput, { color: theme.text }]}
                  />
                </View>
              </View>
            ) : null}
          </Card>

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
                🔒 Sau khi tạo, tài khoản mới sẽ tách biệt hoàn toàn — chỉ chính học sinh đó (đăng
                nhập bằng Số ID & mật khẩu vừa đặt) và GVCN mới xem được trang của học sinh này.
              </Text>
            </Card>
          )}

          {isBlockedEdit ? (
            <Card>
              <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700', lineHeight: 19 }}>
                Chỉ Giáo viên chủ nhiệm mới được chỉnh sửa hồ sơ học sinh đã tạo. Bạn vẫn có thể
                thêm học sinh mới với Số ID & mật khẩu riêng!
              </Text>
            </Card>
          ) : (
            <Button
              label={
                saving
                  ? 'Đang lưu...'
                  : existing
                    ? 'Lưu thay đổi'
                    : 'Tạo tài khoản học sinh'
              }
              icon={'checkmark-circle'}
              disabled={saving}
              onPress={save}
            />
          )}
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
  errBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
  },
  errText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  credCard: { gap: Spacing.two + 2 },
  credHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  credIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credTitle: { fontSize: 15, fontWeight: '900' },
  fieldGroup: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  suggestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  suggestText: { fontSize: 11, fontWeight: '800' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  rawInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 9,
    ...({ outlineStyle: 'none' } as object),
  },
  strengthRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  privBanner: { fontSize: 12, fontWeight: '800', marginTop: Spacing.one },
});
