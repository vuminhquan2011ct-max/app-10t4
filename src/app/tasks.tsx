import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DatePickerField } from '@/components/ui/date-picker-field';
import {
  DriveAttachmentList,
  type DriveAttachmentItem,
} from '@/components/ui/drive-attachment-list';
import {
  DriveUploadButton,
  type PendingUploadPreview,
  type UploadedDriveFile,
} from '@/components/ui/drive-upload-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { TASK_PRIORITIES, TASK_PRIORITY_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { daysSince, formatDate, relativeDay, shiftIsoDate, todayIso } from '@/lib/date';
import { DRIVE_CONFIG, extractDriveFileIdFromUrl, getLocalPreviewUri } from '@/lib/drive';
import { saveUploadedFilesToGallery } from '@/lib/drive-gallery';
import {
  OFFICER_DEPARTMENTS,
  getOfficerDepartmentMeta,
  type OfficerDepartmentKey,
} from '@/lib/officer-roles';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { DriveAttachment, TaskPriority } from '@/types/models';

type TaskFilter = 'all' | 'todo' | 'done';
type KindFilter = 'all' | 'task' | 'event';
type DeptFilter = 'all' | OfficerDepartmentKey;

function softToneOf(color: 'accent' | 'success' | 'warning' | 'danger' | 'purple'): ThemeColor {
  return `${color}Soft` as ThemeColor;
}

export default function TasksScreen() {
  const auth = useAuth();
  const {
    classInfo,
    tasks,
    doneTaskIds,
    memberRole,
    isTeacher,
    isOfficer,
    isClassMonitor,
    officerPositionLabel,
    defaultDepartment,
    currentStudent,
    canEditClass,
    canManageTasksAndEvents,
    canPostAnnouncements,
    toggleTaskDone,
    addTask,
    removeTask,
    removeTaskAttachment,
    deleteUploadedFileEverywhere,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const canManage = canManageTasksAndEvents || canEditClass;
  const actorDisplayName =
    auth.profile?.displayName?.trim() ||
    (isTeacher ? classInfo.teacherName : currentStudent?.name || 'Ban cán sự 10T4');

  const [filter, setFilter] = useState<TaskFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [deptFilter, setDeptFilter] = useState<DeptFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  const [itemKind, setItemKind] = useState<'task' | 'event'>('task');
  const [department, setDepartment] = useState<OfficerDepartmentKey>(
    defaultDepartment ?? (isTeacher ? 'class_board' : 'academic'),
  );
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Toán học');
  const [dueDate, setDueDate] = useState(shiftIsoDate(todayIso(), 3));
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<DriveAttachmentItem[]>([]);
  const [deletingAttachmentIds, setDeletingAttachmentIds] = useState<Record<string, boolean>>({});

  const doneCount = useMemo(
    () => tasks.filter((t) => Boolean(doneTaskIds[t.id])).length,
    [tasks, doneTaskIds],
  );
  const progress = tasks.length === 0 ? 0 : doneCount / tasks.length;

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      const done = Boolean(doneTaskIds[t.id]);
      if (filter === 'todo' && done) return false;
      if (filter === 'done' && !done) return false;
      const tKind = t.itemKind ?? 'task';
      if (kindFilter !== 'all' && tKind !== kindFilter) return false;
      if (deptFilter !== 'all' && t.department !== deptFilter) return false;
      return true;
    });
  }, [tasks, doneTaskIds, filter, kindFilter, deptFilter]);

  const handleTaskSelectionStart = (pending: PendingUploadPreview[]) => {
    const optimistic: DriveAttachmentItem[] = pending.map((p) => ({
      id: p.tempId,
      name: p.fileName,
      url: '',
      thumbnailUrl: p.localUri ?? null,
      localUri: p.localUri ?? null,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      kind: p.kind === 'image' ? 'photo' : p.kind,
      pending: true,
    }));
    setAttachments((prev) => [...prev, ...optimistic]);
  };

  const handleTaskItemUploaded = (f: UploadedDriveFile, tempId: string) => {
    const confirmed: DriveAttachmentItem = {
      id: f.id,
      name: f.name,
      url: f.url,
      thumbnailUrl: f.thumbnailUrl,
      localUri: getLocalPreviewUri(f.id),
      downloadUrl: f.downloadUrl,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      kind: f.kind,
      pending: false,
    };
    setAttachments((prev) => {
      const exists = prev.some((a) => a.id === tempId);
      if (exists) {
        return prev.map((a) => (a.id === tempId ? confirmed : a));
      }
      return [...prev, confirmed];
    });
    void saveUploadedFilesToGallery([f], {
      uploaderName: actorDisplayName,
      uploaderRole: memberRole,
      caption: `${subject} · ${title.trim() || 'Nhiệm vụ / Sự kiện lớp 10T4'}`,
      category: f.kind === 'photo' ? 'class_photo' : 'homework',
    }).catch(() => {});
  };

  const handleTaskItemFailed = (tempId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== tempId));
  };

  const handleTaskFilesUploaded = (files: UploadedDriveFile[]) => {
    if (files.length > 0) {
      showToast(`Đã đính kèm ${files.length} tệp lưu trên Drive ${DRIVE_CONFIG.folderName}! ⚡`);
    }
  };

  const handleRemoveDraftAttachment = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (target && !target.pending) {
      const driveFileId = extractDriveFileIdFromUrl(target.url) || target.id;
      void deleteUploadedFileEverywhere({
        driveFileId,
        fileUrl: target.url,
        fileName: target.name,
      }).catch(() => {});
      showToast('Đã xoá tệp khỏi bài soạn, Drive & Excel', 'info');
    }
  };

  const handleRemovePublishedAttachment = async (taskId: string, att: DriveAttachment) => {
    setDeletingAttachmentIds((prev) => ({ ...prev, [att.id]: true }));
    try {
      const driveFileId = extractDriveFileIdFromUrl(att.url) || att.id;
      await removeTaskAttachment(taskId, {
        id: att.id,
        driveFileId,
        url: att.url,
        name: att.name,
      });
      showToast('Đã xoá tệp đính kèm khỏi nhiệm vụ, Drive & Excel!', 'info');
    } finally {
      setDeletingAttachmentIds((prev) => {
        const next = { ...prev };
        delete next[att.id];
        return next;
      });
    }
  };

  const handleAdd = () => {
    if (!title.trim()) {
      showToast(
        itemKind === 'event'
          ? 'Hãy nhập tên sự kiện / hoạt động'
          : 'Hãy nhập nội dung bài tập / nhiệm vụ',
        'warning',
      );
      return;
    }
    if (attachments.some((a) => a.pending)) {
      showToast('Đợi vài giây để tệp đính kèm hoàn tất đồng bộ lên Drive nhé!', 'info');
      return;
    }
    const cleanAttachments: DriveAttachment[] = attachments.map(
      ({ pending: _p, localUri: _l, ...rest }) => rest,
    );
    const deptMeta = getOfficerDepartmentMeta(department);
    addTask({
      title,
      subject: subject.trim() || deptMeta?.short || 'Hoạt động lớp',
      dueDate,
      priority,
      note,
      attachments: cleanAttachments,
      itemKind,
      department,
      eventDate: itemKind === 'event' ? dueDate : null,
      location: location.trim() || null,
      assignedOfficerRole: isOfficer ? officerPositionLabel : null,
      authorName: actorDisplayName,
      authorPosition: isTeacher ? 'GVCN' : isOfficer ? officerPositionLabel : null,
    });
    setTitle('');
    setLocation('');
    setNote('');
    setAttachments([]);
    setComposerOpen(false);
    showToast(
      itemKind === 'event'
        ? 'Đã tạo sự kiện lớp mới & gán phòng ban phụ trách! 🎉'
        : 'Đã giao nhiệm vụ mới cho cả lớp!',
    );
  };

  const canDeleteTask = (task: (typeof tasks)[number]) => {
    if (isTeacher || isClassMonitor) return true;
    if (!canManage) return false;
    const ownerName = (task.authorName ?? '').trim().toLowerCase();
    if (!ownerName) return false;
    return ownerName === actorDisplayName.trim().toLowerCase();
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Nhiệm vụ · Phòng ban · Sự kiện'}
        subtitle={'Bài tập GV giao, Ban chuyên trách & Sự kiện lớp ' + classInfo.name}
        rightIcon={canManage ? (composerOpen ? 'close' : 'add') : undefined}
        rightLabel={canManage ? (composerOpen ? 'Đóng' : 'Tạo mới') : undefined}
        onRightPress={canManage ? () => setComposerOpen((v) => !v) : undefined}
      />

      {/* Personal Completion Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.25 }]}>
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>
              {canManage && isOfficer
                ? `QUYỀN ${(officerPositionLabel || 'BAN CÁN SỰ').toUpperCase()} · QUẢN LÝ PHÒNG BAN`
                : 'TIẾN ĐỘ CÁ NHÂN CỦA BẠN'}
            </Text>
            <Text style={styles.heroTitle}>{`${doneCount} / ${tasks.length} hoàn thành`}</Text>
            <Text style={styles.heroSub}>
              {canManage
                ? 'Tạo nhiệm vụ GV giao, phân công phòng ban, sự kiện & chuyển nhanh lên Bảng tin lớp.'
                : 'Đánh dấu tiến độ hoàn thành được lưu riêng trên máy của bạn.'}
            </Text>
          </View>
          <ProgressRing
            progress={progress}
            size={84}
            color={'#FFFFFF'}
            trackColor={'rgba(255,255,255,0.25)'}
            caption={'xong'}
            textColor={'#FFFFFF'}
            captionColor={'rgba(255,255,255,0.85)'}
          />
        </LinearGradient>
      </FadeIn>

      {/* Composer (GVCN, GVBM & 6 Ban cán sự phụ trách) */}
      {composerOpen && canManage ? (
        <FadeIn index={1}>
          <Card style={styles.composer}>
            <View style={styles.compHead}>
              <Text style={[styles.compTitle, { color: theme.text }]}>
                {itemKind === 'event' ? 'Tạo sự kiện lớp mới' : 'Giao nhiệm vụ / Bài tập mới'}
              </Text>
              <Badge
                label={isTeacher ? 'GVCN' : officerPositionLabel || 'Ban cán sự'}
                color={'accent'}
                soft={'accentSoft'}
                icon={'shield-checkmark'}
              />
            </View>

            {/* Kind toggle: Nhiệm vụ GV giao vs Sự kiện lớp */}
            <OptionPicker
              label={'Loại công việc'}
              columns={2}
              options={[
                { value: 'task', label: 'Nhiệm vụ GV giao', icon: 'list-circle-outline' },
                { value: 'event', label: 'Sự kiện lớp', icon: 'sparkles-outline' },
              ]}
              value={itemKind}
              onChange={(v) => setItemKind(v as 'task' | 'event')}
            />

            {/* Department picker (Phòng ban phụ trách) */}
            <View style={styles.deptWrap}>
              <Text style={[styles.deptLabel, { color: theme.textSecondary }]}>
                Phòng ban phụ trách
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {OFFICER_DEPARTMENTS.map((dept) => (
                  <Chip
                    key={dept.key}
                    label={dept.short}
                    icon={dept.icon as keyof typeof Ionicons.glyphMap}
                    selected={department === dept.key}
                    onPress={() => setDepartment(dept.key)}
                  />
                ))}
              </ScrollView>
            </View>

            <TextField
              label={itemKind === 'event' ? 'Tên sự kiện / Hoạt động' : 'Tên nhiệm vụ'}
              placeholder={
                itemKind === 'event'
                  ? 'Ví dụ: Hội diễn văn nghệ 20/11 · Giải bóng đá 10T4'
                  : 'Ví dụ: Nộp bài thuyết trình nhóm Lịch sử'
              }
              value={title}
              onChangeText={setTitle}
            />
            <TextField
              label={'Môn học / Chủ đề'}
              placeholder={'Toán học, Văn nghệ, Thể thao, Đoàn thanh niên...'}
              value={subject}
              onChangeText={setSubject}
            />
            <OptionPicker
              label={'Mức độ ưu tiên'}
              columns={3}
              options={TASK_PRIORITY_LIST.map((p) => ({
                value: p,
                label: TASK_PRIORITIES[p].label,
                icon: TASK_PRIORITIES[p].icon,
              }))}
              value={priority}
              onChange={setPriority}
            />
            <DatePickerField
              label={itemKind === 'event' ? 'Ngày diễn ra sự kiện' : 'Hạn nộp / thực hiện'}
              value={dueDate}
              onChange={setDueDate}
            />
            {itemKind === 'event' ? (
              <TextField
                label={'Địa điểm tổ chức (tuỳ chọn)'}
                icon={'location-outline'}
                placeholder={'Ví dụ: Sân trường THPT FPT, Phòng 304...'}
                value={location}
                onChangeText={setLocation}
              />
            ) : null}
            <TextField
              label={'Hướng dẫn / Kế hoạch chi tiết (tuỳ chọn)'}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <DriveUploadButton
              mode={'both'}
              compact
              multiple
              mediaLabel={'Đính kèm ảnh'}
              fileLabel={`Tải file lên ${DRIVE_CONFIG.folderName}`}
              uploaderName={actorDisplayName}
              uploaderRole={memberRole}
              category={'homework'}
              onSelectionStart={handleTaskSelectionStart}
              onItemUploaded={handleTaskItemUploaded}
              onItemFailed={handleTaskItemFailed}
              onUploaded={handleTaskFilesUploaded}
            />
            <DriveAttachmentList
              attachments={attachments}
              editable
              onRemove={handleRemoveDraftAttachment}
            />
            <Button
              label={itemKind === 'event' ? 'Đăng sự kiện lớp' : 'Đăng lên bảng nhiệm vụ'}
              icon={'checkmark-circle'}
              onPress={handleAdd}
            />
          </Card>
        </FadeIn>
      ) : null}

      {/* Completion & Kind Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={`Tất cả (${tasks.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip
          label={`Cần làm (${tasks.length - doneCount})`}
          selected={filter === 'todo'}
          onPress={() => setFilter('todo')}
        />
        <Chip label={`Đã xong (${doneCount})`} selected={filter === 'done'} onPress={() => setFilter('done')} />
        <Chip
          label={'Nhiệm vụ GV'}
          icon={'list-circle-outline'}
          selected={kindFilter === 'task'}
          onPress={() => setKindFilter((k) => (k === 'task' ? 'all' : 'task'))}
        />
        <Chip
          label={'Sự kiện lớp'}
          icon={'sparkles-outline'}
          selected={kindFilter === 'event'}
          onPress={() => setKindFilter((k) => (k === 'event' ? 'all' : 'event'))}
        />
      </ScrollView>

      {/* Department Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          label={'Mọi phòng ban'}
          icon={'grid-outline'}
          selected={deptFilter === 'all'}
          onPress={() => setDeptFilter('all')}
        />
        {OFFICER_DEPARTMENTS.map((dept) => (
          <Chip
            key={dept.key}
            label={dept.short}
            icon={dept.icon as keyof typeof Ionicons.glyphMap}
            selected={deptFilter === dept.key}
            onPress={() => setDeptFilter(dept.key)}
          />
        ))}
      </ScrollView>

      {visible.length === 0 ? (
        <EmptyState
          icon={'checkmark-done-circle-outline'}
          title={filter === 'todo' ? 'Tuyệt vời! Bạn đã hoàn thành hết!' : 'Chưa có nhiệm vụ / sự kiện nào'}
          message={'Danh sách bài tập GV giao, phòng ban và sự kiện của lớp sẽ hiển thị tại đây.'}
        />
      ) : (
        visible.map((task, idx) => {
          const done = Boolean(doneTaskIds[task.id]);
          const prio = TASK_PRIORITIES[task.priority];
          const diff = daysSince(task.dueDate);
          const overdue = !done && diff !== null && diff > 0;
          const isEvent = task.itemKind === 'event';
          const deptMeta = getOfficerDepartmentMeta(task.department);
          const deletable = canDeleteTask(task);

          return (
            <FadeIn key={task.id} index={Math.min(idx + 1, 8)}>
              <Card
                style={[
                  styles.taskCard,
                  done && { opacity: 0.72 },
                  overdue && { borderColor: theme.danger, borderWidth: 1.5 },
                  isEvent && !overdue && { borderColor: theme.purple, borderWidth: 1.2 },
                ]}>
                <View style={styles.taskTop}>
                  <Pressable
                    onPress={() => {
                      toggleTaskDone(task.id);
                      if (!done) decor.recordMissionProgress('complete_task', 1);
                      showToast(
                        done ? 'Đã chuyển về Cần làm' : 'Đã đánh dấu hoàn thành! 🎉',
                        done ? 'info' : 'success',
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={done ? 'Bỏ đánh dấu hoàn thành' : 'Đánh dấu hoàn thành'}
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: done ? theme.success : 'transparent',
                        borderColor: done ? theme.success : theme.textMuted,
                      },
                    ]}>
                    {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </Pressable>

                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.taskTitle,
                        { color: theme.text },
                        done && styles.strike,
                      ]}>
                      {task.title}
                    </Text>
                    <View style={styles.badgeRow}>
                      {isEvent ? (
                        <Badge
                          label={'Sự kiện lớp'}
                          color={'purple'}
                          soft={'purpleSoft'}
                          icon={'sparkles'}
                        />
                      ) : null}
                      {deptMeta ? (
                        <Badge
                          label={deptMeta.short}
                          color={deptMeta.color}
                          soft={softToneOf(deptMeta.color)}
                          icon={deptMeta.icon as keyof typeof Ionicons.glyphMap}
                        />
                      ) : null}
                      <Badge label={task.subject} color={'purple'} soft={'purpleSoft'} />
                      <Badge label={prio.label} color={prio.color} soft={prio.soft} icon={prio.icon} />
                      <Badge
                        label={
                          overdue
                            ? `Quá hạn (${formatDate(task.dueDate)})`
                            : `${relativeDay(task.dueDate)} · ${formatDate(task.dueDate)}`
                        }
                        color={overdue ? 'danger' : 'accentText'}
                        soft={overdue ? 'dangerSoft' : 'accentSoft'}
                        icon={'calendar-outline'}
                      />
                    </View>
                  </View>

                  {deletable ? (
                    <Pressable
                      onPress={() => {
                        removeTask(task.id);
                        showToast('Đã xoá nhiệm vụ & tệp đính kèm khỏi App, Drive & Excel', 'warning');
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Xoá nhiệm vụ">
                      <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                {task.location ? (
                  <View style={styles.metaLine}>
                    <Ionicons name="location-outline" size={13} color={theme.accent} />
                    <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                      {task.location}
                    </Text>
                  </View>
                ) : null}

                {task.note ? (
                  <Text style={[styles.note, { color: theme.textSecondary }]}>{task.note}</Text>
                ) : null}

                {task.attachments && task.attachments.length > 0 ? (
                  <DriveAttachmentList
                    attachments={task.attachments}
                    editable={deletable}
                    confirmBeforeRemove
                    deletingIds={deletingAttachmentIds}
                    onRemove={(attId) => {
                      const found = task.attachments?.find((a) => a.id === attId);
                      if (found) {
                        void handleRemovePublishedAttachment(task.id, found);
                      }
                    }}
                  />
                ) : null}

                {/* Footer: Author Attribution + 1-Tap Broadcast to Announcements */}
                {task.authorName || task.authorPosition || canPostAnnouncements ? (
                  <View style={[styles.taskFooter, { borderColor: theme.border }]}>
                    <Text style={{ color: theme.textMuted, fontSize: 11.5, flex: 1 }} numberOfLines={1}>
                      {task.authorName || task.authorPosition
                        ? `Phụ trách: ${[task.authorPosition, task.authorName].filter(Boolean).join(' · ')}`
                        : deptMeta
                          ? deptMeta.label
                          : `Lớp ${classInfo.name}`}
                    </Text>
                    {canPostAnnouncements ? (
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/announcements',
                            params: {
                              prefillTitle: isEvent
                                ? `Sự kiện lớp: ${task.title}`
                                : `Thông báo nhiệm vụ: ${task.title}`,
                              prefillBody: [
                                task.note?.trim() ||
                                  `Triển khai ${isEvent ? 'sự kiện' : 'nhiệm vụ'} ${task.title} (${task.subject}).`,
                                `Thời gian / Hạn: ${formatDate(task.eventDate || task.dueDate)}`,
                                task.location?.trim() ? `Địa điểm: ${task.location.trim()}` : null,
                              ]
                                .filter(Boolean)
                                .join('\n'),
                              prefillDept: task.department ?? defaultDepartment ?? 'class_board',
                              prefillTag: isEvent ? 'event' : 'reminder',
                              prefillEventDate: task.eventDate || task.dueDate,
                              prefillEventId: task.id,
                            },
                          } as never)
                        }
                        style={({ pressed }) => [
                          styles.broadcastBtn,
                          { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons name="megaphone-outline" size={13} color={theme.accentText} />
                        <Text style={[styles.broadcastText, { color: theme.accentText }]}>
                          Đăng bản tin 📢
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  composer: { gap: Spacing.three },
  compHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  compTitle: { fontSize: 16, fontWeight: '900' },
  deptWrap: { gap: 6 },
  deptLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  taskCard: { gap: Spacing.two },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  taskTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  strike: { textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 36 },
  note: { fontSize: 13, lineHeight: 19, paddingLeft: 36 },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  broadcastText: { fontSize: 11.5, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});
