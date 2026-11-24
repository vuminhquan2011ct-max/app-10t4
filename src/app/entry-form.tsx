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
  ACHIEVEMENT_CATEGORY_LIST,
  ACADEMIC_ACHIEVEMENT_PRESETS,
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_KIND_LIST,
  ENTRY_LEVELS,
  ENTRY_LEVEL_LIST,
  GROUP_BONUS_PRESETS,
  GROUP_PRESETS,
  STUDY_SPEECH_PRESETS,
  STUDY_SUBJECT_PRESETS,
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

type RecordMode = 'study' | 'bonus' | 'violation';

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
  const { id, studentId, mode, subject: paramSubject } = useLocalSearchParams<{
    id?: string;
    studentId?: string;
    mode?: 'bonus' | 'violation' | 'study';
    subject?: string;
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
    studyTargetStudents,
    classInfo,
    role,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    canEditClass,
    currentStudent,
    isClassMonitor,
    isAcademicVP,
    isGroupLeader,
    isDisciplineVP,
    officerPositionLabel,
    customOfficerPermissions,
    inferredStudySubjects,
    canRecordStudy,
    canRecordBonus,
    canRecordViolation,
    canRecordStudyForStudent,
    canRecordBonusForStudent,
    canRecordViolationForStudent,
  } = useClassStore();
  const theme = useTheme();
  const decor = useDecor();
  const { showToast } = useToast();
  const existing = id ? getEntry(id) : undefined;

  const hasClassWideStudy =
    isTeacher ||
    isSubjectTeacher ||
    isClassMonitor ||
    isAcademicVP ||
    customOfficerPermissions.includes('full_coordination') ||
    customOfficerPermissions.includes('record_study') ||
    inferredStudySubjects.length > 0;
  const hasClassWideBonus =
    isTeacher ||
    isClassMonitor ||
    customOfficerPermissions.includes('full_coordination') ||
    customOfficerPermissions.includes('record_bonus_class');
  const isGroupScopedBonus = !hasClassWideBonus && canRecordBonus;
  const isGroupScopedStudy = !hasClassWideStudy && canRecordStudy;
  const isDisciplineVPOnly =
    !isTeacher && !isClassMonitor && canRecordViolation && !canRecordBonus && !hasClassWideStudy;
  const canSelfSubmit = memberRole === 'student' && Boolean(currentStudent);

  const allowStudyMode = canRecordStudy || canSelfSubmit || existing?.kind === 'study';
  const allowBonusMode =
    canRecordBonus ||
    canSelfSubmit ||
    (Boolean(existing) && existing?.kind !== 'violation' && existing?.kind !== 'study');
  const allowViolationMode = canRecordViolation || existing?.kind === 'violation';

  const initialMode: RecordMode = existing
    ? existing.kind === 'violation' || existing.points < 0
      ? 'violation'
      : existing.kind === 'study'
        ? 'study'
        : 'bonus'
    : mode === 'study' && allowStudyMode
      ? 'study'
      : mode === 'violation' && allowViolationMode
        ? 'violation'
        : mode === 'bonus' && allowBonusMode
          ? 'bonus'
          : isSubjectTeacher && allowStudyMode
            ? 'study'
            : isDisciplineVPOnly
              ? 'violation'
              : allowBonusMode
                ? 'bonus'
                : allowStudyMode
                  ? 'study'
                  : 'violation';

  const [recordMode, setRecordMode] = useState<RecordMode>(initialMode);
  const isViolationMode = recordMode === 'violation';
  const isStudyMode = recordMode === 'study';
  const isGroupLeaderOnly = isStudyMode ? isGroupScopedStudy : isGroupScopedBonus;

  const studyCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordStudy ? studyTargetStudents : []),
    [canRecordStudy, studyTargetStudents],
  );

  const bonusCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordBonus ? bonusTargetStudents : []),
    [canRecordBonus, bonusTargetStudents],
  );

  const violationCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordViolation ? violationTargetStudents : []),
    [canRecordViolation, violationTargetStudents],
  );

  const activeCandidates = isViolationMode
    ? violationCandidates
    : isStudyMode
      ? studyCandidates
      : bonusCandidates;
  const isOfficerModeForTarget = isViolationMode
    ? canRecordViolation
    : isStudyMode
      ? canRecordStudy
      : canRecordBonus;
  const isGroupLeaderMissingGroup =
    !isTeacher &&
    !isClassMonitor &&
    isGroupLeader &&
    !currentStudent?.group?.trim() &&
    activeCandidates.length === 0;

  const readOnly = Boolean(
    existing &&
      !canEditClass &&
      (existing.status !== 'pending' || existing.studentId !== currentStudent?.id),
  );

  const defaultOwner =
    existing?.studentId ??
    (!isOfficerModeForTarget
      ? (currentStudent?.id ?? null)
      : isGroupLeaderMissingGroup
        ? null
        : studentId && activeCandidates.some((s) => s.id === studentId)
          ? studentId
          : activeCandidates[0]?.id ?? null);

  const initialSubject =
    existing?.subject?.trim() ||
    paramSubject?.trim() ||
    (isSubjectTeacher && subjectName?.trim()) ||
    inferredStudySubjects[0] ||
    STUDY_SUBJECT_PRESETS[0];

  const [owner, setOwner] = useState<string | null>(defaultOwner);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState<string>('all');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(
    existing?.kind ??
      (initialMode === 'violation'
        ? 'violation'
        : initialMode === 'study'
          ? 'study'
          : 'achievement'),
  );
  const [category, setCategory] = useState<EntryCategory>(
    existing?.category ??
      (initialMode === 'violation'
        ? 'other'
        : initialMode === 'study'
          ? 'study'
          : 'academic'),
  );
  const [studySubject, setStudySubject] = useState<string>(initialSubject);
  const [customStudySubject, setCustomStudySubject] = useState<string>(
    existing?.subject && !(STUDY_SUBJECT_PRESETS as readonly string[]).includes(existing.subject)
      ? existing.subject
      : '',
  );
  const [speechCount, setSpeechCount] = useState<number>(
    existing?.kind === 'study' ? Math.max(1, Math.round(existing.speechCount ?? 1)) : 1,
  );
  const [level, setLevel] = useState<EntryLevel>(
    existing?.level ??
      (initialMode === 'violation' || initialMode === 'study' || isGroupLeaderOnly
        ? 'class'
        : 'school'),
  );
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [points, setPoints] = useState(
    String(
      existing?.points ??
        (initialMode === 'violation'
          ? -5
          : initialMode === 'study'
            ? 2
            : isGroupLeaderOnly
              ? 5
              : suggestedPoints('school')),
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

  const effectiveStudySubject = customStudySubject.trim() || studySubject;

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

  const availableModes = useMemo<{ key: RecordMode; label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'accent' | 'danger' }[]>(() => {
    const list: { key: RecordMode; label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'accent' | 'danger' }[] = [];
    if (allowStudyMode) {
      list.push({ key: 'study', label: 'Học tập · Phát biểu', icon: 'book', tone: 'success' });
    }
    if (allowBonusMode) {
      list.push({ key: 'bonus', label: 'Thành tích / HĐ', icon: 'trophy', tone: 'accent' });
    }
    if (allowViolationMode) {
      list.push({ key: 'violation', label: 'Vi phạm', icon: 'alert-circle', tone: 'danger' });
    }
    return list;
  }, [allowStudyMode, allowBonusMode, allowViolationMode]);

  const switchRecordMode = (next: RecordMode) => {
    if (existing || next === recordMode) return;
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
    } else if (next === 'study') {
      setKind('study');
      setCategory('study');
      setLevel('class');
      setPoints(String(Math.max(1, speechCount) * 2));
      if (canRecordStudy) {
        if (!studyCandidates.some((s) => s.id === owner)) {
          setOwner(studyCandidates[0]?.id ?? null);
        }
      } else {
        setOwner(currentStudent?.id ?? null);
      }
    } else {
      setKind((prev) => (prev === 'violation' || prev === 'study' ? 'achievement' : prev));
      setCategory((prev) => (prev === 'study' || prev === 'other' ? 'academic' : prev));
      const n = Number.parseInt(points, 10);
      setPoints(String(Number.isFinite(n) && n > 0 ? n : suggestedPoints('school')));
      if (canRecordBonus) {
        if (!bonusCandidates.some((s) => s.id === owner)) {
          setOwner(bonusCandidates[0]?.id ?? null);
        }
      } else {
        setOwner(currentStudent?.id ?? null);
      }
    }
  };

  const changeSpeechCount = (nextCount: number) => {
    const safe = Math.max(1, Math.min(20, nextCount));
    setSpeechCount(safe);
    if (!existing) {
      setPoints(String(safe * 2));
    }
  };

  const changeLevel = (next: EntryLevel) => {
    setLevel(next);
    if (!existing && !isViolationMode && !isStudyMode) setPoints(String(suggestedPoints(next)));
  };

  const applyTemplate = (tpl: EntryTemplate) => {
    setTitle(tpl.title);
    setKind(tpl.kind);
    setCategory(tpl.category === 'study' ? 'academic' : tpl.category);
    setLevel(tpl.level);
    setPoints(String(tpl.points));
    setError(null);
  };

  const applyAcademicPreset = (preset: (typeof ACADEMIC_ACHIEVEMENT_PRESETS)[number]) => {
    setTitle(preset.title);
    setKind('achievement');
    setCategory('academic');
    setLevel(preset.level);
    setPoints(String(preset.points));
    setError(null);
  };

  const applyStudyPreset = (preset: (typeof STUDY_SPEECH_PRESETS)[number]) => {
    setTitle(`${preset.title} — Môn ${effectiveStudySubject}`);
    setKind('study');
    setCategory('study');
    setLevel('class');
    setSpeechCount(preset.speechCount);
    setPoints(String(preset.points));
    setError(null);
  };

  const applyBonusPreset = (preset: (typeof GROUP_BONUS_PRESETS)[number]) => {
    setTitle(preset.title);
    setKind(preset.kind === 'study' ? 'activity' : preset.kind);
    setCategory(preset.category === 'study' ? 'academic' : preset.category);
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
        !isOfficerModeForTarget
          ? 'Tài khoản của bạn chưa được GVCN liên kết với hồ sơ học sinh trong danh sách lớp.'
          : 'Hãy chọn học sinh',
      );
      return;
    }
    if (isStudyMode && !effectiveStudySubject.trim()) {
      setError('Hãy chọn hoặc nhập tên môn học phát biểu');
      return;
    }

    const effectiveTitle =
      title.trim() ||
      (isStudyMode
        ? `Phát biểu môn ${effectiveStudySubject.trim()} (${speechCount} lượt)`
        : '');

    if (!effectiveTitle) {
      setError(
        isViolationMode
          ? 'Hãy nhập nội dung vi phạm / nhắc nhở'
          : 'Hãy nhập tên thành tích / hoạt động',
      );
      return;
    }

    if (isViolationMode && !canRecordViolationForStudent(selectedTarget ?? { id: owner })) {
      setError('Bạn không có quyền ghi nhận vi phạm cho học sinh này.');
      return;
    }
    if (
      isStudyMode &&
      owner !== currentStudent?.id &&
      !canRecordStudyForStudent(selectedTarget ?? { id: owner })
    ) {
      setError('Bạn không có quyền ghi nhận phát biểu cho học sinh này.');
      return;
    }
    if (
      !isViolationMode &&
      !isStudyMode &&
      isOfficerModeForTarget &&
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
      : isStudyMode
        ? 'study'
        : kind === 'violation' || kind === 'study'
          ? 'achievement'
          : kind;
    const finalCategory: EntryCategory = isStudyMode ? 'study' : category;

    const data = {
      studentId: owner,
      title: effectiveTitle,
      kind: finalKind,
      category: finalCategory,
      level: isStudyMode ? ('class' as EntryLevel) : level,
      date,
      description,
      proofUrl,
      points: finalPoints,
      subject: isStudyMode ? effectiveStudySubject.trim() : null,
      speechCount: isStudyMode ? Math.max(1, Math.round(speechCount)) : undefined,
    };

    try {
      if (existing) {
        updateEntry(existing.id, data);
        if (canEditClass && reviewNote !== (existing.reviewNote ?? '')) {
          setEntryStatus(existing.id, existing.status, reviewNote.trim() || null);
        }
        showToast('Đã cập nhật ghi nhận!');
      } else {
        await addEntry({
          ...data,
          submittedBy: isOfficerModeForTarget ? 'teacher' : role,
        });
        decor.recordMissionProgress('submit_entry', 1);
        if (isViolationMode) {
          showToast(
            `Đã ghi nhận vi phạm (${finalPoints}đ) cho ${selectedTarget?.name ?? 'học sinh'}!`,
            'warning',
          );
        } else if (isStudyMode) {
          showToast(
            isOfficerModeForTarget
              ? `Đã ghi ${speechCount} lượt phát biểu môn ${effectiveStudySubject} (+${finalPoints}đ) cho ${selectedTarget?.name ?? 'học sinh'}! 📚`
              : `Đã gửi ${speechCount} lượt phát biểu môn ${effectiveStudySubject} lên chờ GVCN duyệt!`,
          );
        } else if (isOfficerModeForTarget) {
          showToast(
            `Đã ghi thành tích / điểm cộng (+${finalPoints}đ) cho ${selectedTarget?.name ?? 'học sinh'}! ⚡`,
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

  const authorityTitle = !isOfficerModeForTarget
    ? null
    : isStudyMode
      ? isGroupLeaderOnly
        ? `Quyền ${officerPositionLabel || 'Tổ trưởng'} · Ghi phát biểu thành viên ${currentStudent?.group || 'trong Tổ'}`
        : `Quyền ${isTeacher ? 'GVCN' : isSubjectTeacher ? `GV ${subjectName ?? 'Bộ môn'}` : officerPositionLabel || 'Ban cán sự'} · Ghi nhận phát biểu theo môn`
      : isViolationMode
        ? `Quyền ${isTeacher ? 'GVCN' : officerPositionLabel || 'Lớp phó kỷ luật'} · Ghi nhận học sinh vi phạm`
        : isGroupLeaderOnly
          ? `Quyền ${officerPositionLabel || 'Tổ trưởng'} · Ghi điểm cộng thành viên ${currentStudent?.group || 'trong Tổ'}`
          : `Quyền ${isTeacher ? 'GVCN' : officerPositionLabel || 'Lớp trưởng'} · Điều phối & Ghi nhận toàn lớp`;

  const headerTitle = readOnly
    ? 'Chi tiết mục'
    : existing
      ? 'Sửa ghi nhận'
      : isStudyMode
        ? 'Ghi phát biểu theo môn'
        : isViolationMode
          ? 'Ghi học sinh vi phạm'
          : isGroupLeaderOnly
            ? 'Ghi điểm cộng Tổ'
            : 'Ghi Thành tích & Hoạt động';

  const headerSubtitle = readOnly
    ? 'Chỉ xem — mục đã được xét duyệt'
    : !isOfficerModeForTarget
      ? 'Sẽ gửi lên chờ GVCN duyệt'
      : isStudyMode
        ? 'Cập nhật ngay vào thống kê Tuần & Cộng dồn Học kỳ I'
        : isViolationMode
          ? 'Trừ điểm thi đua trực tiếp & lưu người ghi nhận'
          : 'Tách riêng với Học tập · Hỗ trợ Thành tích Học thuật';

  const bonusKinds = ENTRY_KIND_LIST.filter((k) => k !== 'violation' && k !== 'study');
  const displayCategoryList = isViolationMode
    ? ENTRY_CATEGORY_LIST
    : ACHIEVEMENT_CATEGORY_LIST;

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
                  borderColor: isViolationMode
                    ? theme.danger
                    : isStudyMode
                      ? theme.success
                      : theme.accent,
                  backgroundColor: isViolationMode
                    ? theme.dangerSoft
                    : isStudyMode
                      ? theme.successSoft
                      : theme.accentSoft,
                },
              ]}>
              <Ionicons
                name={
                  isViolationMode
                    ? 'alert-circle'
                    : isStudyMode
                      ? 'book'
                      : isGroupLeaderOnly
                        ? 'people-circle'
                        : 'shield-checkmark'
                }
                size={20}
                color={
                  isViolationMode ? theme.danger : isStudyMode ? theme.success : theme.accent
                }
              />
              <View style={styles.flex}>
                <Text
                  style={[
                    styles.roleBannerTitle,
                    {
                      color: isViolationMode
                        ? theme.danger
                        : isStudyMode
                          ? theme.success
                          : theme.accentText,
                    },
                  ]}>
                  {authorityTitle}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
                  {isStudyMode
                    ? 'Tách riêng Học tập (phát biểu theo từng môn) để tự động thống kê theo Tuần và cộng dồn cuối Học kỳ I.'
                    : isGroupLeaderOnly
                      ? 'Tổ trưởng chỉ chọn được học sinh trong đúng Tổ của mình và ghi điểm cộng trên lớp.'
                      : isDisciplineVPOnly
                        ? 'Lớp phó kỷ luật chọn học sinh vi phạm trong toàn lớp và ghi điểm trừ kỷ luật.'
                        : 'Ghi nhận được duyệt tự động, đồng bộ ngay và gắn tên người ghi nhận rõ ràng.'}
                </Text>
              </View>
            </Card>
          ) : null}

          {/* Mode Toggle Bar (Học tập · Phát biểu | Thành tích / HĐ | Vi phạm) */}
          {availableModes.length > 1 && !existing ? (
            <View style={[styles.modeBar, { backgroundColor: theme.backgroundElement }]}>
              {availableModes.map((m) => {
                const active = recordMode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => switchRecordMode(m.key)}
                    style={[
                      styles.modeBtn,
                      active && { backgroundColor: theme[m.tone] },
                    ]}>
                    <Ionicons
                      name={m.icon}
                      size={15}
                      color={active ? '#FFFFFF' : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeBtnText,
                        { color: active ? '#FFFFFF' : theme.textSecondary },
                      ]}
                      numberOfLines={1}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Study Mode Specific Controls: Subject Picker + Speech Count Stepper + Presets */}
          {isStudyMode ? (
            <Card style={styles.studentPickerCard}>
              <View style={styles.studentPickerHead}>
                <Text style={[styles.presetLabel, { color: theme.success }]}>
                  Môn học phát biểu
                </Text>
                <Badge
                  label={`Môn: ${effectiveStudySubject}`}
                  color={'success'}
                  soft={'successSoft'}
                  icon={'book'}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}>
                {STUDY_SUBJECT_PRESETS.map((sub) => (
                  <Chip
                    key={sub}
                    label={sub}
                    selected={!customStudySubject.trim() && studySubject === sub}
                    onPress={() => {
                      setStudySubject(sub);
                      setCustomStudySubject('');
                    }}
                  />
                ))}
              </ScrollView>
              <TextField
                icon={'create-outline'}
                placeholder={'Hoặc nhập môn / chuyên đề khác (tuỳ chọn)...'}
                value={customStudySubject}
                onChangeText={setCustomStudySubject}
                clearable
              />

              {/* Speech Count Stepper */}
              <View style={styles.stepperWrap}>
                <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                  Số lượt phát biểu
                </Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => changeSpeechCount(speechCount - 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Giảm số lượt phát biểu"
                    style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="remove" size={18} color={theme.text} />
                  </Pressable>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => changeSpeechCount(n)}
                      style={[
                        styles.stepPill,
                        {
                          backgroundColor:
                            speechCount === n ? theme.success : theme.backgroundElement,
                          borderColor: speechCount === n ? theme.success : theme.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.stepPillText,
                          { color: speechCount === n ? '#FFFFFF' : theme.text },
                        ]}>
                        {n === 5 && speechCount > 5 ? `${speechCount}` : `${n}`}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => changeSpeechCount(speechCount + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Tăng số lượt phát biểu"
                    style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="add" size={18} color={theme.text} />
                  </Pressable>
                </View>
              </View>

              {!existing ? (
                <View style={styles.presetWrap}>
                  <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                    Chọn nhanh mẫu phát biểu
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.presetRow}>
                    {STUDY_SPEECH_PRESETS.map((preset) => (
                      <Pressable
                        key={preset.title}
                        onPress={() => applyStudyPreset(preset)}
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
                  </ScrollView>
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* Quick Presets for Violation or Bonus/Academic Achievement */}
          {!existing && !isStudyMode ? (
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
                  {category === 'academic'
                    ? '🎓 Chọn nhanh mẫu Thành tích Học thuật'
                    : isGroupLeaderOnly
                      ? 'Chọn nhanh điểm cộng trên lớp cho thành viên Tổ'
                      : 'Chọn nhanh mẫu thành tích / hoạt động'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}>
                  {category === 'academic'
                    ? ACADEMIC_ACHIEVEMENT_PRESETS.map((preset) => (
                        <Pressable
                          key={preset.title}
                          onPress={() => applyAcademicPreset(preset)}
                          style={({ pressed }) => [
                            styles.presetChip,
                            { backgroundColor: theme.goldSoft, borderColor: theme.gold },
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.presetText, { color: theme.gold }]}>
                            {`${preset.title} (+${preset.points}đ)`}
                          </Text>
                        </Pressable>
                      ))
                    : null}
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

          {/* Officer / Teacher Student Picker */}
          {isOfficerModeForTarget ? (
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
                    color={isViolationMode ? 'danger' : isStudyMode ? 'success' : 'accentText'}
                    soft={
                      isViolationMode ? 'dangerSoft' : isStudyMode ? 'successSoft' : 'accentSoft'
                    }
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
                  Bạn chưa được GVCN phân vào Tổ nên chưa thể ghi điểm cho thành viên Tổ. Hãy báo
                  GVCN cập nhật Tổ cho hồ sơ của bạn.
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

          {/* Entry Kind */}
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
          ) : isStudyMode ? (
            <View style={styles.lockedKindRow}>
              <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>Phân loại</Text>
              <Badge
                label={`Học tập · Phát biểu (${speechCount} lượt)`}
                color={'success'}
                soft={'successSoft'}
                icon={'book'}
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
              value={kind === 'violation' || kind === 'study' ? 'achievement' : kind}
              onChange={setKind}
            />
          )}

          <TextField
            label={
              isStudyMode
                ? 'Nội dung phát biểu (để trống sẽ tự điền theo môn & số lượt)'
                : isViolationMode
                  ? 'Nội dung vi phạm / nhắc nhở'
                  : isGroupLeaderOnly
                    ? 'Nội dung điểm cộng trên lớp'
                    : 'Tên thành tích / hoạt động'
            }
            icon={
              isStudyMode
                ? 'book-outline'
                : isViolationMode
                  ? 'alert-circle-outline'
                  : 'trophy-outline'
            }
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder={
              isStudyMode
                ? `VD: Phát biểu xây dựng bài môn ${effectiveStudySubject}`
                : isViolationMode
                  ? 'Ví dụ: Đi học muộn, nói chuyện riêng trong giờ...'
                  : category === 'academic'
                    ? 'Ví dụ: Giải Nhất HSG Toán cấp Trường / IELTS 7.5'
                    : 'Ví dụ: Tham gia thiện nguyện / CLB văn nghệ'
            }
            error={error}
          />

          {/* Category picker (hidden for Study mode since category is locked to 'study') */}
          {!isStudyMode ? (
            <OptionPicker
              label={
                isViolationMode ? 'Lĩnh vực' : 'Lĩnh vực Thành tích (có Thành tích Học thuật)'
              }
              columns={3}
              options={displayCategoryList.map((c) => ({
                value: c,
                label: ENTRY_CATEGORIES[c].label,
                icon: ENTRY_CATEGORIES[c].icon,
              }))}
              value={displayCategoryList.includes(category) ? category : displayCategoryList[0]}
              onChange={setCategory}
            />
          ) : null}

          {!isViolationMode && !isStudyMode ? (
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
            label={
              isViolationMode
                ? 'Điểm trừ kỷ luật (số âm)'
                : isStudyMode
                  ? 'Điểm học tập (+)'
                  : 'Điểm thi đua (+)'
            }
            icon={isViolationMode ? 'remove-circle-outline' : 'ribbon-outline'}
            value={points}
            onChangeText={setPoints}
            keyboardType={isViolationMode ? 'numbers-and-punctuation' : 'number-pad'}
            hint={
              isViolationMode
                ? 'Tự động lưu dưới dạng điểm trừ (ví dụ -5đ) và hiển thị rõ trên nhật ký lớp.'
                : isStudyMode
                  ? 'Mặc định +2đ mỗi lượt phát biểu, cộng dồn vào thống kê Tuần & Học kỳ I.'
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
                  : isStudyMode
                    ? isOfficerModeForTarget
                      ? `Lưu ${speechCount} lượt phát biểu ngay`
                      : 'Gửi lượt phát biểu lên GVCN'
                    : isViolationMode
                      ? 'Ghi nhận vi phạm'
                      : isOfficerModeForTarget
                        ? 'Lưu thành tích / điểm cộng'
                        : 'Gửi lên'
              }
              variant={isViolationMode ? 'danger' : 'primary'}
              icon={
                isViolationMode ? 'alert-circle' : isStudyMode ? 'book' : 'checkmark-circle'
              }
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
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
  },
  modeBtnText: { fontSize: 11.5, fontWeight: '900' },
  studentPickerCard: { gap: Spacing.two + 2 },
  studentPickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  stepperWrap: { gap: Spacing.one + 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPill: {
    flex: 1,
    height: 38,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPillText: { fontSize: 14, fontWeight: '900' },
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
