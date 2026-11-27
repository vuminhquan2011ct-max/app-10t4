import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DriveImage } from '@/components/ui/drive-attachment-list';
import {
  DriveUploadButton,
  type PendingUploadPreview,
  type UploadedDriveFile,
} from '@/components/ui/drive-upload-button';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useIsDark, useTheme } from '@/hooks/use-theme';
import { DRIVE_CONFIG, formatUploaderRoleLabel } from '@/lib/drive';
import {
  buildOptimisticDriveMediaItem,
  isSessionUploadedDriveFile,
  saveUploadedFilesToGallery,
  useDriveGallery,
  type DriveMediaItem,
  type SaveDriveMediaMeta,
} from '@/lib/drive-gallery';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';

const CONFIRM_RESET_MS = 3_500;
const TIMETABLE_TAG = '[TKB]';
const TIMETABLE_CAPTION = '[TKB] Thời khóa biểu lớp 10T4';

function formatShortTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMin = Math.floor((Date.now() - ts) / 60_000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin}p trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}g trước`;
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function isVeryRecent(iso: string): boolean {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 15 * 60_000;
}

function normalizeOwnerName(name?: string | null): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isTimetablePhoto(item: DriveMediaItem): boolean {
  if (item.itemType !== 'photo') return false;
  const caption = item.caption?.trim() ?? '';
  return caption.includes(TIMETABLE_TAG) || String(item.category) === 'timetable';
}

/**
 * Single Large Timetable Photo Board ("Bảng Thời Khóa Biểu Lớp 10T4") mounted on
 * the Overview (Tổng quan) tab.
 *
 * - Strictly 1 timetable image allowed at a time (`multiple={false}`, `accept="image/*"`).
 * - Displays the active timetable photo in a large, uncropped (`contentFit="contain"`,
 *   `w1600`) framed board for effortless reading, plus fullscreen zoom, Drive link,
 *   and 2-tap universal cascade delete (App + Supabase + Drive Trash + Excel/Sheets).
 * - Automatically removes any duplicate older `[TKB]` timetable photos if concurrent
 *   uploads ever happen so only 1 timetable photo exists across devices & Excel.
 */
export function LiveRecentPhotosStrip(): ReactElement | null {
  const auth = useAuth();
  const {
    classInfo,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    canEditClass,
    subjectName,
    currentStudent,
    deleteUploadedFileEverywhere,
  } = useClassStore();
  const theme = useTheme();
  const isDark = useIsDark();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const {
    items,
    loading,
    prependOptimistic,
    linkOptimisticDriveId,
    resolveOptimistic,
    failOptimistic,
  } = useDriveGallery();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const metaSnapshotsRef = useRef<Map<string, SaveDriveMediaMeta>>(new Map());
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<DriveMediaItem[]>(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  const uploaderName = useMemo(() => {
    const profileName = auth.profile?.displayName?.trim();
    if (profileName) return profileName;
    if (isTeacher) return classInfo.teacherName;
    if (isSubjectTeacher) return subjectName ? `GV ${subjectName}` : 'Giáo viên bộ môn';
    if (currentStudent?.name) return currentStudent.name;
    return 'Thành viên 10T4';
  }, [
    auth.profile?.displayName,
    isTeacher,
    classInfo.teacherName,
    isSubjectTeacher,
    subjectName,
    currentStudent?.name,
  ]);

  const timetableItems = useMemo(() => items.filter(isTimetablePhoto), [items]);
  const activeTimetablePhoto = timetableItems[0] ?? null;

  const canDeleteItem = useCallback(
    (item: DriveMediaItem): boolean => {
      if (item.pending) return false;
      if (canEditClass) return true;
      if (isSessionUploadedDriveFile(item.driveFileId)) return true;
      const myNorm = normalizeOwnerName(uploaderName);
      return Boolean(myNorm) && normalizeOwnerName(item.uploaderName) === myNorm;
    },
    [canEditClass, uploaderName],
  );

  const cleanupDuplicateTimetablePhotos = useCallback(
    (keepDriveFileId: string, keepRowId?: string) => {
      const olderDuplicates = itemsRef.current.filter((it) => {
        if (it.pending || !isTimetablePhoto(it)) return false;
        if (keepDriveFileId && it.driveFileId === keepDriveFileId) return false;
        if (keepRowId && it.id === keepRowId) return false;
        return true;
      });
      for (const dup of olderDuplicates) {
        void deleteUploadedFileEverywhere({
          id: dup.id,
          driveFileId: dup.driveFileId,
          fileUrl: dup.driveUrl || dup.imageUrl,
          fileName: dup.fileName,
        }).catch(() => {});
      }
    },
    [deleteUploadedFileEverywhere],
  );

  const handleDeleteTimetablePhoto = useCallback(
    async (item: DriveMediaItem) => {
      if (deletingId) return;
      if (confirmDeleteId !== item.id) {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        setConfirmDeleteId(item.id);
        confirmTimerRef.current = setTimeout(() => {
          confirmTimerRef.current = null;
          setConfirmDeleteId(null);
        }, CONFIRM_RESET_MS);
        showToast('Bấm lại lần nữa để xoá ảnh TKB khỏi App, Drive & Excel', 'warning');
        return;
      }

      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
      setConfirmDeleteId(null);
      setDeletingId(item.id);
      try {
        const res = await deleteUploadedFileEverywhere({
          id: item.id,
          driveFileId: item.driveFileId,
          fileUrl: item.driveUrl || item.imageUrl,
          fileName: item.fileName,
        });
        setPreviewOpen(false);
        showToast(
          res.trashedDrive || res.removedSheetRows > 0
            ? 'Đã xoá ảnh Thời khóa biểu khỏi App, Google Drive & Excel!'
            : 'Đã xoá ảnh Thời khóa biểu — bạn có thể đăng ảnh mới!',
          'info',
        );
      } finally {
        setDeletingId(null);
      }
    },
    [confirmDeleteId, deletingId, deleteUploadedFileEverywhere, showToast],
  );

  const handleSelectionStart = useCallback(
    (pending: PendingUploadPreview[]) => {
      const first = pending[0];
      if (!first) return;
      const meta: SaveDriveMediaMeta = {
        uploaderName,
        uploaderRole: memberRole,
        uploaderSubject: isSubjectTeacher ? subjectName : null,
        caption: TIMETABLE_CAPTION,
        category: 'class_photo',
      };
      metaSnapshotsRef.current.set(first.tempId, meta);
      const optItem = buildOptimisticDriveMediaItem({
        tempId: first.tempId,
        fileName: first.fileName,
        mimeType: first.mimeType,
        sizeBytes: first.sizeBytes,
        localUri: first.localUri,
        kind: 'image',
        uploaderName: meta.uploaderName,
        uploaderRole: meta.uploaderRole,
        uploaderSubject: meta.uploaderSubject,
        caption: meta.caption,
        category: meta.category,
      });
      prependOptimistic([optItem]);
    },
    [uploaderName, memberRole, isSubjectTeacher, subjectName, prependOptimistic],
  );

  const handleItemUploaded = useCallback(
    async (file: UploadedDriveFile, tempId: string) => {
      linkOptimisticDriveId(tempId, file.id);
      const meta = metaSnapshotsRef.current.get(tempId) ?? {
        uploaderName,
        uploaderRole: memberRole,
        uploaderSubject: isSubjectTeacher ? subjectName : null,
        caption: TIMETABLE_CAPTION,
        category: 'class_photo' as const,
      };
      metaSnapshotsRef.current.delete(tempId);

      try {
        const res = await saveUploadedFilesToGallery([file], meta);
        const saved = res.items[0];
        if (saved) {
          resolveOptimistic(tempId, saved);
          cleanupDuplicateTimetablePhotos(file.id, saved.id);
        } else {
          failOptimistic(tempId);
        }
      } catch {
        failOptimistic(tempId);
      }
    },
    [
      linkOptimisticDriveId,
      uploaderName,
      memberRole,
      isSubjectTeacher,
      subjectName,
      resolveOptimistic,
      failOptimistic,
      cleanupDuplicateTimetablePhotos,
    ],
  );

  const handleItemFailed = useCallback(
    (tempId: string, errMsg: string) => {
      metaSnapshotsRef.current.delete(tempId);
      failOptimistic(tempId);
      showToast(errMsg, 'danger');
    },
    [failOptimistic, showToast],
  );

  const handleBatchDone = useCallback(
    (files: UploadedDriveFile[]) => {
      const latest = files[0];
      if (!latest) return;
      cleanupDuplicateTimetablePhotos(latest.id);
      showToast('Đã đăng ảnh Thời khóa biểu mới lên bảng Tổng quan! 📅⚡', 'success');
    },
    [cleanupDuplicateTimetablePhotos, showToast],
  );

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => showToast('Không thể mở liên kết ảnh trên Drive', 'warning'));
  };

  const canDeleteActive = activeTimetablePhoto ? canDeleteItem(activeTimetablePhoto) : false;
  const isDeletingActive = Boolean(
    activeTimetablePhoto && deletingId === activeTimetablePhoto.id,
  );
  const isConfirmingActive = Boolean(
    activeTimetablePhoto && confirmDeleteId === activeTimetablePhoto.id,
  );
  const modalVisible =
    previewOpen && Boolean(activeTimetablePhoto && !activeTimetablePhoto.pending);
  const boardCanvasBg = isDark ? '#0B1120' : '#F8FAFC';

  return (
    <Card style={styles.card}>
      {/* Single Timetable Board Hero Header */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, Shadow.card, { shadowColor: gradient[0], shadowOpacity: 0.24 }]}>
        <View pointerEvents="none" style={styles.bannerOrbA} />
        <View pointerEvents="none" style={styles.bannerOrbB} />

        <View style={styles.bannerTop}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>
              {`BẢNG THỜI KHÓA BIỂU · ${activeTimetablePhoto ? '1/1 ẢNH' : '0/1 ẢNH'}`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/gallery' as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mở Kho ảnh và tài liệu lớp"
            style={({ pressed }) => [styles.seeAllPill, pressed && styles.pressed]}>
            <Text style={styles.seeAllPillText}>Kho lớp →</Text>
          </Pressable>
        </View>

        <View style={styles.bannerBody}>
          <View style={styles.bannerIconWell}>
            <Ionicons name="calendar" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              {`Bảng Thời Khóa Biểu Lớp ${classInfo.name}`}
            </Text>
            <Text style={styles.bannerSub} numberOfLines={2}>
              {activeTimetablePhoto
                ? 'Hiển thị trọn vẹn 1 ảnh TKB rõ nét — chạm vào bảng ảnh để phóng to xem chi tiết.'
                : 'Chỉ đăng duy nhất 1 bức ảnh Thời khóa biểu để cả lớp xem nhanh ngay tại Tổng quan.'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Main Big Single-Photo Board Frame */}
      {loading && !activeTimetablePhoto ? (
        <View
          style={[
            styles.emptyBoard,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Đang tải bảng Thời khóa biểu...
          </Text>
          <Text style={[styles.emptySub, { color: theme.textMuted }]}>
            {`Đồng bộ ảnh mới nhất từ Google Drive ${DRIVE_CONFIG.folderName}`}
          </Text>
        </View>
      ) : !activeTimetablePhoto ? (
        <View
          style={[
            styles.emptyBoard,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : theme.backgroundElement,
              borderColor: `${theme.accent}55`,
            },
          ]}>
          <View style={[styles.emptyIconCircle, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="calendar-outline" size={34} color={theme.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Chưa có ảnh Thời khóa biểu (0/1)
          </Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Chỉ đăng duy nhất 1 bức ảnh Thời khóa biểu để cả lớp xem nhanh, rõ nét ngay tại Tổng quan.
          </Text>
          <View style={styles.uploadBtnWrap}>
            <DriveUploadButton
              mode="media"
              multiple={false}
              accept="image/*"
              label="Đăng 1 ảnh Thời khóa biểu lên bảng"
              uploaderName={uploaderName}
              uploaderRole={memberRole}
              category="timetable"
              onSelectionStart={handleSelectionStart}
              onItemUploaded={handleItemUploaded}
              onItemFailed={handleItemFailed}
              onUploaded={handleBatchDone}
            />
          </View>
        </View>
      ) : (
        <View style={styles.activeBoardWrap}>
          {/* Big Uncropped Timetable Photo Frame */}
          <Pressable
            disabled={Boolean(activeTimetablePhoto.pending) || isDeletingActive}
            onPress={() => setPreviewOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Phóng to xem rõ ảnh Thời khóa biểu"
            style={({ pressed }) => [
              styles.boardFrame,
              {
                backgroundColor: boardCanvasBg,
                borderColor: activeTimetablePhoto.pending ? theme.accent : theme.border,
              },
              pressed && styles.pressed,
            ]}>
            <DriveImage
              driveFileId={activeTimetablePhoto.driveFileId}
              primaryUri={activeTimetablePhoto.imageUrl}
              localUri={activeTimetablePhoto.localPreviewUri}
              width={1600}
              contentFit="contain"
              style={styles.boardImage}
            />

            {activeTimetablePhoto.pending ? (
              <View pointerEvents="none" style={styles.pendingPill}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.pendingText}>Đang đồng bộ ảnh Thời khóa biểu...</Text>
              </View>
            ) : (
              <>
                <View pointerEvents="none" style={styles.topLeftBadge}>
                  {isVeryRecent(activeTimetablePhoto.createdAt) ? (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>MỚI CẬP NHẬT</Text>
                    </View>
                  ) : (
                    <View style={styles.slotPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#34D399" />
                      <Text style={styles.slotPillText}>1/1 ẢNH TKB</Text>
                    </View>
                  )}
                </View>

                <View pointerEvents="none" style={styles.zoomHintPill}>
                  <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
                  <Text style={styles.zoomHintText}>Chạm để phóng to</Text>
                </View>
              </>
            )}
          </Pressable>

          {/* Uploader Metadata Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              <Ionicons name="person-circle-outline" size={16} color={theme.accent} />
              <Text style={[styles.metaAuthor, { color: theme.text }]} numberOfLines={1}>
                {activeTimetablePhoto.uploaderName}
              </Text>
              <Text style={[styles.metaRole, { color: theme.textMuted }]} numberOfLines={1}>
                {`· ${formatUploaderRoleLabel(activeTimetablePhoto.uploaderRole, activeTimetablePhoto.uploaderSubject)}`}
              </Text>
            </View>
            <Badge
              label={
                activeTimetablePhoto.pending
                  ? 'Đang tải...'
                  : formatShortTime(activeTimetablePhoto.createdAt) || 'Đã lưu'
              }
              color={'accentText'}
              soft={'accentSoft'}
            />
          </View>

          {/* Strictly 1-Photo Lock Notice */}
          <View
            style={[
              styles.lockNotice,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <Ionicons name="lock-closed-outline" size={14} color={theme.accentText} />
            <Text style={[styles.lockNoticeText, { color: theme.textSecondary }]}>
              {canDeleteActive
                ? 'Đang hiển thị 1/1 ảnh Thời khóa biểu — muốn đổi ảnh mới hãy bấm “Xoá ảnh TKB” bên dưới.'
                : 'Đang hiển thị 1/1 ảnh Thời khóa biểu của lớp — liên hệ GVCN hoặc người đăng nếu cần thay ảnh mới.'}
            </Text>
          </View>

          {/* Action Bar: Zoom Fullscreen, Open Drive, Delete Timetable Photo */}
          {!activeTimetablePhoto.pending ? (
            <View style={styles.actionRow}>
              <Button
                label={'Phóng to xem rõ'}
                icon={'expand-outline'}
                size={'sm'}
                style={styles.flex}
                disabled={isDeletingActive}
                onPress={() => setPreviewOpen(true)}
              />
              <Button
                label={'Mở trên Drive'}
                variant={'soft'}
                icon={'open-outline'}
                size={'sm'}
                disabled={isDeletingActive}
                onPress={() => openLink(activeTimetablePhoto.driveUrl)}
              />
              {canDeleteActive ? (
                <Button
                  label={
                    isDeletingActive
                      ? 'Đang xoá...'
                      : isConfirmingActive
                        ? 'Xác nhận xoá?'
                        : 'Xoá ảnh TKB'
                  }
                  variant={'danger'}
                  icon={'trash-outline'}
                  size={'sm'}
                  disabled={isDeletingActive}
                  onPress={() => void handleDeleteTimetablePhoto(activeTimetablePhoto)}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {/* Fullscreen High-Clarity Timetable Viewer Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}>
        <View
          style={[
            styles.modalBackdrop,
            { backgroundColor: isDark ? 'rgba(2, 6, 23, 0.94)' : 'rgba(15, 23, 42, 0.88)' },
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewOpen(false)} />
          {activeTimetablePhoto ? (
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHead}>
                <View style={styles.flex}>
                  <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                    {`Thời khóa biểu lớp ${classInfo.name}`}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {`${activeTimetablePhoto.uploaderName} · ${formatUploaderRoleLabel(activeTimetablePhoto.uploaderRole, activeTimetablePhoto.uploaderSubject)}`}
                  </Text>
                </View>
                <Badge
                  label={formatShortTime(activeTimetablePhoto.createdAt) || '1/1 TKB'}
                  color={'accentText'}
                  soft={'accentSoft'}
                />
                <Pressable
                  onPress={() => setPreviewOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng chế độ toàn màn hình"
                  style={[styles.closeCircle, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="close" size={18} color={theme.text} />
                </Pressable>
              </View>

              <DriveImage
                driveFileId={activeTimetablePhoto.driveFileId}
                primaryUri={activeTimetablePhoto.imageUrl}
                localUri={activeTimetablePhoto.localPreviewUri}
                width={1600}
                contentFit="contain"
                style={[styles.modalImage, { backgroundColor: boardCanvasBg }]}
              />

              <View style={styles.modalActions}>
                <Button
                  label={'Mở trên Drive'}
                  icon={'open-outline'}
                  size={'sm'}
                  style={styles.flex}
                  disabled={isDeletingActive}
                  onPress={() => openLink(activeTimetablePhoto.driveUrl)}
                />
                {canDeleteActive ? (
                  <Button
                    label={
                      isDeletingActive
                        ? 'Đang xoá...'
                        : isConfirmingActive
                          ? 'Xác nhận xoá?'
                          : 'Xoá ảnh TKB'
                    }
                    variant={'danger'}
                    icon={'trash-outline'}
                    size={'sm'}
                    disabled={isDeletingActive}
                    onPress={() => void handleDeleteTimetablePhoto(activeTimetablePhoto)}
                  />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: Spacing.two + 4 },
  banner: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two + 2,
    overflow: 'hidden',
  },
  bannerOrbA: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    top: -60,
    right: -35,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  bannerOrbB: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    bottom: -50,
    left: -25,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  livePillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  seeAllPill: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  seeAllPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bannerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  bannerIconWell: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  emptyBoard: {
    minHeight: 340,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two + 2,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 360,
  },
  uploadBtnWrap: {
    width: '100%',
    maxWidth: 340,
    marginTop: Spacing.two,
  },
  activeBoardWrap: {
    gap: Spacing.two + 2,
  },
  boardFrame: {
    width: '100%',
    height: Platform.OS === 'web' ? 420 : 360,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  boardImage: {
    width: '100%',
    height: '100%',
  },
  pendingPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(15, 23, 42, 0.84)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  pendingText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  topLeftBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  newPill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  newPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  slotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  slotPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  zoomHintPill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  zoomHintText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 2,
  },
  metaLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaAuthor: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  metaRole: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  lockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 820,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    maxHeight: '92%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 540 : 440,
    borderRadius: Radius.lg,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
