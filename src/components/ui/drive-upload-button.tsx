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
  formatBytes,
  uploadFileToDrive,
  type DriveUploaderRole,
  type UploadedDriveFile,
} from '@/lib/drive';

export type { UploadedDriveFile };

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
  onUploaded?: (files: UploadedDriveFile[]) => void | Promise<void>;
  onError?: (message: string) => void;
  onLargeFileDetected?: (fileName: string, sizeBytes: number) => void;
}

type PendingUploadItem = {
  name: string;
  mimeType: string;
  sizeBytes?: number;
  readBase64: () => Promise<string>;
};

function readWebFileAsBase64(file: globalThis.File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Không đọc được file "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

function guessNameFromUri(uri: string, fallbackPrefix: string, mimeType?: string | null): string {
  const segment = uri.split('/').pop()?.split('?')[0];
  if (segment && segment.includes('.')) return segment;
  const ext = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  return `${fallbackPrefix}_${Date.now()}.${ext}`;
}

/**
 * Cross-platform (Web + iOS + Android) Google Drive (`K8T4_app`) upload trigger
 * usable by both students and teachers anywhere in the app.
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

  const processBatch = async (items: PendingUploadItem[]) => {
    if (items.length === 0) return;

    setLoading(true);
    setProgressRatio(0.05);
    setStatusKind('info');

    const uploadedList: UploadedDriveFile[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const sizeLabel = item.sizeBytes ? ` (${formatBytes(item.sizeBytes)})` : '';

        if (item.sizeBytes && item.sizeBytes > DRIVE_CONFIG.maxDirectUploadBytes) {
          onLargeFileDetected?.(item.name, item.sizeBytes);
          errors.push(
            `"${item.name}" (${formatBytes(item.sizeBytes)}) vượt 25 MB — hãy bấm "Mở Drive ${DRIVE_CONFIG.folderName}" để tải file lớn (GB) trực tiếp!`,
          );
          continue;
        }

        setStatus(
          `Đang chuyển ${i + 1}/${items.length}: ${item.name}${sizeLabel} → Drive ${DRIVE_CONFIG.folderName}...`,
        );
        setProgressRatio(Math.max(0.08, i / items.length));

        try {
          const base64Content = await item.readBase64();
          const uploaded = await uploadFileToDrive({
            fileName: item.name,
            mimeType: item.mimeType || 'application/octet-stream',
            base64Content,
            sizeBytes: item.sizeBytes,
            uploaderName,
            uploaderRole,
            category,
          });
          uploadedList.push(uploaded);
        } catch (fileErr) {
          const msg =
            fileErr instanceof Error ? fileErr.message : `Lỗi khi tải "${item.name}"`;
          errors.push(msg);
        }

        setProgressRatio((i + 1) / items.length);
      }

      if (uploadedList.length > 0) {
        await onUploaded?.(uploadedList);
      }

      if (errors.length === 0 && uploadedList.length > 0) {
        const totalSize = uploadedList.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
        setStatusKind('success');
        setStatus(
          `Đã chuyển ${uploadedList.length} tệp (${formatBytes(totalSize)}) lên Google Drive ${DRIVE_CONFIG.folderName}!`,
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

    input.onchange = () => {
      const selectedFiles = Array.from(input.files || []);
      if (selectedFiles.length === 0) return;
      const batch: PendingUploadItem[] = selectedFiles.map((file) => ({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        readBase64: () => readWebFileAsBase64(file),
      }));
      void processBatch(batch);
    };

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

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: multiple,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const batch: PendingUploadItem[] = result.assets.map((asset) => {
        const mime =
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const name =
          asset.fileName?.trim() ||
          guessNameFromUri(asset.uri, asset.type === 'video' ? 'video' : 'photo', mime);

        return {
          name,
          mimeType: mime,
          sizeBytes: asset.fileSize,
          readBase64: async () => {
            if (asset.base64) return asset.base64;
            const nativeFile = new ExpoFile(asset.uri);
            return nativeFile.base64();
          },
        };
      });

      await processBatch(batch);
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

      const batch: PendingUploadItem[] = result.assets.map((asset) => ({
        name: asset.name || guessNameFromUri(asset.uri, 'file', asset.mimeType),
        mimeType: asset.mimeType || 'application/octet-stream',
        sizeBytes: asset.size,
        readBase64: async () => {
          if (asset.base64) return asset.base64;
          const nativeFile = new ExpoFile(asset.uri);
          return nativeFile.base64();
        },
      }));

      await processBatch(batch);
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