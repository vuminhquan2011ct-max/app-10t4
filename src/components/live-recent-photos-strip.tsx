import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
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
import { Radius, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import {
  DRIVE_CONFIG,
  formatUploaderRoleLabel,
} from '@/lib/drive';
import {
  buildOptimisticDriveMediaItem,
  saveUploadedFilesToGallery,
  useDriveGallery,
  type DriveMediaItem,
  type SaveDriveMediaMeta,
} from '@/lib/drive-gallery';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';

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

/**
 * Self-contained live "Ảnh lớp mới nhất" strip mounted on the Home Dashboard.
 * Supports one-tap quick photo uploads with <50ms optimistic previews, cached
 * `expo-image` rendering, and sub-second cross-device Realtime updates.
 */
export function LiveRecentPhotosStrip(): ReactElement | null {
  const auth = useAuth();
  const { classInfo, memberRole, isTeacher, isSubjectTeacher, subjectName, currentStudent } =
    useClassStore();
  const theme = useTheme();
  const isDark = useIsDark();
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
  const metaSnapshotsRef = useRef<Map<string, SaveDriveMediaMeta>>(new Map());

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

  const recentPhotos = useMemo(
    () => items.filter((item) => item.itemType === 'photo').slice(0, 12),
    [items],
  );

  const handleSelectionStart = useCallback(
    (pending: PendingUploadPreview[]) => {
      const meta: SaveDriveMediaMeta = {
        uploaderName,
        uploaderRole: memberRole,
        uploaderSubject: isSubjectTeacher ? subjectName : null,
        caption: '',
        category: 'class_photo',
      };
      const optItems = pending.map((p) => {
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
        category: 'class_photo' as const,
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
      if (files.length > 0) {
        showToast(
          `Đã cập nhật ${files.length} ảnh mới lên lớp tức thì! ⚡`,
          'success',
        );
      }
    },
    [showToast],
  );

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => showToast('Không thể mở liên kết tệp', 'warning'));
  };

  return (
    <Card style={styles.card}>
      {/* Header Row */}
      <View style={styles.headRow}>
        <View style={[styles.iconWell, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="images" size={18} color={theme.accent} />
        </View>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              Ảnh lớp mới nhất
            </Text>
            <View style={[styles.livePill, { backgroundColor: theme.successSoft }]}>
              <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.liveText, { color: theme.success }]}>Trực tiếp</Text>
            </View>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>
            {recentPhotos.length > 0
              ? `${recentPhotos.length} ảnh gần đây · Đồng bộ tức thì qua Drive ${DRIVE_CONFIG.folderName}`
              : `Đăng ảnh là hiển thị ngay trên máy cả lớp`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/gallery' as never)}
          hitSlop={8}
          style={({ pressed }) => [styles.seeAllBtn, pressed && styles.pressed]}>
          <Text style={[styles.seeAllText, { color: theme.accentText }]}>Xem tất cả →</Text>
        </Pressable>
      </View>

      {/* Instant 1-Tap Quick Upload */}
      <DriveUploadButton
        mode="media"
        compact
        multiple
        accept="image/*"
        label="Đăng ảnh nhanh lên lớp"
        uploaderName={uploaderName}
        uploaderRole={memberRole}
        category="class_photo"
        onSelectionStart={handleSelectionStart}
        onItemUploaded={handleItemUploaded}
        onItemFailed={handleItemFailed}
        onUploaded={handleBatchDone}
      />

      {/* Horizontal Photo Strip */}
      {loading && recentPhotos.length === 0 ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>
            Đang tải ảnh mới nhất...
          </Text>
        </View>
      ) : recentPhotos.length === 0 ? (
        <Pressable
          onPress={() => router.push('/gallery' as never)}
          style={[
            styles.emptyBox,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <Ionicons name="camera-outline" size={20} color={theme.textMuted} />
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', flex: 1 }}>
            {'Chưa có ảnh lớp nào — bấm “Đăng ảnh nhanh” để chia sẻ ngay cho cả lớp 10T4!'}
          </Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}>
          {recentPhotos.map((photo) => {
            const fresh = !photo.pending && isVeryRecent(photo.createdAt);
            return (
              <Pressable
                key={photo.id}
                disabled={Boolean(photo.pending)}
                onPress={() => setPreviewItem(photo)}
                style={({ pressed }) => [
                  styles.thumbCard,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <DriveImage
                  driveFileId={photo.driveFileId}
                  primaryUri={photo.imageUrl}
                  localUri={photo.localPreviewUri}
                  width={480}
                  contentFit="cover"
                  style={styles.thumbImg}
                />

                {photo.pending ? (
                  <View style={styles.pendingPill}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.pendingText}>Đang tải...</Text>
                  </View>
                ) : fresh ? (
                  <View style={styles.newPill}>
                    <Text style={styles.newPillText}>MỚI</Text>
                  </View>
                ) : null}

                <View style={styles.thumbScrim}>
                  <Text style={styles.thumbAuthor} numberOfLines={1}>
                    {photo.uploaderName}
                  </Text>
                  <Text style={styles.thumbTime} numberOfLines={1}>
                    {photo.pending ? 'Đang đồng bộ' : formatShortTime(photo.createdAt)}
                  </Text>
                </View>
              </Pressable>
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
            <Text style={[styles.moreTileText, { color: theme.accentText }]}>Kho ảnh</Text>
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
                  label={'Mở trên Drive'}
                  icon={'open-outline'}
                  size={'sm'}
                  style={styles.flex}
                  onPress={() => openLink(previewItem.driveUrl)}
                />
                <Button
                  label={'Vào Kho ảnh'}
                  variant={'soft'}
                  icon={'images-outline'}
                  size={'sm'}
                  onPress={() => {
                    setPreviewItem(null);
                    router.push('/gallery' as never);
                  }}
                />
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
  card: { gap: Spacing.two + 2 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
  },
  seeAllBtn: {
    paddingVertical: 4,
    paddingLeft: 4,
  },
  seeAllText: {
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
  newPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
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
    fontSize: 15.5,
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
