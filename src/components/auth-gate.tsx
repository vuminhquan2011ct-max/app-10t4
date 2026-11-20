/**
 * Role-Aware & Per-Student Private Sign-In Gate rendered before the class workspace.
 *
 * - Students sign in or register with their own unique Login ID (Số ID) &
 *   self-chosen personal password. Duplicate IDs with wrong passwords are
 *   strictly rejected.
 * - Each student only sees their own profile page, own posts, and isolated
 *   personal app usage (Coins, Stickers, Missions, Decor, Focus timer).
 * - Subject Teachers (`subject_teacher`) & Homeroom Teacher (`teacher`)
 *   authenticate using the dedicated teacher password (`K8T4`). Only GVCN sees all.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { SUBJECT_TEACHER_PRESETS } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import {
  MIN_STUDENT_PASSWORD_LENGTH,
  evaluatePasswordStrength,
  isLoginIdTaken,
  normalizeLoginIdDisplay,
  suggestNextLoginId,
  validateLoginId,
} from '@/lib/student-accounts';
import { useAuth, type AccountRole } from '@/store/auth-store';

type IoniconName = keyof typeof Ionicons.glyphMap;
type StudentAuthTab = 'login' | 'register';

const ROLE_TABS: { key: AccountRole; label: string; icon: IoniconName }[] = [
  { key: 'student', label: 'Học sinh', icon: 'person' },
  { key: 'subject_teacher', label: 'GV Bộ môn', icon: 'book' },
  { key: 'teacher', label: 'GV Chủ nhiệm', icon: 'shield-checkmark' },
];

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AccountRole>('student');
  const [pickedStudentTab, setPickedStudentTab] = useState<StudentAuthTab | null>(null);
  const studentTab: StudentAuthTab =
    pickedStudentTab ?? (auth.studentAccountCount === 0 ? 'register' : 'login');

  // Student Login / Register fields
  const [studentName, setStudentName] = useState('');
  const [studentLoginId, setStudentLoginId] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [studentConfirmPass, setStudentConfirmPass] = useState('');
  const [studentGroup, setStudentGroup] = useState<string>('');
  const [takenIdMatch, setTakenIdMatch] = useState<string | null>(null);
  const [showDuplicateLoginHint, setShowDuplicateLoginHint] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Teacher / Subject Teacher fields
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherDisplayName, setTeacherDisplayName] = useState('');
  const [subject, setSubject] = useState(SUBJECT_TEACHER_PRESETS[0].subject);
  const [customSubject, setCustomSubject] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const cleanIdPreview = normalizeLoginIdDisplay(studentLoginId);

  // Live duplicate-ID check when student is on Register tab
  useEffect(() => {
    if (mode !== 'student' || studentTab !== 'register' || !cleanIdPreview) return;
    let active = true;
    const timer = setTimeout(() => {
      isLoginIdTaken(cleanIdPreview)
        .then((taken) => {
          if (active) setTakenIdMatch(taken ? cleanIdPreview : null);
        })
        .catch(() => {});
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, studentTab, cleanIdPreview]);

  if (auth.loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Đang kiểm tra phiên đăng nhập...
        </Text>
      </View>
    );
  }

  if (auth.canEnterApp) {
    return <>{children}</>;
  }

  const effectiveSubject = customSubject.trim() || subject;
  const isTeacherTab = mode === 'teacher' || mode === 'subject_teacher';
  const activeError = localError || auth.error;
  const strength = evaluatePasswordStrength(studentPassword);
  const idTaken =
    mode === 'student' &&
    studentTab === 'register' &&
    Boolean(cleanIdPreview) &&
    takenIdMatch === cleanIdPreview;
  const idSyntaxError =
    studentTab === 'register' && cleanIdPreview ? validateLoginId(cleanIdPreview) : null;

  const clearErrors = () => {
    if (localError) setLocalError(null);
    if (auth.error) auth.clearError();
    if (showDuplicateLoginHint) setShowDuplicateLoginHint(false);
  };

  const handleSuggestId = async () => {
    clearErrors();
    const suggested = await suggestNextLoginId('10T4');
    setStudentLoginId(suggested);
  };

  const handleStudentLogin = async () => {
    clearErrors();
    const ok = await auth.signInAsStudent(studentLoginId, studentPassword);
    if (ok) {
      setStudentPassword('');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      showToast('Chào mừng trở lại không gian riêng của bạn! 🎉');
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const handleStudentRegister = async () => {
    clearErrors();
    if (!studentName.trim() || studentName.trim().length < 2) {
      setLocalError('Vui lòng nhập họ và tên đầy đủ của bạn.');
      return;
    }
    const syntaxErr = validateLoginId(studentLoginId);
    if (syntaxErr) {
      setLocalError(syntaxErr);
      return;
    }
    if (studentPassword.trim().length < MIN_STUDENT_PASSWORD_LENGTH) {
      setLocalError(`Mật khẩu riêng cần ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (studentPassword.trim() !== studentConfirmPass.trim()) {
      setLocalError('Mật khẩu xác nhận không khớp. Vui lòng nhập lại!');
      return;
    }

    const res = await auth.registerAndSignInStudent({
      name: studentName,
      loginId: studentLoginId,
      password: studentPassword,
      group: studentGroup || null,
    });

    if (res.ok) {
      setStudentPassword('');
      setStudentConfirmPass('');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      showToast(`Đã tạo tài khoản ID ${cleanIdPreview} & mở không gian riêng! 🎉`);
    } else {
      if (res.duplicateId && res.passwordMatched) {
        setShowDuplicateLoginHint(true);
      }
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    }
  };

  const handleTeacherSubmit = async () => {
    clearErrors();
    const ok = await auth.signInWithPassword(teacherPassword, teacherDisplayName, {
      mode,
      subjectName: mode === 'subject_teacher' ? effectiveSubject : null,
    });
    if (ok) {
      setTeacherPassword('');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (mode === 'subject_teacher') {
        showToast(
          `Chào mừng GV Bộ môn ${effectiveSubject}! Bạn có thể vào Bảng tin đăng thông báo 📚`,
        );
      } else {
        showToast('Đăng nhập Giáo viên chủ nhiệm thành công — Toàn quyền quản lý lớp! 🛡️');
      }
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: theme.background }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.accentSoft, theme.background]}
        style={styles.bgGlow}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.five },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.col}>
          {/* Brand Header */}
          <FadeIn index={0}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
              <View style={styles.bubbleA} />
              <View style={styles.bubbleB} />
              <View style={styles.shield}>
                <Ionicons
                  name={
                    mode === 'subject_teacher'
                      ? 'book'
                      : mode === 'teacher'
                        ? 'shield-checkmark'
                        : 'id-card'
                  }
                  size={34}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.heroTitle}>Quản lý Lớp 10T4</Text>
              <Text style={styles.heroSub}>
                THPT FPT · Tài khoản ID riêng tư · Bảo mật mật khẩu cá nhân
              </Text>

              <View style={styles.rewardTeaser}>
                <Text style={{ fontSize: 13 }}>🔒</Text>
                <Text style={styles.rewardTeaserText}>
                  Mỗi học sinh 1 Số ID & mật khẩu riêng · Chỉ GVCN xem toàn lớp
                </Text>
              </View>
            </LinearGradient>
          </FadeIn>

          {/* Error Banner */}
          {activeError ? (
            <FadeIn index={1}>
              <Card
                style={[
                  styles.errCardWrap,
                  { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                ]}>
                <View style={styles.errRow}>
                  <Ionicons name="alert-circle" size={18} color={theme.danger} />
                  <Text style={[styles.errText, { color: theme.danger }]}>{activeError}</Text>
                  <Pressable onPress={clearErrors} hitSlop={8}>
                    <Ionicons name="close" size={16} color={theme.danger} />
                  </Pressable>
                </View>
                {showDuplicateLoginHint ? (
                  <Button
                    label={`Chuyển sang Đăng nhập ID ${cleanIdPreview}`}
                    size={'sm'}
                    variant={'soft'}
                    icon={'log-in-outline'}
                    onPress={() => {
                      clearErrors();
                      setPickedStudentTab('login');
                    }}
                  />
                ) : null}
              </Card>
            </FadeIn>
          ) : null}

          {/* Main Auth Card */}
          <FadeIn index={1}>
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Chọn vai trò & Xác thực
              </Text>

              {/* 3-Role Switcher */}
              <View style={[styles.roleTabs, { backgroundColor: theme.backgroundElement }]}>
                {ROLE_TABS.map((t) => {
                  const active = mode === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        clearErrors();
                        setMode(t.key);
                      }}
                      style={[
                        styles.roleTab,
                        active && [styles.roleTabActive, { backgroundColor: theme.card }],
                      ]}>
                      <Ionicons
                        name={t.icon}
                        size={15}
                        color={active ? theme.accent : theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.roleTabLabel,
                          { color: active ? theme.text : theme.textSecondary },
                        ]}
                        numberOfLines={1}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* ==================== STUDENT MODE ==================== */}
              {mode === 'student' ? (
                <>
                  {/* Student Sub-mode Switcher: Login vs Register */}
                  <View style={[styles.subTabs, { backgroundColor: theme.backgroundElement }]}>
                    {(
                      [
                        { key: 'login', label: 'Đăng nhập ID', icon: 'log-in-outline' },
                        { key: 'register', label: 'Tạo tài khoản mới', icon: 'person-add-outline' },
                      ] as const
                    ).map((sub) => {
                      const active = studentTab === sub.key;
                      return (
                        <Pressable
                          key={sub.key}
                          onPress={() => {
                            clearErrors();
                            setPickedStudentTab(sub.key);
                          }}
                          style={[
                            styles.subTab,
                            active && [styles.roleTabActive, { backgroundColor: theme.card }],
                          ]}>
                          <Ionicons
                            name={sub.icon}
                            size={15}
                            color={active ? theme.accent : theme.textMuted}
                          />
                          <Text
                            style={[
                              styles.subTabText,
                              { color: active ? theme.accentText : theme.textSecondary },
                            ]}>
                            {sub.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {studentTab === 'login' ? (
                    <>
                      <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
                        Nhập đúng <Text style={{ fontWeight: '800', color: theme.text }}>Số ID</Text>{' '}
                        và <Text style={{ fontWeight: '800', color: theme.text }}>mật khẩu riêng</Text>{' '}
                        của bạn để mở trang cá nhân, bài đăng & vật phẩm sử dụng riêng.
                      </Text>

                      <TextField
                        label={'Số ID học sinh'}
                        icon={'id-card-outline'}
                        placeholder={'VD: 01, 10T4-01, HS05...'}
                        value={studentLoginId}
                        onChangeText={(t) => {
                          clearErrors();
                          setStudentLoginId(t);
                        }}
                        autoCapitalize={'characters'}
                        autoCorrect={false}
                        returnKeyType={'next'}
                      />

                      <View style={styles.passGroup}>
                        <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                          Mật khẩu riêng của tài khoản
                        </Text>
                        <View
                          style={[
                            styles.passBox,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor: activeError ? theme.danger : theme.border,
                            },
                          ]}>
                          <Ionicons name="lock-closed-outline" size={18} color={theme.accent} />
                          <TextInput
                            value={studentPassword}
                            onChangeText={(text) => {
                              clearErrors();
                              setStudentPassword(text);
                            }}
                            placeholder={'Nhập mật khẩu cá nhân của bạn...'}
                            placeholderTextColor={theme.textMuted}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={handleStudentLogin}
                            style={[styles.passInput, { color: theme.text }]}
                          />
                          <Pressable
                            onPress={() => setShowPassword((v) => !v)}
                            hitSlop={10}
                            accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={19}
                              color={theme.textSecondary}
                            />
                          </Pressable>
                        </View>
                      </View>

                      <Button
                        label={auth.busy ? 'Đang xác thực...' : 'Đăng nhập vào trang riêng 🔐'}
                        icon={'log-in'}
                        disabled={auth.busy}
                        onPress={handleStudentLogin}
                      />

                      <Pressable
                        onPress={() => {
                          clearErrors();
                          setPickedStudentTab('register');
                        }}
                        style={[styles.switchBanner, { backgroundColor: theme.accentSoft }]}>
                        <Ionicons name="person-add" size={15} color={theme.accentText} />
                        <Text style={[styles.switchBannerText, { color: theme.accentText }]}>
                          Chưa có tài khoản? Tạo tài khoản mới với Số ID & mật khẩu riêng →
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
                        Tự tạo tài khoản riêng cho bạn bằng cách đặt{' '}
                        <Text style={{ fontWeight: '800', color: theme.text }}>Số ID</Text> và{' '}
                        <Text style={{ fontWeight: '800', color: theme.text }}>mật khẩu cá nhân</Text>.
                        Nếu Số ID bị trùng với bạn khác, mật khẩu sẽ không khớp và bị chặn!
                      </Text>

                      <TextField
                        label={'Họ và tên học sinh'}
                        icon={'person-outline'}
                        placeholder={'VD: Nguyễn Minh Anh'}
                        value={studentName}
                        onChangeText={(t) => {
                          clearErrors();
                          setStudentName(t);
                        }}
                        returnKeyType={'next'}
                      />

                      <View style={styles.idFieldWrap}>
                        <View style={styles.idLabelRow}>
                          <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                            Số ID tự đặt (duy nhất)
                          </Text>
                          <Pressable
                            onPress={handleSuggestId}
                            style={[styles.suggestPill, { backgroundColor: theme.accentSoft }]}>
                            <Ionicons name="sparkles" size={12} color={theme.accentText} />
                            <Text style={[styles.suggestText, { color: theme.accentText }]}>
                              Gợi ý ID trống
                            </Text>
                          </Pressable>
                        </View>
                        <View
                          style={[
                            styles.passBox,
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
                            color={
                              idTaken || idSyntaxError
                                ? theme.danger
                                : cleanIdPreview
                                  ? theme.success
                                  : theme.textMuted
                            }
                          />
                          <TextInput
                            value={studentLoginId}
                            onChangeText={(t) => {
                              clearErrors();
                              setStudentLoginId(t);
                            }}
                            placeholder={'VD: 01, 10T4-01, 202601...'}
                            placeholderTextColor={theme.textMuted}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            returnKeyType="next"
                            style={[styles.passInput, { color: theme.text }]}
                          />
                          {cleanIdPreview ? (
                            <Badge
                              label={
                                idSyntaxError
                                  ? 'Không hợp lệ'
                                  : idTaken
                                    ? 'Trùng ID'
                                    : 'Khả dụng'
                              }
                              color={idTaken || idSyntaxError ? 'danger' : 'success'}
                              soft={idTaken || idSyntaxError ? 'dangerSoft' : 'successSoft'}
                            />
                          ) : null}
                        </View>
                        {idTaken ? (
                          <Text style={{ color: theme.danger, fontSize: 11.5, fontWeight: '700' }}>
                            ⚠️ Số ID “{cleanIdPreview}” đã được dùng — trùng ID sẽ báo mật khẩu
                            không đúng! Hãy chọn Số ID khác.
                          </Text>
                        ) : idSyntaxError ? (
                          <Text style={{ color: theme.danger, fontSize: 11.5, fontWeight: '700' }}>
                            {idSyntaxError}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.passGroup}>
                        <View style={styles.idLabelRow}>
                          <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                            Mật khẩu riêng tự đặt
                          </Text>
                          {studentPassword.length > 0 ? (
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
                            styles.passBox,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor: theme.border,
                            },
                          ]}>
                          <Ionicons name="key-outline" size={18} color={theme.accent} />
                          <TextInput
                            value={studentPassword}
                            onChangeText={(t) => {
                              clearErrors();
                              setStudentPassword(t);
                            }}
                            placeholder={'Đặt mật khẩu cá nhân (ít nhất 4 ký tự)...'}
                            placeholderTextColor={theme.textMuted}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="next"
                            style={[styles.passInput, { color: theme.text }]}
                          />
                          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={19}
                              color={theme.textSecondary}
                            />
                          </Pressable>
                        </View>

                        {/* 3-bar Password Strength Meter */}
                        {studentPassword.length > 0 ? (
                          <View style={styles.strengthRow}>
                            {[1, 2, 3].map((step) => (
                              <View
                                key={step}
                                style={[
                                  styles.strengthBar,
                                  {
                                    backgroundColor:
                                      strength.score >= step
                                        ? theme[strength.color]
                                        : theme.border,
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.passGroup}>
                        <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                          Nhập lại mật khẩu
                        </Text>
                        <View
                          style={[
                            styles.passBox,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor:
                                studentConfirmPass.length > 0 &&
                                studentConfirmPass.trim() !== studentPassword.trim()
                                  ? theme.danger
                                  : theme.border,
                            },
                          ]}>
                          <Ionicons
                            name="checkmark-done-outline"
                            size={18}
                            color={
                              studentConfirmPass.length > 0 &&
                              studentConfirmPass.trim() === studentPassword.trim()
                                ? theme.success
                                : theme.textMuted
                            }
                          />
                          <TextInput
                            value={studentConfirmPass}
                            onChangeText={(t) => {
                              clearErrors();
                              setStudentConfirmPass(t);
                            }}
                            placeholder={'Nhập lại mật khẩu vừa đặt...'}
                            placeholderTextColor={theme.textMuted}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="go"
                            onSubmitEditing={handleStudentRegister}
                            style={[styles.passInput, { color: theme.text }]}
                          />
                        </View>
                      </View>

                      {/* Optional Group Quick Picker */}
                      <View style={styles.passGroup}>
                        <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                          Tổ của bạn (tuỳ chọn)
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.subjectRow}>
                          {GROUP_PRESETS.map((g) => (
                            <Chip
                              key={g}
                              label={g}
                              selected={studentGroup === g}
                              onPress={() => setStudentGroup(studentGroup === g ? '' : g)}
                            />
                          ))}
                        </ScrollView>
                      </View>

                      <Button
                        label={
                          auth.busy
                            ? 'Đang tạo tài khoản...'
                            : 'Tạo tài khoản & Mở trang riêng ✨'
                        }
                        icon={'person-add'}
                        disabled={auth.busy}
                        onPress={handleStudentRegister}
                      />
                    </>
                  )}
                </>
              ) : (
                /* ==================== TEACHER / SUBJECT TEACHER MODE ==================== */
                <>
                  <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
                    {mode === 'subject_teacher'
                      ? 'Cổng dành riêng cho Giáo viên bộ môn — chọn môn giảng dạy & xác thực bằng mật khẩu giáo viên để đăng thông báo lớp.'
                      : 'Cổng dành cho Giáo viên chủ nhiệm — chỉ GVCN mới thấy được tất cả học sinh, mọi bài đăng, nhật ký & quản lý mật khẩu tài khoản.'}
                  </Text>

                  {mode === 'subject_teacher' ? (
                    <View style={styles.subjectWrap}>
                      <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                        Chọn bộ môn giảng dạy
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
                            }}
                          />
                        ))}
                      </ScrollView>
                      <TextField
                        label={'Hoặc nhập tên môn khác (tuỳ chọn)'}
                        icon={'book-outline'}
                        placeholder={'VD: Robotics, Kỹ năng mềm...'}
                        value={customSubject}
                        onChangeText={setCustomSubject}
                      />
                    </View>
                  ) : null}

                  <TextField
                    label={
                      mode === 'subject_teacher'
                        ? 'Tên Thầy / Cô hiển thị trên thông báo'
                        : 'Tên Giáo viên chủ nhiệm (tuỳ chọn)'
                    }
                    icon={'person-outline'}
                    placeholder={
                      mode === 'subject_teacher'
                        ? 'Ví dụ: Cô Nguyễn Lan Anh / Thầy Minh'
                        : 'Ví dụ: Thầy Ngô Vũ Hảo'
                    }
                    value={teacherDisplayName}
                    onChangeText={setTeacherDisplayName}
                    returnKeyType="next"
                  />

                  <View style={styles.passGroup}>
                    <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                      Mật khẩu tài khoản Giáo viên
                    </Text>
                    <View
                      style={[
                        styles.passBox,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: activeError ? theme.danger : theme.border,
                        },
                      ]}>
                      <Ionicons name="shield-outline" size={18} color={theme.warning} />
                      <TextInput
                        value={teacherPassword}
                        onChangeText={(text) => {
                          clearErrors();
                          setTeacherPassword(text);
                        }}
                        placeholder={'Nhập mật khẩu xác thực giáo viên...'}
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="go"
                        onSubmitEditing={handleTeacherSubmit}
                        style={[styles.passInput, { color: theme.text }]}
                      />
                      <Pressable
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={10}
                        accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={19}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Button
                    label={
                      auth.busy
                        ? 'Đang xác thực...'
                        : mode === 'subject_teacher'
                          ? `Vào Cổng GV ${effectiveSubject}`
                          : 'Đăng nhập Giáo viên chủ nhiệm'
                    }
                    icon={isTeacherTab ? 'shield-checkmark' : 'lock-open'}
                    disabled={auth.busy}
                    onPress={handleTeacherSubmit}
                  />
                </>
              )}

              {/* Privacy & Security Feature List */}
              <View style={styles.featureList}>
                {[
                  {
                    icon: 'id-card' as const,
                    text: 'Mỗi học sinh có Số ID & mật khẩu riêng tự đặt — trùng Số ID sẽ báo mật khẩu không đúng',
                  },
                  {
                    icon: 'lock-closed' as const,
                    text: 'Học sinh chỉ xem được trang tên, bài đăng, Xu, Sticker & dữ liệu sử dụng riêng của mình',
                  },
                  {
                    icon: 'shield-checkmark' as const,
                    text: 'Chỉ Giáo viên chủ nhiệm (GVCN) mới xem được toàn bộ lớp & quản lý tất cả tài khoản',
                  },
                ].map((item) => (
                  <View key={item.text} style={styles.featRow}>
                    <View style={[styles.featIcon, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name={item.icon} size={15} color={theme.accent} />
                    </View>
                    <Text style={[styles.featText, { color: theme.textSecondary }]}>
                      {item.text}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeIn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  loadingText: { fontSize: 14, fontWeight: '700' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  col: { width: '100%', maxWidth: 480, gap: Spacing.three },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four + 4,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubbleA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bubbleB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -50,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shield: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  rewardTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  rewardTeaserText: { color: '#FDE68A', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  errCardWrap: { gap: Spacing.two, borderWidth: 1 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  errText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  card: { gap: Spacing.three },
  cardTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  cardDesc: { fontSize: 12.5, lineHeight: 19 },
  roleTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.md,
    gap: 4,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  roleTabActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roleTabLabel: { fontSize: 12, fontWeight: '800' },
  subTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    gap: 4,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  subTabText: { fontSize: 12.5, fontWeight: '800' },
  idFieldWrap: { gap: 6 },
  idLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  suggestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  suggestText: { fontSize: 11, fontWeight: '800' },
  strengthRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  switchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  switchBannerText: { flex: 1, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  subjectWrap: { gap: Spacing.two },
  subjectRow: { gap: Spacing.two, paddingRight: Spacing.two },
  passGroup: { gap: 6 },
  passLabel: { fontSize: 12, fontWeight: '800' },
  passBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  passInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 10,
    ...({ outlineStyle: 'none' } as object),
  },
  featureList: { gap: Spacing.two, marginTop: 2 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  featIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 18 },
});
