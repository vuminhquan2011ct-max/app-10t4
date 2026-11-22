import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import {
  DRIVE_CONFIG,
  cacheLocalPreviewUri,
  detectDriveMediaKind,
  formatBytes,
  uploadFileToDrive,
  type DriveUploaderRole,
  type UploadedDriveFile,
} from '@/lib/drive';
import {
  createObjectUrlSafe,
  optimizeWebImageFile,
  readWebBlobAsBase64,
} from '@/lib/image-optimize';

export type { UploadedDriveFile };

export interface PendingUploadPreview {
  tempId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  localUri?: string;
  kind: 'image' | 'video' | 'document';
}

export interface DriveUploadButtonProps {
  label?: string;
  mediaLabel?: string;
  fileLabel?: string;
  /** `'both'` renders side-by-side Image/Video & File pickers; `'media'` or `'files'` renders one button. */
  mode?: 'both' | 'media' | 'files';
  multiple?: boolean;
  accept?: string;
  compact?: boolean;
  disabled?: boolean;
  uploaderName?: string;
  uploaderRole?: DriveUploaderRole;
  category?: string;
  /** Fires immediately (<50ms) when user picks files, carrying local preview URIs for optimistic UI. */
  onSelectionStart?: (pending: PendingUploadPreview[]) => void;
  /** Fires per-file the moment each file finishes uploading to Drive (concurrent streaming). */
  onItemUploaded?: (file: UploadedDriveFile, tempId: string) => void | Promise<void>;
  /** Fires per-file if an individual upload fails so optimistic placeholders can be cleared. */
  onItemFailed?: (tempId: string, error: string) => void;
  /** Backward-compatible batch completion callback with all successfully uploaded files. */
  onUploaded?: (files: UploadedDriveFile[]) => void | Promise<void>;
  onError?: (message: string) => void;
  onLargeFileDetected?: (fileName: string, sizeBytes: number) => void;
}

const UPLOAD_CONCURRENCY = 3;

type PreparedPayload = {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  base64Content: string;
};

type PendingUploadJob = {
  preview: PendingUploadPreview;
  /** If true, size limit check runs after optional client compression (e.g. Web PNG -> JPEG). */
  mayCompressBeforeSizeCheck?: boolean;
  prepare: () => Promise<PreparedPayload>;
};

function makeTempId(idx: number): string {
  return `tmp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
}

function toPreviewKind(fileName: string, mimeType?: string | null): 'image' | 'video' | 'document' {
  const detected = detectDriveMediaKind(fileName, mimeType);
  return detected === 'photo' ? 'image' : detected;
}

function isImageOnlyAccept(acceptStr: string): boolean {
  const lower = acceptStr.trim().toLowerCase();
  return lower.startsWith('image/') && !lower.includes('video');
}

function guessNameFromUri(uri: string, fallbackPrefix: string, mimeType?: string | null): string {
  const segment = uri.split('/').pop()?.split('?')[0];
  if (segment && segment.includes('.')) return segment;
  const ext = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  return `${fallbackPrefix}_${Date.now()}.${ext}`;
}

/**
 * Cross-platform (Web + iOS + Android) high-speed Google Drive (`K8T4_app`) upload
 * button with client-side image compression, bounded parallel uploads (concurrency=3),
 * and instant (<50ms) optimistic local preview callbacks.
 */
export function DriveUploadButton({
  label = 'Tải ảnh / file lên Drive',
  mediaLabel = 'Chọn Ảnh / Video',
  fileLabel = 'Chọn File / Tài liệu',
  mode = 'both',
  multiple = true,
  accept = '*/*',
  compact = false,
  disabled = false,
  uploaderName,
  uploaderRole,
  category,
  onSelectionStart,
  onItemUploaded,
  onItemFailed,
  onUploaded,
  onError,
  onLargeFileDetected,
}: DriveUploadButtonProps) {
  const theme = useTheme();
  const gradient = useBrandGradient();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'idle' | 'info' | 'success' | 'error'>('idle');
  const [progressRatio, setProgressRatio] = useState(0);

  const processBatch = async (rawJobs: PendingUploadJob[]) => {
    const jobs = multiple ? rawJobs : rawJobs.slice(0, 1);
    if (jobs.length === 0) return;

    // Fire optimistic previews IMMEDIATELY (<50ms) before any compression/network starts.
    onSelectionStart?.(jobs.map((j) => j.preview));

    setLoading(true);
    setProgressRatio(0.08);
    setStatusKind('info');
    setStatus(
      jobs.length === 1
        ? `Đang tối ưu & tải nhanh "${jobs[0].preview.fileName}" → Drive ${DRIVE_CONFIG.folderName}...`
        : `Đang tải song song ${jobs.length} tệp → Drive ${DRIVE_CONFIG.folderName}...`,
    );

    const total = jobs.length;
    const uploadedSlots: (UploadedDriveFile | null)[] = new Array(total).fill(null);
    const errors: string[] = [];
    let completed = 0;
    let cursor = 0;

    const runWorker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= total) return;

        const job = jobs[idx];
        const { preview } = job;

        try {
          if (
            !job.mayCompressBeforeSizeCheck &&
            preview.sizeBytes &&
            preview.sizeBytes > DRIVE_CONFIG.maxDirectUploadBytes
          ) {
            onLargeFileDetected?.(preview.fileName, preview.sizeBytes);
            const largeMsg = `"${preview.fileName}" (${formatBytes(preview.sizeBytes)}) vượt 25 MB — hãy bấm "Mở Drive ${DRIVE_CONFIG.folderName}" để tải file lớn (GB) trực tiếp!`;
            errors.push(largeMsg);
            onItemFailed?.(preview.tempId, largeMsg);
            continue;
          }

          const prepared = await job.prepare();

          if (
            prepared.sizeBytes &&
            prepared.sizeBytes > DRIVE_CONFIG.maxDirectUploadBytes
          ) {
            onLargeFileDetected?.(prepared.fileName, prepared.sizeBytes);
            const largeMsg = `"${prepared.fileName}" (${formatBytes(prepared.sizeBytes)}) vượt 25 MB — hãy bấm "Mở Drive ${DRIVE_CONFIG.folderName}" để tải file lớn (GB) trực tiếp!`;
            errors.push(largeMsg);
            onItemFailed?.(preview.tempId, largeMsg);
            continue;
          }

          const uploaded = await uploadFileToDrive({
            fileName: prepared.fileName,
            mimeType: prepared.mimeType || 'application/octet-stream',
            base64Content: prepared.base64Content,
            sizeBytes: prepared.sizeBytes,
            uploaderName,
            uploaderRole,
            category,
          });

          // Cache local preview URI so the uploader sees zero Drive CDN wait/flicker.
          if (preview.localUri) {
            cacheLocalPreviewUri(uploaded.id, preview.localUri);
          }

          uploadedSlots[idx] = uploaded;
          await onItemUploaded?.(uploaded, preview.tempId);
        } catch (fileErr) {
          const msg =
            fileErr instanceof Error ? fileErr.message : `Lỗi khi tải "${preview.fileName}"`;
          errors.push(msg);
          onItemFailed?.(preview.tempId, msg);
        } finally {
          completed += 1;
          setProgressRatio(Math.max(0.12, completed / total));
          if (completed < total) {
            setStatus(
              `Đã xử lý ${completed}/${total} tệp → Drive ${DRIVE_CONFIG.folderName}...`,
            );
          }
        }
      }
    };

    try {
      const workerCount = Math.min(UPLOAD_CONCURRENCY, total);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

      const uploadedList = uploadedSlots.filter((f): f is UploadedDriveFile => f !== null);

      if (uploadedList.length > 0) {
        await onUploaded?.(uploadedList);
      }

      if (errors.length === 0 && uploadedList.length > 0) {
        const totalSize = uploadedList.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
        setStatusKind('success');
        setStatus(
          `Đã cập nhật ${uploadedList.length} tệp (${formatBytes(totalSize)}) lên Drive ${DRIVE_CONFIG.folderName}!`,
        );
      } else if (uploadedList.length > 0 && errors.length > 0) {
        setStatusKind('error');
        const msg = `Đã tải ${uploadedList.length} tệp. Lỗi: ${errors[0]}`;
        setStatus(msg);
        onError?.(msg);
      } else if (errors.length > 0) {
        setStatusKind('error');
        setStatus(errors[0]);
        onError?.(errors[0]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tải tệp lên Google Drive';
      setStatusKind('error');
      setStatus(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const openWebPicker = (pickerAccept: string) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = pickerAccept;
    input.multiple = multiple;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    input.onchange = () => {
      const rawFiles = Array.from(input.files || []);
      cleanup();
      const selectedFiles = multiple ? rawFiles : rawFiles.slice(0, 1);
      if (selectedFiles.length === 0) return;

      if (isImageOnlyAccept(pickerAccept)) {
        const hasNonImage = selectedFiles.some((f) => toPreviewKind(f.name, f.type) !== 'image');
        if (hasNonImage) {
          const msg = 'Vui lòng chỉ chọn tệp hình ảnh (PNG, JPG, WEBP...).';
          setStatusKind('error');
          setStatus(msg);
          onError?.(msg);
          return;
        }
      }

      const jobs: PendingUploadJob[] = selectedFiles.map((file, idx) => {
        const kind = toPreviewKind(file.name, file.type);
        const localUri = kind === 'image' ? createObjectUrlSafe(file) : undefined;
        const preview: PendingUploadPreview = {
          tempId: makeTempId(idx),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          localUri,
          kind,
        };

        return {
          preview,
          mayCompressBeforeSizeCheck: kind === 'image',
          prepare: async () => {
            if (kind === 'image') {
              const optimized = await optimizeWebImageFile(file, {
                existingPreviewUri: preview.localUri,
              });
              if (optimized.localPreviewUri && !preview.localUri) {
                preview.localUri = optimized.localPreviewUri;
              }
              return {
                fileName: optimized.fileName,
                mimeType: optimized.mimeType,
                sizeBytes: optimized.sizeBytes,
                base64Content: optimized.base64,
              };
            }
            const base64Content = await readWebBlobAsBase64(file, file.name);
            return {
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              base64Content,
            };
          },
        };
      });

      void processBatch(jobs);
    };

    input.addEventListener('cancel', cleanup);
    document.body.appendChild(input);
    input.click();
  };

  const pickMedia = async () => {
    if (loading || disabled) return;

    if (Platform.OS === 'web') {
      openWebPicker(accept === '*/*' ? 'image/*,video/*' : accept);
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const msg = 'Vui lòng cấp quyền truy cập Thư viện ảnh để tải ảnh/video lên Drive.';
        setStatusKind('error');
        setStatus(msg);
        onError?.(msg);
        return;
      }

      // `base64: false` returns immediately with `asset.uri` for <50ms optimistic preview,
      // while `quality: 0.78` trims raw mobile photo size cleanly before reading concurrently.
      const imageOnly = isImageOnlyAccept(accept);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageOnly ? ['images'] : ['images', 'videos'],
        allowsMultipleSelection: multiple,
        quality: 0.78,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const selectedAssets = multiple ? result.assets : result.assets.slice(0, 1);
      const jobs: PendingUploadJob[] = selectedAssets.map((asset, idx) => {
        const mime =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const name =
          asset.fileName?.trim() ||
          guessNameFromUri(asset.uri, asset.type === 'video' ? 'video' : 'photo', mime);
        const kind: 'image' | 'video' | 'document' =
          asset.type === 'video' ? 'video' : toPreviewKind(name, mime);

        return {
          preview: {
            tempId: makeTempId(idx),
            fileName: name,
            mimeType: mime,
            sizeBytes: asset.fileSize,
            localUri: kind === 'image' ? asset.uri : undefined,
            kind,
          },
          prepare: async () => {
            const nativeFile = new ExpoFile(asset.uri);
            const base64Content = await nativeFile.base64();
            return {
              fileName: name,
              mimeType: mime,
              sizeBytes: asset.fileSize,
              base64Content,
            };
          },
        };
      });

      await processBatch(jobs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không mở được thư viện ảnh';
      setStatusKind('error');
      setStatus(msg);
      onError?.(msg);
    }
  };

  const pickFiles = async () => {
    if (loading || disabled) return;

    if (Platform.OS === 'web') {
      openWebPicker(accept);
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: accept || '*/*',
        multiple,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const selectedAssets = multiple ? result.assets : result.assets.slice(0, 1);
      const jobs: PendingUploadJob[] = selectedAssets.map((asset, idx) => {
        const name = asset.name || guessNameFromUri(asset.uri, 'file', asset.mimeType);
        const mime = asset.mimeType || 'application/octet-stream';
        const kind = toPreviewKind(name, mime);
        return {
          preview: {
            tempId: makeTempId(idx),
            fileName: name,
            mimeType: mime,
            sizeBytes: asset.size,
            localUri: kind === 'image' ? asset.uri : undefined,
            kind,
          },
          prepare: async () => {
            const base64Content = asset.base64
              ? asset.base64
              : await new ExpoFile(asset.uri).base64();
            return {
              fileName: name,
              mimeType: mime,
              sizeBytes: asset.size,
              base64Content,
            };
          },
        };
      });

      await processBatch(jobs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không mở được trình chọn tệp';
      setStatusKind('error');
      setStatus(msg);
      onError?.(msg);
    }
  };

  const statusColor =
    statusKind === 'error'
      ? theme.danger
      : statusKind === 'success'
        ? theme.success
        : theme.accentText;

  return (
    <View style={styles.wrap}>
      {mode === 'both' ? (
        <View style={styles.dualRow}>
          <Pressable
            onPress={() => void pickMedia()}
            disabled={loading || disabled}
            style={({ pressed }) => [
              styles.primaryBtn,
              compact && styles.compactBtn,
              { backgroundColor: gradient[0] },
              pressed && styles.pressed,
              (loading || disabled) && styles.disabled,
            ]}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="images" size={compact ? 16 : 18} color="#FFFFFF" />
            )}
            <Text style={[styles.primaryText, compact && styles.compactText]} numberOfLines={1}>
              {loading ? 'Đang tải...' : mediaLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void pickFiles()}
            disabled={loading || disabled}
            style={({ pressed }) => [
              styles.secondaryBtn,
              compact && styles.compactBtn,
              { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}44` },
              pressed && styles.pressed,
              (loading || disabled) && styles.disabled,
            ]}>
            <Ionicons
              name="document-attach"
              size={compact ? 16 : 18}
              color={theme.accentText}
            />
            <Text
              style={[styles.secondaryText, compact && styles.compactText, { color: theme.accentText }]}
              numberOfLines={1}>
              {fileLabel}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => void (mode === 'media' ? pickMedia() : pickFiles())}
          disabled={loading || disabled}
          style={({ pressed }) => [
            styles.singleBtn,
            compact && styles.compactBtn,
            { backgroundColor: gradient[0] },
            pressed && styles.pressed,
            (loading || disabled) && styles.disabled,
          ]}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name={mode === 'media' ? 'images' : 'cloud-upload'}
              size={compact ? 16 : 18}
              color="#FFFFFF"
            />
          )}
          <Text style={[styles.primaryText, compact && styles.compactText]} numberOfLines={1}>
            {loading ? `Đang tải lên ${DRIVE_CONFIG.folderName}...` : label}
          </Text>
        </Pressable>
      )}

      {loading ? (
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.accent,
                width: `${Math.round(Math.max(8, Math.min(100, progressRatio * 100)))}%` as `${number}%`,
              },
            ]}
          />
        </View>
      ) : null}

      {status ? (
        <View style={styles.statusRow}>
          <Ionicons
            name={
              statusKind === 'error'
                ? 'alert-circle'
                : statusKind === 'success'
                  ? 'checkmark-circle'
                  : 'cloud-upload-outline'
            }
            size={14}
            color={statusColor}
          />
          <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  dualRow: { flexDirection: 'row', gap: Spacing.two },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  singleBtn: {
    minHeight: 46,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  compactBtn: { minHeight: 38, paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  secondaryText: { fontSize: 13.5, fontWeight: '800' },
  compactText: { fontSize: 12.5 },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
});
