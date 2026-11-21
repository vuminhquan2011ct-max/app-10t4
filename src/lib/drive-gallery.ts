/**
 * Shared Google Drive (`K8T4_app`) Class Gallery & File Repository service.
 *
 * - Binary files (MB / GB) live in Google Drive folder `K8T4_app`.
 * - Lightweight metadata is synced via Supabase `public.class_photos` AND
 *   cached locally in AsyncStorage so students & teachers never lose uploads
 *   even when offline or before optional SQL columns are added.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DRIVE_CONFIG,
  buildDriveDownloadUrl,
  buildDriveThumbnailUrl,
  buildDriveViewUrl,
  detectDriveMediaKind,
  extractDriveFileId,
  formatFallbackUploaderName,
  parseUploaderMetadata,
  type DriveMediaKind,
  type DriveUploaderRole,
  type UploadedDriveFile,
} from '@/lib/drive';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const CACHE_KEY = 'class10t4:drive-gallery:v2';
const META_MAP_KEY = 'class10t4:drive-file-meta:v1';

export type DriveMediaCategory = 'class_photo' | 'lecture' | 'homework' | 'media' | 'other';

export const DRIVE_MEDIA_CATEGORY_LIST: DriveMediaCategory[] = [
  'class_photo',
  'lecture',
  'homework',
  'media',
  'other',
];

export const DRIVE_MEDIA_CATEGORIES: Record<
  DriveMediaCategory,
  {
    label: string;
    icon: 'images-outline' | 'book-outline' | 'document-attach-outline' | 'videocam-outline' | 'folder-outline';
    color: 'accent' | 'success' | 'warning' | 'purple' | 'danger';
    soft: 'accentSoft' | 'successSoft' | 'warningSoft' | 'purpleSoft' | 'dangerSoft';
  }
> = {
  class_photo: {
    label: 'Ảnh lớp',
    icon: 'images-outline',
    color: 'accent',
    soft: 'accentSoft',
  },
  lecture: {
    label: 'Bài giảng / Đề cương',
    icon: 'book-outline',
    color: 'success',
    soft: 'successSoft',
  },
  homework: {
    label: 'Bài tập / Bài nộp',
    icon: 'document-attach-outline',
    color: 'warning',
    soft: 'warningSoft',
  },
  media: {
    label: 'Video / Kỷ yếu',
    icon: 'videocam-outline',
    color: 'purple',
    soft: 'purpleSoft',
  },
  other: {
    label: 'Tài liệu khác',
    icon: 'folder-outline',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export interface DriveMediaItem {
  id: string;
  uploaderName: string;
  uploaderRole: DriveUploaderRole;
  uploaderSubject: string | null;
  caption: string;
  driveFileId: string;
  imageUrl: string;
  driveUrl: string;
  downloadUrl: string;
  fileName: string;
  itemType: DriveMediaKind;
  mimeType: string;
  sizeBytes: number;
  category: DriveMediaCategory;
  folderName: string;
  createdAt: string;
  localOnly?: boolean;
}

type RawSupabaseRow = {
  id?: string | number;
  uploader_name?: string | null;
  uploader_role?: string | null;
  uploader_subject?: string | null;
  caption?: string | null;
  drive_file_id?: string | null;
  image_url?: string | null;
  file_name?: string | null;
  item_type?: string | null;
  drive_url?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  category?: string | null;
  drive_folder_name?: string | null;
  created_at?: string | null;
};

type LocalFileMeta = {
  sizeBytes?: number;
  mimeType?: string;
  category?: DriveMediaCategory;
  uploaderRole?: DriveUploaderRole;
  uploaderSubject?: string | null;
};

async function loadLocalMetaMap(): Promise<Record<string, LocalFileMeta>> {
  try {
    const raw = await AsyncStorage.getItem(META_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalFileMeta> | null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveLocalMetaEntries(entries: Record<string, LocalFileMeta>): Promise<void> {
  try {
    const existing = await loadLocalMetaMap();
    const merged = { ...existing, ...entries };
    await AsyncStorage.setItem(META_MAP_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }
}

async function loadCachedItems(): Promise<DriveMediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DriveMediaItem[] | null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCachedItems(items: DriveMediaItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items.slice(0, 300)));
  } catch {
    // Ignore storage quota errors
  }
}

function isValidCategory(val: unknown): val is DriveMediaCategory {
  return (
    val === 'class_photo' ||
    val === 'lecture' ||
    val === 'homework' ||
    val === 'media' ||
    val === 'other'
  );
}

function normalizeRow(
  row: RawSupabaseRow,
  metaMap: Record<string, LocalFileMeta>,
): DriveMediaItem {
  const driveFileId =
    row.drive_file_id?.trim() ||
    extractDriveFileId(row.drive_url ?? '') ||
    extractDriveFileId(row.image_url ?? '') ||
    '';
  const localMeta = driveFileId ? metaMap[driveFileId] : undefined;
  const fileName = row.file_name?.trim() || (row.item_type === 'document' ? 'Tài liệu lớp' : 'Ảnh lớp 10T4');
  const mimeType = row.mime_type?.trim() || localMeta?.mimeType || '';

  let itemType: DriveMediaKind;
  if (row.item_type === 'photo' || row.item_type === 'video' || row.item_type === 'document') {
    itemType = row.item_type;
  } else {
    itemType = detectDriveMediaKind(fileName, mimeType);
  }

  const parsedUploader = parseUploaderMetadata(
    row.uploader_name ?? 'Thành viên 10T4',
    row.uploader_role ?? localMeta?.uploaderRole,
    row.uploader_subject ?? localMeta?.uploaderSubject,
  );

  const driveUrl =
    row.drive_url?.trim() || (driveFileId ? buildDriveViewUrl(driveFileId) : row.image_url ?? '');
  const imageUrl =
    itemType === 'photo'
      ? driveFileId
        ? buildDriveThumbnailUrl(driveFileId, 1200)
        : row.image_url?.trim() || driveUrl
      : row.image_url?.trim() || driveUrl;

  const rawCategory = row.category ?? localMeta?.category;
  const category: DriveMediaCategory = isValidCategory(rawCategory)
    ? rawCategory
    : itemType === 'photo'
      ? 'class_photo'
      : itemType === 'video'
        ? 'media'
        : 'lecture';

  const sizeBytes =
    typeof row.file_size === 'number' && Number.isFinite(row.file_size) && row.file_size > 0
      ? row.file_size
      : localMeta?.sizeBytes ?? 0;

  return {
    id: String(row.id ?? `drv_${driveFileId || Date.now()}`),
    uploaderName: parsedUploader.displayName,
    uploaderRole: parsedUploader.role,
    uploaderSubject: parsedUploader.subject,
    caption: row.caption?.trim() || '',
    driveFileId,
    imageUrl,
    driveUrl,
    downloadUrl: driveFileId ? buildDriveDownloadUrl(driveFileId) : driveUrl,
    fileName,
    itemType,
    mimeType,
    sizeBytes,
    category,
    folderName: row.drive_folder_name?.trim() || DRIVE_CONFIG.folderName,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function fetchDriveMediaItems(): Promise<{
  items: DriveMediaItem[];
  source: 'cloud' | 'cache';
  error?: string;
}> {
  const [cached, metaMap] = await Promise.all([loadCachedItems(), loadLocalMetaMap()]);

  if (!isSupabaseConfigured) {
    return { items: cached, source: 'cache' };
  }

  try {
    const { data, error } = await supabase
      .from('class_photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return {
        items: cached,
        source: 'cache',
        error: `Không đồng bộ được danh sách từ Supabase (${error.message}). Đang hiển thị bản lưu cục bộ.`,
      };
    }

    const remoteItems = ((data as RawSupabaseRow[] | null) ?? []).map((r) =>
      normalizeRow(r, metaMap),
    );
    const remoteFileIds = new Set(remoteItems.map((i) => i.driveFileId).filter(Boolean));
    const localOnlyExtras = cached.filter(
      (item) => item.localOnly && (!item.driveFileId || !remoteFileIds.has(item.driveFileId)),
    );
    const merged = [...localOnlyExtras, ...remoteItems].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    await saveCachedItems(merged);
    return { items: merged, source: 'cloud' };
  } catch (err) {
    return {
      items: cached,
      source: 'cache',
      error: err instanceof Error ? err.message : 'Lỗi kết nối danh sách Drive',
    };
  }
}

export interface SaveDriveMediaMeta {
  uploaderName: string;
  uploaderRole: DriveUploaderRole;
  uploaderSubject?: string | null;
  caption?: string;
  category?: DriveMediaCategory;
}

function isSchemaColumnMismatch(message: string, code?: string): boolean {
  if (code === 'PGRST204' || code === '42703') return true;
  return /column|schema cache|does not exist/i.test(message);
}

/**
 * Save uploaded Google Drive file metadata to Supabase `class_photos`
 * (auto-falling back to the legacy 7-column schema if optional columns haven't
 * been migrated yet) and update local cache immediately.
 */
export async function saveUploadedFilesToGallery(
  files: UploadedDriveFile[],
  meta: SaveDriveMediaMeta,
): Promise<{
  items: DriveMediaItem[];
  savedToCloud: boolean;
  warning?: string;
}> {
  if (files.length === 0) {
    return { items: [], savedToCloud: true };
  }

  const cleanName = meta.uploaderName.trim() || 'Thành viên 10T4';
  const cleanCaption = meta.caption?.trim() || '';

  const localMetaPatch: Record<string, LocalFileMeta> = {};
  const localItems: DriveMediaItem[] = files.map((file, idx) => {
    const category: DriveMediaCategory =
      meta.category ??
      (file.kind === 'photo' ? 'class_photo' : file.kind === 'video' ? 'media' : 'lecture');
    localMetaPatch[file.id] = {
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      category,
      uploaderRole: meta.uploaderRole,
      uploaderSubject: meta.uploaderSubject ?? null,
    };
    return {
      id: `local_${Date.now()}_${idx}_${file.id.slice(0, 8)}`,
      uploaderName: cleanName,
      uploaderRole: meta.uploaderRole,
      uploaderSubject: meta.uploaderSubject ?? null,
      caption: cleanCaption,
      driveFileId: file.id,
      imageUrl: file.thumbnailUrl || file.url,
      driveUrl: file.url,
      downloadUrl: file.downloadUrl,
      fileName: file.name,
      itemType: file.kind,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      category,
      folderName: file.folderName || DRIVE_CONFIG.folderName,
      createdAt: file.createdAt || new Date().toISOString(),
      localOnly: !isSupabaseConfigured,
    };
  });

  await saveLocalMetaEntries(localMetaPatch);

  if (!isSupabaseConfigured) {
    const existing = await loadCachedItems();
    await saveCachedItems([...localItems, ...existing]);
    return { items: localItems, savedToCloud: false };
  }

  // Try inserting with extended metadata columns first.
  const extendedRows = files.map((file) => {
    const category: DriveMediaCategory =
      meta.category ??
      (file.kind === 'photo' ? 'class_photo' : file.kind === 'video' ? 'media' : 'lecture');
    return {
      uploader_name: cleanName,
      uploader_role: meta.uploaderRole,
      uploader_subject: meta.uploaderSubject ?? null,
      caption: cleanCaption,
      drive_file_id: file.id,
      image_url: file.thumbnailUrl || file.url,
      file_name: file.name,
      item_type: file.kind,
      drive_url: file.url,
      file_size: file.sizeBytes,
      mime_type: file.mimeType,
      category,
      drive_folder_id: file.folderId,
      drive_folder_name: file.folderName,
    };
  });

  let insertError = (await supabase.from('class_photos').insert(extendedRows)).error;

  // Backwards-compatible fallback to the original 7 columns if the Supabase table
  // hasn't added the new optional columns yet.
  if (insertError && isSchemaColumnMismatch(insertError.message, insertError.code)) {
    const fallbackUploader = formatFallbackUploaderName(
      cleanName,
      meta.uploaderRole,
      meta.uploaderSubject,
    );
    const coreRows = files.map((file) => ({
      uploader_name: fallbackUploader,
      caption: cleanCaption,
      drive_file_id: file.id,
      image_url: file.thumbnailUrl || file.url,
      file_name: file.name,
      item_type: file.kind === 'photo' ? 'photo' : 'document',
      drive_url: file.url,
    }));
    insertError = (await supabase.from('class_photos').insert(coreRows)).error;
  }

  const existing = await loadCachedItems();
  if (insertError) {
    const fallbackLocal = localItems.map((i) => ({ ...i, localOnly: true }));
    await saveCachedItems([...fallbackLocal, ...existing]);
    return {
      items: fallbackLocal,
      savedToCloud: false,
      warning: `File đã lưu thành công trên Google Drive ${DRIVE_CONFIG.folderName}, nhưng chưa ghi được vào bảng Supabase (${insertError.message}). Đã lưu tạm trên máy.`,
    };
  }

  await saveCachedItems([...localItems, ...existing]);
  return { items: localItems, savedToCloud: true };
}

/**
 * Register a large file (MB / GB) that was uploaded directly into the Google Drive
 * `K8T4_app` folder by pasting its Google Drive sharing URL.
 */
export async function saveExternalDriveLinkToGallery(params: {
  driveUrl: string;
  fileName: string;
  sizeMb?: number;
  mediaKind?: DriveMediaKind;
  meta: SaveDriveMediaMeta;
}): Promise<{
  items: DriveMediaItem[];
  savedToCloud: boolean;
  warning?: string;
}> {
  const fileId = extractDriveFileId(params.driveUrl);
  if (!fileId) {
    throw new Error(
      'Link Google Drive chưa hợp lệ. Hãy sao chép link chia sẻ dạng https://drive.google.com/file/d/.../view',
    );
  }

  const finalName = params.fileName.trim() || `File_Drive_${fileId.slice(0, 6)}`;
  const kind = params.mediaKind ?? detectDriveMediaKind(finalName);
  const sizeBytes =
    params.sizeMb && Number.isFinite(params.sizeMb) && params.sizeMb > 0
      ? Math.round(params.sizeMb * 1024 * 1024)
      : 0;

  const synthetic: UploadedDriveFile = {
    id: fileId,
    name: finalName,
    url: buildDriveViewUrl(fileId),
    thumbnailUrl: kind === 'photo' ? buildDriveThumbnailUrl(fileId) : null,
    downloadUrl: buildDriveDownloadUrl(fileId),
    mimeType:
      kind === 'photo'
        ? 'image/jpeg'
        : kind === 'video'
          ? 'video/mp4'
          : 'application/octet-stream',
    sizeBytes,
    kind,
    folderId: DRIVE_CONFIG.folderId,
    folderName: DRIVE_CONFIG.folderName,
    createdAt: new Date().toISOString(),
  };

  return saveUploadedFilesToGallery([synthetic], params.meta);
}

export async function deleteDriveMediaItem(item: DriveMediaItem): Promise<void> {
  const existing = await loadCachedItems();
  const next = existing.filter((x) => x.id !== item.id && x.driveFileId !== item.driveFileId);
  await saveCachedItems(next);

  if (isSupabaseConfigured && !item.localOnly) {
    await supabase.from('class_photos').delete().eq('id', item.id);
  }
}

export function computeDriveStorageStats(items: DriveMediaItem[]): {
  totalCount: number;
  photoCount: number;
  videoCount: number;
  documentCount: number;
  teacherCount: number;
  studentCount: number;
  totalBytes: number;
} {
  let photoCount = 0;
  let videoCount = 0;
  let documentCount = 0;
  let teacherCount = 0;
  let studentCount = 0;
  let totalBytes = 0;

  for (const item of items) {
    if (item.itemType === 'photo') photoCount += 1;
    else if (item.itemType === 'video') videoCount += 1;
    else documentCount += 1;

    if (item.uploaderRole === 'teacher' || item.uploaderRole === 'subject_teacher') {
      teacherCount += 1;
    } else {
      studentCount += 1;
    }

    if (item.sizeBytes > 0) totalBytes += item.sizeBytes;
  }

  return {
    totalCount: items.length,
    photoCount,
    videoCount,
    documentCount,
    teacherCount,
    studentCount,
    totalBytes,
  };
}
