/**
 * Study Vault & Exam Prep Resources Hub (Kho Tài liệu & Đề cương Lớp 10T4).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
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
import { Radius, Shadow, Spacing } from '@/constants/theme';
import {
  RESOURCE_SUBJECT_PRESETS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LIST,
} from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import {
  DRIVE_CONFIG,
  extractDriveFileIdFromUrl,
  formatBytes,
  getLocalPreviewUri,
} from '@/lib/drive';
import { saveUploadedFilesToGallery } from '@/lib/drive-gallery';
import { shareOrCopyText } from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { ClassResource, ResourceType } from '@/types/models';

function inferResourceType(file: UploadedDriveFile): ResourceType {
  if (file.kind === 'video') return 'video';
  const lower = file.name.toLowerCase();
  if (/\.(ppt|pptx|key)$/i.test(lower)) return 'slide';
  if (/(bai.?tap|de.?thi|kiem.?tra|exercise)/i.test(lower)) return 'exercise';
  if (/\.(pdf|doc|docx|xls|xlsx|txt|md)$/i.test(lower)) return 'outline';
  return 'link';
}

export default function ResourcesScreen() {
  const auth = useAuth();
  const {
    classInfo,
    resources,
    savedResourceIds,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    currentStudentId,
    currentStudent,
    canEditClass,
    toggleResourceSaved,
    addResource,
    togglePinResource,
    removeResource,
    deleteUploadedFileEverywhere,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ResourceType>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  // Composer fields
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(RESOURCE_SUBJECT_PRESETS[0]);
  const [type, setType] = useState<ResourceType>('outline');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [pinned, setPinned] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<DriveAttachmentItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  const savedCount = useMemo(
    () => resources.filter((r) => Boolean(savedResourceIds[r.id])).length,
    [resources, savedResourceIds],
  );
  const pinnedCount = useMemo(() => resources.filter((r) => r.pinned).length, [resources]);

  const subjects = useMemo(() => {
    const set = new Set<string>(RESOURCE_SUBJECT_PRESETS);
    for (const r of resources) {
      if (r.subject.trim()) set.add(r.subject.trim());
    }
    return ['all', 'saved', ...Array.from(set)];
  }, [resources]);

  const visible = useMemo(() => {
    const q = stripVietnamese(query);
    return resources.filter((item) => {
      const matchSub =
        subjectFilter === 'all'
          ? true
          : subjectFilter === 'saved'
            ? Boolean(savedResourceIds[item.id])
            : item.subject.trim() === subjectFilter;
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      const matchQ =
        !q ||
        stripVietnamese(`${item.title} ${item.subject} ${item.description ?? ''} ${item.author}`).includes(
          q,
        );
      return matchSub && matchType && matchQ;
    });
  }, [resources, subjectFilter, typeFilter, query, savedResourceIds]);

  const openUrl = (rawUrl: string) => {
    const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    Linking.openURL(target).catch(() => showToast('Không thể mở liên kết này', 'warning'));
  };

  const uploaderDisplayName =
    auth.profile?.displayName?.trim() ||
    (isTeacher
      ? classInfo.teacherName
      : isSubjectTeacher
        ? `GV ${subjectName ?? 'Bộ môn'}`
        : currentStudent?.name || 'Thành viên 10T4');

  const handleDriveSelectionStart = (pending: PendingUploadPreview[]) => {
    const first = pending[0];
    if (!first) return;
    if (!title.trim()) {
      setTitle(first.fileName.replace(/\.[^.]+$/, ''));
    }
    setUploadedPreview({
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

  const handleDriveItemUploaded = (first: UploadedDriveFile) => {
    setUrl(first.url);
    if (!title.trim()) {
      setTitle(first.name.replace(/\.[^.]+$/, ''));
    }
    setType(inferResourceType(first));
    if (!description.trim() && first.sizeBytes > 0) {
      setDescription(`Tệp lưu trên Google Drive ${DRIVE_CONFIG.folderName} (${formatBytes(first.sizeBytes)})`);
    }
    setUploadedPreview({
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
      caption: `${subject} · ${title.trim() || first.name}`,
      category: first.kind === 'photo' ? 'class_photo' : 'lecture',
    }).catch(() => {});
    showToast(`Đã tải "${first.name}" lên Google Drive ${DRIVE_CONFIG.folderName}! ⚡`);
  };

  const handleDriveItemFailed = (tempId: string) => {
    setUploadedPreview((prev) => (prev && prev.id === tempId && prev.pending ? null : prev));
  };

  const handleRemoveDraftUpload = () => {
    const target = uploadedPreview;
    setUploadedPreview(null);
    setUrl('');
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

  const canDeleteResource = (item: ClassResource): boolean => {
    if (canEditClass) return true;
    if (currentStudentId && item.ownerStudentId && item.ownerStudentId === currentStudentId) {
      return true;
    }
    const myNorm = uploaderDisplayName.trim().toLowerCase();
    return Boolean(myNorm) && item.author.trim().toLowerCase() === myNorm;
  };

  const handleDeleteResource = (item: ClassResource) => {
    if (confirmDeleteId !== item.id) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(item.id);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmDeleteId(null);
      }, 3_500);
      showToast('Bấm lại lần nữa để xoá tài liệu khỏi App, Drive & Excel', 'warning');
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmDeleteId(null);
    removeResource(item.id);
    showToast('Đã xoá tài liệu khỏi Kho lớp, Drive & Excel!', 'warning');
  };

  const handlePublish = async () => {
    if (uploadedPreview?.pending) {
      showToast('Đợi vài giây để tệp hoàn tất tải lên Drive nhé!', 'info');
      return;
    }
    if (!title.trim() || !url.trim()) {
      showToast('Hãy nhập tiêu đề và đường link tài liệu', 'warning');
      return;
    }
    try {
      await addResource({
        title,
        subject,
        type,
        url,
        description,
        pinned: canEditClass ? pinned : false,
      });
      decor.recordMissionProgress('save_resource', 2);
      setTitle('');
      setUrl('');
      setDescription('');
      setPinned(false);
      setUploadedPreview(null);
      setComposerOpen(false);
      showToast('Đã chia sẻ tài liệu vào Kho học tập 10T4! 📚');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể lưu tài liệu', 'danger');
    }
  };

  return (
    <Screen withTabBar={false} onRefresh={pullNow}>
      <PageHeader
        title={'Kho Tài liệu & Đề cương'}
        subtitle={`Thư viện học tập chung của lớp ${classInfo.name}`}
        rightIcon={composerOpen ? 'close' : 'add'}
        rightLabel={composerOpen ? 'Đóng' : 'Đóng góp'}
        onRightPress={() => setComposerOpen((v) => !v)}
      />

      {/* Vault Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.bubble} />
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>THƯ VIỆN SỐ 10T4</Text>
            <Text style={styles.heroTitle}>{`${resources.length} tài liệu học tập`}</Text>
            <Text style={styles.heroSub}>
              {`${pinnedCount} đề cương ghim quan trọng · ${savedCount} mục bạn đã lưu ⭐`}
            </Text>
            <Pressable
              onPress={() => router.push('/gallery' as never)}
              style={styles.heroDrivePill}>
              <Ionicons name="cloud-upload-outline" size={13} color="#FFFFFF" />
              <Text style={styles.heroDriveText}>
                {`Mở Kho Ảnh & File Drive ${DRIVE_CONFIG.folderName} →`}
              </Text>
            </Pressable>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="library" size={28} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Composer */}
      {composerOpen ? (
        <FadeIn index={0}>
          <Card style={styles.composer}>
            <Text style={[styles.compTitle, { color: theme.text }]}>Chia sẻ tài liệu mới 📚</Text>
            <TextField
              label={'Tiêu đề tài liệu'}
              placeholder={'Ví dụ: Đề cương ôn tập Giữa kỳ 1 môn Hóa'}
              value={title}
              onChangeText={setTitle}
            />
            <OptionPicker
              label={'Môn học'}
              layout={'row'}
              options={RESOURCE_SUBJECT_PRESETS.map((s) => ({ value: s, label: s }))}
              value={subject}
              onChange={setSubject}
            />
            <OptionPicker
              label={'Loại tài liệu'}
              columns={3}
              options={RESOURCE_TYPE_LIST.map((t) => ({
                value: t,
                label: RESOURCE_TYPES[t].label,
                icon: RESOURCE_TYPES[t].icon,
              }))}
              value={type}
              onChange={setType}
            />
            <TextField
              label={'Đường link (Google Drive, PDF, YouTube...)'}
              icon={'link-outline'}
              placeholder={'https://drive.google.com/... hoặc tải file trực tiếp bên dưới'}
              value={url}
              onChangeText={(val) => {
                setUrl(val);
                if (uploadedPreview && val.trim() !== uploadedPreview.url) {
                  setUploadedPreview(null);
                }
              }}
              autoCapitalize={'none'}
            />
            <DriveUploadButton
              mode={'both'}
              compact
              multiple={false}
              mediaLabel={'Tải ảnh/video lên Drive'}
              fileLabel={`Tải file lên ${DRIVE_CONFIG.folderName}`}
              uploaderName={uploaderDisplayName}
              uploaderRole={memberRole}
              category={'lecture'}
              onSelectionStart={handleDriveSelectionStart}
              onItemUploaded={handleDriveItemUploaded}
              onItemFailed={handleDriveItemFailed}
            />
            {uploadedPreview ? (
              <DriveAttachmentList
                attachments={[uploadedPreview]}
                editable
                onRemove={handleRemoveDraftUpload}
              />
            ) : null}
            <TextField
              label={'Mô tả ngắn (tuỳ chọn)'}
              placeholder={'Nội dung chính, chương nào, lưu ý khi ôn tập...'}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            {canEditClass ? (
              <Pressable
                onPress={() => setPinned((v) => !v)}
                style={[styles.pinRow, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={18} color={theme.accent} />
                <Text style={[styles.pinText, { color: theme.text }]}>Ghim lên đầu kho tài liệu</Text>
                <Ionicons
                  name={pinned ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={pinned ? theme.accent : theme.textMuted}
                />
              </Pressable>
            ) : null}
            <Button label={'Đăng tài liệu lên kho lớp'} icon={'cloud-upload'} onPress={handlePublish} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Search */}
      <FadeIn index={1}>
        <TextField
          icon={'search'}
          placeholder={'Tìm đề cương, tên môn, slide...'}
          value={query}
          onChangeText={setQuery}
        />
      </FadeIn>

      {/* Subject filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {subjects.map((sub) => (
          <Chip
            key={sub}
            label={
              sub === 'all' ? 'Tất cả môn' : sub === 'saved' ? `Đã lưu (${savedCount})` : sub
            }
            icon={sub === 'saved' ? 'star' : undefined}
            selected={subjectFilter === sub}
            onPress={() => setSubjectFilter(sub)}
          />
        ))}
      </ScrollView>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={'Mọi định dạng'} selected={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
        {RESOURCE_TYPE_LIST.map((t) => (
          <Chip
            key={t}
            label={RESOURCE_TYPES[t].label}
            icon={RESOURCE_TYPES[t].icon}
            selected={typeFilter === t}
            onPress={() => setTypeFilter(t)}
          />
        ))}
      </ScrollView>

      {/* Resource List */}
      {visible.length === 0 ? (
        <EmptyState
          icon={'folder-open-outline'}
          title={'Chưa có tài liệu phù hợp'}
          message={'Thử bỏ bộ lọc hoặc bấm "Đóng góp" để chia sẻ đề cương hay cho cả lớp.'}
        />
      ) : (
        visible.map((item, idx) => {
          const meta = RESOURCE_TYPES[item.type] ?? RESOURCE_TYPES.link;
          const saved = Boolean(savedResourceIds[item.id]);

          return (
            <FadeIn key={item.id} index={Math.min(idx + 2, 8)}>
              <Card
                style={[
                  styles.resCard,
                  item.pinned && { borderColor: theme.accent, borderWidth: 1.5 },
                ]}>
                <View style={styles.resHead}>
                  <View style={[styles.typeIcon, { backgroundColor: theme[meta.soft] }]}>
                    <Ionicons name={meta.icon} size={20} color={theme[meta.color]} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.resTitle, { color: theme.text }]}>{item.title}</Text>
                    <View style={styles.badgeRow}>
                      <Badge label={item.subject} color={'purple'} soft={'purpleSoft'} />
                      <Badge label={meta.label} color={meta.color} soft={meta.soft} />
                      {item.pinned ? (
                        <Badge label={'Ghim'} color={'gold'} soft={'goldSoft'} icon={'pin'} />
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      toggleResourceSaved(item.id);
                      if (!saved) decor.recordMissionProgress('save_resource', 1);
                      showToast(saved ? 'Đã bỏ lưu tài liệu' : 'Đã lưu vào mục Yêu thích ⭐', 'info');
                    }}
                    hitSlop={8}>
                    <Ionicons
                      name={saved ? 'star' : 'star-outline'}
                      size={22}
                      color={saved ? theme.gold : theme.textMuted}
                    />
                  </Pressable>
                </View>

                {item.description ? (
                  <Text style={[styles.resDesc, { color: theme.textSecondary }]}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={[styles.resFooter, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 11, flex: 1 }} numberOfLines={1}>
                    {'Chia sẻ bởi ' + item.author}
                  </Text>
                  <View style={styles.footerBtns}>
                    <Pressable
                      onPress={async () => {
                        const res = await shareOrCopyText(item.url, item.title);
                        showToast(res === 'copied' ? 'Đã sao chép đường link!' : 'Đã mở chia sẻ!');
                      }}
                      style={[styles.miniBtn, { backgroundColor: theme.backgroundElement }]}>
                      <Ionicons name="copy-outline" size={14} color={theme.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => openUrl(item.url)}
                      style={[styles.openBtn, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="open-outline" size={14} color={theme.accentText} />
                      <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
                        Mở ngay
                      </Text>
                    </Pressable>
                    {canEditClass ? (
                      <Pressable
                        onPress={() => togglePinResource(item.id)}
                        style={[styles.miniBtn, { backgroundColor: theme.backgroundElement }]}>
                        <Ionicons
                          name={item.pinned ? 'pin' : 'pin-outline'}
                          size={14}
                          color={item.pinned ? theme.accent : theme.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                    {canDeleteResource(item) ? (
                      <Pressable
                        onPress={() => handleDeleteResource(item)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          confirmDeleteId === item.id
                            ? `Xác nhận xoá ${item.title}`
                            : `Xoá ${item.title}`
                        }
                        style={[
                          confirmDeleteId === item.id
                            ? [styles.confirmDeleteBtn, { backgroundColor: theme.danger }]
                            : [styles.miniBtn, { backgroundColor: theme.dangerSoft }],
                        ]}>
                        <Ionicons
                          name={confirmDeleteId === item.id ? 'trash' : 'trash-outline'}
                          size={14}
                          color={confirmDeleteId === item.id ? '#FFFFFF' : theme.danger}
                        />
                        {confirmDeleteId === item.id ? (
                          <Text style={styles.confirmDeleteText}>Xoá?</Text>
                        ) : null}
                      </Pressable>
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
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -70,
    right: -40,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 3 },
  heroDrivePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
  },
  heroDriveText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: { gap: Spacing.two + 2 },
  compTitle: { fontSize: 16, fontWeight: '900' },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  pinText: { flex: 1, fontSize: 13, fontWeight: '700' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  resCard: { gap: Spacing.two + 2 },
  resHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  typeIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  resTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  resDesc: { fontSize: 13, lineHeight: 19 },
  resFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: Radius.pill,
  },
  confirmDeleteText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
});
