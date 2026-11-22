import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import {
  DRIVE_CONFIG,
  formatBytes,
  formatUploaderRoleLabel,
  getFileVisualMeta,
} from '@/lib/drive';
import {
  buildOptimisticDriveMediaItem,
  isSessionUploadedDriveFile,
  saveUploadedFilesToGallery,
  useDriveGallery,
  type DriveMediaCategory,
  type DriveMediaItem,
  type SaveDriveMediaMeta,
} from '@/lib/drive-gallery';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';

const CONFIRM_RESET_MS = 3_500;

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

function categoryForKind(kind: 'image' | 'photo' | 'video' | 'document'): DriveMediaCategory {
  if (kind === 'image' || kind === 'photo') return 'class_photo';
  if (kind === 'video') return 'media';
  return 'lecture';
}

function normalizeOwnerName(name?: string | null): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Prominent Photo & File Upload Hub mounted exclusively on the Overview (Tổng quan) tab.
 *
 * Direct 1-tap buttons to upload photos, videos, PDFs, Word/PowerPoint/ZIP documents
 * to Google Drive `K8T4_app` with <50ms optimistic previews, parallel compression,
 * live Realtime updates, and 2-tap universal deletion (App + Drive + Excel/Sheets).
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

  const [previewItem, setPreviewItem] = useState<DriveMediaItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const metaSnapshotsRef = useRef<Map<string, SaveDriveMediaMeta>>(new Map());
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const canDeleteItem = useCallback(
    (item: DriveMediaItem): boolean => {
      if (item.pending) return false;
      if (canEditClass) return true;
      if (isSessionUploadedDriveFile(item.driveFileId)) return true;
      const myNorm = normalizeOwnerName(uploaderName);
      if (myNorm && normalizeOwnerName(item.uploaderName) === myNorm) return true;
      return false;
    },
    [canEditClass, uploaderName],
  );

  const handleDeleteItem = useCallback(
    async (item: DriveMediaItem) => {
      if (deletingId) return;
      if (confirmDeleteId !== item.id) {
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        setConfirmDeleteId(item.id);
        confirmTimerRef.current = setTimeout(() => {
          confirmTimerRef.current = null;
          setConfirmDeleteId(null);
        }, CONFIRM_RESET_MS);
        showToast('Bấm lại lần nữa để xoá khỏi App, Drive & Excel', 'warning');
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
        if (previewItem?.id === item.id) {
          setPreviewItem(null);
        }
        showToast(
          res.trashedDrive || res.removedSheetRows > 0
            ? 'Đã xoá tệp khỏi App, Google Drive & Excel!'
            : 'Đã xoá tệp khỏi App & đồng bộ toàn lớp!',
          'info',
        );
      } finally {
        setDeletingId(null);
      }
    },
    [confirmDeleteId, deletingId, deleteUploadedFileEverywhere, previewItem?.id, showToast],
  );

  const recentItems = useMemo(() => items.slice(0, 12), [items]);

  const counts = useMemo(() => {
    let photos = 0;
    let files = 0;
    for (const item of items) {
      if (item.itemType === 'photo') photos += 1;
      else files += 1;
    }
    return { photos, files, total: items.length };
  }, [items]);

  const handleSelectionStart = useCallback(
    (pending: PendingUploadPreview[]) => {
      const optItems = pending.map((p) => {
        const meta: SaveDriveMediaMeta = {
          uploaderName,
          uploaderRole: memberRole,
          uploaderSubject: isSubjectTeacher ? subjectName : null,
          caption: '',
          category: categoryForKind(p.kind),
        };
        metaSnapshotsRef.current.set(p.tempId, meta);
        return buildOptimisticDriveMediaItem({
          tempId: p.tempId,
          fileName: p.fileName,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
          localUri: p.localUri,
          kind: p.kind,
          uploaderName: meta.uploaderName,
          uploaderRole: meta.uploaderRole,
          uploaderSubject: meta.uploaderSubject,
          caption: meta.caption,
          category: meta.category,
        });
      });
      prependOptimistic(optItems);
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
        caption: '',
        category: categoryForKind(file.kind),
      };
      metaSnapshotsRef.current.delete(tempId);

      try {
        const res = await saveUploadedFilesToGallery([file], meta);
        const saved = res.items[0];
        if (saved) {
          resolveOptimistic(tempId, saved);
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
      if (files.length === 0) return;
      const allPhotos = files.every((f) => f.kind === 'photo');
      showToast(
        allPhotos
          ? `Đã đăng ${files.length} ảnh mới lên lớp tức thì! ⚡`
          : `Đã đăng ${files.length} ảnh / tệp lên Drive ${DRIVE_CONFIG.folderName} tức thì! ⚡`,
        'success',
      );
    },
    [showToast],
  );

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => showToast('Không thể mở liên kết tệp', 'warning'));
  };

  return (
    <Card style={styles.card}>
      {/* Prominent Quick-Upload Hero Banner */}
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
              {`ĐĂNG NHANH · DRIVE ${DRIVE_CONFIG.folderName}`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/gallery' as never)}
            hitSlop={8}
            style={({ pressed }) => [styles.seeAllPill, pressed && styles.pressed]}>
            <Text style={styles.seeAllPillText}>Kho lớp →</Text>
          </Pressable>
        </View>

        <View style={styles.bannerBody}>
          <View style={styles.bannerIconWell}>
            <Ionicons name="cloud-upload" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              Đăng Ảnh, Video & Tài liệu lên lớp
            </Text>
            <Text style={styles.bannerSub} numberOfLines={2}>
              Chọn ảnh, video, PDF, Word, PowerPoint, ZIP... — tự nén siêu nhanh & hiện ngay cho cả lớp!
            </Text>
          </View>
        </View>

        <View style={styles.bannerStats}>
          <View style={styles.statChip}>
            <Ionicons name="images-outline" size={12} color="#FFFFFF" />
            <Text style={styles.statChipText}>{`${counts.photos} ảnh`}</Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="document-text-outline" size={12} color="#FFFFFF" />
            <Text style={styles.statChipText}>{`${counts.files} file & video`}</Text>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="flash" size={12} color="#FDE047" />
            <Text style={styles.statChipText}>Đồng bộ tức thì</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Dual 1-Tap Upload Buttons: Photos/Videos AND Files/Documents */}
      <DriveUploadButton
        mode="both"
        multiple
        accept="*/*"
        mediaLabel="Đăng Ảnh / Video"
        fileLabel="Đăng File / Tài liệu"
        uploaderName={uploaderName}
        uploaderRole={memberRole}
        category="class_photo"
        onSelectionStart={handleSelectionStart}
        onItemUploaded={handleItemUploaded}
        onItemFailed={handleItemFailed}
        onUploaded={handleBatchDone}
      />

      {/* Live Feed Header */}
      <View style={styles.feedHead}>
        <Text style={[styles.feedTitle, { color: theme.text }]}>
          {counts.total > 0 ? `Ảnh & File mới nhất (${counts.total})` : 'Ảnh & File mới nhất'}
        </Text>
        <Pressable
          onPress={() => router.push('/gallery' as never)}
          hitSlop={8}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <Text style={[styles.seeAllLink, { color: theme.accentText }]}>Xem tất cả →</Text>
        </Pressable>
      </View>

      {/* Horizontal Recent Photos & Files Strip */}
      {loading && recentItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
            Đang tải ảnh & tài liệu mới nhất...
          </Text>
        </View>
      ) : recentItems.length === 0 ? (
        <Pressable
          onPress={() => router.push('/gallery' as never)}
          style={[
            styles.emptyBox,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <Ionicons name="cloud-upload-outline" size={20} color={theme.textMuted} />
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', flex: 1 }}>
            {'Chưa có ảnh hoặc tệp nào — bấm “Đăng Ảnh / Video” hoặc “Đăng File / Tài liệu” ở trên để chia sẻ ngay!'}
          </Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}>
          {recentItems.map((item) => {
            const fresh = !item.pending && isVeryRecent(item.createdAt);
            const deletable = canDeleteItem(item);
            const isConfirming = confirmDeleteId === item.id;
            const isDeleting = deletingId === item.id;

            if (item.itemType === 'photo') {
              return (
                <View
                  key={item.id}
                  style={[
                    styles.thumbCard,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <Pressable
                    disabled={Boolean(item.pending) || isDeleting}
                    onPress={() => setPreviewItem(item)}
                    style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}>
                    <DriveImage
                      driveFileId={item.driveFileId}
                      primaryUri={item.imageUrl}
                      localUri={item.localPreviewUri}
                      width={480}
                      contentFit="cover"
                      style={styles.thumbImg}
                    />
                  </Pressable>

                  {item.pending ? (
                    <View pointerEvents="none" style={styles.pendingPill}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.pendingText}>Đang tải...</Text>
                    </View>
                  ) : fresh ? (
                    <View pointerEvents="none" style={styles.newPill}>
                      <Text style={styles.newPillText}>MỚI</Text>
                    </View>
                  ) : null}

                  {deletable ? (
                    <Pressable
                      disabled={isDeleting}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void handleDeleteItem(item);
                      }}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={isConfirming ? `Xác nhận xoá ${item.fileName}` : `Xoá ${item.fileName}`}
                      style={({ pressed }) => [
                        isConfirming ? styles.tileDeleteConfirm : styles.tileDeleteBtn,
                        pressed && styles.pressed,
                      ]}>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : isConfirming ? (
                        <Text style={styles.tileDeleteConfirmText}>Xoá?</Text>
                      ) : (
                        <Ionicons name="trash-outline" size={12} color="#FFFFFF" />
                      )}
                    </Pressable>
                  ) : null}

                  <View pointerEvents="none" style={styles.thumbScrim}>
                    <Text style={styles.thumbAuthor} numberOfLines={1}>
                      {item.uploaderName}
                    </Text>
                    <Text style={styles.thumbTime} numberOfLines={1}>
                      {item.pending ? 'Đang đồng bộ' : formatShortTime(item.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }

            const fileVisual = getFileVisualMeta(item.fileName, item.mimeType);
            const fileSoftKey = `${fileVisual.tone}Soft` as
              | 'accentSoft'
              | 'dangerSoft'
              | 'successSoft'
              | 'warningSoft'
              | 'purpleSoft';

            return (
              <View
                key={item.id}
                style={[
                  styles.fileCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <View style={styles.fileCardTop}>
                  <Pressable
                    disabled={Boolean(item.pending) || isDeleting}
                    onPress={() => openLink(item.driveUrl)}
                    style={[styles.fileIconBox, { backgroundColor: theme[fileSoftKey] }]}>
                    {item.pending ? (
                      <ActivityIndicator size="small" color={theme[fileVisual.tone]} />
                    ) : (
                      <Ionicons name={fileVisual.icon} size={20} color={theme[fileVisual.tone]} />
                    )}
                  </Pressable>
                  <View style={styles.fileCardTopRight}>
                    {item.pending ? (
                      <View style={[styles.fileBadge, { backgroundColor: theme.accentSoft }]}>
                        <Text style={[styles.fileBadgeText, { color: theme.accentText }]}>
                          Đang tải
                        </Text>
                      </View>
                    ) : deletable ? (
                      <Pressable
                        disabled={isDeleting}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          void handleDeleteItem(item);
                        }}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={isConfirming ? `Xác nhận xoá ${item.fileName}` : `Xoá ${item.fileName}`}
                        style={({ pressed }) => [
                          isConfirming
                            ? [styles.fileDeleteConfirm, { backgroundColor: theme.danger }]
                            : [styles.fileDeleteBtn, { backgroundColor: theme.dangerSoft }],
                          pressed && styles.pressed,
                        ]}>
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={isConfirming ? '#FFFFFF' : theme.danger} />
                        ) : isConfirming ? (
                          <Text style={styles.tileDeleteConfirmText}>Xoá?</Text>
                        ) : (
                          <Ionicons name="trash-outline" size={13} color={theme.danger} />
                        )}
                      </Pressable>
                    ) : fresh ? (
                      <View style={styles.newPillInline}>
                        <Text style={styles.newPillText}>MỚI</Text>
                      </View>
                    ) : (
                      <View style={[styles.fileBadge, { backgroundColor: theme[fileSoftKey] }]}>
                        <Text style={[styles.fileBadgeText, { color: theme[fileVisual.tone] }]}>
                          {fileVisual.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Pressable
                  disabled={Boolean(item.pending) || isDeleting}
                  onPress={() => openLink(item.driveUrl)}
                  style={({ pressed }) => [styles.fileCardBody, pressed && styles.pressed]}>
                  <Text style={[styles.fileCardName, { color: theme.text }]} numberOfLines={2}>
                    {item.fileName}
                  </Text>

                  <Text style={[styles.fileCardMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.pending
                      ? 'Đang đồng bộ...'
                      : [
                          item.uploaderName,
                          item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : formatShortTime(item.createdAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </Text>
                </Pressable>
              </View>
            );
          })}

          <Pressable
            onPress={() => router.push('/gallery' as never)}
            style={({ pressed }) => [
              styles.moreTile,
              { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}44` },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="arrow-forward-circle" size={26} color={theme.accent} />
            <Text style={[styles.moreTileText, { color: theme.accentText }]}>Kho lớp</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Fullscreen Photo Preview Modal */}
      <Modal
        visible={Boolean(previewItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}>
        <View
          style={[
            styles.modalBackdrop,
            { backgroundColor: isDark ? 'rgba(2, 6, 23, 0.92)' : 'rgba(15, 23, 42, 0.86)' },
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewItem(null)} />
          {previewItem ? (
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHead}>
                <View style={styles.flex}>
                  <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                    {previewItem.caption || previewItem.fileName}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {`${previewItem.uploaderName} · ${formatUploaderRoleLabel(previewItem.uploaderRole, previewItem.uploaderSubject)}`}
                  </Text>
                </View>
                <Badge
                  label={formatShortTime(previewItem.createdAt)}
                  color={'accentText'}
                  soft={'accentSoft'}
                />
                <Pressable
                  onPress={() => setPreviewItem(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng xem trước"
                  style={[styles.closeCircle, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="close" size={18} color={theme.text} />
                </Pressable>
              </View>

              <DriveImage
                driveFileId={previewItem.driveFileId}
                primaryUri={previewItem.imageUrl}
                localUri={previewItem.localPreviewUri}
                width={1600}
                contentFit="contain"
                style={styles.modalImage}
              />

              <View style={styles.modalActions}>
                <Button
                  label={'Mở Drive'}
                  icon={'open-outline'}
                  size={'sm'}
                  style={styles.flex}
                  onPress={() => openLink(previewItem.driveUrl)}
                />
                <Button
                  label={'Kho lớp'}
                  variant={'soft'}
                  icon={'folder-open-outline'}
                  size={'sm'}
                  onPress={() => {
                    setPreviewItem(null);
                    router.push('/gallery' as never);
                  }}
                />
                {canDeleteItem(previewItem) ? (
                  <Button
                    label={
                      deletingId === previewItem.id
                        ? 'Đang xoá...'
                        : confirmDeleteId === previewItem.id
                          ? 'Xác nhận xoá?'
                          : 'Xoá'
                    }
                    variant={'danger'}
                    icon={'trash-outline'}
                    size={'sm'}
                    disabled={deletingId === previewItem.id}
                    onPress={() => void handleDeleteItem(previewItem)}
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
  bannerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  feedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedTitle: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  strip: {
    gap: Spacing.two,
    paddingRight: Spacing.one,
  },
  thumbCard: {
    width: 124,
    height: 132,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  pendingPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pendingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  newPill: {
    position: 'absolute',
    top: 7,
    left: 7,
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  newPillInline: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  newPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  tileDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDeleteConfirm: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDeleteConfirmText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  thumbScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  thumbAuthor: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  thumbTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 9.5,
    fontWeight: '600',
  },
  fileCard: {
    width: 146,
    height: 132,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two + 2,
    justifyContent: 'space-between',
    gap: 6,
  },
  fileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  fileCardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fileCardBody: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDeleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDeleteConfirm: {
    paddingHorizontal: 8,
    height: 24,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: Radius.pill,
  },
  fileBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  fileCardName: {
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 16.5,
  },
  fileCardMeta: {
    fontSize: 10,
    fontWeight: '600',
  },
  moreTile: {
    width: 82,
    height: 132,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  moreTileText: {
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    maxHeight: '90%',
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
    height: Platform.OS === 'web' ? 420 : 340,
    borderRadius: Radius.lg,
    backgroundColor: '#0f172a',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
