/**
 * Teacher Account Management (Teachers & Students), Role & Privacy Console + Audit Log.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { MEMBER_ROLES, MEMBER_STATUSES } from '@/constants/utilities-meta';
import { useTheme } from '@/hooks/use-theme';
import { stripVietnamese } from '@/lib/intelligence';
import {
  MIN_STUDENT_PASSWORD_LENGTH,
  loadStudentAccounts,
  type StudentAccountRecord,
} from '@/lib/student-accounts';
import {
  MIN_TEACHER_PASSWORD_LENGTH,
  loadTeacherAccounts,
  type TeacherAccountRecord,
} from '@/lib/teacher-accounts';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import type { MemberRole, MemberStatus, Profile } from '@/types/auth';

type StatusFilter = 'all' | MemberStatus;
type AccountTab = 'teachers' | 'students';

const ROLE_ORDER: MemberRole[] = ['teacher', 'editor', 'student'];

export default function MembersScreen() {
  const auth = useAuth();
  const {
    isTeacher,
    students,
    registeredMembers,
    registeredTeachers,
    activityLog,
    statsOfStudent,
    updateStudent,
    logActivity,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();

  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Local account management tabs (GVCN only)
  const [accountTab, setAccountTab] = useState<AccountTab>('students');

  // Local student account credentials management
  const [studentAccounts, setStudentAccounts] = useState<StudentAccountRecord[]>([]);
  const [accountQuery, setAccountQuery] = useState('');
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassDraft, setResetPassDraft] = useState('');

  // Local teacher account credentials management
  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccountRecord[]>([]);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [resetTeacherId, setResetTeacherId] = useState<string | null>(null);
  const [resetTeacherPassDraft, setResetTeacherPassDraft] = useState('');
  const [confirmDeleteTeacherId, setConfirmDeleteTeacherId] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    const [sList, tList] = await Promise.all([
      loadStudentAccounts({ forceRemote: true }),
      loadTeacherAccounts({ forceRemote: true }),
    ]);
    setStudentAccounts(sList);
    setTeacherAccounts(tList);
    await pullNow();
  }, [pullNow]);

  useFocusEffect(
    useCallback(() => {
      if (!isTeacher) return;
      void refreshAccounts();
    }, [isTeacher, refreshAccounts]),
  );

  useEffect(() => {
    if (!isTeacher) return;
    let active = true;
    Promise.all([loadStudentAccounts(), loadTeacherAccounts()])
      .then(([sList, tList]) => {
        if (!active) return;
        setStudentAccounts(sList);
        setTeacherAccounts(tList);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    isTeacher,
    students.length,
    registeredMembers.length,
    auth.studentAccountsVersion,
    auth.teacherAccountsVersion,
  ]);

  const accountByStudentId = useMemo(
    () => new Map(studentAccounts.map((a) => [a.studentId, a])),
    [studentAccounts],
  );

  // Merge cloud public teacher directory with personal teacher account records so any newly
  // registered teacher on another device appears immediately.
  const combinedTeachers = useMemo<TeacherAccountRecord[]>(() => {
    const map = new Map<string, TeacherAccountRecord>();
    for (const acc of teacherAccounts) {
      map.set(acc.teacherId, acc);
    }
    for (const pub of registeredTeachers) {
      const existing = map.get(pub.id);
      if (!existing) {
        map.set(pub.id, {
          teacherId: pub.id,
          loginId: pub.loginId,
          loginIdKey: pub.loginId.toUpperCase(),
          name: pub.name,
          role: pub.role,
          subject: pub.subject,
          passwordHash: '',
          createdAt: pub.createdAt,
          updatedAt: pub.updatedAt,
        });
      } else if (pub.updatedAt.localeCompare(existing.updatedAt) > 0) {
        map.set(pub.id, {
          ...existing,
          loginId: pub.loginId,
          loginIdKey: pub.loginId.toUpperCase(),
          name: pub.name,
          role: pub.role,
          subject: pub.subject,
          updatedAt: pub.updatedAt,
        });
      }
    }
    return Array.from(map.values());
  }, [teacherAccounts, registeredTeachers]);

  const filteredStudents = useMemo(() => {
    const q = stripVietnamese(accountQuery);
    return [...students]
      .filter((s) => {
        if (!q) return true;
        return stripVietnamese(`${s.name} ${s.code} ${s.group ?? ''}`).includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.code.localeCompare(b.code, 'vi'));
  }, [students, accountQuery]);

  const filteredTeachers = useMemo(() => {
    const q = stripVietnamese(teacherQuery);
    return [...combinedTeachers]
      .filter((t) => {
        if (!q) return true;
        return stripVietnamese(
          `${t.name} ${t.loginId} ${t.subject ?? ''} ${t.role === 'teacher' ? 'gvcn chu nhiem' : 'gvbm bo mon'}`,
        ).includes(q);
      })
      .sort(
        (a, b) =>
          (a.role === b.role ? 0 : a.role === 'teacher' ? -1 : 1) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }, [combinedTeachers, teacherQuery]);

  const handleResetStudentPassword = async (studentId: string, studentName: string) => {
    const clean = resetPassDraft.trim();
    if (clean.length < MIN_STUDENT_PASSWORD_LENGTH) {
      showToast(`Mật khẩu mới cần ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự`, 'warning');
      return;
    }
    try {
      await updateStudent(studentId, { password: clean });
      await refreshAccounts();
      setResetTargetId(null);
      setResetPassDraft('');
      showToast(`Đã đặt lại mật khẩu cho ${studentName}! 🔐`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu', 'danger');
    }
  };

  const handleResetTeacherPassword = async (acc: TeacherAccountRecord) => {
    const clean = resetTeacherPassDraft.trim();
    if (clean.length < MIN_TEACHER_PASSWORD_LENGTH) {
      showToast(`Mật khẩu mới cần ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự`, 'warning');
      return;
    }
    const res = await auth.editTeacherAccount({
      teacherId: acc.teacherId,
      newPassword: clean,
    });
    if (!res.ok) {
      showToast(res.error ?? 'Không thể đặt lại mật khẩu giáo viên', 'danger');
      return;
    }
    logActivity(`Đặt lại mật khẩu tài khoản giáo viên ${acc.name} (ID: ${acc.loginId})`);
    await refreshAccounts();
    setResetTeacherId(null);
    setResetTeacherPassDraft('');
    showToast(`Đã đặt lại mật khẩu cho ${acc.name}! 🔐`);
  };

  const handleDeleteTeacher = async (acc: TeacherAccountRecord) => {
    if (confirmDeleteTeacherId !== acc.teacherId) {
      setConfirmDeleteTeacherId(acc.teacherId);
      showToast(`Bấm lần nữa để xác nhận xoá tài khoản ${acc.name}`, 'warning');
      return;
    }
    const res = await auth.deleteTeacherAccount(acc.teacherId);
    if (!res.ok) {
      showToast(res.error ?? 'Không thể xoá tài khoản giáo viên', 'danger');
      setConfirmDeleteTeacherId(null);
      return;
    }
    logActivity(`Xoá tài khoản giáo viên ${acc.name} (ID: ${acc.loginId})`);
    setConfirmDeleteTeacherId(null);
    await refreshAccounts();
    showToast(`Đã xoá tài khoản giáo viên ${acc.name}`, 'warning');
  };

  const load = useCallback(async () => {
    if (!auth.isCloudActive || !isTeacher) return;
    setLoading(true);
    try {
      const list = await auth.fetchMembers();
      setMembers(list);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tải được danh sách thành viên', 'danger');
    } finally {
      setLoading(false);
    }
  }, [auth, isTeacher, showToast]);

  useEffect(() => {
    if (!auth.isCloudActive || !isTeacher) return;
    let active = true;
    auth
      .fetchMembers()
      .then((list) => {
        if (active) setMembers(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [auth, isTeacher]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: members.length, pending: 0, approved: 0, blocked: 0 };
    for (const m of members) c[m.status] += 1;
    return c;
  }, [members]);

  const visible = useMemo(
    () => members.filter((m) => filter === 'all' || m.status === filter),
    [members, filter],
  );

  const applyPatch = async (member: Profile, patch: Parameters<typeof auth.updateMember>[1], msg: string) => {
    try {
      await auth.updateMember(member.id, patch);
      await load();
      showToast(msg);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cập nhật thất bại', 'danger');
    }
  };

  return (
    <Screen withTabBar={false} onRefresh={refreshAccounts}>
      <PageHeader
        title={'Tài khoản & Nhật ký lớp'}
        subtitle={'Quản lý tài khoản Giáo viên, Học sinh & lịch sử chỉnh sửa'}
        rightIcon={auth.isCloudActive ? 'refresh' : 'person-add'}
        rightLabel={auth.isCloudActive ? undefined : 'Tạo TK GV'}
        onRightPress={
          auth.isCloudActive
            ? load
            : isTeacher
              ? () => router.push('/teacher-form' as never)
              : undefined
        }
      />

      {!isTeacher ? (
        <EmptyState
          icon={'lock-closed-outline'}
          title={'Chỉ Giáo viên chủ nhiệm được truy cập'}
          message={'Nhật ký chỉnh sửa và quản lý bảo mật thuộc về GVCN.'}
        />
      ) : !auth.isCloudActive ? (
        <>
          {/* Segment Switcher: Teacher Accounts vs Student Accounts */}
          <FadeIn index={0}>
            <View style={[styles.segTabs, { backgroundColor: theme.backgroundElement }]}>
              {(
                [
                  {
                    key: 'teachers',
                    label: `Giáo viên (${combinedTeachers.length})`,
                    icon: 'shield-checkmark-outline' as const,
                  },
                  {
                    key: 'students',
                    label: `Học sinh (${students.length})`,
                    icon: 'people-outline' as const,
                  },
                ] as const
              ).map((tab) => {
                const active = accountTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setAccountTab(tab.key)}
                    style={[
                      styles.segTab,
                      active && [styles.segTabActive, { backgroundColor: theme.card }],
                    ]}>
                    <Ionicons
                      name={tab.icon}
                      size={16}
                      color={active ? theme.accent : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.segTabText,
                        { color: active ? theme.accentText : theme.textSecondary },
                      ]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FadeIn>

          {accountTab === 'teachers' ? (
            <>
              <FadeIn index={0}>
                <Card style={styles.offlineCard}>
                  <View style={styles.memberHead}>
                    <View style={[styles.iconBox, { backgroundColor: theme.warningSoft }]}>
                      <Ionicons name="shield-checkmark" size={22} color={theme.warning} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.title, { color: theme.text }]}>
                        Quản lý Tài khoản Giáo viên
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                        Tạo tài khoản riêng cho GV Chủ nhiệm & GV Bộ môn kèm Mã ID và mật khẩu cá
                        nhân. Mỗi thầy/cô đăng nhập độc lập bằng ID của mình.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.quickRow}>
                    <Button
                      label={'Tạo TK GV Chủ nhiệm'}
                      icon={'shield-checkmark'}
                      size={'sm'}
                      style={styles.flex}
                      onPress={() =>
                        router.push({
                          pathname: '/teacher-form',
                          params: { role: 'teacher' },
                        } as never)
                      }
                    />
                    <Button
                      label={'Tạo TK GV Bộ môn'}
                      variant={'soft'}
                      icon={'book-outline'}
                      size={'sm'}
                      style={styles.flex}
                      onPress={() =>
                        router.push({
                          pathname: '/teacher-form',
                          params: { role: 'subject_teacher' },
                        } as never)
                      }
                    />
                  </View>
                </Card>
              </FadeIn>

              <TextField
                icon={'search'}
                placeholder={'Tìm giáo viên theo tên, Mã ID, bộ môn...'}
                value={teacherQuery}
                onChangeText={setTeacherQuery}
              />

              {filteredTeachers.length === 0 ? (
                <EmptyState
                  icon={'shield-outline'}
                  title={'Chưa có tài khoản giáo viên riêng nào'}
                  message={
                    'Bấm "Tạo TK GV Chủ nhiệm" hoặc "Tạo TK GV Bộ môn" ở trên để cấp Mã ID & mật khẩu riêng cho thầy/cô.'
                  }
                />
              ) : (
                filteredTeachers.map((acc, idx) => {
                  const isSelf = auth.teacherId === acc.teacherId;
                  const isResetting = resetTeacherId === acc.teacherId;
                  const isConfirmingDel = confirmDeleteTeacherId === acc.teacherId;
                  const rMeta = MEMBER_ROLES[acc.role];

                  return (
                    <FadeIn key={acc.teacherId} index={Math.min(idx + 1, 8)}>
                      <Card style={styles.memberCard}>
                        <View style={styles.memberHead}>
                          <Avatar name={acc.name} size={44} />
                          <View style={styles.flex}>
                            <Text
                              style={[styles.memberName, { color: theme.text }]}
                              numberOfLines={1}>
                              {acc.name + (isSelf ? ' (Bạn)' : '')}
                            </Text>
                            <Text
                              style={{ color: theme.textSecondary, fontSize: 12 }}
                              numberOfLines={1}>
                              {[
                                `ID: ${acc.loginId}`,
                                acc.role === 'subject_teacher' && acc.subject
                                  ? `Môn ${acc.subject}`
                                  : 'Toàn quyền lớp',
                              ].join(' · ')}
                            </Text>
                            <View style={styles.badgeRow}>
                              <Badge
                                label={rMeta.short}
                                color={rMeta.color}
                                soft={rMeta.soft}
                                icon={rMeta.icon}
                              />
                              <Badge
                                label={'Mật khẩu riêng 🔐'}
                                color={'success'}
                                soft={'successSoft'}
                                icon={'key'}
                              />
                            </View>
                          </View>
                        </View>

                        {isResetting ? (
                          <View style={[styles.panel, { borderColor: theme.border }]}>
                            <TextField
                              label={`Đặt mật khẩu mới cho ${acc.name} (ID: ${acc.loginId})`}
                              icon={'key-outline'}
                              placeholder={'Nhập mật khẩu mới (ít nhất 4 ký tự)...'}
                              value={resetTeacherPassDraft}
                              onChangeText={setResetTeacherPassDraft}
                              autoCapitalize={'none'}
                            />
                            <View style={styles.quickRow}>
                              <Button
                                label={'Huỷ'}
                                variant={'ghost'}
                                size={'sm'}
                                onPress={() => {
                                  setResetTeacherId(null);
                                  setResetTeacherPassDraft('');
                                }}
                              />
                              <Button
                                label={'Lưu mật khẩu mới'}
                                size={'sm'}
                                icon={'checkmark-circle'}
                                style={styles.flex}
                                onPress={() => handleResetTeacherPassword(acc)}
                              />
                            </View>
                          </View>
                        ) : (
                          <View style={styles.quickRow}>
                            <Button
                              label={'Đặt lại MK'}
                              variant={'soft'}
                              size={'sm'}
                              icon={'key-outline'}
                              style={styles.flex}
                              onPress={() => {
                                setResetTeacherId(acc.teacherId);
                                setResetTeacherPassDraft('');
                                setConfirmDeleteTeacherId(null);
                              }}
                            />
                            <Button
                              label={'Sửa'}
                              variant={'ghost'}
                              size={'sm'}
                              icon={'create-outline'}
                              onPress={() =>
                                router.push({
                                  pathname: '/teacher-form',
                                  params: { id: acc.teacherId },
                                } as never)
                              }
                            />
                            {!isSelf ? (
                              <Button
                                label={isConfirmingDel ? 'Xác nhận' : 'Xoá'}
                                variant={'danger'}
                                size={'sm'}
                                icon={'trash-outline'}
                                onPress={() => handleDeleteTeacher(acc)}
                              />
                            ) : null}
                          </View>
                        )}
                      </Card>
                    </FadeIn>
                  );
                })
              )}
            </>
          ) : (
            <>
              <FadeIn index={0}>
                <Card style={styles.offlineCard}>
                  <View style={styles.memberHead}>
                    <View style={[styles.iconBox, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="people" size={22} color={theme.accent} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.title, { color: theme.text }]}>
                        Quản lý Tài khoản Học sinh (GVCN)
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                        Mỗi học sinh có Số ID & mật khẩu riêng và chỉ thấy trang của chính mình. Chỉ
                        GVCN mới xem được toàn bộ {students.length} học sinh & đặt lại mật khẩu khi cần.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.quickRow}>
                    <Button
                      label={'Thêm học sinh'}
                      icon={'person-add'}
                      size={'sm'}
                      style={styles.flex}
                      onPress={() => router.push('/student-form' as never)}
                    />
                    <Button
                      label={'Nhập nhanh DS'}
                      variant={'soft'}
                      icon={'list'}
                      size={'sm'}
                      onPress={() => router.push('/bulk-students' as never)}
                    />
                  </View>
                </Card>
              </FadeIn>

              <TextField
                icon={'search'}
                placeholder={'Tìm học sinh theo tên, Số ID, tổ...'}
                value={accountQuery}
                onChangeText={setAccountQuery}
              />

              {filteredStudents.length === 0 ? (
                <EmptyState
                  icon={'people-outline'}
                  title={'Chưa có tài khoản học sinh nào'}
                  message={'Bấm "Thêm học sinh" ở trên để tạo tài khoản kèm Số ID & mật khẩu riêng.'}
                />
              ) : (
                filteredStudents.map((stu, idx) => {
                  const acc = accountByStudentId.get(stu.id);
                  const stats = statsOfStudent(stu.id);
                  const isResetting = resetTargetId === stu.id;

                  return (
                    <FadeIn key={stu.id} index={Math.min(idx + 1, 8)}>
                      <Card style={styles.memberCard}>
                        <View style={styles.memberHead}>
                          <Avatar name={stu.name} size={44} />
                          <View style={styles.flex}>
                            <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                              {stu.name}
                            </Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                              {[
                                `ID: ${stu.code}`,
                                stu.group || 'Chưa phân tổ',
                                `${stats.total} bài · ${stats.points}đ`,
                              ].join(' · ')}
                            </Text>
                            <View style={styles.badgeRow}>
                              <Badge
                                label={acc ? 'Đã đặt mật khẩu 🔐' : 'Chưa đặt mật khẩu'}
                                color={acc ? 'success' : 'warning'}
                                soft={acc ? 'successSoft' : 'warningSoft'}
                                icon={acc ? 'key' : 'alert-circle-outline'}
                              />
                            </View>
                          </View>
                        </View>

                        {isResetting ? (
                          <View style={[styles.panel, { borderColor: theme.border }]}>
                            <TextField
                              label={`Đặt mật khẩu mới cho ${stu.name} (ID: ${stu.code})`}
                              icon={'key-outline'}
                              placeholder={'Nhập mật khẩu mới (ít nhất 4 ký tự)...'}
                              value={resetPassDraft}
                              onChangeText={setResetPassDraft}
                              autoCapitalize={'none'}
                            />
                            <View style={styles.quickRow}>
                              <Button
                                label={'Huỷ'}
                                variant={'ghost'}
                                size={'sm'}
                                onPress={() => {
                                  setResetTargetId(null);
                                  setResetPassDraft('');
                                }}
                              />
                              <Button
                                label={'Lưu mật khẩu mới'}
                                size={'sm'}
                                icon={'checkmark-circle'}
                                style={styles.flex}
                                onPress={() => handleResetStudentPassword(stu.id, stu.name)}
                              />
                            </View>
                          </View>
                        ) : (
                          <View style={styles.quickRow}>
                            <Button
                              label={acc ? 'Đặt lại mật khẩu' : 'Đặt mật khẩu'}
                              variant={'soft'}
                              size={'sm'}
                              icon={'key-outline'}
                              style={styles.flex}
                              onPress={() => {
                                setResetTargetId(stu.id);
                                setResetPassDraft('');
                              }}
                            />
                            <Button
                              label={'Xem trang'}
                              variant={'ghost'}
                              size={'sm'}
                              icon={'person-circle-outline'}
                              onPress={() =>
                                router.push({
                                  pathname: '/student/[id]',
                                  params: { id: stu.id },
                                } as never)
                              }
                            />
                          </View>
                        )}
                      </Card>
                    </FadeIn>
                  );
                })
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Status filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(
              [
                { value: 'all', label: 'Tất cả' },
                { value: 'pending', label: 'Chờ duyệt' },
                { value: 'approved', label: 'Đã duyệt' },
                { value: 'blocked', label: 'Đã chặn' },
              ] as const
            ).map((f) => (
              <Chip
                key={f.value}
                label={`${f.label} · ${counts[f.value]}`}
                selected={filter === f.value}
                onPress={() => setFilter(f.value)}
              />
            ))}
          </ScrollView>

          {loading && members.length === 0 ? (
            <EmptyState icon={'sync'} title={'Đang tải danh sách thành viên...'} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={'people-outline'}
              title={'Không có tài khoản trong mục này'}
              message={'Chưa có thành viên nào trong danh sách.'}
            />
          ) : (
            visible.map((member, i) => {
              const roleMeta = MEMBER_ROLES[member.role];
              const statusMeta = MEMBER_STATUSES[member.status];
              const isSelf = member.id === auth.userId;
              const linkedStudent = students.find((s) => s.id === member.studentId);
              const expanded = expandedId === member.id;

              return (
                <FadeIn key={member.id} index={Math.min(i, 8)}>
                  <Card style={styles.memberCard}>
                    <Pressable
                      onPress={() => setExpandedId(expanded ? null : member.id)}
                      style={styles.memberHead}>
                      <Avatar name={member.displayName || member.email || '?'} size={46} />
                      <View style={styles.flex}>
                        <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                          {(member.displayName || 'Chưa đặt tên') + (isSelf ? ' (Bạn)' : '')}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                          {member.email ?? 'Không rõ email'}
                        </Text>
                        <View style={styles.badgeRow}>
                          <Badge
                            label={statusMeta.label}
                            color={statusMeta.color}
                            soft={statusMeta.soft}
                            icon={statusMeta.icon}
                          />
                          <Badge
                            label={roleMeta.short}
                            color={roleMeta.color}
                            soft={roleMeta.soft}
                            icon={roleMeta.icon}
                          />
                          {member.canViewPrivate || member.role === 'teacher' ? (
                            <Badge
                              label={'Xem SĐT/Email'}
                              color={'gold'}
                              soft={'goldSoft'}
                              icon={'key'}
                            />
                          ) : null}
                        </View>
                      </View>
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={theme.textMuted}
                      />
                    </Pressable>

                    {/* Pending quick actions */}
                    {member.status === 'pending' ? (
                      <View style={styles.quickRow}>
                        <Button
                          label={'Duyệt vào lớp'}
                          size={'sm'}
                          icon={'checkmark-circle'}
                          style={styles.flex}
                          onPress={() =>
                            applyPatch(member, { status: 'approved' }, `Đã duyệt ${member.displayName || member.email}!`)
                          }
                        />
                        <Button
                          label={'Từ chối / Chặn'}
                          size={'sm'}
                          variant={'danger'}
                          icon={'ban'}
                          style={styles.flex}
                          onPress={() =>
                            applyPatch(member, { status: 'blocked' }, 'Đã chặn tài khoản này')
                          }
                        />
                      </View>
                    ) : null}

                    {/* Expanded RBAC & Privacy panel */}
                    {expanded && !isSelf ? (
                      <View style={[styles.panel, { borderColor: theme.border }]}>
                        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                          Vai trò trong lớp
                        </Text>
                        <View style={styles.roleRow}>
                          {ROLE_ORDER.map((r) => {
                            const active = member.role === r;
                            return (
                              <Pressable
                                key={r}
                                onPress={() =>
                                  applyPatch(
                                    member,
                                    { role: r, canViewPrivate: r === 'teacher' ? true : member.canViewPrivate },
                                    `Đã chuyển sang vai trò ${MEMBER_ROLES[r].label}`,
                                  )
                                }
                                style={[
                                  styles.roleBtn,
                                  {
                                    backgroundColor: active ? theme.accent : theme.backgroundElement,
                                  },
                                ]}>
                                <Text
                                  style={[
                                    styles.roleBtnText,
                                    { color: active ? '#FFFFFF' : theme.textSecondary },
                                  ]}>
                                  {MEMBER_ROLES[r].short}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {/* Privacy toggle */}
                        {member.role !== 'teacher' ? (
                          <Pressable
                            onPress={() =>
                              applyPatch(
                                member,
                                { canViewPrivate: !member.canViewPrivate },
                                member.canViewPrivate
                                  ? 'Đã ẩn SĐT/Email với tài khoản này'
                                  : 'Đã cấp quyền xem SĐT/Email',
                              )
                            }
                            style={[styles.privToggle, { backgroundColor: theme.backgroundElement }]}>
                            <Ionicons
                              name={member.canViewPrivate ? 'eye' : 'eye-off'}
                              size={18}
                              color={member.canViewPrivate ? theme.accent : theme.textMuted}
                            />
                            <View style={styles.flex}>
                              <Text style={[styles.privTitle, { color: theme.text }]}>
                                Cho xem SĐT, Email, Địa chỉ & Ghi chú
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                                Nếu tắt, tài khoản chỉ thấy liên hệ của chính mình (khi đã liên kết)
                              </Text>
                            </View>
                            <Ionicons
                              name={member.canViewPrivate ? 'checkmark-circle' : 'ellipse-outline'}
                              size={22}
                              color={member.canViewPrivate ? theme.accent : theme.textMuted}
                            />
                          </Pressable>
                        ) : null}

                        {/* Link to student profile */}
                        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                          {'Liên kết hồ sơ học sinh: ' + (linkedStudent?.name ?? 'Chưa liên kết')}
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.chips}>
                          <Chip
                            label={'Bỏ liên kết'}
                            selected={!member.studentId}
                            onPress={() =>
                              applyPatch(member, { clearStudent: true }, 'Đã bỏ liên kết học sinh')
                            }
                          />
                          {students.map((s) => (
                            <Chip
                              key={s.id}
                              label={s.name}
                              selected={member.studentId === s.id}
                              onPress={() =>
                                applyPatch(member, { studentId: s.id }, `Đã liên kết với ${s.name}`)
                              }
                            />
                          ))}
                        </ScrollView>

                        {/* Block / Unblock */}
                        <View style={styles.quickRow}>
                          {member.status !== 'approved' ? (
                            <Button
                              label={'Duyệt lại'}
                              size={'sm'}
                              icon={'checkmark-circle'}
                              style={styles.flex}
                              onPress={() =>
                                applyPatch(member, { status: 'approved' }, 'Đã mở quyền truy cập!')
                              }
                            />
                          ) : (
                            <Button
                              label={'Khoá tài khoản này'}
                              size={'sm'}
                              variant={'danger'}
                              icon={'ban'}
                              style={styles.flex}
                              onPress={() =>
                                applyPatch(member, { status: 'blocked' }, 'Đã khoá tài khoản này')
                              }
                            />
                          )}
                        </View>
                      </View>
                    ) : null}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      )}

      {/* Audit Activity Log */}
      <SectionHeader
        title={'Nhật ký chỉnh sửa gần đây'}
        subtitle={'Minh bạch ai đã thay đổi dữ liệu lớp'}
      />
      {activityLog.length === 0 ? (
        <Card>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            Chưa có hoạt động chỉnh sửa nào được ghi nhận.
          </Text>
        </Card>
      ) : (
        <Card style={styles.logCard}>
          {activityLog.slice(0, 15).map((item) => (
            <View key={item.id} style={[styles.logRow, { borderColor: theme.border }]}>
              <View style={[styles.logDot, { backgroundColor: theme.accent }]} />
              <View style={styles.flex}>
                <Text style={[styles.logText, { color: theme.text }]}>
                  <Text style={{ fontWeight: '800' }}>{item.actor}</Text>
                  {' · ' + item.action}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    gap: 4,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  segTabActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTabText: { fontSize: 13, fontWeight: '800' },
  offlineCard: { gap: Spacing.three },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '900' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  memberCard: { gap: Spacing.three },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  memberName: { fontSize: 15, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: Spacing.two },
  panel: {
    gap: Spacing.two + 2,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  roleRow: { flexDirection: 'row', gap: 6 },
  roleBtn: { flex: 1, paddingVertical: 9, borderRadius: Radius.sm, alignItems: 'center' },
  roleBtnText: { fontSize: 12, fontWeight: '800' },
  privToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
  },
  privTitle: { fontSize: 13, fontWeight: '800' },
  logCard: { gap: Spacing.two + 2 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  logText: { fontSize: 13, lineHeight: 18 },
});
