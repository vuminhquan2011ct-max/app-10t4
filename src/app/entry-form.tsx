import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ModalHeader } from '@/components/modal-header';
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
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_KIND_LIST,
  ENTRY_LEVELS,
  ENTRY_LEVEL_LIST,
  GROUP_BONUS_PRESETS,
  GROUP_PRESETS,
  VIOLATION_PRESETS,
} from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { ENTRY_TEMPLATES, type EntryTemplate } from '@/data/seed-extras';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import {
  DRIVE_CONFIG,
  buildDriveDownloadUrl,
  buildDriveThumbnailUrl,
  detectDriveMediaKind,
  extractDriveFileId,
  extractDriveFileIdFromUrl,
  getLocalPreviewUri,
  type DriveMediaKind,
} from '@/lib/drive';
import {
  getCachedDriveMediaItems,
  getMemoryDriveMediaItems,
  saveUploadedFilesToGallery,
} from '@/lib/drive-gallery';
import { stripVietnamese } from '@/lib/intelligence';
import { suggestedPoints } from '@/lib/stats';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { EntryCategory, EntryKind, EntryLevel, PublicStudentRosterItem } from '@/types/models';

type RecordMode = 'bonus' | 'violation';

function inferProofKindFromUrl(url: string): DriveMediaKind {
  const trimmed = url.trim();
  if (/\/(document|spreadsheets|presentation)\/d\//i.test(trimmed)) {
    return 'document';
  }
  if (/lh3\.googleusercontent\.com|drive\.google\.com\/thumbnail/i.test(trimmed)) {
    return 'photo';
  }
  const byExt = detectDriveMediaKind(trimmed);
  if (byExt === 'photo' || byExt === 'video') return byExt;
  return extractDriveFileId(trimmed) ? 'photo' : 'document';
}

export default function EntryFormScreen() {
  const { id, studentId, mode } = useLocalSearchParams<{
    id?: string;
    studentId?: string;
    mode?: 'bonus' | 'violation';
  }>();
  const auth = useAuth();
  const {
    getEntry,
    addEntry,
    updateEntry,
    removeEntry,
    clearEntryProof,
    deleteUploadedFileEverywhere,
    setEntryStatus,
    bonusTargetStudents,
    violationTargetStudents,
    classInfo,
    role,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    canEditClass,
    currentStudent,
    isClassMonitor,
    isGroupLeader,
    isDisciplineVP,
    officerPositionLabel,
    canRecordBonus,
    canRecordViolation,
    canRecordBonusForStudent,
    canRecordViolationForStudent,
  } = useClassStore();
  const theme = useTheme();
  const decor = useDecor();
  const { showToast } = useToast();
  const existing = id ? getEntry(id) : undefined;

  // Officer role-aware capabilities
  const canSwitchModes = isTeacher || isClassMonitor || (canRecordBonus && canRecordViolation);
  const isDisciplineVPOnly = !canSwitchModes && canRecordViolation && !canRecordBonus;
  const isGroupLeaderOnly = !canSwitchModes && canRecordBonus && !canRecordViolation;
  const isOfficerRecorder = canSwitchModes || canRecordBonus || canRecordViolation;
  const isStudentSelfOnly = !isOfficerRecorder;

  const initialMode: RecordMode = existing
    ? existing.kind === 'violation' || existing.points < 0
      ? 'violation'
      : 'bonus'
    : isDisciplineVPOnly
      ? 'violation'
      : canSwitchModes && mode === 'violation'
        ? 'violation'
        : 'bonus';

  const [recordMode, setRecordMode] = useState<RecordMode>(initialMode);
  const isViolationMode = recordMode === 'violation';

  const bonusCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordBonus ? bonusTargetStudents : []),
    [canRecordBonus, bonusTargetStudents],
  );

  const violationCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordViolation ? violationTargetStudents : []),
    [canRecordViolation, violationTargetStudents],
  );

  const activeCandidates = isViolationMode ? violationCandidates : bonusCandidates;
  const isGroupLeaderMissingGroup = isGroupLeaderOnly && !currentStudent?.group?.trim();

  const readOnly = Boolean(
    existing &&
      !canEditClass &&
      (existing.status !== 'pending' || existing.studentId !== currentStudent?.id),
  );

  const defaultOwner =
    existing?.studentId ??
    (isStudentSelfOnly
      ? (currentStudent?.id ?? null)
      : isGroupLeaderMissingGroup
        ? null
        : studentId && activeCandidates.some((s) => s.id === studentId)
          ? studentId
          : activeCandidates[0]?.id ?? null);

  const [owner, setOwner] = useState<string | null>(defaultOwner);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState<string>('all');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(
    existing?.kind ?? (initialMode === 'violation' ? 'violation' : 'achievement'),
  );
  const [category, setCategory] = useState<EntryCategory>(
    existing?.category ?? (initialMode === 'violation' ? 'other' : 'study'),
  );
  const [level, setLevel] = useState<EntryLevel>(
    existing?.level ?? (initialMode === 'violation' || isGroupLeaderOnly ? 'class' : 'school'),
  );
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [points, setPoints] = useState(
    String(
      existing?.points ??
        (initialMode === 'violation' ? -5 : isGroupLeaderOnly ? 5 : suggestedPoints('school')),
    ),
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [proofUrl, setProofUrl] = useState(existing?.proofUrl ?? '');
  const [uploadedProof, setUploadedProof] = useState<DriveAttachmentItem | null>(null);
  const [resolvedProofMeta, setResolvedProofMeta] = useState<{
    fileId: string;
    name: string;
    kind: DriveMediaKind;
    mimeType?: string;
    sizeBytes?: number;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState(existing?.reviewNote ?? '');

  const uploaderDisplayName =
    auth.profile?.displayName?.trim() ||
    (isTeacher
      ? classInfo.teacherName
      : isSubjectTeacher
        ? `GV ${subjectName ?? 'Bộ môn'}`
        : currentStudent?.name || 'Thành viên 10T4');

  const candidateGroups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const s of activeCandidates) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [activeCandidates]);

  const filteredCandidates = useMemo(() => {
    const q = stripVietnamese(studentQuery);
    return activeCandidates.filter((s) => {
      const matchGroup =
        isGroupLeaderOnly ||
        studentGroupFilter === 'all' ||
        (s.group?.trim() ?? '') === studentGroupFilter;
      if (!matchGroup) return false;
      if (!q) return true;
      return stripVietnamese(`${s.name} ${s.code} ${s.group ?? ''}`).includes(q);
    });
  }, [activeCandidates, studentQuery, studentGroupFilter, isGroupLeaderOnly]);

  const selectedTarget = useMemo(
    () => activeCandidates.find((s) => s.id === owner) ?? null,
    [activeCandidates, owner],
  );

  const proofDriveId = extractDriveFileId(proofUrl);
  const inMemoryProofItem =
    proofDriveId && !uploadedProof
      ? getMemoryDriveMediaItems().find((item) => item.driveFileId === proofDriveId) ?? null
      : null;

  useEffect(() => {
    if (!proofDriveId || uploadedProof || inMemoryProofItem) return;
    let active = true;
    void getCachedDriveMediaItems().then((cached) => {
      if (!active) return;
      const match = cached.find((item) => item.driveFileId === proofDriveId);
      if (match) {
        setResolvedProofMeta({
          fileId: proofDriveId,
          name: match.fileName,
          kind: match.itemType,
          mimeType: match.mimeType,
          sizeBytes: match.sizeBytes,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [proofDriveId, uploadedProof, inMemoryProofItem]);

  const replacedDraftRef = useRef<DriveAttachmentItem | null>(null);

  const handleProofSelectionStart = (pending: PendingUploadPreview[]) => {
    const first = pending[0];
    if (!first) return;
    if (
      uploadedProof &&
      !uploadedProof.pending &&
      uploadedProof.url &&
      uploadedProof.url.trim() !== (existing?.proofUrl ?? '').trim()
    ) {
      replacedDraftRef.current = uploadedProof;
    }
    setUploadedProof({
      id: first.tempId,
      name: first.fileName,
      url: '',
      thumbnailUrl: first.localUri ?? null,
      localUri: first.localUri ?? null,
      mimeType: first.mimeType,
      sizeBytes: first.sizeBytes,
      kind: first.kind === 'image' ? 'photo' : first.kind,
      pending: true,
    });
  };

  const handleProofItemUploaded = (first: UploadedDriveFile) => {
    const prevDraft = replacedDraftRef.current;
    replacedDraftRef.current = null;
    if (prevDraft && prevDraft.url && prevDraft.url.trim() !== first.url.trim()) {
      void deleteUploadedFileEverywhere({
        driveFileId: extractDriveFileIdFromUrl(prevDraft.url) || prevDraft.id,
        fileUrl: prevDraft.url,
        fileName: prevDraft.name,
      }).catch(() => {});
    }

    setProofUrl(first.url);
    setUploadedProof({
      id: first.id,
      name: first.name,
      url: first.url,
      thumbnailUrl: first.thumbnailUrl,
      localUri: getLocalPreviewUri(first.id),
      downloadUrl: first.downloadUrl,
      mimeType: first.mimeType,
      sizeBytes: first.sizeBytes,
      kind: first.kind,
      pending: false,
    });
    void saveUploadedFilesToGallery([first], {
      uploaderName: uploaderDisplayName,
      uploaderRole: memberRole,
      uploaderSubject: isSubjectTeacher ? subjectName : null,
      caption: title.trim() ? `Minh chứng: ${title.trim()}` : `Minh chứng (${first.name})`,
      category: first.kind === 'photo' ? 'class_photo' : 'homework',
    }).catch(() => {});
    showToast(`Đã tải minh chứng lên Google Drive ${DRIVE_CONFIG.folderName}! ⚡`);
  };

  const handleProofItemFailed = (tempId: string) => {
    const prevDraft = replacedDraftRef.current;
    replacedDraftRef.current = null;
    setUploadedProof((prev) => (prev && prev.id === tempId && prev.pending ? prevDraft : prev));
  };

  const matchedProofMeta = inMemoryProofItem
    ? {
        fileId: proofDriveId ?? '',
        name: inMemoryProofItem.fileName,
        kind: inMemoryProofItem.itemType,
        mimeType: inMemoryProofItem.mimeType,
        sizeBytes: inMemoryProofItem.sizeBytes,
      }
    : proofDriveId && resolvedProofMeta?.fileId === proofDriveId
      ? resolvedProofMeta
      : null;
  const inferredKind: DriveMediaKind = matchedProofMeta?.kind ?? inferProofKindFromUrl(proofUrl);

  const effectiveProofAttachment: DriveAttachmentItem | null =
    uploadedProof ??
    (proofDriveId
      ? {
          id: proofDriveId,
          name: matchedProofMeta?.name || `Minh chứng Drive (${DRIVE_CONFIG.folderName})`,
          url: proofUrl.trim(),
          thumbnailUrl: inferredKind === 'photo' ? buildDriveThumbnailUrl(proofDriveId, 800) : null,
          localUri: getLocalPreviewUri(proofDriveId),
          downloadUrl: buildDriveDownloadUrl(proofDriveId),
          mimeType: matchedProofMeta?.mimeType,
          sizeBytes: matchedProofMeta?.sizeBytes,
          kind: inferredKind,
        }
      : null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const switchRecordMode = (next: RecordMode) => {
    if (!canSwitchModes || existing) return;
    setRecordMode(next);
    setError(null);
    if (next === 'violation') {
      setKind('violation');
      setCategory('other');
      setLevel('class');
      const n = Number.parseInt(points, 10);
      setPoints(String(Number.isFinite(n) && n < 0 ? n : -5));
      if (!violationCandidates.some((s) => s.id === owner)) {
        setOwner(violationCandidates[0]?.id ?? null);
      }
    } else {
      setKind((prev) => (prev === 'violation' ? 'activity' : prev));
      setCategory((prev) => (prev === 'other' ? 'study' : prev));
      const n = Number.parseInt(points, 10);
      setPoints(String(Number.isFinite(n) && n > 0 ? n : 5));
      if (!bonusCandidates.some((s) => s.id === owner)) {
        setOwner(bonusCandidates[0]?.id ?? null);
      }
    }
  };

  const changeLevel = (next: EntryLevel) => {
    setLevel(next);
    if (!existing && !isViolationMode) setPoints(String(suggestedPoints(next)));
  };

  const applyTemplate = (tpl: EntryTemplate) => {
    setTitle(tpl.title);
    setKind(tpl.kind);
    setCategory(tpl.category);
    setLevel(tpl.level);
    setPoints(String(tpl.points));
    setError(null);
  };

  const applyBonusPreset = (preset: (typeof GROUP_BONUS_PRESETS)[number]) => {
    setTitle(preset.title);
    setKind(preset.kind);
    setCategory(preset.category);
    setLevel('class');
    setPoints(String(Math.abs(preset.points)));
    setError(null);
  };

  const applyViolationPreset = (preset: (typeof VIOLATION_PRESETS)[number]) => {
    setTitle(preset.title);
    setKind('violation');
    setCategory(preset.category);
    setLevel('class');
    setPoints(String(preset.points < 0 ? preset.points : -Math.abs(preset.points)));
    setError(null);
  };

  const save = async () => {
    if (readOnly) {
      showToast('Mục này đã khoá chỉnh sửa', 'info');
      return;
    }
    if (uploadedProof?.pending) {
      showToast('Đợi vài giây để tệp minh chứng hoàn tất đồng bộ lên Drive nhé!', 'info');
      return;
    }
    if (!owner) {
      setError(
        isStudentSelfOnly
          ? 'Tài khoản của bạn chưa được GVCN liên kết với hồ sơ học sinh trong danh sách lớp.'
          : 'Hãy chọn học sinh',
      );
      return;
    }
    if (!title.trim()) {
      setError(
        isViolationMode
          ? 'Hãy nhập nội dung vi phạm / nhắc nhở'
          : 'Hãy nhập tên thành tích / điểm cộng',
      );
      return;
    }

    if (isViolationMode && !canRecordViolationForStudent(selectedTarget ?? { id: owner })) {
      setError('Bạn không có quyền ghi nhận vi phạm cho học sinh này.');
      return;
    }
    if (
      !isViolationMode &&
      !isStudentSelfOnly &&
      owner !== currentStudent?.id &&
      !canRecordBonusForStudent(selectedTarget ?? { id: owner })
    ) {
      setError('Tổ trưởng chỉ được ghi điểm cộng cho thành viên trong Tổ của mình.');
      return;
    }

    const numeric = Number.parseInt(points, 10);
    const finalPoints = isViolationMode
      ? -Math.max(1, Math.abs(Number.isFinite(numeric) ? numeric : 5))
      : Math.max(0, Number.isFinite(numeric) ? numeric : 0);
    const finalKind: EntryKind = isViolationMode
      ? 'violation'
      : kind === 'violation'
        ? 'activity'
        : kind;

    const data = {
      studentId: owner,
      title,
      kind: finalKind,
      category,
      level,
      date,
      description,
      proofUrl,
      points: finalPoints,
    };

    try {
      if (existing) {
        updateEntry(existing.id, data);
        if (canEditClass && reviewNote !== (existing.reviewNote ?? '')) {
          setEntryStatus(existing.id, existing.status, reviewNote.trim() || null);
        }
        showToast('Đã cập nhật ghi nhận!');
      } else {
        await addEntry({ ...data, submittedBy: isOfficerRecorder ? 'teacher' : role });
        decor.recordMissionProgress('submit_entry', 1);
        if (isViolationMode) {
          showToast(
            `Đã ghi nhận vi phạm (${finalPoints}đ) cho ${selectedTarget?.name ?? 'học sinh'}!`,
            'warning',
          );
        } else if (isOfficerRecorder) {
          showToast(
            `Đã ghi điểm cộng (+${finalPoints}đ) cho ${selectedTarget?.name ?? 'học sinh'}! ⚡`,
          );
        } else {
          showToast('Đã gửi lên chờ GVCN duyệt!');
        }
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu ghi nhận');
    }
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      showToast('Bấm lần nữa để xác nhận xóa mục này', 'warning');
      return;
    }
    removeEntry(existing.id);
    showToast('Đã xóa mục ghi nhận', 'warning');
    router.back();
  };

  const authorityTitle = canSwitchModes
    ? `Quyền ${isTeacher ? 'GVCN' : officerPositionLabel || 'Lớp trưởng'} · Điều phối & Ghi điểm / Vi phạm toàn lớp`
    : isDisciplineVPOnly
      ? `Quyền ${officerPositionLabel || 'Lớp phó kỷ luật'} · Ghi nhận học sinh vi phạm`
      : isGroupLeaderOnly
        ? `Quyền ${officerPositionLabel || 'Tổ trưởng'} · Ghi điểm cộng thành viên ${currentStudent?.group || 'trong Tổ'}`
        : null;

  const headerTitle = readOnly
    ? 'Chi tiết mục'
    : existing
      ? 'Sửa ghi nhận'
      : isViolationMode
        ? 'Ghi học sinh vi phạm'
        : isGroupLeaderOnly
          ? 'Ghi điểm cộng Tổ'
          : 'Ghi điểm & Thành tích';

  const headerSubtitle = readOnly
    ? 'Chỉ xem — mục đã được xét duyệt'
    : isStudentSelfOnly
      ? 'Sẽ gửi lên chờ GVCN duyệt'
      : isViolationMode
        ? 'Trừ điểm thi đua trực tiếp & lưu người ghi nhận'
        : 'Ghi nhận trực tiếp vào bảng điểm học sinh';

  const bonusKinds = ENTRY_KIND_LIST.filter((k) => k !== 'violation');

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        actionLabel={readOnly ? undefined : 'Lưu'}
        onAction={readOnly ? undefined : save}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {/* Role Authority Banner */}
          {authorityTitle ? (
            <Card
              style={[
                styles.roleBanner,
                {
                  borderColor: isViolationMode ? theme.danger : theme.accent,
                  backgroundColor: isViolationMode ? theme.dangerSoft : theme.accentSoft,
                },
              ]}>
              <Ionicons
                name={
                  isViolationMode
                    ? 'alert-circle'
                    : isGroupLeaderOnly
                      ? 'people-circle'
                      : 'shield-checkmark'
                }
                size={20}
                color={isViolationMode ? theme.danger : theme.accent}
              />
              <View style={styles.flex}>
                <Text
                  style={[
                    styles.roleBannerTitle,
                    { color: isViolationMode ? theme.danger : theme.accentText },
                  ]}>
                  {authorityTitle}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
                  {isGroupLeaderOnly
                    ? 'Tổ trưởng chỉ chọn được học sinh trong đúng Tổ của mình và ghi điểm cộng trên lớp.'
                    : isDisciplineVPOnly
                      ? 'Lớp phó kỷ luật chọn học sinh vi phạm trong toàn lớp và ghi điểm trừ kỷ luật.'
                      : 'Ghi nhận được duyệt tự động, đồng bộ ngay và gắn tên người ghi nhận rõ ràng.'}
                </Text>
              </View>
            </Card>
          ) : null}

          {/* Mode Toggle for Dual Authority (GVCN & Lớp trưởng) */}
          {canSwitchModes && !existing ? (
            <View style={[styles.modeBar, { backgroundColor: theme.backgroundElement }]}>
              <Pressable
                onPress={() => switchRecordMode('bonus')}
                style={[
                  styles.modeBtn,
                  !isViolationMode && { backgroundColor: theme.success },
                ]}>
                <Ionicons
                  name="add-circle"
                  size={16}
                  color={!isViolationMode ? '#FFFFFF' : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: !isViolationMode ? '#FFFFFF' : theme.textSecondary },
                  ]}>
                  + Ghi điểm cộng
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchRecordMode('violation')}
                style={[
                  styles.modeBtn,
                  isViolationMode && { backgroundColor: theme.danger },
                ]}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={isViolationMode ? '#FFFFFF' : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: isViolationMode ? '#FFFFFF' : theme.textSecondary },
                  ]}>
                  - Ghi học sinh vi phạm
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Quick Presets */}
          {!existing ? (
            isViolationMode ? (
              <View style={styles.presetWrap}>
                <Text style={[styles.presetLabel, { color: theme.danger }]}>
                  Chọn nhanh lỗi vi phạm thường gặp
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}>
                  {VIOLATION_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.title}
                      onPress={() => applyViolationPreset(preset)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.presetText, { color: theme.danger }]}>
                        {`${preset.title} (${preset.points}đ)`}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.presetWrap}>
                <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                  {isGroupLeaderOnly
                    ? 'Chọn nhanh điểm cộng trên lớp cho thành viên Tổ'
                    : 'Chọn nhanh mẫu điểm cộng / thành tích'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}>
                  {GROUP_BONUS_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.title}
                      onPress={() => applyBonusPreset(preset)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        { backgroundColor: theme.successSoft, borderColor: theme.success },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.presetText, { color: theme.success }]}>
                        {`${preset.title} (+${preset.points}đ)`}
                      </Text>
                    </Pressable>
                  ))}
                  {!isGroupLeaderOnly
                    ? ENTRY_TEMPLATES.map((tpl) => (
                        <Pressable
                          key={tpl.label}
                          onPress={() => applyTemplate(tpl)}
                          style={({ pressed }) => [
                            styles.presetChip,
                            { backgroundColor: theme.accentSoft, borderColor: theme.border },
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.presetText, { color: theme.accentText }]}>
                            {tpl.label}
                          </Text>
                        </Pressable>
                      ))
                    : null}
                </ScrollView>
              </View>
            )
          ) : null}

          {/* Officer / Teacher Student Picker (with Search & Group Filter for whole-class pickers) */}
          {isOfficerRecorder ? (
            <Card style={styles.studentPickerCard}>
              <View style={styles.studentPickerHead}>
                <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                  {isGroupLeaderOnly
                    ? `Chọn thành viên ${currentStudent?.group || 'Tổ'} (${filteredCandidates.length})`
                    : `Chọn học sinh (${filteredCandidates.length})`}
                </Text>
                {selectedTarget ? (
                  <Badge
                    label={
                      selectedTarget.group
                        ? `${selectedTarget.name} · ${selectedTarget.group}`
                        : selectedTarget.name
                    }
                    color={isViolationMode ? 'danger' : 'accentText'}
                    soft={isViolationMode ? 'dangerSoft' : 'accentSoft'}
                    icon={'person-circle-outline'}
                  />
                ) : null}
              </View>

              {!isGroupLeaderOnly && activeCandidates.length > 6 ? (
                <>
                  <TextField
                    icon={'search'}
                    placeholder={'Tìm nhanh học sinh theo tên hoặc Số ID...'}
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.presetRow}>
                    {candidateGroups.map((g) => (
                      <Chip
                        key={g}
                        label={g === 'all' ? 'Cả lớp' : g}
                        selected={studentGroupFilter === g}
                        onPress={() => setStudentGroupFilter(g)}
                      />
                    ))}
                  </ScrollView>
                </>
              ) : null}

              {isGroupLeaderMissingGroup ? (
                <Text style={{ color: theme.warning, fontSize: 12.5, lineHeight: 18, fontWeight: '700' }}>
                  Bạn chưa được GVCN phân vào Tổ nên chưa thể ghi điểm cộng cho thành viên Tổ. Hãy
                  báo GVCN cập nhật Tổ cho hồ sơ của bạn.
                </Text>
              ) : filteredCandidates.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
                  {isGroupLeaderOnly
                    ? 'Chưa có thành viên nào trong Tổ của bạn.'
                    : 'Không tìm thấy học sinh phù hợp.'}
                </Text>
              ) : (
                <View style={styles.wrapChips}>
                  {filteredCandidates.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.group && !isGroupLeaderOnly ? `${s.name} (${s.group})` : s.name}
                      selected={owner === s.id}
                      onPress={() => {
                        setOwner(s.id);
                        setError(null);
                      }}
                    />
                  ))}
                </View>
              )}
            </Card>
          ) : null}

          {/* Entry Kind (locked to Violation in violation mode, otherwise Achievement/Activity) */}
          {isViolationMode ? (
            <View style={styles.lockedKindRow}>
              <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>Phân loại</Text>
              <Badge
                label={'Vi phạm / Nhắc nhở (Điểm trừ)'}
                color={'danger'}
                soft={'dangerSoft'}
                icon={'alert-circle'}
              />
            </View>
          ) : (
            <OptionPicker
              label={'Loại'}
              options={bonusKinds.map((k) => ({
                value: k,
                label: ENTRY_KINDS[k].label,
                icon: ENTRY_KINDS[k].icon,
              }))}
              value={kind === 'violation' ? 'activity' : kind}
              onChange={setKind}
            />
          )}

          <TextField
            label={
              isViolationMode
                ? 'Nội dung vi phạm / nhắc nhở'
                : isGroupLeaderOnly
                  ? 'Nội dung điểm cộng trên lớp'
                  : 'Tên thành tích / hoạt động'
            }
            icon={isViolationMode ? 'alert-circle-outline' : 'trophy-outline'}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder={
              isViolationMode
                ? 'Ví dụ: Đi học muộn, nói chuyện riêng trong giờ...'
                : isGroupLeaderOnly
                  ? 'Ví dụ: Xung phong phát biểu xây dựng bài'
                  : 'Giải Nhất Olympic Toán cấp trường'
            }
            error={error}
          />

          <OptionPicker
            label={'Lĩnh vực'}
            columns={3}
            options={ENTRY_CATEGORY_LIST.map((c) => ({
              value: c,
              label: ENTRY_CATEGORIES[c].label,
              icon: ENTRY_CATEGORIES[c].icon,
            }))}
            value={category}
            onChange={setCategory}
          />

          {!isViolationMode ? (
            <OptionPicker
              label={'Cấp độ'}
              columns={3}
              options={ENTRY_LEVEL_LIST.map((l) => ({ value: l, label: ENTRY_LEVELS[l].label }))}
              value={level}
              onChange={changeLevel}
            />
          ) : null}

          <DatePickerField label={'Ngày diễn ra'} value={date} onChange={setDate} />

          <TextField
            label={isViolationMode ? 'Điểm trừ kỷ luật (số âm)' : 'Điểm thi đua (+)'}
            icon={isViolationMode ? 'remove-circle-outline' : 'ribbon-outline'}
            value={points}
            onChangeText={setPoints}
            keyboardType={isViolationMode ? 'numbers-and-punctuation' : 'number-pad'}
            hint={
              isViolationMode
                ? 'Tự động lưu dưới dạng điểm trừ (ví dụ -5đ) và hiển thị rõ trên nhật ký lớp.'
                : isGroupLeader || isDisciplineVP || isClassMonitor
                  ? 'Điểm cộng do Ban cán sự ghi nhận sẽ cập nhật ngay vào bảng điểm.'
                  : 'Gợi ý theo cấp độ, giáo viên có thể điều chỉnh khi duyệt.'
            }
          />

          <TextField
            label={'Mô tả / Ghi chú chi tiết'}
            icon={'document-text-outline'}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TextField
            label={'Link minh chứng (Ảnh / File Google Drive)'}
            icon={'link-outline'}
            value={proofUrl}
            onChangeText={(val) => {
              setProofUrl(val);
              if (uploadedProof && val.trim() !== uploadedProof.url) {
                setUploadedProof(null);
              }
            }}
            autoCapitalize={'none'}
            placeholder={'https://drive.google.com/... hoặc tải ảnh/file bên dưới'}
          />
          {!readOnly ? (
            <DriveUploadButton
              mode={'both'}
              compact
              multiple={false}
              mediaLabel={'Tải ảnh minh chứng'}
              fileLabel={`Tải file (${DRIVE_CONFIG.folderName})`}
              uploaderName={uploaderDisplayName}
              uploaderRole={memberRole}
              category={'homework'}
              onSelectionStart={handleProofSelectionStart}
              onItemUploaded={handleProofItemUploaded}
              onItemFailed={handleProofItemFailed}
            />
          ) : null}
          {effectiveProofAttachment ? (
            <DriveAttachmentList
              attachments={[effectiveProofAttachment]}
              editable={!readOnly}
              onRemove={() => {
                const target = effectiveProofAttachment;
                const rawUrl = proofUrl.trim();
                const justUploaded = uploadedProof;
                setUploadedProof(null);
                setProofUrl('');

                if (existing) {
                  if (existing.proofUrl) {
                    void clearEntryProof(existing.id);
                  }
                  if (
                    justUploaded &&
                    !justUploaded.pending &&
                    justUploaded.url &&
                    justUploaded.url.trim() !== (existing.proofUrl ?? '').trim()
                  ) {
                    void deleteUploadedFileEverywhere({
                      driveFileId: extractDriveFileIdFromUrl(justUploaded.url) || justUploaded.id,
                      fileUrl: justUploaded.url,
                      fileName: justUploaded.name,
                    }).catch(() => {});
                  }
                } else if (target && !target.pending) {
                  const targetUrl = target.url || rawUrl;
                  void deleteUploadedFileEverywhere({
                    driveFileId: extractDriveFileIdFromUrl(targetUrl) || target.id,
                    fileUrl: targetUrl,
                    fileName: target.name,
                  }).catch(() => {});
                }
                showToast('Đã xoá tệp minh chứng khỏi mục, Drive & Excel!', 'info');
              }}
            />
          ) : null}

          {existing && isTeacher ? (
            <TextField
              label={'Ghi chú duyệt của giáo viên'}
              icon={'chatbubble-ellipses-outline'}
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder={'Khen ngợi hoặc lý do điều chỉnh...'}
            />
          ) : null}

          {!readOnly ? (
            <Button
              label={
                existing
                  ? 'Lưu thay đổi'
                  : isViolationMode
                    ? 'Ghi nhận vi phạm'
                    : isOfficerRecorder
                      ? 'Lưu điểm cộng ngay'
                      : 'Gửi lên'
              }
              variant={isViolationMode ? 'danger' : 'primary'}
              icon={isViolationMode ? 'alert-circle' : 'checkmark-circle'}
              onPress={save}
            />
          ) : null}
          {existing && !readOnly && (isTeacher || existing.status === 'pending') ? (
            <Button
              label={confirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá mục này'}
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
  roleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
    borderWidth: 1.2,
  },
  roleBannerTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  modeBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  modeBtnText: { fontSize: 13, fontWeight: '900' },
  studentPickerCard: { gap: Spacing.two + 2 },
  studentPickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lockedKindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  presetWrap: { gap: Spacing.one + 2 },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presetRow: { gap: Spacing.two, paddingRight: Spacing.two },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
