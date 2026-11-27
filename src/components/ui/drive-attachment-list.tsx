import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, type ImageContentFit } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DRIVE_CONFIG,
  buildDriveFallbackThumbnailUrl,
  buildDriveThumbnailUrl,
  extractDriveFileId,
  formatBytes,
  getFileVisualMeta,
  getLocalPreviewUri,
} from '@/lib/drive';
import type { DriveAttachment } from '@/types/models';

export type DriveAttachmentItem = DriveAttachment & {
  /** Optimistic uploading state (renders subtle "Đang tải lên..." badge). */
  pending?: boolean;
  /** Local blob/file preview URI for instant zero-wait rendering. */
  localUri?: string | null;
};

type DriveImageProps = {
  driveFileId?: string | null;
  primaryUri?: string | null;
  localUri?: string | null;
  width?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
};

/**
 * Reusable cached Drive image (`expo-image`) with instant local preview cache,
 * fast `lh3.googleusercontent.com` CDN primary URL, and automatic fallback to
 * `drive.google.com/thumbnail` on error.
 */
export function DriveImage({
  driveFileId,
  primaryUri,
  localUri,
  width = 800,
  contentFit = 'cover',
  style,
}: DriveImageProps) {
  const cleanFileId =
    driveFileId?.trim() || (primaryUri ? extractDriveFileId(primaryUri) : null) || '';
  const cachedLocal = localUri || (cleanFileId ? getLocalPreviewUri(cleanFileId) : null);

  const primaryCdn = cleanFileId
    ? buildDriveThumbnailUrl(cleanFileId, width)
    : primaryUri?.trim() || '';
  const fallbackCdn = cleanFileId
    ? buildDriveFallbackThumbnailUrl(cleanFileId, width)
    : primaryUri?.trim() || '';

  const candidates: string[] = [];
  for (const uri of [cachedLocal, primaryCdn, fallbackCdn]) {
    if (uri && !candidates.includes(uri)) {
      candidates.push(uri);
    }
  }

  const sourceKey = `${cleanFileId}|${primaryUri ?? ''}|${localUri ?? ''}|${width}`;
  const [attempt, setAttempt] = useState({ key: sourceKey, index: 0 });
  const activeIdx = attempt.key === sourceKey ? attempt.index : 0;
  const resolvedUri =
    candidates.length > 0 ? candidates[Math.min(activeIdx, candidates.length - 1)] : '';

  if (!resolvedUri) return null;

  return (
    <Image
      source={{ uri: resolvedUri }}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={120}
      onError={() => {
        setAttempt((prev) => {
          const current = prev.key === sourceKey ? prev.index : 0;
          const maxIdx = Math.max(0, candidates.length - 1);
          return current < maxIdx
            ? { key: sourceKey, index: current + 1 }
            : prev.key === sourceKey
              ? prev
              : { key: sourceKey, index: maxIdx };
        });
      }}
      style={style}
    />
  );
}

type DriveAttachmentListProps = {
  attachments: DriveAttachmentItem[];
  editable?: boolean;
  onRemove?: (id: string) => void;
  /** When true, first tap arms a 3.5s "Xoá?" confirmation pill before invoking `onRemove`. */
  confirmBeforeRemove?: boolean;
  /** Optional map of attachment IDs currently deleting (renders inline spinner). */
  deletingIds?: Record<string, boolean>;
};

const CONFIRM_RESET_MS = 3_500;

/**
 * Reusable preview strip for Google Drive (`K8T4_app`) photos & files attached
 * to announcements, tasks, or achievement entries — supports instant optimistic
 * pending previews, cached `expo-image` rendering, and 1-tap or 2-tap delete.
 */
export function DriveAttachmentList({
  attachments,
  editable = false,
  onRemove,
  confirmBeforeRemove = false,
  deletingIds,
}: DriveAttachmentListProps) {
  const theme = useTheme();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  if (attachments.length === 0) return null;

  const handleRemoveTap = (id: string) => {
    if (!onRemove || deletingIds?.[id]) return;
    if (confirmBeforeRemove && confirmingId !== id) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingId(id);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmingId(null);
      }, CONFIRM_RESET_MS);
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingId(null);
    onRemove(id);
  };

  const photos = attachments.filter((a) => a.kind === 'photo');
  const files = attachments.filter((a) => a.kind !== 'photo');

  return (
    <View style={styles.wrap}>
      {photos.length > 0 ? (
        <View style={styles.photoGrid}>
          {photos.map((photo) => {
            const driveId =
              extractDriveFileId(photo.url) ||
              extractDriveFileId(photo.thumbnailUrl ?? '') ||
              (photo.pending ? null : photo.id);
            const isDeleting = Boolean(deletingIds?.[photo.id]);
            const isConfirming = confirmBeforeRemove && confirmingId === photo.id;

            return (
              <View
                key={photo.id}
                style={[
                  styles.photoTile,
                  photos.length === 1 && styles.photoTileSingle,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <Pressable
                  disabled={Boolean(photo.pending) || isDeleting || !photo.url}
                  onPress={() => {
                    if (photo.url) Linking.openURL(photo.url).catch(() => {});
                  }}
                  style={StyleSheet.absoluteFill}>
                  <DriveImage
                    driveFileId={driveId}
                    primaryUri={photo.thumbnailUrl || photo.url}
                    localUri={photo.localUri}
                    width={600}
                    contentFit="cover"
                    style={styles.photoImg}
                  />
                </Pressable>
                {photo.pending ? (
                  <View style={styles.pendingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.pendingText}>Đang tải lên...</Text>
                  </View>
                ) : (
                  <View style={styles.photoTag}>
                    <Ionicons name="cloud-done" size={10} color="#FFFFFF" />
                    <Text style={styles.photoTagText} numberOfLines={1}>
                      {photo.sizeBytes ? formatBytes(photo.sizeBytes) : DRIVE_CONFIG.folderName}
                    </Text>
                  </View>
                )}
                {editable && onRemove && !photo.pending ? (
                  <Pressable
                    disabled={isDeleting}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleRemoveTap(photo.id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isConfirming ? `Xác nhận xoá ${photo.name}` : `Xoá ${photo.name}`}
                    style={({ pressed }) => [
                      isConfirming ? styles.removeConfirmPill : styles.removeBadge,
                      pressed && styles.pressed,
                    ]}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : isConfirming ? (
                      <>
                        <Ionicons name="trash" size={12} color="#FFFFFF" />
                        <Text style={styles.removeConfirmText}>Xoá?</Text>
                      </>
                    ) : (
                      <Ionicons name="trash-outline" size={13} color="#FFFFFF" />
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {files.map((file) => {
        const meta = getFileVisualMeta(file.name, file.mimeType);
        const softKey = `${meta.tone}Soft` as
          | 'accentSoft'
          | 'dangerSoft'
          | 'successSoft'
          | 'warningSoft'
          | 'purpleSoft';
        const isDeleting = Boolean(deletingIds?.[file.id]);
        const isConfirming = confirmBeforeRemove && confirmingId === file.id;

        return (
          <View
            key={file.id}
            style={[
              styles.fileRow,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={[styles.fileIcon, { backgroundColor: theme[softKey] }]}>
              {file.pending ? (
                <ActivityIndicator size="small" color={theme[meta.tone]} />
              ) : (
                <Ionicons name={meta.icon} size={18} color={theme[meta.tone]} />
              )}
            </View>
            <Pressable
              disabled={Boolean(file.pending) || isDeleting || !file.url}
              onPress={() => {
                if (file.url) Linking.openURL(file.url).catch(() => {});
              }}
              style={styles.fileTexts}>
              <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={[styles.fileMeta, { color: theme.textMuted }]} numberOfLines={1}>
                {file.pending
                  ? `Đang tải lên Drive ${DRIVE_CONFIG.folderName}...`
                  : [
                      meta.badge,
                      file.sizeBytes ? formatBytes(file.sizeBytes) : null,
                      `Drive ${DRIVE_CONFIG.folderName}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </Text>
            </Pressable>
            {file.pending ? (
              <View style={[styles.pendingPill, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.openPillText, { color: theme.accentText }]}>Đang tải...</Text>
              </View>
            ) : (
              <View style={styles.fileActions}>
                {file.url ? (
                  <Pressable
                    disabled={isDeleting}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      Linking.openURL(file.url).catch(() => {});
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Mở ${file.name}`}
                    style={({ pressed }) => [
                      styles.openPill,
                      { backgroundColor: theme.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="open-outline" size={13} color={theme.accentText} />
                    <Text style={[styles.openPillText, { color: theme.accentText }]}>Mở</Text>
                  </Pressable>
                ) : null}
                {editable && onRemove ? (
                  <Pressable
                    disabled={isDeleting}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleRemoveTap(file.id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isConfirming ? `Xác nhận xoá ${file.name}` : `Xoá ${file.name}`}
                    style={({ pressed }) => [
                      isConfirming
                        ? [styles.confirmDeletePill, { backgroundColor: theme.danger }]
                        : [styles.actionBtn, { backgroundColor: theme.dangerSoft }],
                      pressed && styles.pressed,
                    ]}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={isConfirming ? '#FFFFFF' : theme.danger} />
                    ) : isConfirming ? (
                      <>
                        <Ionicons name="trash" size={13} color="#FFFFFF" />
                        <Text style={styles.removeConfirmText}>Xoá?</Text>
                      </>
                    ) : (
                      <Ionicons name="trash-outline" size={15} color={theme.danger} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoTile: {
    width: '48%',
    flexGrow: 1,
    height: 150,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  photoTileSingle: {
    width: '100%',
    height: 210,
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  pendingOverlay: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  pendingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  pendingPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  photoTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  photoTagText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  removeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(220, 38, 38, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeConfirmPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  removeConfirmText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTexts: { flex: 1, gap: 2 },
  fileName: { fontSize: 13, fontWeight: '800' },
  fileMeta: { fontSize: 11, fontWeight: '600' },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: Radius.pill,
  },
  openPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: Radius.pill,
  },
  openPillText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
