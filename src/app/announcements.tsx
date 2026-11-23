/**
 * Class Announcements & Subject Teachers Portal (/announcements).
 *
 * - Both Homeroom Teacher (GVCN) and Subject Teachers (GV Bộ môn) can publish,
 *   pin, and manage announcements with subject badges & exam countdowns.
 * - Subject Teachers can unlock posting access directly from this screen using
 *   the Teacher Password (`K8T4`).
 * - Students liking announcements automatically progress the News Mission for Rare Stickers.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import {
  ANNOUNCEMENT_TAGS,
  ANNOUNCEMENT_TAG_LIST,
  SUBJECT_TEACHER_PRESETS,
} from '@/constants/utilities-meta';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, relativeDay } from '@/lib/date';
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
import type { Announcement, AnnouncementTag, DriveAttachment } from '@/types/models';

type AnnFilter = 'all' | 'subject_teachers' | 'homeroom' | 'officers' | AnnouncementTag;

function softToneOf(color: 'accent' | 'success' | 'warning' | 'danger' | 'purple'): ThemeColor {
  return `${color}Soft` as ThemeColor;
}

export default function AnnouncementsScreen() {
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
  const {
    announcements,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    isOfficer,
    isClassMonitor,
    officerPositionLabel,
    defaultDepartment,
    currentStudent,
    subjectName,
    canPostAnnouncements,
    classInfo,
    addAnnouncement,
    togglePinAnnouncement,
    likeAnnouncement,
    removeAnnouncement,
    removeAnnouncementAttachment,
    deleteUploadedFileEverywhere,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();

  const isOfficerPublisher = !isTeacher && !isSubjectTeacher && isOfficer && canPostAnnouncements;
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
  const hasPrefill = Boolean(prefillSig && canPostAnnouncements);

  const [appliedPrefillSig, setAppliedPrefillSig] = useState<string>(hasPrefill ? prefillSig : '');
  const [filter, setFilter] = useState<AnnFilter>('all');
  const [composerOpen, setComposerOpen] = useState(hasPrefill);
  const [portalOpen, setPortalOpen] = useState(false);

  // Subject teacher quick unlock portal state
  const [portalSubject, setPortalSubject] = useState(
    subjectName || SUBJECT_TEACHER_PRESETS[0].subject,
  );
  const [portalCustomSubject, setPortalCustomSubject] = useState('');
  const [portalLoginId, setPortalLoginId] = useState('');
  const [portalName, setPortalName] = useState(auth.profile?.displayName ?? '');
  const [portalPassword, setPortalPassword] = useState('');
  const [showPortalPass, setShowPortalPass] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Composer fields (initialized from optional route prefill params cleanly)
  const [title, setTitle] = useState(params.prefillTitle ?? '');
  const [content, setContent] = useState(params.prefillBody ?? '');
  const [tag, setTag] = useState<AnnouncementTag>(resolvedPrefillTag);
  const [composerDept, setComposerDept] = useState<OfficerDepartmentKey | null>(resolvedPrefillDept);
  const [composerSubject, setComposerSubject] = useState<string>(
    subjectName || SUBJECT_TEACHER_PRESETS[0].subject,
  );
  const [composerAuthor, setComposerAuthor] = useState<string>(
    auth.profile?.displayName?.trim() ||
      (isTeacher
        ? classInfo.teacherName
        : isOfficerPublisher
          ? currentStudent?.name ?? ''
          : ''),
  );
  const [eventDate, setEventDate] = useState<string | null>(params.prefillEventDate?.trim() || null);
  const [composerEventId, setComposerEventId] = useState<string | null>(
    params.prefillEventId?.trim() || null,
  );
  const [pinned, setPinned] = useState(isTeacher);
  const [attachments, setAttachments] = useState<DriveAttachmentItem[]>([]);
  const [deletingAttachmentIds, setDeletingAttachmentIds] = useState<Record<string, boolean>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  // Apply fresh route prefill params even when /announcements was already mounted in the nav stack
  if (prefillSig && prefillSig !== appliedPrefillSig && canPostAnnouncements) {
    setAppliedPrefillSig(prefillSig);
    setTitle(params.prefillTitle ?? '');
    setContent(params.prefillBody ?? '');
    setTag(resolvedPrefillTag);
    setComposerDept(resolvedPrefillDept);
    setEventDate(params.prefillEventDate?.trim() || null);
    setComposerEventId(params.prefillEventId?.trim() || null);
    setComposerAuthor(
      auth.profile?.displayName?.trim() ||
        (isSubjectTeacher
          ? `GV Bộ môn ${subjectName ?? ''}`.trim()
          : isOfficerPublisher
            ? currentStudent?.name || officerPositionLabel || 'Ban cán sự'
            : classInfo.teacherName),
    );
    setComposerOpen(true);
  }

  const subjectAnnCount = useMemo(
    () => announcements.filter((a) => a.authorRole === 'subject_teacher' || Boolean(a.subject)).length,
    [announcements],
  );
  const officerAnnCount = useMemo(
    () => announcements.filter((a) => a.authorRole === 'officer' || Boolean(a.authorPosition)).length,
    [announcements],
  );

  const visible = useMemo(
    () =>
      announcements.filter((a) => {
        if (filter === 'all') return true;
        if (filter === 'subject_teachers') {
          return a.authorRole === 'subject_teacher' || Boolean(a.subject);
        }
        if (filter === 'officers') {
          return a.authorRole === 'officer' || Boolean(a.authorPosition);
        }
        if (filter === 'homeroom') {
          return (
            a.authorRole !== 'subject_teacher' &&
            a.authorRole !== 'officer' &&
            !a.subject &&
            !a.authorPosition
          );
        }
        return a.tag === filter;
      }),
    [announcements, filter],
  );

  const handleOpenComposer = () => {
    const nextOpen = !composerOpen;
    if (nextOpen) {
      setTag(isSubjectTeacher ? 'subject' : isOfficerPublisher ? 'event' : 'important');
      setComposerDept(defaultDepartment ?? (isTeacher ? 'class_board' : null));
      setComposerSubject(subjectName || SUBJECT_TEACHER_PRESETS[0].subject);
      setComposerEventId(null);
      setComposerAuthor(
        auth.profile?.displayName?.trim() ||
          (isSubjectTeacher
            ? `GV Bộ môn ${subjectName ?? ''}`.trim()
            : isOfficerPublisher
              ? currentStudent?.name || officerPositionLabel || 'Ban cán sự'
              : classInfo.teacherName),
      );
      setPinned(isTeacher);
    }
    setComposerOpen(nextOpen);
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
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const resolvedSubject = res.account?.subject || chosenSubject;
    const resolvedName = res.account?.name || cleanName;
    setPortalLoginId('');
    setPortalPassword('');
    setPortalOpen(false);
    setComposerSubject(resolvedSubject);
    setComposerAuthor(resolvedName);
    setTag('subject');
    setPinned(false);
    setComposerOpen(true);
    showToast(`Chào mừng ${resolvedName} (${resolvedSubject})! Đã mở quyền đăng thông báo 📚`);
  };

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
      uploaderName:
        composerAuthor.trim() ||
        auth.profile?.displayName?.trim() ||
        currentStudent?.name ||
        classInfo.teacherName,
      uploaderRole: memberRole,
      uploaderSubject: isSubjectTeacher ? composerSubject : null,
      caption: title.trim() ? `Thông báo: ${title.trim()}` : 'Đính kèm bảng tin lớp 10T4',
      category: f.kind === 'photo' ? 'class_photo' : 'lecture',
    }).catch(() => {});
  };

  const handleAttachmentItemFailed = (tempId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== tempId));
  };

  const handleAttachmentUploaded = (files: UploadedDriveFile[]) => {
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
      showToast('Đã xoá tệp đính kèm khỏi bài soạn, Drive & Excel', 'info');
    }
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
      showToast('Đã xoá tệp đính kèm khỏi thông báo, Drive & Excel!', 'info');
    } finally {
      setDeletingAttachmentIds((prev) => {
        const next = { ...prev };
        delete next[att.id];
        return next;
      });
    }
  };

  const handlePublish = () => {
    if (!title.trim() || !content.trim()) {
      showToast('Vui lòng nhập tiêu đề và nội dung thông báo', 'warning');
      return;
    }
    if (attachments.some((a) => a.pending)) {
      showToast('Đợi vài giây để tệp đính kèm hoàn tất đồng bộ lên Drive nhé!', 'info');
      return;
    }
    const cleanAttachments: DriveAttachment[] = attachments.map(
      ({ pending: _p, localUri: _l, ...rest }) => rest,
    );
    const effectiveSubject = isSubjectTeacher
      ? composerSubject.trim() || subjectName || 'Bộ môn'
      : tag === 'subject'
        ? composerSubject.trim() || null
        : null;
    const effectiveAuthor =
      composerAuthor.trim() ||
      auth.profile?.displayName?.trim() ||
      (isSubjectTeacher
        ? `GV ${effectiveSubject}`
        : isOfficerPublisher
          ? currentStudent?.name || officerPositionLabel || 'Ban cán sự'
          : classInfo.teacherName);

    const effectiveAuthorRole: Announcement['authorRole'] = isTeacher
      ? 'teacher'
      : isSubjectTeacher
        ? 'subject_teacher'
        : isOfficerPublisher
          ? 'officer'
          : 'editor';

    addAnnouncement({
      title,
      content,
      tag,
      eventDate,
      eventId: composerEventId,
      pinned,
      author: effectiveAuthor,
      subject: effectiveSubject,
      authorRole: effectiveAuthorRole,
      department: composerDept,
      authorPosition: isOfficerPublisher ? officerPositionLabel : null,
      attachments: cleanAttachments,
    });
    setTitle('');
    setContent('');
    setEventDate(null);
    setComposerEventId(null);
    setAttachments([]);
    setComposerOpen(false);
    showToast(
      effectiveSubject
        ? `Đã đăng thông báo môn ${effectiveSubject} lên bảng tin! 📚`
        : isOfficerPublisher
          ? `Đã đăng bản tin ${officerPositionLabel ?? 'Ban cán sự'} lên bảng tin lớp! 📢`
          : 'Đã đăng thông báo mới lên bảng tin!',
    );
  };

  const handleLike = (id: string) => {
    if (likedIds[id]) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLikedIds((prev) => ({ ...prev, [id]: true }));
    likeAnnouncement(id);
    decor.recordMissionProgress('like_announcement', 1);
  };

  const canManageItem = (item: Announcement) => {
    if (isTeacher || isClassMonitor) return true;
    const myName = (auth.profile?.displayName?.trim() || currentStudent?.name?.trim() || '').toLowerCase();
    const sameAuthor = Boolean(myName) && item.author.trim().toLowerCase() === myName;
    if (isSubjectTeacher) {
      const sameSubject =
        Boolean(subjectName) &&
        Boolean(item.subject) &&
        item.subject?.toLowerCase() === subjectName?.toLowerCase();
      return item.authorRole === 'subject_teacher' && (sameSubject || sameAuthor);
    }
    if (isOfficerPublisher) {
      const sameDept = Boolean(defaultDepartment) && item.department === defaultDepartment;
      return item.authorRole === 'officer' && (sameAuthor || sameDept);
    }
    return false;
  };

  const subjectEmojiOf = (sub?: string | null) => {
    if (!sub) return '📚';
    const found = SUBJECT_TEACHER_PRESETS.find(
      (p) => p.subject.toLowerCase() === sub.toLowerCase(),
    );
    return found?.emoji ?? '📚';
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Bảng tin lớp ' + classInfo.name}
        subtitle={'Thông báo GVCN, GV Bộ môn & Ban cán sự lớp'}
        rightIcon={
          canPostAnnouncements ? (composerOpen ? 'close' : 'add') : portalOpen ? 'close' : 'book'
        }
        rightLabel={
          canPostAnnouncements
            ? composerOpen
              ? 'Đóng'
              : 'Đăng tin'
            : portalOpen
              ? 'Đóng'
              : 'GV Bộ môn'
        }
        onRightPress={canPostAnnouncements ? handleOpenComposer : () => setPortalOpen((v) => !v)}
      />

      {/* Active Officer Publisher Strip */}
      {isOfficerPublisher ? (
        <FadeIn index={0}>
          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.stBanner}>
            <View style={styles.stIcon}>
              <Ionicons name="megaphone" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.stEyebrow}>QUYỀN BAN CÁN SỰ ĐĂNG BẢN TIN</Text>
              <Text style={styles.stTitle} numberOfLines={1}>
                {`${currentStudent?.name || auth.profile?.displayName || 'Ban cán sự'} · ${officerPositionLabel ?? ''}`}
              </Text>
            </View>
            <Pressable
              onPress={handleOpenComposer}
              style={styles.stSwitchBtn}>
              <Text style={styles.stSwitchText}>{composerOpen ? 'Đóng' : 'Soạn tin'}</Text>
            </Pressable>
          </LinearGradient>
        </FadeIn>
      ) : null}

      {/* Active Subject Teacher Strip */}
      {isSubjectTeacher ? (
        <FadeIn index={0}>
          <LinearGradient
            colors={['#059669', '#0284C7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.stBanner}>
            <View style={styles.stIcon}>
              <Text style={{ fontSize: 20 }}>{subjectEmojiOf(subjectName)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.stEyebrow}>CHẾ ĐỘ GIÁO VIÊN BỘ MÔN</Text>
              <Text style={styles.stTitle} numberOfLines={1}>
                {`${auth.profile?.displayName?.trim() || 'Thầy / Cô'} · ${subjectName ?? 'Bộ môn'}`}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                await auth.switchAccountRole('student');
                setComposerOpen(false);
                showToast('Đã chuyển về chế độ Học sinh', 'info');
              }}
              style={styles.stSwitchBtn}>
              <Text style={styles.stSwitchText}>Đổi vai</Text>
            </Pressable>
          </LinearGradient>
        </FadeIn>
      ) : null}

      {/* Subject Teacher Entry Portal (shown to Students without posting permission) */}
      {!canPostAnnouncements ? (
        <FadeIn index={0}>
          <Card style={[styles.portalCard, { borderColor: theme.warning, borderWidth: 1.2 }]}>
            <Pressable
              onPress={() => setPortalOpen((v) => !v)}
              style={styles.portalHead}>
              <View style={[styles.portalIcon, { backgroundColor: theme.warningSoft }]}>
                <Ionicons name="book" size={20} color={theme.warning} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.portalTitle, { color: theme.text }]}>
                  Cổng Giáo viên Bộ môn đăng Thông báo
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Thầy/Cô bộ môn xác thực mật khẩu giáo viên để gửi dặn dò & lịch kiểm tra cho 10T4
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
                  label={'Mã ID giáo viên (nếu đã có tài khoản riêng)'}
                  icon={'id-card-outline'}
                  placeholder={'VD: GVBM-01 (để trống nếu dùng mã GV lớp)'}
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
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                      Chọn môn giảng dạy
                    </Text>
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
                      label={'Hoặc nhập môn khác (tuỳ chọn)'}
                      placeholder={'VD: Robotics, Kỹ năng sống...'}
                      value={portalCustomSubject}
                      onChangeText={setPortalCustomSubject}
                    />

                    <TextField
                      label={'Tên Thầy / Cô'}
                      icon={'person-outline'}
                      placeholder={'VD: Cô Nguyễn Minh Anh / Thầy Nam'}
                      value={portalName}
                      onChangeText={setPortalName}
                    />
                  </>
                ) : null}

                <View style={styles.passGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {portalLoginId.trim()
                      ? 'Mật khẩu riêng của tài khoản Giáo viên'
                      : 'Mật khẩu xác thực Giáo viên'}
                  </Text>
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
                      onSubmitEditing={handleUnlockSubjectTeacher}
                      style={[styles.passInput, { color: theme.text }]}
                    />
                    <Pressable onPress={() => setShowPortalPass((v) => !v)} hitSlop={10}>
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
                </View>

                <Button
                  label={'Xác thực & Mở quyền Đăng Thông báo'}
                  icon={'lock-open'}
                  onPress={handleUnlockSubjectTeacher}
                />
              </View>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      {/* Announcement Composer (GVCN, GV Bộ môn & Ban cán sự) */}
      {composerOpen && canPostAnnouncements ? (
        <FadeIn index={0}>
          <Card style={styles.composer}>
            <View style={styles.compHead}>
              <Text style={[styles.compTitle, { color: theme.text }]}>
                {isSubjectTeacher
                  ? 'Đăng thông báo Bộ môn'
                  : isOfficerPublisher
                    ? 'Đăng bản tin Ban cán sự'
                    : 'Tạo thông báo mới'}
              </Text>
              <Badge
                label={
                  isSubjectTeacher
                    ? `${subjectEmojiOf(composerSubject)} GV ${composerSubject}`
                    : isOfficerPublisher
                      ? officerPositionLabel || 'Ban cán sự'
                      : '🛡️ GV Chủ nhiệm'
                }
                color={isSubjectTeacher ? 'success' : isOfficerPublisher ? 'purple' : 'accent'}
                soft={
                  isSubjectTeacher ? 'successSoft' : isOfficerPublisher ? 'purpleSoft' : 'accentSoft'
                }
              />
            </View>

            <OptionPicker
              label={'Phân loại'}
              columns={2}
              options={ANNOUNCEMENT_TAG_LIST.map((t) => ({
                value: t,
                label: ANNOUNCEMENT_TAGS[t].label,
                icon: ANNOUNCEMENT_TAGS[t].icon,
              }))}
              value={tag}
              onChange={setTag}
            />

            {/* Department / Ban chuyên trách selector */}
            {!isSubjectTeacher ? (
              <View style={styles.subjectPickWrap}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Phòng ban / Ban chuyên trách
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
                      icon={dept.icon as keyof typeof Ionicons.glyphMap}
                      selected={composerDept === dept.key}
                      onPress={() => setComposerDept(dept.key)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {isSubjectTeacher || tag === 'subject' ? (
              <View style={styles.subjectPickWrap}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Môn học gắn thẻ
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

            <TextField
              label={isOfficerPublisher ? 'Người đăng bản tin' : 'Tên giáo viên đăng tin'}
              icon={'person-outline'}
              placeholder={
                isOfficerPublisher
                  ? 'Tên thành viên Ban cán sự'
                  : 'VD: Cô Nguyễn Minh Anh / Thầy Ngô Vũ Hảo'
              }
              value={composerAuthor}
              onChangeText={setComposerAuthor}
            />

            <TextField
              label={'Tiêu đề'}
              placeholder={'Ví dụ: Lịch kiểm tra 15p Toán / Kế hoạch sự kiện lớp'}
              value={title}
              onChangeText={setTitle}
            />
            <TextField
              label={'Nội dung chi tiết'}
              placeholder={'Nhập nội dung thông báo, bài tập hoặc dặn dò tới cả lớp 10T4...'}
              value={content}
              onChangeText={setContent}
              multiline
            />
            <DatePickerField
              label={'Ngày kiểm tra / Hạn nộp / Sự kiện (tuỳ chọn)'}
              value={eventDate}
              onChange={setEventDate}
              clearable
              onClear={() => setEventDate(null)}
            />
            <View style={styles.subjectPickWrap}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                {`Đính kèm ảnh / file lên Google Drive ${DRIVE_CONFIG.folderName} (tuỳ chọn)`}
              </Text>
              <DriveUploadButton
                mode={'both'}
                compact
                multiple
                mediaLabel={'Đính kèm ảnh'}
                fileLabel={'Đính kèm file'}
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
                onRemove={handleRemoveDraftAttachment}
              />
            </View>
            <Pressable
              onPress={() => setPinned((p) => !p)}
              style={[styles.pinToggle, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons
                name={pinned ? 'pin' : 'pin-outline'}
                size={18}
                color={pinned ? theme.accent : theme.textMuted}
              />
              <Text style={[styles.pinToggleText, { color: theme.text }]}>
                Ghim lên đầu bảng tin & Trang tổng quan
              </Text>
              <Ionicons
                name={pinned ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={pinned ? theme.accent : theme.textMuted}
              />
            </Pressable>
            <Button label={'Đăng lên bảng tin lớp 10T4'} icon={'send'} onPress={handlePublish} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          label={`Tất cả (${announcements.length})`}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`🏅 Ban cán sự (${officerAnnCount})`}
          selected={filter === 'officers'}
          onPress={() => setFilter('officers')}
        />
        <Chip
          label={`📚 GV Bộ môn (${subjectAnnCount})`}
          selected={filter === 'subject_teachers'}
          onPress={() => setFilter('subject_teachers')}
        />
        <Chip
          label={'🛡️ GV Chủ nhiệm'}
          selected={filter === 'homeroom'}
          onPress={() => setFilter('homeroom')}
        />
        {ANNOUNCEMENT_TAG_LIST.map((t) => (
          <Chip
            key={t}
            label={ANNOUNCEMENT_TAGS[t].label}
            icon={ANNOUNCEMENT_TAGS[t].icon}
            selected={filter === t}
            onPress={() => setFilter(t)}
          />
        ))}
      </ScrollView>

      {visible.length === 0 ? (
        <EmptyState
          icon={'megaphone-outline'}
          title={'Chưa có thông báo nào'}
          message={'Thông báo từ GVCN, Giáo viên bộ môn và Ban cán sự sẽ hiển thị tại đây.'}
        />
      ) : (
        visible.map((item, i) => {
          const meta = ANNOUNCEMENT_TAGS[item.tag] ?? ANNOUNCEMENT_TAGS.important;
          const liked = Boolean(likedIds[item.id]);
          const isFromSubjectTeacher =
            item.authorRole === 'subject_teacher' || Boolean(item.subject);
          const isFromOfficer = item.authorRole === 'officer' || Boolean(item.authorPosition);
          const deptMeta = getOfficerDepartmentMeta(item.department);
          const manageable = canManageItem(item);

          return (
            <FadeIn key={item.id} index={Math.min(i + 1, 8)}>
              <Card
                style={[
                  styles.card,
                  item.pinned && { borderColor: theme.accent, borderWidth: 1.5 },
                  isFromSubjectTeacher &&
                    !item.pinned && {
                      borderLeftWidth: 4,
                      borderLeftColor: theme.success,
                    },
                  isFromOfficer &&
                    !item.pinned &&
                    !isFromSubjectTeacher && {
                      borderLeftWidth: 4,
                      borderLeftColor: theme.purple,
                    },
                ]}>
                <View style={styles.topRow}>
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
                      icon={deptMeta.icon as keyof typeof Ionicons.glyphMap}
                    />
                  ) : null}
                  {item.pinned ? (
                    <Badge label={'Đã ghim'} color={'gold'} soft={'goldSoft'} icon={'pin'} />
                  ) : null}
                  {item.eventDate ? (
                    <Badge
                      label={relativeDay(item.eventDate) + ' · ' + formatDate(item.eventDate)}
                      color={'purple'}
                      soft={'purpleSoft'}
                      icon={'calendar-outline'}
                    />
                  ) : null}
                </View>

                <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{item.content}</Text>
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

                <View style={[styles.footer, { borderColor: theme.border }]}>
                  <Text style={[styles.author, { color: theme.textMuted }]}>
                    {isFromSubjectTeacher && item.subject
                      ? `Đăng bởi ${item.author} · GV ${item.subject}`
                      : item.authorPosition
                        ? `Đăng bởi ${item.author} · ${item.authorPosition}`
                        : `Đăng bởi ${item.author}`}
                  </Text>

                  <View style={styles.footerActions}>
                    <Pressable
                      onPress={() => handleLike(item.id)}
                      style={({ pressed }) => [
                        styles.likeBtn,
                        { backgroundColor: liked ? theme.dangerSoft : theme.backgroundElement },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={15}
                        color={liked ? theme.danger : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.likeText,
                          { color: liked ? theme.danger : theme.textSecondary },
                        ]}>
                        {item.likes}
                      </Text>
                    </Pressable>

                    {manageable ? (
                      <>
                        <Pressable
                          onPress={() => {
                            togglePinAnnouncement(item.id);
                            showToast(item.pinned ? 'Đã bỏ ghim' : 'Đã ghim thông báo', 'info');
                          }}
                          style={[styles.iconAction, { backgroundColor: theme.backgroundElement }]}>
                          <Ionicons
                            name={item.pinned ? 'pin' : 'pin-outline'}
                            size={15}
                            color={item.pinned ? theme.accent : theme.textSecondary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            removeAnnouncement(item.id);
                            showToast('Đã xoá thông báo & tệp đính kèm khỏi App, Drive & Excel', 'warning');
                          }}
                          style={[styles.iconAction, { backgroundColor: theme.dangerSoft }]}>
                          <Ionicons name="trash-outline" size={15} color={theme.danger} />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
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
  stBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  stIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.7 },
  stTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 1 },
  stSwitchBtn: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  stSwitchText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  portalCard: { gap: Spacing.three },
  portalHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  portalIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: { fontSize: 14.5, fontWeight: '900' },
  portalForm: {
    gap: Spacing.two + 2,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  passGroup: { gap: 6 },
  passBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 46,
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
  composer: { gap: Spacing.three },
  compHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  compTitle: { fontSize: 16, fontWeight: '900' },
  subjectPickWrap: { gap: 6 },
  pinToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  pinToggleText: { flex: 1, fontSize: 13, fontWeight: '700' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  card: { gap: Spacing.two + 2 },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 16, fontWeight: '900', lineHeight: 22 },
  body: { fontSize: 14, lineHeight: 21 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  author: { fontSize: 12, fontWeight: '600', flex: 1 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  likeText: { fontSize: 12, fontWeight: '800' },
  iconAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
});
