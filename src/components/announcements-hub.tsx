/**
 * Flagship "Trang Thông Tin Lớp 10T4" Hub — Shared by the new `Thông tin` tab
 * (`/bulletin`) and the backward-compatible `/announcements` screen.
 *
 * Features:
 * - Every GVCN, Subject Teacher, Editor, and GVCN-assigned Class Officer
 *   (`canPostAnnouncements`) can publish notices, messages, multi-photos, videos
 *   & files to Google Drive (`K8T4_app`).
 * - 3 Visibility Modes:
 *   1. `public`   — Công khai (everyone in class)
 *   2. `selected` — Chọn thành viên (selected classmates + author + GVCN)
 *   3. `private`  — Không công khai (author + GVCN only)
 * - Live inline Audience Switcher (`updateAnnouncementAudience`), Read-Receipts
 *   (`toggleAnnouncementAcknowledge` + readers drawer), and inline Discussion
 *   Replies (`addAnnouncementReply` / `removeAnnouncementReply` with 2-tap confirm).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
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
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import {
  ANNOUNCEMENT_TAGS,
  ANNOUNCEMENT_TAG_LIST,
  SUBJECT_TEACHER_PRESETS,
} from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { useTwoTapConfirm } from '@/hooks/use-two-tap-confirm';
import { formatDate, relativeDay } from '@/lib/date';
import { DRIVE_CONFIG, extractDriveFileIdFromUrl, getLocalPreviewUri } from '@/lib/drive';
import { saveUploadedFilesToGallery } from '@/lib/drive-gallery';
import { stripVietnamese } from '@/lib/intelligence';
import {
  OFFICER_DEPARTMENTS,
  getOfficerDepartmentMeta,
  normalizePositionsList,
  type OfficerDepartmentKey,
} from '@/lib/officer-roles';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type {
  Announcement,
  AnnouncementReply,
  AnnouncementTag,
  AnnouncementVisibility,
  DriveAttachment,
  PublicStudentRosterItem,
} from '@/types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;
type HubFilter = 'all' | 'public' | 'selected' | 'private' | 'media' | 'pinned';

const VISIBILITY_OPTIONS: {
  key: AnnouncementVisibility;
  title: string;
  desc: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
}[] = [
  {
    key: 'public',
    title: 'Công khai',
    desc: 'Mọi người đều xem được',
    icon: 'globe-outline',
    color: 'success',
    soft: 'successSoft',
  },
  {
    key: 'selected',
    title: 'Chọn thành viên',
    desc: 'Chỉ thành viên được chọn & GVCN xem',
    icon: 'people-outline',
    color: 'purple',
    soft: 'purpleSoft',
  },
  {
    key: 'private',
    title: 'Không công khai',
    desc: 'Riêng tư — chỉ bạn & GVCN xem được',
    icon: 'lock-closed-outline',
    color: 'warning',
    soft: 'warningSoft',
  },
];

function softToneOf(color: 'accent' | 'success' | 'warning' | 'danger' | 'purple'): ThemeColor {
  return `${color}Soft` as ThemeColor;
}

function subjectEmojiOf(sub?: string | null): string {
  if (!sub) return '📚';
  const found = SUBJECT_TEACHER_PRESETS.find(
    (p) => p.subject.toLowerCase() === sub.toLowerCase(),
  );
  return found?.emoji ?? '📚';
}

function formatShortTimestamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ==================== REUSABLE 3-MODE AUDIENCE SELECTOR ==================== */

function AudienceSelector({
  visibility,
  selectedIds,
  roster,
  compact = false,
  onChangeVisibility,
  onChangeSelectedIds,
}: {
  visibility: AnnouncementVisibility;
  selectedIds: string[];
  roster: PublicStudentRosterItem[];
  compact?: boolean;
  onChangeVisibility: (next: AnnouncementVisibility) => void;
  onChangeSelectedIds: (next: string[]) => void;
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredRoster = useMemo(() => {
    const q = stripVietnamese(search);
    return roster
      .filter((s) => {
        if (!q) return true;
        const pos = normalizePositionsList(s.positions, s.position).join(' ');
        return stripVietnamese(`${s.name} ${s.code} ${s.group ?? ''} ${pos}`).includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [roster, search]);

  const toggleMember = (studentId: string) => {
    if (selectedSet.has(studentId)) {
      onChangeSelectedIds(selectedIds.filter((id) => id !== studentId));
    } else {
      onChangeSelectedIds([...selectedIds, studentId]);
    }
  };

  const toggleGroupShortcut = (groupLabel: string) => {
    const groupMembers = roster.filter(
      (s) => (s.group?.trim().toLowerCase() ?? '') === groupLabel.toLowerCase(),
    );
    if (groupMembers.length === 0) return;
    const allIn = groupMembers.every((m) => selectedSet.has(m.id));
    if (allIn) {
      const drop = new Set(groupMembers.map((m) => m.id));
      onChangeSelectedIds(selectedIds.filter((id) => !drop.has(id)));
    } else {
      const next = new Set(selectedIds);
      for (const m of groupMembers) next.add(m.id);
      onChangeSelectedIds(Array.from(next));
    }
  };

  const toggleOfficersShortcut = () => {
    const officers = roster.filter(
      (s) => Boolean(s.position?.trim()) || Boolean(s.positions && s.positions.length > 0),
    );
    if (officers.length === 0) return;
    const allIn = officers.every((m) => selectedSet.has(m.id));
    if (allIn) {
      const drop = new Set(officers.map((m) => m.id));
      onChangeSelectedIds(selectedIds.filter((id) => !drop.has(id)));
    } else {
      const next = new Set(selectedIds);
      for (const m of officers) next.add(m.id);
      onChangeSelectedIds(Array.from(next));
    }
  };

  return (
    <View style={styles.audienceWrap}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        QUYỀN XEM BÀI ĐĂNG
      </Text>
      <View style={styles.visCardsCol}>
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = visibility === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onChangeVisibility(opt.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${opt.title}: ${opt.desc}`}
              style={({ pressed }) => [
                styles.visCard,
                compact && styles.visCardCompact,
                {
                  backgroundColor: active ? theme[opt.soft] : theme.backgroundElement,
                  borderColor: active ? theme[opt.color] : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.visIconBox,
                  { backgroundColor: active ? theme[opt.color] : theme.card },
                ]}>
                <Ionicons
                  name={opt.icon}
                  size={16}
                  color={active ? '#FFFFFF' : theme[opt.color]}
                />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.visTitle, { color: theme.text }]}>{opt.title}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5 }} numberOfLines={1}>
                  {opt.desc}
                </Text>
              </View>
              <Ionicons
                name={active ? 'checkmark-circle' : 'ellipse-outline'}
                size={19}
                color={active ? theme[opt.color] : theme.textMuted}
              />
            </Pressable>
          );
        })}
      </View>

      {visibility === 'selected' ? (
        <View
          style={[
            styles.pickerBox,
            { backgroundColor: theme.backgroundElement, borderColor: `${theme.purple}66` },
          ]}>
          <View style={styles.pickerHeadRow}>
            <Text style={[styles.pickerTitle, { color: theme.text }]}>
              Chọn thành viên được xem
            </Text>
            <Badge
              label={`Đã chọn: ${selectedIds.length} thành viên`}
              color={'purple'}
              soft={'purpleSoft'}
              icon={'people'}
            />
          </View>

          {/* 1-tap Group & Officer Shortcuts */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {GROUP_PRESETS.map((grp) => {
              const members = roster.filter(
                (s) => (s.group?.trim().toLowerCase() ?? '') === grp.toLowerCase(),
              );
              const allIn = members.length > 0 && members.every((m) => selectedSet.has(m.id));
              return (
                <Pressable
                  key={grp}
                  onPress={() => toggleGroupShortcut(grp)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Chọn nhanh ${grp}`}
                  style={({ pressed }) => [
                    styles.shortcutPill,
                    {
                      backgroundColor: allIn ? theme.purple : theme.card,
                      borderColor: allIn ? theme.purple : theme.border,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.shortcutPillText,
                      { color: allIn ? '#FFFFFF' : theme.text },
                    ]}>
                    {`${grp} (${members.length})`}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={toggleOfficersShortcut}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Chọn nhanh Ban cán sự"
              style={({ pressed }) => [
                styles.shortcutPill,
                { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.shortcutPillText, { color: theme.accentText }]}>
                Ban cán sự
              </Text>
            </Pressable>
            {selectedIds.length > 0 ? (
              <Pressable
                onPress={() => onChangeSelectedIds([])}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Bỏ chọn hết thành viên"
                style={({ pressed }) => [
                  styles.shortcutPill,
                  { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.shortcutPillText, { color: theme.danger }]}>
                  Bỏ chọn hết
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <TextField
            icon={'search'}
            placeholder={'Tìm thành viên theo tên, Số ID, tổ, chức vụ...'}
            value={search}
            onChangeText={setSearch}
            clearable
          />

          {filteredRoster.length === 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              Không tìm thấy thành viên phù hợp.
            </Text>
          ) : (
            <View style={styles.memberChipWrap}>
              {filteredRoster.map((member) => {
                const picked = selectedSet.has(member.id);
                const posList = normalizePositionsList(member.positions, member.position);
                const metaLine = [member.group || null, posList[0] || null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => toggleMember(member.id)}
                    hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: picked }}
                    accessibilityLabel={`Chọn ${member.name}`}
                    style={({ pressed }) => [
                      styles.memberChip,
                      {
                        backgroundColor: picked ? theme.purpleSoft : theme.card,
                        borderColor: picked ? theme.purple : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={picked ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={picked ? theme.purple : theme.textMuted}
                    />
                    <View style={styles.memberChipTexts}>
                      <Text
                        style={[
                          styles.memberChipName,
                          { color: picked ? theme.purple : theme.text },
                        ]}
                        numberOfLines={1}>
                        {member.name}
                      </Text>
                      {metaLine ? (
                        <Text
                          style={{ color: theme.textMuted, fontSize: 10 }}
                          numberOfLines={1}>
                          {metaLine}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/* ==================== FLAGSHIP ANNOUNCEMENT & MESSAGE COMPOSER ==================== */

function AnnouncementComposer({
  initialTitle,
  initialBody,
  initialTag,
  initialDept,
  initialEventDate,
  initialEventId,
  onPublished,
}: {
  initialTitle: string;
  initialBody: string;
  initialTag: AnnouncementTag;
  initialDept: OfficerDepartmentKey | null;
  initialEventDate: string | null;
  initialEventId: string | null;
  onPublished: () => void;
}) {
  const auth = useAuth();
  const theme = useTheme();
  const { showToast } = useToast();
  const {
    classInfo,
    classRosterPublic,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    isOfficer,
    isClassMonitor,
    officerPositionLabel,
    currentStudent,
    currentStudentId,
    subjectName,
    addAnnouncement,
    deleteUploadedFileEverywhere,
  } = useClassStore();

  const isOfficerPublisher = !isTeacher && !isSubjectTeacher && isOfficer;
  const subjectTeacherActorLabel = (() => {
    const base = auth.profile?.displayName?.trim() || 'GV Bộ môn';
    return subjectName ? `${base} (${subjectName})` : base;
  })();

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialBody);
  const [tag, setTag] = useState<AnnouncementTag>(initialTag);
  const [composerDept, setComposerDept] = useState<OfficerDepartmentKey | null>(initialDept);
  const [composerSubject, setComposerSubject] = useState<string>(
    subjectName || SUBJECT_TEACHER_PRESETS[0].subject,
  );
  const [composerAuthor, setComposerAuthor] = useState<string>(
    auth.profile?.displayName?.trim() || classInfo.teacherName,
  );
  const [eventDate, setEventDate] = useState<string | null>(initialEventDate);
  const [pinned, setPinned] = useState(isTeacher);
  const [visibility, setVisibility] = useState<AnnouncementVisibility>('public');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DriveAttachmentItem[]>([]);
  const uploadedFilesRef = useRef<Map<string, UploadedDriveFile>>(new Map());

  const handleAttachmentSelectionStart = (pending: PendingUploadPreview[]) => {
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

  const handleAttachmentItemUploaded = (f: UploadedDriveFile, tempId: string) => {
    uploadedFilesRef.current.set(f.id, f);
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
  };

  const handleAttachmentItemFailed = (tempId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== tempId));
  };

  const handleAttachmentUploaded = (files: UploadedDriveFile[]) => {
    if (files.length > 0) {
      showToast(`Đã đính kèm ${files.length} ảnh/tệp! ⚡`);
    }
  };

  const handleRemoveDraftAttachment = (id: string) => {
    const target = attachments.find((a) => a.id === id);
    uploadedFilesRef.current.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (target && !target.pending) {
      const driveFileId = extractDriveFileIdFromUrl(target.url) || target.id;
      void deleteUploadedFileEverywhere({
        driveFileId,
        fileUrl: target.url,
        fileName: target.name,
      }).catch(() => {});
      showToast('Đã xoá tệp đính kèm khỏi bài soạn, Drive & Excel', 'info');
    }
  };

  const handlePublish = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle && !trimmedContent && attachments.length === 0) {
      showToast('Hãy nhập nội dung tin nhắn hoặc đính kèm ảnh/tệp trước khi đăng', 'warning');
      return;
    }
    if (attachments.some((a) => a.pending)) {
      showToast('Đợi vài giây để ảnh/tệp hoàn tất đồng bộ lên Drive nhé!', 'info');
      return;
    }
    if (visibility === 'selected' && selectedIds.length === 0) {
      showToast(
        'Hãy chọn ít nhất 1 thành viên được xem (hoặc chuyển sang Không công khai)',
        'warning',
      );
      return;
    }

    const autoTitle =
      trimmedTitle ||
      (trimmedContent
        ? trimmedContent.length > 60
          ? `${trimmedContent.slice(0, 60)}…`
          : trimmedContent
        : 'Chia sẻ ảnh / tệp tin');

    const cleanAttachments: DriveAttachment[] = attachments.map(
      ({ pending: _p, localUri: _l, ...rest }) => rest,
    );
    const effectiveSubject = isSubjectTeacher
      ? subjectName || composerSubject.trim() || 'Bộ môn'
      : tag === 'subject'
        ? composerSubject.trim() || null
        : null;
    const effectiveAuthor = isTeacher
      ? composerAuthor.trim() || auth.profile?.displayName?.trim() || classInfo.teacherName
      : isSubjectTeacher
        ? subjectTeacherActorLabel
        : currentStudent?.name || auth.profile?.displayName?.trim() || officerPositionLabel || 'Ban cán sự';

    const effectiveAuthorRole: Announcement['authorRole'] = isTeacher
      ? 'teacher'
      : isSubjectTeacher
        ? 'subject_teacher'
        : isOfficerPublisher
          ? 'officer'
          : 'editor';

    addAnnouncement({
      title: autoTitle,
      content: trimmedContent || (cleanAttachments.length > 0 ? `Đã chia sẻ ${cleanAttachments.length} tệp đính kèm.` : autoTitle),
      tag,
      eventDate,
      eventId: initialEventId,
      pinned: isTeacher || isClassMonitor ? pinned : false,
      author: effectiveAuthor,
      subject: effectiveSubject,
      authorRole: effectiveAuthorRole,
      authorStudentId: isTeacher || isSubjectTeacher ? null : currentStudentId,
      department: composerDept,
      authorPosition: isOfficerPublisher ? officerPositionLabel : null,
      attachments: cleanAttachments,
      visibility,
      visibleToStudentIds: visibility === 'selected' ? selectedIds : [],
    });

    // Strictly publish attachments to the public class gallery ONLY for 'public' posts
    if (visibility === 'public' && cleanAttachments.length > 0) {
      const publicFiles = cleanAttachments
        .map((att) => uploadedFilesRef.current.get(att.id))
        .filter((f): f is UploadedDriveFile => Boolean(f));
      if (publicFiles.length > 0) {
        void saveUploadedFilesToGallery(publicFiles, {
          uploaderName: effectiveAuthor,
          uploaderRole: memberRole,
          uploaderSubject: isSubjectTeacher ? effectiveSubject : null,
          caption: autoTitle,
          category: publicFiles.every((f) => f.kind === 'photo') ? 'class_photo' : 'lecture',
        }).catch(() => {});
      }
    }
    uploadedFilesRef.current.clear();

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    showToast(
      visibility === 'private'
        ? 'Đã lưu tin riêng tư (chỉ bạn & GVCN xem được)! 🔒'
        : visibility === 'selected'
          ? `Đã gửi tin tới ${selectedIds.length} thành viên được chọn! 👥`
          : 'Đã đăng công khai lên Trang Thông Tin lớp 10T4! 🌍',
    );
    onPublished();
  };

  const publishBtnLabel =
    visibility === 'private'
      ? 'Lưu riêng tư (Chỉ bạn & GVCN)'
      : visibility === 'selected'
        ? `Gửi tới ${selectedIds.length} thành viên đã chọn`
        : `Đăng công khai lớp ${classInfo.name}`;

  return (
    <FadeIn index={0}>
      <Card style={[styles.composer, { borderColor: `${theme.accent}66`, borderWidth: 1.2 }]}>
        <View style={styles.compHead}>
          <Text style={[styles.compTitle, { color: theme.text }]}>
            Đăng tin · Ảnh · File · Nhắn tin
          </Text>
          <Badge
            label={
              isTeacher
                ? '🛡️ GV Chủ nhiệm'
                : isSubjectTeacher
                  ? `${subjectEmojiOf(composerSubject)} GV ${composerSubject}`
                  : officerPositionLabel || 'Ban cán sự'
            }
            color={isSubjectTeacher ? 'success' : isOfficerPublisher ? 'purple' : 'accent'}
            soft={
              isSubjectTeacher ? 'successSoft' : isOfficerPublisher ? 'purpleSoft' : 'accentSoft'
            }
          />
        </View>

        <TextField
          label={'Tiêu đề (tuỳ chọn — để trống tự lấy từ nội dung)'}
          placeholder={'VD: Dặn dò kiểm tra 15p / Ảnh hoạt động Tổ 2...'}
          value={title}
          onChangeText={setTitle}
          clearable
        />

        <TextField
          label={'Nội dung tin nhắn / thông báo'}
          placeholder={'Nhập nội dung tin nhắn, thông báo hoặc ghi chú gửi kèm ảnh/tệp...'}
          value={content}
          onChangeText={setContent}
          multiline
        />

        {/* Multi-Photo, Video & File Uploader */}
        <View style={styles.blockGap}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
            {`ĐÍNH KÈM NHIỀU ẢNH, VIDEO & FILE (DRIVE ${DRIVE_CONFIG.folderName})`}
          </Text>
          <DriveUploadButton
            mode={'both'}
            compact
            multiple
            mediaLabel={'Chọn ảnh / video'}
            fileLabel={'Chọn tệp / tài liệu'}
            uploaderName={composerAuthor.trim() || classInfo.teacherName}
            uploaderRole={memberRole}
            category={'lecture'}
            onSelectionStart={handleAttachmentSelectionStart}
            onItemUploaded={handleAttachmentItemUploaded}
            onItemFailed={handleAttachmentItemFailed}
            onUploaded={handleAttachmentUploaded}
          />
          <DriveAttachmentList
            attachments={attachments}
            editable
            confirmBeforeRemove
            onRemove={handleRemoveDraftAttachment}
          />
        </View>

        {/* 3-Mode Visibility & Audience Picker */}
        <AudienceSelector
          visibility={visibility}
          selectedIds={selectedIds}
          roster={classRosterPublic}
          onChangeVisibility={setVisibility}
          onChangeSelectedIds={setSelectedIds}
        />

        {/* Tag & Department Controls */}
        <OptionPicker
          label={'Phân loại tin'}
          columns={2}
          options={ANNOUNCEMENT_TAG_LIST.map((t) => ({
            value: t,
            label: ANNOUNCEMENT_TAGS[t].label,
            icon: ANNOUNCEMENT_TAGS[t].icon,
          }))}
          value={tag}
          onChange={setTag}
        />

        {!isSubjectTeacher ? (
          <View style={styles.blockGap}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              PHÒNG BAN / BAN CHUYÊN TRÁCH
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              <Chip
                label={'Chung cả lớp'}
                selected={composerDept === null}
                onPress={() => setComposerDept(null)}
              />
              {OFFICER_DEPARTMENTS.map((dept) => (
                <Chip
                  key={dept.key}
                  label={dept.short}
                  icon={dept.icon as IoniconName}
                  selected={composerDept === dept.key}
                  onPress={() => setComposerDept(dept.key)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {isSubjectTeacher || tag === 'subject' ? (
          <View style={styles.blockGap}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              MÔN HỌC GẮN THẺ
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {SUBJECT_TEACHER_PRESETS.map((item) => (
                <Chip
                  key={item.subject}
                  label={`${item.emoji} ${item.subject}`}
                  selected={composerSubject === item.subject}
                  onPress={() => setComposerSubject(item.subject)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {isTeacher ? (
          <TextField
            label={'Tên giáo viên đăng tin'}
            icon={'person-outline'}
            value={composerAuthor}
            onChangeText={setComposerAuthor}
          />
        ) : null}

        <DatePickerField
          label={'Ngày kiểm tra / Hạn nộp / Sự kiện (tuỳ chọn)'}
          value={eventDate}
          onChange={setEventDate}
          clearable
          onClear={() => setEventDate(null)}
        />

        {isTeacher || isClassMonitor ? (
          <Pressable
            onPress={() => setPinned((p) => !p)}
            accessibilityRole="switch"
            accessibilityState={{ checked: pinned }}
            accessibilityLabel="Ghim lên đầu trang thông tin"
            style={[styles.pinToggle, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons
              name={pinned ? 'pin' : 'pin-outline'}
              size={18}
              color={pinned ? theme.accent : theme.textMuted}
            />
            <Text style={[styles.pinToggleText, { color: theme.text }]}>
              Ghim lên đầu Trang Thông Tin & Tổng quan
            </Text>
            <Ionicons
              name={pinned ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={pinned ? theme.accent : theme.textMuted}
            />
          </Pressable>
        ) : null}

        <Button
          label={publishBtnLabel}
          icon={
            visibility === 'private'
              ? 'lock-closed'
              : visibility === 'selected'
                ? 'people'
                : 'send'
          }
          onPress={handlePublish}
        />
      </Card>
    </FadeIn>
  );
}

/* ==================== MAIN SHARED HUB COMPONENT ==================== */

export function AnnouncementsHub({
  withTabBar = false,
  showBackButton = false,
}: {
  withTabBar?: boolean;
  showBackButton?: boolean;
}) {
  const params = useLocalSearchParams<{
    prefillTitle?: string;
    prefillBody?: string;
    prefillDept?: string;
    prefillTag?: string;
    prefillEventDate?: string;
    prefillEventId?: string;
  }>();

  const auth = useAuth();
  const decor = useDecor();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const {
    announcements,
    classRosterPublic,
    classInfo,
    voterKey,
    currentStudent,
    currentStudentId,
    isTeacher,
    isSubjectTeacher,
    isOfficer,
    isClassMonitor,
    officerPositionLabel,
    defaultDepartment,
    subjectName,
    canPostAnnouncements,
    togglePinAnnouncement,
    likeAnnouncement,
    removeAnnouncement,
    removeAnnouncementAttachment,
    updateAnnouncementAudience,
    toggleAnnouncementAcknowledge,
    addAnnouncementReply,
    removeAnnouncementReply,
    pullNow,
  } = useClassStore();

  const isOfficerPublisher = !isTeacher && !isSubjectTeacher && isOfficer && canPostAnnouncements;
  const ackKey = currentStudentId ?? voterKey;

  const prefillSig =
    params.prefillTitle ||
    params.prefillBody ||
    params.prefillEventId ||
    params.prefillEventDate
      ? [
          params.prefillTitle ?? '',
          params.prefillBody ?? '',
          params.prefillDept ?? '',
          params.prefillTag ?? '',
          params.prefillEventDate ?? '',
          params.prefillEventId ?? '',
        ].join('||')
      : '';

  const [composerToggle, setComposerToggle] = useState<{ sig: string; open: boolean }>({
    sig: prefillSig,
    open: Boolean(prefillSig && canPostAnnouncements),
  });
  const composerOpen =
    composerToggle.sig === prefillSig
      ? composerToggle.open
      : Boolean(prefillSig && canPostAnnouncements);

  const setComposerOpen = (next: boolean) => {
    setComposerToggle({ sig: prefillSig, open: next });
  };

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HubFilter>('all');
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [deletingAttachmentIds, setDeletingAttachmentIds] = useState<Record<string, boolean>>({});

  // Inline post audience editor
  const [editingAudienceId, setEditingAudienceId] = useState<string | null>(null);
  const [audienceDraftVis, setAudienceDraftVis] = useState<AnnouncementVisibility>('public');
  const [audienceDraftIds, setAudienceDraftIds] = useState<string[]>([]);

  // Inline readers drawer & reply threads
  const [openReadersId, setOpenReadersId] = useState<string | null>(null);
  const [openRepliesIds, setOpenRepliesIds] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // 2-tap safe deletion for announcements AND replies (shared hook with unmount cleanup)
  const { isArmed: isDeleteArmed, armOrConfirm: armOrConfirmTwoTap } = useTwoTapConfirm(3_500);

  // Subject teacher quick unlock portal (for viewers without post access)
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalSubject, setPortalSubject] = useState(
    subjectName || SUBJECT_TEACHER_PRESETS[0].subject,
  );
  const [portalCustomSubject, setPortalCustomSubject] = useState('');
  const [portalLoginId, setPortalLoginId] = useState('');
  const [portalName, setPortalName] = useState(auth.profile?.displayName ?? '');
  const [portalPassword, setPortalPassword] = useState('');
  const [showPortalPass, setShowPortalPass] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const rosterById = useMemo(
    () => new Map(classRosterPublic.map((s) => [s.id, s])),
    [classRosterPublic],
  );

  const counts = useMemo(() => {
    let pub = 0;
    let sel = 0;
    let priv = 0;
    let media = 0;
    let pinned = 0;
    for (const a of announcements) {
      const vis = a.visibility ?? 'public';
      if (vis === 'public') pub += 1;
      else if (vis === 'selected') sel += 1;
      else if (vis === 'private') priv += 1;
      if ((a.attachments?.length ?? 0) > 0) media += 1;
      if (a.pinned) pinned += 1;
    }
    return {
      all: announcements.length,
      public: pub,
      selected: sel,
      private: priv,
      media,
      pinned,
    };
  }, [announcements]);

  const visibleList = useMemo(() => {
    const q = stripVietnamese(query);
    return announcements.filter((item) => {
      const vis = item.visibility ?? 'public';
      if (filter === 'public' && vis !== 'public') return false;
      if (filter === 'selected' && vis !== 'selected') return false;
      if (filter === 'private' && vis !== 'private') return false;
      if (filter === 'media' && (item.attachments?.length ?? 0) === 0) return false;
      if (filter === 'pinned' && !item.pinned) return false;
      if (!q) return true;
      const attNames = (item.attachments ?? []).map((a) => a.name).join(' ');
      const replyTexts = (item.replies ?? []).map((r) => `${r.authorName} ${r.content}`).join(' ');
      return stripVietnamese(
        `${item.title} ${item.content} ${item.author} ${item.authorPosition ?? ''} ${item.subject ?? ''} ${attNames} ${replyTexts}`,
      ).includes(q);
    });
  }, [announcements, filter, query]);

  const resolvedPrefillTag: AnnouncementTag =
    params.prefillTag && ANNOUNCEMENT_TAG_LIST.includes(params.prefillTag as AnnouncementTag)
      ? (params.prefillTag as AnnouncementTag)
      : isSubjectTeacher
        ? 'subject'
        : isOfficerPublisher
          ? 'event'
          : 'important';

  const resolvedPrefillDept: OfficerDepartmentKey | null =
    getOfficerDepartmentMeta(params.prefillDept)?.key ??
    defaultDepartment ??
    (isTeacher ? 'class_board' : null);

  const subjectTeacherActorLabel = (() => {
    const base = auth.profile?.displayName?.trim() || 'GV Bộ môn';
    return subjectName ? `${base} (${subjectName})` : base;
  })();

  const isAuthorOf = (item: Announcement): boolean => {
    if (currentStudentId && item.authorStudentId === currentStudentId) {
      return true;
    }
    if (
      isSubjectTeacher &&
      item.authorRole === 'subject_teacher' &&
      item.author === subjectTeacherActorLabel
    ) {
      return true;
    }
    return false;
  };

  const canManageItem = (item: Announcement): boolean => {
    return isTeacher || isClassMonitor || isAuthorOf(item);
  };

  const canDeleteReply = (item: Announcement, reply: AnnouncementReply): boolean => {
    if (isTeacher || isClassMonitor || isAuthorOf(item)) return true;
    if (currentStudentId && reply.authorStudentId === currentStudentId) {
      return true;
    }
    if (
      isSubjectTeacher &&
      reply.authorRole === 'subject_teacher' &&
      reply.authorName === subjectTeacherActorLabel
    ) {
      return true;
    }
    return false;
  };

  const armOrConfirmDelete = (key: string, warnMessage: string, onConfirmed: () => void) => {
    const wasArmed = isDeleteArmed(key);
    armOrConfirmTwoTap(key, onConfirmed);
    if (!wasArmed) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      showToast(warnMessage, 'warning');
    }
  };

  const handleOpenAudienceEditor = (item: Announcement) => {
    if (editingAudienceId === item.id) {
      setEditingAudienceId(null);
      return;
    }
    setEditingAudienceId(item.id);
    setAudienceDraftVis(item.visibility ?? 'public');
    setAudienceDraftIds(item.visibleToStudentIds ?? []);
  };

  const handleSaveAudience = (announcementId: string) => {
    if (audienceDraftVis === 'selected' && audienceDraftIds.length === 0) {
      showToast('Hãy chọn ít nhất 1 thành viên được xem', 'warning');
      return;
    }
    updateAnnouncementAudience(
      announcementId,
      audienceDraftVis,
      audienceDraftVis === 'selected' ? audienceDraftIds : [],
    );
    setEditingAudienceId(null);
    showToast(
      audienceDraftVis === 'public'
        ? 'Đã đổi bài đăng sang Công khai 🌍'
        : audienceDraftVis === 'private'
          ? 'Đã đổi bài đăng sang Không công khai 🔒'
          : `Đã cập nhật quyền xem cho ${audienceDraftIds.length} thành viên 👥`,
      'info',
    );
  };

  const handleLike = (id: string) => {
    if (likedIds[id]) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLikedIds((prev) => ({ ...prev, [id]: true }));
    likeAnnouncement(id);
    decor.recordMissionProgress('like_announcement', 1);
  };

  const handleAcknowledge = (id: string, alreadyAcked: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    toggleAnnouncementAcknowledge(id);
    showToast(alreadyAcked ? 'Đã bỏ đánh dấu Đã xem' : 'Đã xác nhận xem thông tin ✓', 'info');
  };

  const handleSendReply = (announcementId: string) => {
    const draft = (replyDrafts[announcementId] ?? '').trim();
    if (!draft) return;
    addAnnouncementReply(announcementId, draft);
    setReplyDrafts((prev) => ({ ...prev, [announcementId]: '' }));
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  const handleRemovePublishedAttachment = async (announcementId: string, att: DriveAttachment) => {
    setDeletingAttachmentIds((prev) => ({ ...prev, [att.id]: true }));
    try {
      const driveFileId = extractDriveFileIdFromUrl(att.url) || att.id;
      await removeAnnouncementAttachment(announcementId, {
        id: att.id,
        driveFileId,
        url: att.url,
        name: att.name,
      });
      showToast('Đã xoá tệp đính kèm khỏi bài đăng, Drive & Excel!', 'info');
    } finally {
      setDeletingAttachmentIds((prev) => {
        const next = { ...prev };
        delete next[att.id];
        return next;
      });
    }
  };

  const handleUnlockSubjectTeacher = async () => {
    setPortalError(null);
    const chosenSubject = portalCustomSubject.trim() || portalSubject;
    const usingPersonalId = Boolean(portalLoginId.trim());
    if (!usingPersonalId && !chosenSubject) {
      setPortalError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
      return;
    }
    const cleanName = portalName.trim() || `GV Bộ môn ${chosenSubject}`;
    const res = await auth.switchAccountRole('subject_teacher', {
      loginId: portalLoginId.trim() || undefined,
      password: portalPassword,
      subjectName: chosenSubject,
      displayName: cleanName,
    });
    if (!res.ok) {
      setPortalError(res.error ?? 'Mật khẩu tài khoản giáo viên không chính xác!');
      return;
    }
    setPortalLoginId('');
    setPortalPassword('');
    setPortalOpen(false);
    setComposerOpen(true);
    showToast(`Chào mừng ${res.account?.name || cleanName}! Đã mở quyền đăng tin 📚`);
  };

  const resolveAckName = (key: string): string => {
    const stu = rosterById.get(key);
    if (stu) return stu.group ? `${stu.name} (${stu.group})` : stu.name;
    if (key === ackKey) {
      return auth.profile?.displayName?.trim() || currentStudent?.name || 'Bạn';
    }
    return key.startsWith('teacher') || key.startsWith('local-teacher')
      ? classInfo.teacherName
      : 'Thành viên lớp';
  };

  return (
    <Screen withTabBar={withTabBar} onRefresh={pullNow}>
      {showBackButton ? (
        <PageHeader
          title={`Trang Thông Tin Lớp ${classInfo.name}`}
          subtitle={'Đăng tin, ảnh, file & nhắn tin theo quyền xem'}
          rightIcon={canPostAnnouncements ? (composerOpen ? 'close' : 'add') : undefined}
          rightLabel={canPostAnnouncements ? (composerOpen ? 'Đóng' : 'Đăng tin') : undefined}
          onRightPress={
            canPostAnnouncements ? () => setComposerOpen(!composerOpen) : undefined
          }
        />
      ) : null}

      {/* Flagship Brand-Gradient Hero Header */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            Shadow.floating,
            { shadowColor: gradient[0], shadowOpacity: 0.28 },
          ]}>
          <View style={styles.heroOrbA} />
          <View style={styles.heroOrbB} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroPill}>
              <Ionicons name="newspaper" size={12} color="#FDE68A" />
              <Text style={styles.heroPillText}>
                {`TRANG THÔNG TIN LỚP ${classInfo.name.toUpperCase()}`}
              </Text>
            </View>
            <View style={styles.heroRolePill}>
              <Ionicons
                name={canPostAnnouncements ? 'shield-checkmark' : 'eye-outline'}
                size={11}
                color="#A7F3D0"
              />
              <Text style={styles.heroRoleText}>
                {isTeacher
                  ? 'GV Chủ nhiệm'
                  : isSubjectTeacher
                    ? `GV ${subjectName ?? 'Bộ môn'}`
                    : isOfficerPublisher
                      ? officerPositionLabel || 'Ban cán sự'
                      : 'Thành viên lớp'}
              </Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{`Trang Thông Tin Lớp ${classInfo.name}`}</Text>
          <Text style={styles.heroSub}>
            {canPostAnnouncements
              ? 'Đăng thông báo, nhiều ảnh/file Drive & nhắn tin công khai, chọn thành viên hoặc riêng tư.'
              : 'Xem thông báo công khai, tin gửi riêng cho bạn, xác nhận đã đọc và trao đổi trực tiếp.'}
          </Text>

          <View style={styles.heroKpiRow}>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{counts.all}</Text>
              <Text style={styles.heroKpiLab}>Tổng tin</Text>
            </View>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{counts.public}</Text>
              <Text style={styles.heroKpiLab}>Công khai</Text>
            </View>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{counts.selected + counts.private}</Text>
              <Text style={styles.heroKpiLab}>Riêng tư / Chọn</Text>
            </View>
          </View>

          {canPostAnnouncements ? (
            <Pressable
              onPress={() => setComposerOpen(!composerOpen)}
              accessibilityRole="button"
              accessibilityLabel={composerOpen ? 'Đóng khung đăng tin' : 'Mở khung đăng tin, ảnh, file'}
              style={({ pressed }) => [styles.heroWhiteBtn, pressed && styles.pressed]}>
              <Ionicons
                name={composerOpen ? 'close-circle' : 'add-circle'}
                size={18}
                color={gradient[0]}
              />
              <Text style={[styles.heroWhiteBtnText, { color: gradient[0] }]}>
                {composerOpen ? 'Đóng khung soạn tin' : '+ Đăng tin · Ảnh · File'}
              </Text>
            </Pressable>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Collapsible Subject Teacher Portal (for non-posting users) */}
      {!canPostAnnouncements ? (
        <FadeIn index={0}>
          <Card style={[styles.portalCard, { borderColor: `${theme.warning}66`, borderWidth: 1.1 }]}>
            <Pressable
              onPress={() => setPortalOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Mở cổng Giáo viên Bộ môn"
              style={styles.portalHead}>
              <View style={[styles.portalIcon, { backgroundColor: theme.warningSoft }]}>
                <Ionicons name="book" size={18} color={theme.warning} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.portalTitle, { color: theme.text }]}>
                  Cổng Giáo viên Bộ môn đăng Thông tin
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                  Thầy/Cô bộ môn xác thực để gửi thông báo & tài liệu cho lớp
                </Text>
              </View>
              <Ionicons
                name={portalOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.warning}
              />
            </Pressable>

            {portalOpen ? (
              <View style={[styles.portalForm, { borderColor: theme.border }]}>
                <TextField
                  label={'Mã ID giáo viên (tuỳ chọn)'}
                  icon={'id-card-outline'}
                  placeholder={'VD: GVBM-01'}
                  value={portalLoginId}
                  onChangeText={(t) => {
                    if (portalError) setPortalError(null);
                    setPortalLoginId(t);
                  }}
                  autoCapitalize={'characters'}
                  autoCorrect={false}
                />
                {!portalLoginId.trim() ? (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chips}>
                      {SUBJECT_TEACHER_PRESETS.map((item) => (
                        <Chip
                          key={item.subject}
                          label={`${item.emoji} ${item.subject}`}
                          selected={!portalCustomSubject.trim() && portalSubject === item.subject}
                          onPress={() => {
                            setPortalSubject(item.subject);
                            setPortalCustomSubject('');
                          }}
                        />
                      ))}
                    </ScrollView>
                    <TextField
                      label={'Hoặc nhập môn khác'}
                      value={portalCustomSubject}
                      onChangeText={setPortalCustomSubject}
                    />
                    <TextField
                      label={'Tên Thầy / Cô'}
                      icon={'person-outline'}
                      value={portalName}
                      onChangeText={setPortalName}
                    />
                  </>
                ) : null}
                <View
                  style={[
                    styles.passBox,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: portalError ? theme.danger : theme.border,
                    },
                  ]}>
                  <Ionicons name="shield-outline" size={18} color={theme.warning} />
                  <TextInput
                    value={portalPassword}
                    onChangeText={(t) => {
                      if (portalError) setPortalError(null);
                      setPortalPassword(t);
                    }}
                    placeholder={'Nhập mật khẩu giáo viên...'}
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showPortalPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => void handleUnlockSubjectTeacher()}
                    style={[styles.passInput, { color: theme.text }]}
                  />
                  <Pressable
                    onPress={() => setShowPortalPass((v) => !v)}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel={showPortalPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    <Ionicons
                      name={showPortalPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
                {portalError ? (
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>
                    {portalError}
                  </Text>
                ) : null}
                <Button
                  label={'Xác thực & Mở quyền đăng tin'}
                  icon={'lock-open'}
                  onPress={() => void handleUnlockSubjectTeacher()}
                />
              </View>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      {/* Flagship Composer */}
      {composerOpen && canPostAnnouncements ? (
        <AnnouncementComposer
          key={prefillSig || 'manual'}
          initialTitle={params.prefillTitle ?? ''}
          initialBody={params.prefillBody ?? ''}
          initialTag={resolvedPrefillTag}
          initialDept={resolvedPrefillDept}
          initialEventDate={params.prefillEventDate?.trim() || null}
          initialEventId={params.prefillEventId?.trim() || null}
          onPublished={() => setComposerOpen(false)}
        />
      ) : null}

      {/* Search + 6-Mode Filter Strip */}
      <FadeIn index={1}>
        <Card style={styles.filterCard}>
          <TextField
            icon={'search'}
            placeholder={'Tìm tin nhắn, thông báo, người đăng, tệp đính kèm...'}
            value={query}
            onChangeText={setQuery}
            clearable
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {(
              [
                { key: 'all', label: `Tất cả (${counts.all})` },
                { key: 'public', label: `🌍 Công khai (${counts.public})` },
                { key: 'selected', label: `👥 Riêng cho tôi (${counts.selected})` },
                { key: 'private', label: `🔒 Không công khai (${counts.private})` },
                { key: 'media', label: `📎 Có ảnh/file (${counts.media})` },
                { key: 'pinned', label: `📌 Đã ghim (${counts.pinned})` },
              ] as const
            ).map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                selected={filter === f.key}
                onPress={() => setFilter(f.key)}
              />
            ))}
          </ScrollView>
        </Card>
      </FadeIn>

      {/* Post Feed */}
      {visibleList.length === 0 ? (
        <EmptyState
          icon={'newspaper-outline'}
          title={'Chưa có bài đăng phù hợp'}
          message={
            canPostAnnouncements
              ? 'Bấm “+ Đăng tin · Ảnh · File” ở trên để gửi thông báo, chia sẻ ảnh/tệp hoặc nhắn tin cho thành viên lớp.'
              : 'Các thông báo công khai và tin nhắn gửi riêng cho bạn sẽ tự động hiển thị tại đây.'
          }
        />
      ) : (
        visibleList.map((item, i) => {
          const meta = ANNOUNCEMENT_TAGS[item.tag] ?? ANNOUNCEMENT_TAGS.important;
          const vis: AnnouncementVisibility = item.visibility ?? 'public';
          const selectedCount = (item.visibleToStudentIds ?? []).length;
          const isFromSubjectTeacher =
            item.authorRole === 'subject_teacher' || Boolean(item.subject);
          const isFromOfficer = item.authorRole === 'officer' || Boolean(item.authorPosition);
          const deptMeta = getOfficerDepartmentMeta(item.department);
          const isAuthor = isAuthorOf(item);
          const manageable = canManageItem(item);
          const canEditAudience = isTeacher || isClassMonitor || isAuthor;
          const liked = Boolean(likedIds[item.id]);
          const ackList = item.acknowledgedBy ?? [];
          const hasAcked = ackList.includes(ackKey);
          const replies = item.replies ?? [];
          const repliesOpen = Boolean(openRepliesIds[item.id]);
          const readersOpen = openReadersId === item.id;
          const audienceOpen = editingAudienceId === item.id;
          const delPostKey = `ann:${item.id}`;
          const confirmingDelPost = isDeleteArmed(delPostKey);

          const recipientNames = (item.visibleToStudentIds ?? [])
            .map((sid) => rosterById.get(sid)?.name ?? 'Thành viên')
            .filter(Boolean);

          return (
            <FadeIn key={item.id} index={Math.min(i + 2, 8)}>
              <Card
                style={[
                  styles.postCard,
                  item.pinned && { borderColor: theme.accent, borderWidth: 1.5 },
                  vis === 'private' &&
                    !item.pinned && { borderColor: `${theme.warning}88`, borderWidth: 1.2 },
                  vis === 'selected' &&
                    !item.pinned && { borderColor: `${theme.purple}88`, borderWidth: 1.2 },
                ]}>
                {/* Top Metadata & Visibility Badges */}
                <View style={styles.topRow}>
                  <Badge
                    label={
                      vis === 'private'
                        ? 'Không công khai'
                        : vis === 'selected'
                          ? `Chọn ${selectedCount} người`
                          : 'Công khai'
                    }
                    color={vis === 'private' ? 'warning' : vis === 'selected' ? 'purple' : 'success'}
                    soft={
                      vis === 'private'
                        ? 'warningSoft'
                        : vis === 'selected'
                          ? 'purpleSoft'
                          : 'successSoft'
                    }
                    icon={
                      vis === 'private'
                        ? 'lock-closed'
                        : vis === 'selected'
                          ? 'people'
                          : 'globe-outline'
                    }
                  />
                  <Badge label={meta.label} color={meta.color} soft={meta.soft} icon={meta.icon} />
                  {item.subject ? (
                    <Badge
                      label={`${subjectEmojiOf(item.subject)} Môn ${item.subject}`}
                      color={'success'}
                      soft={'successSoft'}
                    />
                  ) : isFromOfficer ? (
                    <Badge
                      label={item.authorPosition || 'Ban cán sự'}
                      color={'purple'}
                      soft={'purpleSoft'}
                      icon={'ribbon'}
                    />
                  ) : (
                    <Badge
                      label={'GV Chủ nhiệm'}
                      color={'accentText'}
                      soft={'accentSoft'}
                      icon={'shield-checkmark'}
                    />
                  )}
                  {deptMeta ? (
                    <Badge
                      label={deptMeta.short}
                      color={deptMeta.color}
                      soft={softToneOf(deptMeta.color)}
                      icon={deptMeta.icon as IoniconName}
                    />
                  ) : null}
                  {item.pinned ? (
                    <Badge label={'Đã ghim'} color={'gold'} soft={'goldSoft'} icon={'pin'} />
                  ) : null}
                  {item.eventDate ? (
                    <Badge
                      label={`${relativeDay(item.eventDate)} · ${formatDate(item.eventDate)}`}
                      color={'accentText'}
                      soft={'accentSoft'}
                      icon={'calendar-outline'}
                    />
                  ) : null}
                </View>

                {/* Author Line */}
                <View style={styles.authorRow}>
                  <Avatar name={item.author} size={30} />
                  <View style={styles.flex}>
                    <Text style={[styles.authorName, { color: theme.text }]} numberOfLines={1}>
                      {item.author}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
                      {[
                        isFromSubjectTeacher && item.subject
                          ? `GV ${item.subject}`
                          : item.authorPosition || null,
                        formatShortTimestamp(item.createdAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Recipient Pills for Selected-Audience Posts (Author / GVCN) */}
                {(isAuthor || isTeacher) && vis === 'selected' && recipientNames.length > 0 ? (
                  <View
                    style={[
                      styles.recipientsBar,
                      { backgroundColor: theme.purpleSoft, borderColor: `${theme.purple}44` },
                    ]}>
                    <Ionicons name="people" size={13} color={theme.purple} />
                    <Text style={[styles.recipientsLabel, { color: theme.purple }]}>
                      {`Người xem: ${recipientNames.slice(0, 6).join(', ')}${recipientNames.length > 6 ? ` +${recipientNames.length - 6} khác` : ''}`}
                    </Text>
                  </View>
                ) : null}

                {/* Title & Body */}
                <Text style={[styles.postTitle, { color: theme.text }]}>{item.title}</Text>
                <Text style={[styles.postBody, { color: theme.textSecondary }]}>
                  {item.content}
                </Text>

                {/* Drive Attachments (Photos, Videos, Documents) */}
                {item.attachments && item.attachments.length > 0 ? (
                  <DriveAttachmentList
                    attachments={item.attachments}
                    editable={manageable}
                    confirmBeforeRemove
                    deletingIds={deletingAttachmentIds}
                    onRemove={(attId) => {
                      const found = item.attachments?.find((a) => a.id === attId);
                      if (found) {
                        void handleRemovePublishedAttachment(item.id, found);
                      }
                    }}
                  />
                ) : null}

                {/* Inline Audience Switcher (Author / GVCN / Lớp trưởng) */}
                {audienceOpen && canEditAudience ? (
                  <View
                    style={[
                      styles.inlineDrawer,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <AudienceSelector
                      compact
                      visibility={audienceDraftVis}
                      selectedIds={audienceDraftIds}
                      roster={classRosterPublic}
                      onChangeVisibility={setAudienceDraftVis}
                      onChangeSelectedIds={setAudienceDraftIds}
                    />
                    <View style={styles.drawerBtns}>
                      <Button
                        label={'Lưu quyền xem'}
                        size={'sm'}
                        icon={'checkmark'}
                        style={styles.flex}
                        onPress={() => handleSaveAudience(item.id)}
                      />
                      <Button
                        label={'Huỷ'}
                        size={'sm'}
                        variant={'soft'}
                        onPress={() => setEditingAudienceId(null)}
                      />
                    </View>
                  </View>
                ) : null}

                {/* Management Actions Row (Audience Switcher, Pin, 2-Tap Delete) */}
                {canEditAudience || manageable ? (
                  <View style={[styles.manageBar, { borderTopColor: theme.border }]}>
                    {canEditAudience ? (
                      <Pressable
                        onPress={() => handleOpenAudienceEditor(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Chỉnh quyền xem bài đăng"
                        style={({ pressed }) => [
                          styles.manageBtn,
                          {
                            backgroundColor: audienceOpen ? theme.purple : theme.purpleSoft,
                            borderColor: theme.purple,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name="eye-outline"
                          size={13}
                          color={audienceOpen ? '#FFFFFF' : theme.purple}
                        />
                        <Text
                          style={[
                            styles.manageBtnText,
                            { color: audienceOpen ? '#FFFFFF' : theme.purple },
                          ]}>
                          {audienceOpen ? 'Đóng quyền xem' : 'Quyền xem'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {manageable && (isTeacher || isClassMonitor) ? (
                      <Pressable
                        onPress={() => {
                          togglePinAnnouncement(item.id);
                          showToast(item.pinned ? 'Đã bỏ ghim bài đăng' : 'Đã ghim bài đăng', 'info');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={item.pinned ? 'Bỏ ghim bài đăng' : 'Ghim bài đăng'}
                        style={({ pressed }) => [
                          styles.manageBtn,
                          {
                            backgroundColor: item.pinned ? theme.goldSoft : theme.backgroundElement,
                            borderColor: item.pinned ? theme.gold : theme.border,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name={item.pinned ? 'pin' : 'pin-outline'}
                          size={13}
                          color={item.pinned ? theme.gold : theme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.manageBtnText,
                            { color: item.pinned ? theme.gold : theme.textSecondary },
                          ]}>
                          {item.pinned ? 'Bỏ ghim' : 'Ghim'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {manageable ? (
                      <Pressable
                        onPress={() =>
                          armOrConfirmDelete(
                            delPostKey,
                            'Bấm lại lần nữa để xoá bài đăng & tệp đính kèm',
                            () => {
                              removeAnnouncement(item.id);
                              showToast(
                                'Đã xoá bài đăng & tệp đính kèm khỏi App, Drive & Excel',
                                'warning',
                              );
                            },
                          )
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={confirmingDelPost ? 'Xác nhận xoá bài đăng' : 'Xoá bài đăng'}
                        style={({ pressed }) => [
                          styles.manageBtn,
                          {
                            backgroundColor: confirmingDelPost ? '#DC2626' : theme.dangerSoft,
                            borderColor: confirmingDelPost ? '#DC2626' : theme.danger,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name={confirmingDelPost ? 'alert-circle' : 'trash-outline'}
                          size={13}
                          color={confirmingDelPost ? '#FFFFFF' : theme.danger}
                        />
                        <Text
                          style={[
                            styles.manageBtnText,
                            { color: confirmingDelPost ? '#FFFFFF' : theme.danger },
                          ]}>
                          {confirmingDelPost ? 'Xác nhận?' : 'Xoá'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Interactive Footer: Like | Đã xem ✓ | Tin nhắn (Replies) */}
                <View style={[styles.footer, { borderColor: theme.border }]}>
                  <Pressable
                    onPress={() => handleLike(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Thích bài đăng (${item.likes})`}
                    style={({ pressed }) => [
                      styles.footerPill,
                      {
                        backgroundColor: liked ? theme.dangerSoft : theme.backgroundElement,
                        borderColor: liked ? theme.danger : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={14}
                      color={liked ? theme.danger : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.footerPillText,
                        { color: liked ? theme.danger : theme.textSecondary },
                      ]}>
                      {`Thích (${item.likes})`}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleAcknowledge(item.id, hasAcked)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={hasAcked ? 'Đã xác nhận xem' : 'Đánh dấu đã xem'}
                    style={({ pressed }) => [
                      styles.footerPill,
                      {
                        backgroundColor: hasAcked ? theme.successSoft : theme.backgroundElement,
                        borderColor: hasAcked ? theme.success : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={hasAcked ? 'checkmark-done' : 'checkmark-outline'}
                      size={14}
                      color={hasAcked ? theme.success : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.footerPillText,
                        { color: hasAcked ? theme.success : theme.textSecondary },
                      ]}>
                      {hasAcked ? 'Đã xem ✓' : 'Đã xem'}
                    </Text>
                  </Pressable>

                  {(isAuthor || isTeacher) && ackList.length > 0 ? (
                    <Pressable
                      onPress={() => setOpenReadersId((cur) => (cur === item.id ? null : item.id))}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Xem ${ackList.length} người đã xác nhận đọc`}
                      style={({ pressed }) => [
                        styles.footerPill,
                        {
                          backgroundColor: readersOpen ? theme.accentSoft : theme.backgroundElement,
                          borderColor: readersOpen ? theme.accent : 'transparent',
                        },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons
                        name="eye-outline"
                        size={14}
                        color={readersOpen ? theme.accentText : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.footerPillText,
                          { color: readersOpen ? theme.accentText : theme.textSecondary },
                        ]}>
                        {`Đã xem: ${ackList.length}`}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() =>
                      setOpenRepliesIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Mở tin nhắn trao đổi (${replies.length})`}
                    style={({ pressed }) => [
                      styles.footerPill,
                      {
                        backgroundColor: repliesOpen ? theme.accentSoft : theme.backgroundElement,
                        borderColor: repliesOpen ? theme.accent : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={repliesOpen ? 'chatbubbles' : 'chatbubble-ellipses-outline'}
                      size={14}
                      color={repliesOpen ? theme.accentText : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.footerPillText,
                        { color: repliesOpen ? theme.accentText : theme.textSecondary },
                      ]}>
                      {`Tin nhắn (${replies.length})`}
                    </Text>
                  </Pressable>
                </View>

                {/* Readers Drawer (for Author & GVCN) */}
                {readersOpen && (isAuthor || isTeacher) ? (
                  <View
                    style={[
                      styles.inlineDrawer,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <Text style={[styles.drawerHeading, { color: theme.text }]}>
                      {`Thành viên đã xác nhận xem (${ackList.length})`}
                    </Text>
                    <View style={styles.readersWrap}>
                      {ackList.map((key) => (
                        <Badge
                          key={key}
                          label={resolveAckName(key)}
                          color={'success'}
                          soft={'successSoft'}
                          icon={'checkmark-circle-outline'}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Inline Message / Reply Thread */}
                {repliesOpen ? (
                  <View
                    style={[
                      styles.replySection,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <Text style={[styles.drawerHeading, { color: theme.text }]}>
                      {`Trao đổi & Tin nhắn (${replies.length})`}
                    </Text>

                    {replies.length === 0 ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                        Chưa có tin nhắn nào — hãy gửi phản hồi đầu tiên bên dưới!
                      </Text>
                    ) : (
                      <View style={styles.replyList}>
                        {replies.map((rep) => {
                          const canDelRep = canDeleteReply(item, rep);
                          const delRepKey = `rep:${item.id}:${rep.id}`;
                          const confirmingRep = isDeleteArmed(delRepKey);
                          return (
                            <View
                              key={rep.id}
                              style={[
                                styles.replyBubble,
                                { backgroundColor: theme.card, borderColor: theme.border },
                              ]}>
                              <Avatar name={rep.authorName} size={26} />
                              <View style={styles.flex}>
                                <View style={styles.replyHead}>
                                  <Text
                                    style={[styles.replyAuthor, { color: theme.text }]}
                                    numberOfLines={1}>
                                    {rep.authorName}
                                  </Text>
                                  {rep.authorPosition ? (
                                    <Text
                                      style={{ color: theme.purple, fontSize: 10.5, fontWeight: '800' }}
                                      numberOfLines={1}>
                                      {`· ${rep.authorPosition}`}
                                    </Text>
                                  ) : null}
                                  <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                                    {formatShortTimestamp(rep.createdAt)}
                                  </Text>
                                </View>
                                <Text style={[styles.replyContent, { color: theme.textSecondary }]}>
                                  {rep.content}
                                </Text>
                              </View>
                              {canDelRep ? (
                                <Pressable
                                  onPress={() =>
                                    armOrConfirmDelete(
                                      delRepKey,
                                      'Bấm lại lần nữa để xoá tin nhắn này',
                                      () => {
                                        removeAnnouncementReply(item.id, rep.id);
                                        showToast('Đã xoá tin nhắn', 'info');
                                      },
                                    )
                                  }
                                  hitSlop={10}
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    confirmingRep ? 'Xác nhận xoá tin nhắn' : 'Xoá tin nhắn'
                                  }
                                  style={[
                                    styles.replyDelBtn,
                                    {
                                      backgroundColor: confirmingRep
                                        ? '#DC2626'
                                        : theme.dangerSoft,
                                      borderColor: confirmingRep ? '#DC2626' : theme.danger,
                                    },
                                  ]}>
                                  <Text
                                    style={{
                                      color: confirmingRep ? '#FFFFFF' : theme.danger,
                                      fontSize: 10.5,
                                      fontWeight: '800',
                                    }}>
                                    {confirmingRep ? 'Xác nhận?' : 'Xoá'}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Reply Input Row */}
                    <View
                      style={[
                        styles.replyComposerRow,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}>
                      <TextInput
                        value={replyDrafts[item.id] ?? ''}
                        onChangeText={(txt) =>
                          setReplyDrafts((prev) => ({ ...prev, [item.id]: txt }))
                        }
                        placeholder={'Nhắn tin phản hồi...'}
                        placeholderTextColor={theme.textMuted}
                        returnKeyType="send"
                        onSubmitEditing={() => handleSendReply(item.id)}
                        style={[styles.replyInput, { color: theme.text }]}
                      />
                      <Pressable
                        disabled={!(replyDrafts[item.id] ?? '').trim()}
                        onPress={() => handleSendReply(item.id)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Gửi tin nhắn phản hồi"
                        style={({ pressed }) => [
                          styles.replySendBtn,
                          {
                            backgroundColor: (replyDrafts[item.id] ?? '').trim()
                              ? theme.accent
                              : theme.backgroundElement,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name="send"
                          size={14}
                          color={
                            (replyDrafts[item.id] ?? '').trim() ? theme.accentOnFill : theme.textMuted
                          }
                        />
                      </Pressable>
                    </View>
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
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },

  /* Hero */
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.two + 2,
    overflow: 'hidden',
  },
  heroOrbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -75,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroOrbB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -55,
    left: -35,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.32)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  heroPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  heroRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  heroRoleText: { color: '#ECFDF5', fontSize: 10.5, fontWeight: '800' },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12.5,
    lineHeight: 18,
  },
  heroKpiRow: { flexDirection: 'row', gap: Spacing.two },
  heroKpiBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 1,
  },
  heroKpiVal: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  heroKpiLab: { color: 'rgba(255,255,255,0.88)', fontSize: 10.5, fontWeight: '700' },
  heroWhiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    marginTop: 2,
  },
  heroWhiteBtnText: { fontSize: 13.5, fontWeight: '900' },

  /* Subject Teacher Portal */
  portalCard: { gap: Spacing.two + 2 },
  portalHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  portalIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: { fontSize: 14, fontWeight: '800' },
  portalForm: {
    gap: Spacing.two + 2,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  passBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1.2,
    paddingHorizontal: Spacing.three,
    height: 46,
  },
  passInput: { flex: 1, fontSize: 14, fontWeight: '600' },

  /* Composer & Audience Picker */
  composer: { gap: Spacing.three },
  compHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  compTitle: { fontSize: 15.5, fontWeight: '900' },
  blockGap: { gap: Spacing.one + 2 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  audienceWrap: { gap: Spacing.two },
  visCardsCol: { gap: Spacing.one + 2 },
  visCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1.2,
  },
  visCardCompact: { paddingVertical: 8 },
  visIconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visTitle: { fontSize: 13.5, fontWeight: '800' },
  pickerBox: {
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  pickerHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  pickerTitle: { fontSize: 13, fontWeight: '800' },
  shortcutPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  shortcutPillText: { fontSize: 11.5, fontWeight: '800' },
  memberChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    maxWidth: '100%',
  },
  memberChipTexts: { maxWidth: 180 },
  memberChipName: { fontSize: 12, fontWeight: '800' },
  pinToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  pinToggleText: { flex: 1, fontSize: 13, fontWeight: '700' },

  /* Filter Card */
  filterCard: { gap: Spacing.two + 2 },

  /* Post Cards */
  postCard: { gap: Spacing.two + 2 },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  authorName: { fontSize: 13, fontWeight: '800' },
  recipientsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recipientsLabel: { flex: 1, fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  postTitle: { fontSize: 16, fontWeight: '900', lineHeight: 22 },
  postBody: { fontSize: 13.5, lineHeight: 20 },

  /* Inline Drawers */
  inlineDrawer: {
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  drawerHeading: { fontSize: 12.5, fontWeight: '800' },
  drawerBtns: { flexDirection: 'row', gap: Spacing.two },
  readersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  /* Management Row */
  manageBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  manageBtnText: { fontSize: 11.5, fontWeight: '800' },

  /* Footer */
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  footerPillText: { fontSize: 12, fontWeight: '800' },

  /* Replies Thread */
  replySection: {
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyList: { gap: 6 },
  replyBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  replyAuthor: { fontSize: 12, fontWeight: '800' },
  replyContent: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  replyDelBtn: {
    minHeight: 28,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyComposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: 5,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  replyInput: {
    flex: 1,
    fontSize: 13,
    minHeight: 36,
    paddingVertical: 4,
  },
  replySendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
