import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { SUBJECT_TEACHER_PRESETS } from '@/constants/utilities-meta';
import { useTheme } from '@/hooks/use-theme';
import { evaluatePasswordStrength, normalizeLoginIdDisplay } from '@/lib/student-accounts';
import {
  MIN_TEACHER_PASSWORD_LENGTH,
  findTeacherAccountById,
  isTeacherLoginIdTaken,
  suggestNextTeacherLoginId,
  validateTeacherLoginId,
  type TeacherAccountRecord,
  type TeacherRole,
} from '@/lib/teacher-accounts';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';

const TEACHER_ROLE_OPTIONS: {
  value: TeacherRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'teacher', label: 'GV Chủ nhiệm', icon: 'shield-checkmark-outline' },
  { value: 'subject_teacher', label: 'GV Bộ môn', icon: 'book-outline' },
];

export default function TeacherFormScreen() {
  const { id, role: initialRoleParam } = useLocalSearchParams<{
    id?: string;
    role?: string;
  }>();
  const auth = useAuth();
  const { isTeacher, isSubjectTeacher, logActivity } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();

  const canAccessScreen = isTeacher || isSubjectTeacher;
  const isEditing = Boolean(id);

  const [loadingRecord, setLoadingRecord] = useState(isEditing);
  const [existing, setExisting] = useState<TeacherAccountRecord | null>(null);

  const defaultRole: TeacherRole =
    initialRoleParam === 'subject_teacher'
      ? 'subject_teacher'
      : initialRoleParam === 'teacher'
        ? 'teacher'
        : isTeacher
          ? 'teacher'
          : 'subject_teacher';

  const [role, setRole] = useState<TeacherRole>(defaultRole);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [subject, setSubject] = useState(SUBJECT_TEACHER_PRESETS[0].subject);
  const [customSubject, setCustomSubject] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [takenIdMatch, setTakenIdMatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load existing teacher account when editing
  useEffect(() => {
    if (!id) return;
    let active = true;
    findTeacherAccountById(id)
      .then((record) => {
        if (!active) return;
        setExisting(record);
        if (record) {
          setRole(record.role);
          setName(record.name);
          setLoginId(record.loginId);
          setIdManuallyEdited(true);
          if (record.subject) {
            const preset = SUBJECT_TEACHER_PRESETS.find(
              (p) => p.subject.toLowerCase() === record.subject?.toLowerCase(),
            );
            if (preset) {
              setSubject(preset.subject);
              setCustomSubject('');
            } else {
              setCustomSubject(record.subject);
            }
          }
        }
      })
      .finally(() => {
        if (active) setLoadingRecord(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Auto-suggest an available Teacher Login ID when creating a new account
  useEffect(() => {
    if (isEditing || idManuallyEdited) return;
    let active = true;
    suggestNextTeacherLoginId(role)
      .then((suggested) => {
        if (active) setLoginId(suggested);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isEditing, idManuallyEdited, role]);

  const cleanIdPreview = normalizeLoginIdDisplay(loginId);

  // Live duplicate-ID check
  useEffect(() => {
    if (!cleanIdPreview) return;
    let active = true;
    const timer = setTimeout(() => {
      isTeacherLoginIdTaken(cleanIdPreview, existing?.teacherId)
        .then((taken) => {
          if (active) setTakenIdMatch(taken ? cleanIdPreview : null);
        })
        .catch(() => {});
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cleanIdPreview, existing?.teacherId]);

  const idTaken = Boolean(cleanIdPreview) && takenIdMatch === cleanIdPreview;
  const idSyntaxError = cleanIdPreview ? validateTeacherLoginId(cleanIdPreview) : null;
  const strength = evaluatePasswordStrength(password);
  const effectiveSubject = customSubject.trim() || subject;
  const needsGvcnCode = !isEditing && !isTeacher && role === 'teacher';
  const isSelfAccount = Boolean(existing && auth.teacherId && existing.teacherId === auth.teacherId);
  const isBlockedEdit = Boolean(isEditing && !isTeacher && !isSelfAccount);

  const handleSuggestId = async () => {
    setError(null);
    const suggested = await suggestNextTeacherLoginId(role);
    setLoginId(suggested);
    setIdManuallyEdited(false);
  };

  const save = async () => {
    if (saving || !canAccessScreen) return;
    setError(null);

    if (isBlockedEdit) {
      showToast('Chỉ GVCN mới được sửa tài khoản giáo viên khác.', 'warning');
      return;
    }
    if (!name.trim() || name.trim().length < 2) {
      setError('Vui lòng nhập họ và tên Thầy / Cô (tối thiểu 2 ký tự).');
      return;
    }
    if (role === 'subject_teacher' && !effectiveSubject) {
      setError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
      return;
    }

    const idErr = validateTeacherLoginId(loginId);
    if (idErr) {
      setError(idErr);
      return;
    }

    if (!isEditing) {
      if (password.trim().length < MIN_TEACHER_PASSWORD_LENGTH) {
        setError(`Vui lòng đặt mật khẩu riêng tối thiểu ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`);
        return;
      }
      if (password.trim() !== confirmPassword.trim()) {
        setError('Mật khẩu xác nhận không khớp. Vui lòng nhập lại!');
        return;
      }
      if (needsGvcnCode && !accessCode.trim()) {
        setError('Vui lòng nhập Mã xác thực GVCN để tạo tài khoản Giáo viên chủ nhiệm.');
        return;
      }
    } else if (
      password.trim().length > 0 &&
      password.trim().length < MIN_TEACHER_PASSWORD_LENGTH
    ) {
      setError(`Mật khẩu mới cần tối thiểu ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`);
      return;
    }

    setSaving(true);
    try {
      const roleLabel =
        role === 'teacher' ? 'GV Chủ nhiệm' : `GV Bộ môn (${effectiveSubject})`;

      if (existing) {
        const res = await auth.editTeacherAccount({
          teacherId: existing.teacherId,
          name,
          role: isTeacher ? role : existing.role,
          subject: role === 'subject_teacher' ? effectiveSubject : null,
          newLoginId: cleanIdPreview,
          newPassword: password.trim() || undefined,
        });
        if (!res.ok) {
          const msg = res.error ?? 'Không thể cập nhật tài khoản giáo viên.';
          setError(msg);
          showToast(msg, 'danger');
          return;
        }
        logActivity(
          password.trim()
            ? `Cập nhật & đặt lại mật khẩu tài khoản ${roleLabel} ${name.trim()} (ID: ${cleanIdPreview})`
            : `Cập nhật tài khoản ${roleLabel} ${name.trim()} (ID: ${cleanIdPreview})`,
        );
        showToast(
          password.trim()
            ? 'Đã cập nhật hồ sơ & đặt lại mật khẩu giáo viên!'
            : 'Đã cập nhật tài khoản giáo viên!',
        );
        router.back();
        return;
      }

      const res = await auth.createTeacherAccount({
        name,
        loginId: cleanIdPreview,
        password,
        role,
        subject: role === 'subject_teacher' ? effectiveSubject : null,
        teacherAccessCode: needsGvcnCode ? accessCode : undefined,
      });

      if (!res.ok || !res.account) {
        const msg = res.error ?? 'Không thể tạo tài khoản giáo viên.';
        setError(msg);
        showToast(msg, 'danger');
        return;
      }

      logActivity(`Tạo tài khoản ${roleLabel} ${res.account.name} (ID: ${res.account.loginId})`);
      showToast(
        `Đã tạo tài khoản ${roleLabel} ${res.account.name} (ID: ${res.account.loginId})! 🛡️`,
      );
      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu tài khoản giáo viên';
      setError(msg);
      showToast(msg, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing || !isTeacher || isSelfAccount) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      showToast('Bấm lần nữa để xác nhận xoá tài khoản giáo viên', 'warning');
      return;
    }
    const res = await auth.deleteTeacherAccount(existing.teacherId);
    if (!res.ok) {
      showToast(res.error ?? 'Không thể xoá tài khoản giáo viên', 'danger');
      return;
    }
    logActivity(`Xoá tài khoản giáo viên ${existing.name} (ID: ${existing.loginId})`);
    showToast('Đã xoá tài khoản giáo viên', 'warning');
    router.back();
  };

  if (!canAccessScreen) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <ModalHeader title={'Tài khoản giáo viên'} subtitle={'Yêu cầu quyền giáo viên'} />
        <View style={styles.centerPad}>
          <EmptyState
            icon={'lock-closed-outline'}
            title={'Chỉ Giáo viên mới có quyền tạo tài khoản giáo viên'}
            message={'Hãy đăng nhập bằng tài khoản GV Chủ nhiệm hoặc GV Bộ môn để sử dụng mục này.'}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={isEditing ? 'Sửa tài khoản giáo viên' : 'Tạo tài khoản giáo viên mới'}
        subtitle={
          existing
            ? `ID: ${existing.loginId}`
            : 'Cấp Mã ID duy nhất & mật khẩu riêng cho GVCN / GV Bộ môn'
        }
        actionLabel={isBlockedEdit || loadingRecord ? undefined : saving ? 'Đang lưu...' : 'Lưu'}
        onAction={isBlockedEdit || loadingRecord || saving ? undefined : save}
      />

      {loadingRecord ? (
        <View style={styles.centerPad}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : isEditing && !existing ? (
        <View style={styles.centerPad}>
          <EmptyState
            icon={'alert-circle-outline'}
            title={'Không tìm thấy tài khoản giáo viên'}
            message={'Tài khoản này có thể đã bị xoá trước đó.'}
          />
        </View>
      ) : (
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

            {/* Role Picker: Homeroom Teacher vs Subject Teacher */}
            {(!isEditing || isTeacher) ? (
              <OptionPicker
                label={'Vai trò tài khoản giáo viên'}
                columns={2}
                options={TEACHER_ROLE_OPTIONS}
                value={role}
                onChange={(nextRole) => {
                  setRole(nextRole);
                  setError(null);
                }}
              />
            ) : null}

            {/* Subject Picker when role === subject_teacher */}
            {role === 'subject_teacher' ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Bộ môn giảng dạy
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subjectRow}>
                  {SUBJECT_TEACHER_PRESETS.map((item) => (
                    <Chip
                      key={item.subject}
                      label={`${item.emoji} ${item.subject}`}
                      selected={!customSubject.trim() && subject === item.subject}
                      onPress={() => {
                        setSubject(item.subject);
                        setCustomSubject('');
                        setError(null);
                      }}
                    />
                  ))}
                </ScrollView>
                <TextField
                  label={'Hoặc nhập tên môn khác (tuỳ chọn)'}
                  icon={'book-outline'}
                  placeholder={'VD: Robotics, Kỹ năng mềm...'}
                  value={customSubject}
                  onChangeText={(v) => {
                    setCustomSubject(v);
                    setError(null);
                  }}
                />
              </View>
            ) : null}

            <TextField
              label={'Họ và tên Thầy / Cô'}
              icon={'person-outline'}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              placeholder={
                role === 'subject_teacher'
                  ? 'VD: Cô Nguyễn Lan Anh / Thầy Minh'
                  : 'VD: Thầy Ngô Vũ Hảo'
              }
            />

            {/* Credentials Card: Unique Teacher Login ID + Personal Password */}
            <Card style={[styles.credCard, { borderColor: theme.warning, borderWidth: 1 }]}>
              <View style={styles.credHead}>
                <View style={[styles.credIcon, { backgroundColor: theme.warningSoft }]}>
                  <Ionicons name="shield-checkmark" size={18} color={theme.warning} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.credTitle, { color: theme.text }]}>
                    Mã ID & Mật khẩu riêng của Giáo viên
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                    {role === 'teacher'
                      ? 'Tài khoản GV Chủ nhiệm có toàn quyền quản lý lớp, xem toàn bộ học sinh & tạo tài khoản mới.'
                      : 'Tài khoản GV Bộ môn có quyền đăng bảng tin, dặn dò & lịch kiểm tra cho lớp 10T4.'}
                  </Text>
                </View>
              </View>

              {/* Unique Teacher Login ID */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    Mã ID giáo viên (duy nhất)
                  </Text>
                  {!isEditing ? (
                    <Pressable
                      onPress={handleSuggestId}
                      style={[styles.suggestPill, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="sparkles" size={12} color={theme.accentText} />
                      <Text style={[styles.suggestText, { color: theme.accentText }]}>
                        Gợi ý ID trống
                      </Text>
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
                    color={idTaken || idSyntaxError ? theme.danger : theme.warning}
                  />
                  <TextInput
                    value={loginId}
                    onChangeText={(v) => {
                      setLoginId(v);
                      setIdManuallyEdited(true);
                      setError(null);
                    }}
                    placeholder={role === 'teacher' ? 'VD: GVCN-01, THAYHAO...' : 'VD: GVBM-01, GV-TOAN...'}
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
                    ⚠️ Mã ID “{cleanIdPreview}” đã trùng với tài khoản giáo viên khác — hãy chọn Mã
                    ID khác!
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
                    {isEditing
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
                  <Ionicons name="key-outline" size={18} color={theme.warning} />
                  <TextInput
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setError(null);
                    }}
                    placeholder={
                      isEditing
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

              {!isEditing ? (
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
                      placeholder={'Nhập lại mật khẩu vừa đặt...'}
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.rawInput, { color: theme.text }]}
                    />
                  </View>
                </View>
              ) : null}

              {/* Extra GVCN access code only if a Subject Teacher wants to create a GVCN account */}
              {needsGvcnCode ? (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    Mã xác thực GV Chủ nhiệm (bắt buộc khi cấp quyền GVCN)
                  </Text>
                  <View
                    style={[
                      styles.inputBox,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.warning },
                    ]}>
                    <Ionicons name="shield-outline" size={18} color={theme.warning} />
                    <TextInput
                      value={accessCode}
                      onChangeText={(v) => {
                        setAccessCode(v);
                        setError(null);
                      }}
                      placeholder={'Nhập mã bảo mật giáo viên lớp...'}
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

            <Card>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                🛡️ Sau khi tạo, giáo viên mới có thể đăng nhập trực tiếp tại màn hình Đăng nhập bằng{' '}
                <Text style={{ fontWeight: '800', color: theme.text }}>
                  Mã ID ({cleanIdPreview || 'GVCN-01'})
                </Text>{' '}
                và mật khẩu riêng vừa đặt, với không gian giao diện & nhật ký tách biệt.
              </Text>
            </Card>

            {isBlockedEdit ? (
              <Card>
                <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700', lineHeight: 19 }}>
                  Chỉ Giáo viên chủ nhiệm mới được chỉnh sửa tài khoản của giáo viên khác.
                </Text>
              </Card>
            ) : (
              <Button
                label={
                  saving
                    ? 'Đang lưu...'
                    : isEditing
                      ? 'Lưu thay đổi'
                      : 'Tạo tài khoản giáo viên'
                }
                icon={'shield-checkmark'}
                disabled={saving}
                onPress={save}
              />
            )}

            {existing && isTeacher && !isSelfAccount ? (
              <Button
                label={
                  confirmDelete
                    ? 'Bấm lần nữa để xoá vĩnh viễn'
                    : 'Xoá tài khoản giáo viên này'
                }
                variant={'danger'}
                icon={'trash-outline'}
                onPress={handleDelete}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centerPad: { flex: 1, justifyContent: 'center', padding: Spacing.four },
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
  subjectRow: { gap: Spacing.two, paddingRight: Spacing.two },
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
});
