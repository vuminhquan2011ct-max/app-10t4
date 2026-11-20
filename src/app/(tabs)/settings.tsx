import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MASCOTS } from '@/constants/decor-meta';
import {
  ACCENT_PRESET_LIST,
  Radius,
  Shadow,
  Spacing,
  type ThemeMode,
} from '@/constants/theme';
import { MEMBER_ROLES, SUBJECT_TEACHER_PRESETS } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme, useThemePreference } from '@/hooks/use-theme';
import { buildClassSummaryReport, exportJsonBackup, shareOrCopyText } from '@/lib/export';
import { MIN_STUDENT_PASSWORD_LENGTH } from '@/lib/student-accounts';
import { useAuth, type AccountRole } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type Ionicon = keyof typeof Ionicons.glyphMap;

const LOCAL_ROLES: { value: AccountRole; label: string; hint: string; icon: Ionicon; locked?: boolean }[] = [
  { value: 'student', label: 'Học sinh', hint: 'Nhiệm vụ & Xu', icon: 'person' },
  { value: 'subject_teacher', label: 'GV Bộ môn', hint: 'Đăng thông báo', icon: 'book', locked: true },
  { value: 'teacher', label: 'GV Chủ nhiệm', hint: 'Toàn quyền lớp', icon: 'shield-checkmark', locked: true },
];

const THEME_MODES: { value: ThemeMode; label: string; icon: Ionicon }[] = [
  { value: 'system', label: 'Tự động', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Sáng', icon: 'sunny-outline' },
  { value: 'dark', label: 'Tối', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const auth = useAuth();
  const {
    memberRole,
    isTeacher,
    canViewAll,
    isSubjectTeacher,
    subjectName,
    canEditClass,
    canAddStudents,
    classInfo,
    updateClass,
    currentStudent,
    totals,
    ranking,
    fundSummary,
    classStreak,
    syncStatus,
    lastSyncedAt,
    pullNow,
    exportStateJson,
    importStateJson,
    resetDemoData,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { mode, setMode, accentKey, setAccentKey } = useThemePreference();
  const decor = useDecor();
  const activeMascot = MASCOTS[decor.mascotId] ?? MASCOTS.foxy;
  const { showToast } = useToast();

  // Rename cloud display name
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Teacher / Subject Teacher role switch password verification
  const [pendingRole, setPendingRole] = useState<AccountRole | null>(null);
  const [teacherSwitchId, setTeacherSwitchId] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [showTeacherPass, setShowTeacherPass] = useState(false);
  const [teacherPassError, setTeacherPassError] = useState<string | null>(null);
  const [pickedSubject, setPickedSubject] = useState(
    subjectName || SUBJECT_TEACHER_PRESETS[0].subject,
  );
  const [teacherDisplayDraft, setTeacherDisplayDraft] = useState('');

  // Class info inline editor
  const [editingClass, setEditingClass] = useState(false);
  const [cName, setCName] = useState(classInfo.name);
  const [cSchool, setCSchool] = useState(classInfo.school);
  const [cYear, setCYear] = useState(classInfo.year);
  const [cTeacher, setCTeacher] = useState(classInfo.teacherName);
  const [cMotto, setCMotto] = useState(classInfo.motto);
  const [cGoal, setCGoal] = useState(String(classInfo.goalPoints ?? 200));

  // Change personal student password
  const [changingPass, setChangingPass] = useState(false);
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);

  // Backup import & reset confirmation
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const displayName =
    auth.profile?.displayName?.trim() ||
    (isTeacher
      ? classInfo.teacherName
      : isSubjectTeacher
        ? `GV Bộ môn ${subjectName ?? ''}`.trim()
        : (currentStudent?.name ?? 'Học sinh'));

  const syncMeta = {
    synced: {
      label: 'Đã đồng bộ Cloud · RLS 🔒',
      color: 'success' as const,
      soft: 'successSoft' as const,
      icon: 'cloud-done' as Ionicon,
    },
    syncing: {
      label: 'Đang đồng bộ...',
      color: 'warning' as const,
      soft: 'warningSoft' as const,
      icon: 'sync' as Ionicon,
    },
    offline: {
      label: 'Mất kết nối Cloud',
      color: 'danger' as const,
      soft: 'dangerSoft' as const,
      icon: 'cloud-offline' as Ionicon,
    },
    local: {
      label: 'Chế độ ngoại tuyến',
      color: 'accentText' as const,
      soft: 'accentSoft' as const,
      icon: 'phone-portrait' as Ionicon,
    },
  }[syncStatus];

  const openClassEditor = () => {
    setCName(classInfo.name);
    setCSchool(classInfo.school);
    setCYear(classInfo.year);
    setCTeacher(classInfo.teacherName);
    setCMotto(classInfo.motto);
    setCGoal(String(classInfo.goalPoints ?? 200));
    setEditingClass((v) => !v);
  };

  const saveClassInfo = () => {
    const parsedGoal = Number.parseInt(cGoal, 10);
    updateClass({
      name: cName.trim() || classInfo.name,
      school: cSchool.trim() || classInfo.school,
      year: cYear.trim() || classInfo.year,
      teacherName: cTeacher.trim() || classInfo.teacherName,
      motto: cMotto.trim(),
      goalPoints: Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 200,
    });
    setEditingClass(false);
    showToast('Đã cập nhật thông tin lớp!');
  };

  const handleRenameCloud = async () => {
    const ok = await auth.renameMe(nameDraft);
    if (ok) {
      setEditingName(false);
      showToast('Đã đổi tên hiển thị!');
    }
  };

  const canChangeOwnPass =
    (auth.accountRole === 'student' && Boolean(auth.studentId)) ||
    ((isTeacher || isSubjectTeacher) && Boolean(auth.teacherId));

  const handleChangeOwnPassword = async () => {
    setPassError(null);
    if (!curPass.trim()) {
      setPassError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPass.trim().length < MIN_STUDENT_PASSWORD_LENGTH) {
      setPassError(`Mật khẩu mới cần tối thiểu ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (newPass.trim() !== confirmNewPass.trim()) {
      setPassError('Mật khẩu xác nhận không khớp!');
      return;
    }
    const res =
      auth.accountRole === 'student'
        ? await auth.changeStudentPassword(curPass, newPass)
        : await auth.changeTeacherPassword(curPass, newPass);
    if (!res.ok) {
      setPassError(res.error ?? 'Không thể đổi mật khẩu');
      return;
    }
    setCurPass('');
    setNewPass('');
    setConfirmNewPass('');
    setChangingPass(false);
    showToast('Đã đổi mật khẩu cá nhân thành công! 🔐');
  };

  const handleExportSummary = async () => {
    const report = buildClassSummaryReport({
      classInfo,
      totals,
      ranking,
      fundBalance: fundSummary.balance,
      streak: classStreak,
    });
    const res = await shareOrCopyText(report, `Báo cáo lớp ${classInfo.name}`);
    showToast(res === 'copied' ? 'Đã sao chép báo cáo lớp!' : 'Đã mở chia sẻ báo cáo!');
  };

  const handleBackupJson = async () => {
    const res = await exportJsonBackup(exportStateJson());
    showToast(
      res === 'downloaded'
        ? 'Đã tải xuống tệp sao lưu JSON!'
        : res === 'copied'
          ? 'Đã sao chép bản sao lưu JSON!'
          : 'Đã chia sẻ bản sao lưu JSON!',
    );
  };

  const handleImportJson = () => {
    if (!importText.trim()) {
      showToast('Hãy dán nội dung JSON sao lưu trước', 'warning');
      return;
    }
    const ok = importStateJson(importText);
    if (ok) {
      setImportText('');
      setShowImport(false);
      showToast('Khôi phục dữ liệu từ bản sao lưu thành công!');
    } else {
      showToast('Tệp JSON không hợp lệ', 'danger');
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      showToast('Bấm lần nữa để xác nhận khôi phục dữ liệu mẫu', 'warning');
      return;
    }
    resetDemoData();
    setConfirmReset(false);
    showToast('Đã khôi phục dữ liệu mẫu');
  };

  const handleSelectRoleCard = async (target: AccountRole) => {
    setTeacherPassError(null);
    if (target === 'student') {
      if (auth.accountRole === 'student') return;
      setPendingRole(null);
      await auth.switchAccountRole('student');
      showToast('Hãy đăng nhập bằng Số ID & mật khẩu riêng của học sinh!', 'info');
      return;
    }

    // Switching directly between teacher -> subject_teacher can just open subject picker or switch.
    // Switching from student -> teacher/subject_teacher OR subject_teacher -> teacher requires teacher password `K8T4`.
    const needsPass =
      auth.accountRole === 'student' ||
      (auth.accountRole === 'subject_teacher' && target === 'teacher');

    if (!needsPass && target === 'subject_teacher') {
      setPendingRole('subject_teacher');
      setPickedSubject(subjectName || SUBJECT_TEACHER_PRESETS[0].subject);
      setTeacherDisplayDraft(auth.profile?.displayName ?? '');
      return;
    }

    if (target === auth.accountRole && target === 'teacher') return;

    setPendingRole(target);
    setTeacherSwitchId('');
    setTeacherPass('');
    setPickedSubject(subjectName || SUBJECT_TEACHER_PRESETS[0].subject);
    setTeacherDisplayDraft(auth.profile?.displayName ?? '');
  };

  const handleConfirmTeacherSwitch = async () => {
    if (!pendingRole) return;
    setTeacherPassError(null);
    const res = await auth.switchAccountRole(pendingRole, {
      loginId: teacherSwitchId.trim() || undefined,
      password: teacherPass,
      subjectName: pendingRole === 'subject_teacher' ? pickedSubject : null,
      displayName: teacherDisplayDraft.trim() || undefined,
    });
    if (!res.ok) {
      setTeacherPassError(res.error ?? 'Mật khẩu giáo viên không chính xác!');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const resolvedSubject = res.account?.subject || pickedSubject;
    const label =
      pendingRole === 'subject_teacher'
        ? `Giáo viên bộ môn (${resolvedSubject})`
        : res.account
          ? `Giáo viên chủ nhiệm (${res.account.name})`
          : 'Giáo viên chủ nhiệm';
    setTeacherSwitchId('');
    setTeacherPass('');
    setPendingRole(null);
    showToast(`Đã chuyển sang tài khoản ${label}! 🛡️`);
  };

  const roleMeta = MEMBER_ROLES[memberRole];

  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={'Cài đặt'}
          subtitle={'Tài khoản, bảo mật mật khẩu, giao diện & sao lưu'}
        />
      </FadeIn>

      {/* Profile Hero */}
      <FadeIn index={1}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.profile, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.bubble} />
          <Avatar
            name={displayName}
            imageUrl={auth.isCloudActive ? auth.profile?.avatarUrl : null}
            size={62}
            ring
            frame={decor.avatarFrame}
          />
          <View style={styles.profileTexts}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.profileSub} numberOfLines={1}>
              {auth.isCloudActive
                ? `${auth.email ?? ''} · ${roleMeta.label}`
                : `${roleMeta.label} · Lớp ${classInfo.name}`}
            </Text>
            <View style={styles.syncGlass}>
              <Ionicons name={syncMeta.icon} size={12} color="#FFFFFF" />
              <Text style={styles.syncGlassText}>
                {lastSyncedAt && syncStatus === 'synced'
                  ? `${syncMeta.label} · ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                  : syncMeta.label}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Account & Security Console */}
      <FadeIn index={2}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="key" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>Tài khoản & Mật khẩu lớp</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Đã xác thực bằng mật khẩu truy cập Lớp 10T4 · Đổi tên hoặc khoá app bất kỳ lúc nào
              </Text>
            </View>
          </View>

          <View style={styles.badgeWrap}>
            <Badge label={'Đã xác thực 🔒'} color={'success'} soft={'successSoft'} icon={'checkmark-circle'} />
            <Badge
              label={roleMeta.label}
              color={roleMeta.color}
              soft={roleMeta.soft}
              icon={roleMeta.icon}
            />
            {auth.loginId ? (
              <Badge
                label={`ID: ${auth.loginId}`}
                color={'accentText'}
                soft={'accentSoft'}
                icon={'id-card-outline'}
              />
            ) : null}
            {currentStudent ? (
              <Badge
                label={`Trang riêng: ${currentStudent.name}`}
                color={'purple'}
                soft={'purpleSoft'}
                icon={'person-circle-outline'}
              />
            ) : null}
          </View>

          {editingName ? (
            <View style={styles.editor}>
              <TextField
                label={'Tên hiển thị'}
                value={nameDraft}
                onChangeText={setNameDraft}
              />
              <View style={styles.backupActions}>
                <Button
                  label={'Huỷ'}
                  variant={'ghost'}
                  size={'sm'}
                  onPress={() => setEditingName(false)}
                />
                <Button
                  label={'Lưu tên'}
                  size={'sm'}
                  icon={'checkmark'}
                  style={styles.flex}
                  onPress={handleRenameCloud}
                />
              </View>
            </View>
          ) : (
            <View style={styles.backupActions}>
              <Button
                label={'Đổi tên hiển thị'}
                variant={'soft'}
                size={'sm'}
                icon={'create-outline'}
                style={styles.flex}
                onPress={() => {
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
              />
              <Button
                label={'Đăng xuất'}
                variant={'danger'}
                size={'sm'}
                icon={'log-out-outline'}
                onPress={auth.signOut}
              />
            </View>
          )}

          {/* Personal Password Change (Students & Personal Teacher Accounts) */}
          {canChangeOwnPass ? (
            changingPass ? (
              <View
                style={[
                  styles.verifyBox,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.accent },
                ]}>
                <View style={styles.verifyHead}>
                  <Ionicons name="key" size={16} color={theme.accent} />
                  <Text style={[styles.verifyTitle, { color: theme.text }]}>
                    Đổi mật khẩu cá nhân (ID: {auth.loginId})
                  </Text>
                  <Pressable onPress={() => setChangingPass(false)} hitSlop={8}>
                    <Ionicons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
                <TextField
                  label={'Mật khẩu hiện tại'}
                  value={curPass}
                  onChangeText={(t) => {
                    setCurPass(t);
                    setPassError(null);
                  }}
                  secureTextEntry
                  autoCapitalize={'none'}
                />
                <TextField
                  label={'Mật khẩu mới (tối thiểu 4 ký tự)'}
                  value={newPass}
                  onChangeText={(t) => {
                    setNewPass(t);
                    setPassError(null);
                  }}
                  secureTextEntry
                  autoCapitalize={'none'}
                />
                <TextField
                  label={'Nhập lại mật khẩu mới'}
                  value={confirmNewPass}
                  onChangeText={(t) => {
                    setConfirmNewPass(t);
                    setPassError(null);
                  }}
                  secureTextEntry
                  autoCapitalize={'none'}
                />
                {passError ? (
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>
                    {passError}
                  </Text>
                ) : null}
                <Button
                  label={'Lưu mật khẩu mới'}
                  icon={'checkmark-circle'}
                  size={'sm'}
                  onPress={handleChangeOwnPassword}
                />
              </View>
            ) : (
              <Button
                label={'Đổi mật khẩu cá nhân'}
                variant={'ghost'}
                size={'sm'}
                icon={'key-outline'}
                onPress={() => {
                  setPassError(null);
                  setCurPass('');
                  setNewPass('');
                  setConfirmNewPass('');
                  setChangingPass(true);
                }}
              />
            )
          ) : null}

          {isTeacher || isSubjectTeacher ? (
            <Button
              label={'Tạo tài khoản giáo viên mới'}
              icon={'person-add'}
              size={'sm'}
              onPress={() => router.push('/teacher-form' as never)}
            />
          ) : null}

          {isTeacher ? (
            <Button
              label={'Quản lý Tài khoản (GV & HS) & Nhật ký'}
              variant={'soft'}
              size={'sm'}
              icon={'shield-checkmark'}
              onPress={() => router.push('/members' as never)}
            />
          ) : null}
        </Card>
      </FadeIn>

      {/* Theme Studio */}
      <FadeIn index={3}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: theme.purpleSoft }]}>
              <Ionicons name="color-palette" size={18} color={theme.purple} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>Giao diện & Chủ đề</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Tùy biến chế độ sáng/tối và bảng màu riêng cho thiết bị của bạn
              </Text>
            </View>
          </View>

          <View style={styles.modeRow}>
            {THEME_MODES.map((m) => {
              const selected = mode === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setMode(m.value)}
                  style={({ pressed }) => [
                    styles.modePill,
                    {
                      backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                      borderColor: selected ? theme.accent : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={m.icon}
                    size={16}
                    color={selected ? theme.accentText : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.modeText,
                      { color: selected ? theme.accentText : theme.textSecondary },
                    ]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sub, { color: theme.textSecondary }]}>Bảng màu thương hiệu</Text>
          <View style={styles.paletteRow}>
            {ACCENT_PRESET_LIST.map((preset) => {
              const selected = accentKey === preset.key;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    setAccentKey(preset.key);
                    showToast(`Đã đổi sang chủ đề ${preset.label}`, 'info');
                  }}
                  style={({ pressed }) => [styles.paletteItem, pressed && styles.pressed]}>
                  <View
                    style={[
                      styles.orbRing,
                      { borderColor: selected ? preset.preview[0] : 'transparent' },
                    ]}>
                    <LinearGradient
                      colors={preset.preview}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.orb}>
                      {selected ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                    </LinearGradient>
                  </View>
                  <Text
                    style={[
                      styles.paletteName,
                      { color: selected ? theme.text : theme.textSecondary },
                    ]}
                    numberOfLines={1}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.backupActions}>
            <Button
              label={'Studio Trang Trí App'}
              icon={'color-wand'}
              size={'sm'}
              style={styles.flex}
              onPress={() => router.push('/studio' as never)}
            />
            <Button
              label={'Góc Sticker'}
              variant={'soft'}
              icon={'sparkles'}
              size={'sm'}
              onPress={() => router.push('/creative' as never)}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Companion Mascot & Tour Guide Console */}
      <FadeIn index={3}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <MascotAvatar mascotId={decor.mascotId} size={46} mood="happy" />
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>
                {`Trợ lý ${activeMascot.name} & Hướng dẫn viên`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {activeMascot.roleTitle} · Hỗ trợ tra cứu, soạn Zalo & dẫn tour
              </Text>
            </View>
          </View>

          <View style={styles.backupActions}>
            <Button
              label={'Chạy Tour 7 bước'}
              icon={'compass'}
              size={'sm'}
              style={styles.flex}
              onPress={() => decor.startTour()}
            />
            <Button
              label={'Mở Trợ lý'}
              variant={'soft'}
              icon={'chatbubbles'}
              size={'sm'}
              onPress={() => decor.openAssistant('chat')}
            />
          </View>

          <View style={styles.backupActions}>
            <Button
              label={decor.assistantVisible ? 'Ẩn nút Trợ lý nổi' : 'Hiện nút Trợ lý nổi'}
              variant={'ghost'}
              size={'sm'}
              icon={decor.assistantVisible ? 'eye-off-outline' : 'eye-outline'}
              style={styles.flex}
              onPress={() => {
                decor.setAssistantVisible(!decor.assistantVisible);
                showToast(
                  decor.assistantVisible ? 'Đã ẩn nút Trợ lý nổi' : 'Đã hiện nút Trợ lý nổi ✨',
                  'info',
                );
              }}
            />
            <Button
              label={decor.assistantMinimized ? 'Phóng to nút' : 'Thu gọn nút'}
              variant={'ghost'}
              size={'sm'}
              icon={decor.assistantMinimized ? 'expand-outline' : 'contract-outline'}
              onPress={() => {
                decor.setAssistantMinimized(!decor.assistantMinimized);
                showToast('Đã cập nhật kích thước nút Trợ lý', 'info');
              }}
            />
          </View>
        </Card>
      </FadeIn>
      {canEditClass ? (
        <FadeIn index={4}>
          <Card style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="school" size={18} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: theme.text }]}>
                  {'Thông tin lớp ' + classInfo.name}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {classInfo.school + ' · Mục tiêu ' + (classInfo.goalPoints ?? 200) + ' điểm'}
                </Text>
              </View>
              <Button
                label={editingClass ? 'Đóng' : 'Sửa'}
                size={'sm'}
                variant={'soft'}
                onPress={openClassEditor}
              />
            </View>

            {editingClass ? (
              <View style={styles.editor}>
                <TextField label={'Tên lớp'} value={cName} onChangeText={setCName} />
                <TextField label={'Trường'} value={cSchool} onChangeText={setCSchool} />
                <TextField label={'Năm học'} value={cYear} onChangeText={setCYear} />
                <TextField label={'Giáo viên chủ nhiệm'} value={cTeacher} onChangeText={setCTeacher} />
                <TextField label={'Khẩu hiệu lớp'} value={cMotto} onChangeText={setCMotto} />
                <TextField
                  label={'Mục tiêu điểm thi đua học kỳ'}
                  value={cGoal}
                  onChangeText={setCGoal}
                  keyboardType={'number-pad'}
                />
                <Button label={'Lưu thông tin lớp'} icon={'checkmark-circle'} onPress={saveClassInfo} />
              </View>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      {/* Role Switcher protected by Teacher Password (K8T4) */}
      {!auth.isCloudActive ? (
        <FadeIn index={5}>
          <Card style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: theme.warningSoft }]}>
                <Ionicons name="shield-checkmark" size={18} color={theme.warning} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: theme.text }]}>
                  Chuyển tài khoản & Phân quyền
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Chuyển sang tài khoản Giáo viên / GV Bộ môn cần xác thực mật khẩu giáo viên
                </Text>
              </View>
            </View>

            <View style={styles.roleRow}>
              {LOCAL_ROLES.map((item) => {
                const selected = auth.accountRole === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => handleSelectRoleCard(item.value)}
                    style={({ pressed }) => [
                      styles.roleCard,
                      {
                        backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                        borderColor: selected ? theme.accent : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <View
                      style={[
                        styles.roleIcon,
                        { backgroundColor: selected ? theme.accent : theme.card },
                      ]}>
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={selected ? '#FFFFFF' : theme.textMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.roleLabel,
                        { color: selected ? theme.accentText : theme.text },
                      ]}
                      numberOfLines={1}>
                      {item.label}
                    </Text>
                    <Text style={[styles.roleHint, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.value === 'subject_teacher' && selected && subjectName
                        ? subjectName
                        : item.hint}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={theme.accent}
                        style={styles.check}
                      />
                    ) : item.locked ? (
                      <Ionicons
                        name="lock-closed"
                        size={14}
                        color={theme.textMuted}
                        style={styles.check}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Teacher Password Verification Panel */}
            {pendingRole ? (
              <View style={[styles.verifyBox, { backgroundColor: theme.backgroundElement, borderColor: theme.warning }]}>
                <View style={styles.verifyHead}>
                  <Ionicons name="key" size={16} color={theme.warning} />
                  <Text style={[styles.verifyTitle, { color: theme.text }]}>
                    {pendingRole === 'subject_teacher'
                      ? 'Xác thực Giáo viên bộ môn'
                      : 'Xác thực Giáo viên chủ nhiệm'}
                  </Text>
                  <Pressable onPress={() => setPendingRole(null)} hitSlop={8}>
                    <Ionicons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>

                {pendingRole === 'subject_teacher' ? (
                  <>
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>
                      Chọn bộ môn giảng dạy
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.subjectChips}>
                      {SUBJECT_TEACHER_PRESETS.map((sub) => (
                        <Chip
                          key={sub.subject}
                          label={`${sub.emoji} ${sub.subject}`}
                          selected={pickedSubject === sub.subject}
                          onPress={() => setPickedSubject(sub.subject)}
                        />
                      ))}
                    </ScrollView>
                    <TextField
                      label={'Tên Thầy / Cô (tuỳ chọn)'}
                      placeholder={'VD: Cô Nguyễn Minh Anh'}
                      value={teacherDisplayDraft}
                      onChangeText={setTeacherDisplayDraft}
                    />
                  </>
                ) : null}

                {(auth.accountRole === 'student' ||
                  (auth.accountRole === 'subject_teacher' && pendingRole === 'teacher')) ? (
                  <View style={styles.passGroup}>
                    <TextField
                      label={'Mã ID giáo viên (để trống nếu dùng mã GV lớp)'}
                      icon={'id-card-outline'}
                      placeholder={pendingRole === 'subject_teacher' ? 'VD: GVBM-01' : 'VD: GVCN-01'}
                      value={teacherSwitchId}
                      onChangeText={(t) => {
                        if (teacherPassError) setTeacherPassError(null);
                        setTeacherSwitchId(t);
                      }}
                      autoCapitalize={'characters'}
                      autoCorrect={false}
                    />
                    <Text style={[styles.sub, { color: theme.textSecondary }]}>
                      {teacherSwitchId.trim()
                        ? 'Mật khẩu riêng của tài khoản Giáo viên'
                        : 'Mật khẩu xác thực Giáo viên lớp'}
                    </Text>
                    <View
                      style={[
                        styles.passBox,
                        {
                          backgroundColor: theme.card,
                          borderColor: teacherPassError ? theme.danger : theme.border,
                        },
                      ]}>
                      <Ionicons name="lock-closed-outline" size={17} color={theme.warning} />
                      <TextInput
                        value={teacherPass}
                        onChangeText={(t) => {
                          if (teacherPassError) setTeacherPassError(null);
                          setTeacherPass(t);
                        }}
                        placeholder={
                          teacherSwitchId.trim()
                            ? 'Nhập mật khẩu cá nhân của tài khoản...'
                            : 'Nhập mật khẩu giáo viên...'
                        }
                        placeholderTextColor={theme.textMuted}
                        secureTextEntry={!showTeacherPass}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={handleConfirmTeacherSwitch}
                        style={[styles.passInput, { color: theme.text }]}
                      />
                      <Pressable onPress={() => setShowTeacherPass((v) => !v)} hitSlop={10}>
                        <Ionicons
                          name={showTeacherPass ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                    </View>
                    {teacherPassError ? (
                      <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>
                        {teacherPassError}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <Button
                  label={
                    pendingRole === 'subject_teacher'
                      ? `Mở quyền GV Bộ môn (${pickedSubject})`
                      : 'Xác thực & Chuyển sang GVCN'
                  }
                  icon={'shield-checkmark'}
                  size={'sm'}
                  onPress={handleConfirmTeacherSwitch}
                />
              </View>
            ) : null}

            {auth.accountRole === 'student' ? (
              <View style={styles.pickWrap}>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  🔒 Mỗi tài khoản học sinh được bảo vệ bằng Số ID & mật khẩu riêng. Để chuyển sang
                  học sinh khác, hãy Đăng xuất và đăng nhập bằng Số ID + mật khẩu của tài khoản đó.
                </Text>
                {canAddStudents ? (
                  <Button
                    label={'Tạo tài khoản học sinh mới'}
                    variant={'soft'}
                    size={'sm'}
                    icon={'person-add-outline'}
                    onPress={() => router.push('/student-form' as never)}
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.pickWrap}>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  🛡️ Giáo viên có thể tạo thêm tài khoản giáo viên mới (GV Chủ nhiệm / GV Bộ môn)
                  với Mã ID & mật khẩu riêng để mỗi Thầy/Cô đăng nhập độc lập.
                </Text>
                <View style={styles.backupActions}>
                  <Button
                    label={'Tạo TK giáo viên mới'}
                    variant={'soft'}
                    size={'sm'}
                    icon={'person-add'}
                    style={styles.flex}
                    onPress={() => router.push('/teacher-form' as never)}
                  />
                  {canAddStudents ? (
                    <Button
                      label={'Tạo TK học sinh'}
                      variant={'ghost'}
                      size={'sm'}
                      icon={'person-add-outline'}
                      onPress={() => router.push('/student-form' as never)}
                    />
                  ) : null}
                </View>
              </View>
            )}
          </Card>
        </FadeIn>
      ) : null}

      {/* Export, Backup & Restore — Strictly Homeroom Teacher (GVCN) Only */}
      {canViewAll ? (
        <FadeIn index={6}>
          <Card style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: theme.successSoft }]}>
                <Ionicons name="cloud-upload" size={18} color={theme.success} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.label, { color: theme.text }]}>Báo cáo & Sao lưu dữ liệu</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Xuất báo cáo toàn lớp hoặc sao lưu / khôi phục dữ liệu JSON (Chỉ GVCN)
                </Text>
              </View>
            </View>

            <View style={styles.backupActions}>
              <Button
                label={'Xuất báo cáo lớp'}
                variant={'soft'}
                size={'sm'}
                icon={'document-text'}
                style={styles.flex}
                onPress={handleExportSummary}
              />
              <Button
                label={'Sao lưu JSON'}
                variant={'soft'}
                size={'sm'}
                icon={'download-outline'}
                style={styles.flex}
                onPress={handleBackupJson}
              />
            </View>

            {isTeacher ? (
              <>
                <Button
                  label={showImport ? 'Ẩn khung khôi phục JSON' : 'Khôi phục từ bản sao lưu JSON'}
                  variant={'ghost'}
                  size={'sm'}
                  icon={'code-slash-outline'}
                  onPress={() => setShowImport((v) => !v)}
                />

                {showImport ? (
                  <View style={styles.editor}>
                    <TextField
                      label={'Dán nội dung JSON sao lưu'}
                      placeholder={'{"version":1,"students":[...]}'}
                      value={importText}
                      onChangeText={setImportText}
                      multiline
                    />
                    <Button label={'Áp dụng bản sao lưu'} icon={'checkmark'} onPress={handleImportJson} />
                  </View>
                ) : null}

                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <Button
                  label={confirmReset ? 'Bấm lần nữa để khôi phục mẫu' : 'Khôi phục dữ liệu mẫu'}
                  variant={'danger'}
                  icon={'refresh'}
                  onPress={handleReset}
                />
              </>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={7}>
        <Text style={[styles.footer, { color: theme.textMuted }]}>
          {'Quản lý lớp ' + classInfo.name + ' · ' + classInfo.school + ' · ' + classInfo.year}
        </Text>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  card: { gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  cardIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    top: -70,
    right: -40,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  profileTexts: { flex: 1, gap: 4 },
  profileName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  profileSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600' },
  syncGlass: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    marginTop: 2,
  },
  syncGlassText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: Spacing.two },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  modeText: { fontSize: 13, fontWeight: '800' },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  paletteItem: { width: '30.5%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 4 },
  orbRing: { padding: 3, borderRadius: 999, borderWidth: 2.5 },
  orb: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  paletteName: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  editor: { gap: Spacing.two + 2 },
  roleRow: { flexDirection: 'row', gap: Spacing.two },
  roleCard: { flex: 1, gap: 2, padding: Spacing.two + 3, borderRadius: Radius.lg, borderWidth: 1.5 },
  roleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one + 2,
  },
  roleLabel: { fontSize: 13, fontWeight: '800' },
  roleHint: { fontSize: 11 },
  check: { position: 'absolute', top: 9, right: 9 },
  verifyBox: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    gap: Spacing.two + 2,
  },
  verifyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  verifyTitle: { flex: 1, fontSize: 14, fontWeight: '900' },
  subjectChips: { gap: Spacing.two, paddingRight: Spacing.two },
  passGroup: { gap: 6 },
  passBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  passInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 8,
    ...({ outlineStyle: 'none' } as object),
  },
  pickWrap: { gap: Spacing.two },
  pickList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 5,
    paddingRight: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    maxWidth: '100%',
  },
  pickText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  backupActions: { flexDirection: 'row', gap: Spacing.two },
  divider: { height: StyleSheet.hairlineWidth },
  footer: { textAlign: 'center', fontSize: 12, marginTop: Spacing.two },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
