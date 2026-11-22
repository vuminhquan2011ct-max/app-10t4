import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
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
import { suggestedPoints } from '@/lib/stats';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { EntryCategory, EntryKind, EntryLevel } from '@/types/models';

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
  // Generic Drive `/file/d/.../view` links attached as entry proofs are usually photos
  // unless gallery metadata identifies them as video/document.
  return extractDriveFileId(trimmed) ? 'photo' : 'document';
}

export default function EntryFormScreen() {
  const { id, studentId } = useLocalSearchParams<{ id?: string; studentId?: string }>();
  const auth = useAuth();
  const {
    getEntry,
    addEntry,
    updateEntry,
    removeEntry,
    clearEntryProof,
    deleteUploadedFileEverywhere,
    setEntryStatus,
    students,
    classInfo,
    role,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    canEditClass,
    currentStudent,
  } = useClassStore();
  const theme = useTheme();
  const decor = useDecor();
  const { showToast } = useToast();
  const existing = id ? getEntry(id) : undefined;
  const isStudent = !canEditClass;
  const readOnly = Boolean(
    existing && isStudent && (existing.status !== 'pending' || existing.studentId !== currentStudent?.id),
  );

  const [owner, setOwner] = useState<string | null>(
    existing?.studentId ?? (isStudent ? (currentStudent?.id ?? null) : (studentId ?? students[0]?.id ?? null)),
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(existing?.kind ?? 'achievement');
  const [category, setCategory] = useState<EntryCategory>(existing?.category ?? 'study');
  const [level, setLevel] = useState<EntryLevel>(existing?.level ?? 'school');
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [points, setPoints] = useState(String(existing?.points ?? suggestedPoints('school')));
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

  const proofDriveId = extractDriveFileId(proofUrl);
  const inMemoryProofItem =
    proofDriveId && !uploadedProof
      ? getMemoryDriveMediaItems().find((item) => item.driveFileId === proofDriveId) ?? null
      : null;

  // Resolve exact file name & media kind asynchronously from AsyncStorage cache if not in memory yet.
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
    // Non-blocking mirror to shared Gallery + Realtime Broadcast
    void saveUploadedFilesToGallery([first], {
      uploaderName: uploaderDisplayName,
      uploaderRole: memberRole,
      uploaderSubject: isSubjectTeacher ? subjectName : null,
      caption: title.trim() ? `Minh chứng: ${title.trim()}` : `Minh chứng thành tích (${first.name})`,
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

  const changeLevel = (next: EntryLevel) => {
    setLevel(next);
    if (!existing) setPoints(String(suggestedPoints(next)));
  };

  const applyTemplate = (tpl: EntryTemplate) => {
    setTitle(tpl.title);
    setKind(tpl.kind);
    setCategory(tpl.category);
    setLevel(tpl.level);
    setPoints(String(tpl.points));
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
        isStudent
          ? 'Tài khoản của bạn chưa được GVCN liên kết với hồ sơ học sinh trong danh sách lớp.'
          : 'Hãy chọn học sinh',
      );
      return;
    }
    if (!title.trim()) {
      setError('Hãy nhập tên thành tích / hoạt động');
      return;
    }
    const numeric = Number.parseInt(points, 10);
    const data = {
      studentId: owner,
      title,
      kind,
      category,
      level,
      date,
      description,
      proofUrl,
      points: Number.isFinite(numeric) ? numeric : 0,
    };
    try {
      if (existing) {
        updateEntry(existing.id, data);
        if (canEditClass && reviewNote !== (existing.reviewNote ?? '')) {
          setEntryStatus(existing.id, existing.status, reviewNote.trim() || null);
        }
        showToast('Đã cập nhật thành tích!');
      } else {
        await addEntry({ ...data, submittedBy: role });
        decor.recordMissionProgress('submit_entry', 1);
        showToast(isStudent ? 'Đã gửi lên chờ GVCN duyệt!' : 'Đã ghi thành tích mới!');
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu thành tích');
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
    showToast('Đã xóa mục thành tích', 'warning');
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={readOnly ? 'Chi tiết mục' : existing ? 'Sửa mục' : 'Ghi thành tích'}
        subtitle={
          readOnly
            ? 'Chỉ xem — mục đã được xét duyệt'
            : isStudent
              ? 'Sẽ chờ giáo viên duyệt'
              : 'Giáo viên ghi trực tiếp'
        }
        actionLabel={readOnly ? undefined : 'Lưu'}
        onAction={readOnly ? undefined : save}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {/* Quick Presets */}
          {!existing ? (
            <View style={styles.presetWrap}>
              <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                Chọn nhanh mẫu gợi ý
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}>
                {ENTRY_TEMPLATES.map((tpl) => (
                  <Pressable
                    key={tpl.label}
                    onPress={() => applyTemplate(tpl)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      { backgroundColor: theme.accentSoft, borderColor: theme.border },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.presetText, { color: theme.accentText }]}>{tpl.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {isStudent ? null : (
            <OptionPicker
              label={'Học sinh'}
              layout={'row'}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              value={owner}
              onChange={(v) => {
                setOwner(v);
                setError(null);
              }}
            />
          )}
          <OptionPicker
            label={'Loại'}
            options={ENTRY_KIND_LIST.map((k) => ({
              value: k,
              label: ENTRY_KINDS[k].label,
              icon: ENTRY_KINDS[k].icon,
            }))}
            value={kind}
            onChange={setKind}
          />
          <TextField
            label={'Tên thành tích / hoạt động'}
            icon={'trophy-outline'}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder={'Giải Nhất Olympic Toán cấp trường'}
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
          <OptionPicker
            label={'Cấp độ'}
            columns={3}
            options={ENTRY_LEVEL_LIST.map((l) => ({ value: l, label: ENTRY_LEVELS[l].label }))}
            value={level}
            onChange={changeLevel}
          />
          <DatePickerField label={'Ngày diễn ra'} value={date} onChange={setDate} />
          <TextField
            label={'Điểm thi đua'}
            icon={'ribbon-outline'}
            value={points}
            onChangeText={setPoints}
            keyboardType={'number-pad'}
            hint={'Gợi ý theo cấp độ, giáo viên có thể điều chỉnh khi duyệt.'}
          />
          <TextField
            label={'Mô tả'}
            icon={'document-text-outline'}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextField
            label={'Link minh chứng (Ảnh giấy khen / File Google Drive)'}
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
          {existing && role === 'teacher' ? (
            <TextField
              label={'Ghi chú duyệt của giáo viên'}
              icon={'chatbubble-ellipses-outline'}
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder={'Khen ngợi hoặc lý do điều chỉnh...'}
            />
          ) : null}

          {!readOnly ? (
            <Button label={existing ? 'Lưu thay đổi' : 'Gửi lên'} icon={'checkmark-circle'} onPress={save} />
          ) : null}
          {existing && !readOnly && (role === 'teacher' || existing.status === 'pending') ? (
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
