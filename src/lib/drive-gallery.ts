/**
 * Shared Google Drive (`K8T4_app`) Class Gallery & File Repository service.
 *
 * - Heavy binaries live in Google Drive folder `K8T4_app`.
 * - Lightweight metadata syncs via Supabase `public.class_photos` in 1 single RTT
 *   (with cached schema capability detection so legacy 10-column tables never waste
 *   a failing `PGRST204` POST) and propagates across devices in <300ms via
 *   Supabase Realtime Broadcast + `postgres_changes` + foreground polling.
 * - Instant stale-while-revalidate memory + AsyncStorage cache eliminates mount spinners.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  DRIVE_CONFIG,
  buildDriveDownloadUrl,
  buildDriveFallbackThumbnailUrl,
  buildDriveThumbnailUrl,
  buildDriveViewUrl,
  deleteFileFromDrive,
  detectDriveMediaKind,
  evictLocalPreviewUri,
  extractDriveFileId,
  extractDriveFileIdFromUrl,
  formatFallbackUploaderName,
  getLocalPreviewUri,
  parseUploaderMetadata,
  type DriveMediaKind,
  type DriveUploaderRole,
  type UploadedDriveFile,
} from '@/lib/drive';
import {
  emitLiveBroadcast,
  getRealtimeClientId,
  subscribeLiveBroadcast,
  type LiveBroadcastEvent,
} from '@/lib/realtime-bus';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const CACHE_KEY = 'class10t4:drive-gallery:v2';
const META_MAP_KEY = 'class10t4:drive-file-meta:v1';
const SCHEMA_MODE_KEY = 'class10t4:drive-gallery-schema:v1';

type ClassPhotosSchemaMode = 'extended' | 'legacy10';

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
    icon:
      | 'images-outline'
      | 'book-outline'
      | 'document-attach-outline'
      | 'videocam-outline'
      | 'folder-outline';
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
  fallbackImageUrl?: string | null;
  localPreviewUri?: string | null;
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
  /** True while the file is still uploading to Drive / Supabase (optimistic UI). */
  pending?: boolean;
  /** Temporary client ID matching `PendingUploadPreview.tempId`. */
  tempId?: string;
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

/* ---------- In-memory Stale-While-Revalidate Cache & Pub/Sub Bus ---------- */

let memoryItemsCache: DriveMediaItem[] | null = null;
let memoryMetaMap: Record<string, LocalFileMeta> | null = null;
let cachedSchemaMode: ClassPhotosSchemaMode | null = null;

/** Tracks Drive file IDs uploaded during this session so the uploader can always delete them immediately. */
const sessionUploadedDriveIds = new Set<string>();
/** Tracks in-flight/recent deletions (15s) so concurrent polls cannot resurrect a just-deleted item. */
const recentlyDeletedDriveIds = new Map<string, number>();
const recentlyDeletedRowIds = new Map<string, number>();
const RECENT_DELETE_TTL_MS = 15_000;

function pruneRecentDeletes(): void {
  const now = Date.now();
  for (const [k, ts] of recentlyDeletedDriveIds.entries()) {
    if (now - ts > RECENT_DELETE_TTL_MS) recentlyDeletedDriveIds.delete(k);
  }
  for (const [k, ts] of recentlyDeletedRowIds.entries()) {
    if (now - ts > RECENT_DELETE_TTL_MS) recentlyDeletedRowIds.delete(k);
  }
}

function isRecentlyDeletedItem(item: { id?: string | null; driveFileId?: string | null }): boolean {
  pruneRecentDeletes();
  const rowId = item.id?.trim();
  const drvId = item.driveFileId?.trim();
  if (rowId && recentlyDeletedRowIds.has(rowId)) return true;
  if (drvId && recentlyDeletedDriveIds.has(drvId)) return true;
  return false;
}

function recordDeletedTargets(rowId?: string | null, driveFileId?: string | null): void {
  const now = Date.now();
  const cleanRow = rowId?.trim();
  const cleanDrive = driveFileId?.trim();
  if (cleanRow) recentlyDeletedRowIds.set(cleanRow, now);
  if (cleanDrive) {
    recentlyDeletedDriveIds.set(cleanDrive, now);
    sessionUploadedDriveIds.delete(cleanDrive);
    evictLocalPreviewUri(cleanDrive);
    void removeLocalMetaEntry(cleanDrive);
  }
}

export function isSessionUploadedDriveFile(driveFileId?: string | null): boolean {
  const clean = driveFileId?.trim();
  if (!clean) return false;
  return sessionUploadedDriveIds.has(clean);
}

type GalleryListener = (items: DriveMediaItem[]) => void;
const galleryListeners = new Set<GalleryListener>();

function emitGalleryUpdate(items: DriveMediaItem[]): void {
  memoryItemsCache = items;
  for (const listener of galleryListeners) {
    try {
      listener(items);
    } catch {
      // Never let one subscriber break others
    }
  }
}

/** Subscribe to instant in-app gallery updates across all mounted screens & Home strip. */
export function subscribeDriveGallery(listener: GalleryListener): () => void {
  galleryListeners.add(listener);
  return () => {
    galleryListeners.delete(listener);
  };
}

/** Synchronous accessor for instant zero-spinner initial renders. */
export function getMemoryDriveMediaItems(): DriveMediaItem[] {
  return memoryItemsCache ?? [];
}

async function loadSchemaMode(): Promise<ClassPhotosSchemaMode | null> {
  if (cachedSchemaMode) return cachedSchemaMode;
  try {
    const raw = await AsyncStorage.getItem(SCHEMA_MODE_KEY);
    if (raw === 'extended' || raw === 'legacy10') {
      cachedSchemaMode = raw;
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

async function persistSchemaMode(mode: ClassPhotosSchemaMode): Promise<void> {
  if (cachedSchemaMode === mode) return;
  cachedSchemaMode = mode;
  try {
    await AsyncStorage.setItem(SCHEMA_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

async function loadLocalMetaMap(): Promise<Record<string, LocalFileMeta>> {
  if (memoryMetaMap) return memoryMetaMap;
  try {
    const raw = await AsyncStorage.getItem(META_MAP_KEY);
    if (!raw) {
      memoryMetaMap = {};
      return memoryMetaMap;
    }
    const parsed = JSON.parse(raw) as Record<string, LocalFileMeta> | null;
    memoryMetaMap = parsed && typeof parsed === 'object' ? parsed : {};
    return memoryMetaMap;
  } catch {
    return {};
  }
}

async function saveLocalMetaEntries(entries: Record<string, LocalFileMeta>): Promise<void> {
  try {
    const existing = await loadLocalMetaMap();
    const merged = { ...existing, ...entries };
    memoryMetaMap = merged;
    await AsyncStorage.setItem(META_MAP_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }
}

async function removeLocalMetaEntry(driveFileId: string): Promise<void> {
  const clean = driveFileId.trim();
  if (!clean) return;
  try {
    const existing = await loadLocalMetaMap();
    if (!(clean in existing)) return;
    const next = { ...existing };
    delete next[clean];
    memoryMetaMap = next;
    await AsyncStorage.setItem(META_MAP_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

function hydrateItemUrls(item: DriveMediaItem): DriveMediaItem {
  const driveFileId =
    item.driveFileId?.trim() ||
    extractDriveFileId(item.driveUrl ?? '') ||
    extractDriveFileId(item.imageUrl ?? '') ||
    '';
  const localPreview = driveFileId ? getLocalPreviewUri(driveFileId) : item.localPreviewUri ?? null;
  if (item.itemType === 'photo' && driveFileId) {
    return {
      ...item,
      driveFileId,
      imageUrl: buildDriveThumbnailUrl(driveFileId, 800),
      fallbackImageUrl: buildDriveFallbackThumbnailUrl(driveFileId, 800),
      localPreviewUri: localPreview || item.localPreviewUri || null,
    };
  }
  return {
    ...item,
    driveFileId,
    localPreviewUri: localPreview || item.localPreviewUri || null,
  };
}

/** Stale-while-revalidate instant cache loader (memory first, then AsyncStorage). */
export async function getCachedDriveMediaItems(): Promise<DriveMediaItem[]> {
  if (memoryItemsCache !== null) return memoryItemsCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) {
      memoryItemsCache = [];
      return [];
    }
    const parsed = JSON.parse(raw) as DriveMediaItem[] | null;
    const list = Array.isArray(parsed) ? parsed.map(hydrateItemUrls) : [];
    memoryItemsCache = list;
    return list;
  } catch {
    return [];
  }
}

async function saveCachedItems(items: DriveMediaItem[]): Promise<void> {
  const clean = items.filter((item) => !item.pending).slice(0, 300);
  emitGalleryUpdate(clean);
  try {
    // Strip transient blob: localPreviewUri before serializing to AsyncStorage.
    const serializable = clean.map(({ localPreviewUri: _lp, pending: _p, tempId: _t, ...rest }) => rest);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(serializable));
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

function mergeItemLists(incoming: DriveMediaItem[], existing: DriveMediaItem[]): DriveMediaItem[] {
  const byKey = new Map<string, DriveMediaItem>();

  const put = (item: DriveMediaItem, preferOverwrite: boolean) => {
    const key = item.driveFileId ? `drv:${item.driveFileId}` : `id:${item.id}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      return;
    }
    if (preferOverwrite) {
      byKey.set(key, {
        ...prev,
        ...item,
        localPreviewUri: item.localPreviewUri || prev.localPreviewUri || null,
        sizeBytes: item.sizeBytes > 0 ? item.sizeBytes : prev.sizeBytes,
        localOnly: Boolean(item.localOnly && prev.localOnly),
      });
    }
  };

  for (const item of existing) put(item, false);
  for (const item of incoming) put(item, true);

  return Array.from(byKey.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  const fileName =
    row.file_name?.trim() || (row.item_type === 'document' ? 'Tài liệu lớp' : 'Ảnh lớp 10T4');
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
        ? buildDriveThumbnailUrl(driveFileId, 800)
        : row.image_url?.trim() || driveUrl
      : row.image_url?.trim() || driveUrl;
  const fallbackImageUrl =
    itemType === 'photo' && driveFileId ? buildDriveFallbackThumbnailUrl(driveFileId, 800) : null;
  const localPreviewUri = driveFileId ? getLocalPreviewUri(driveFileId) : null;

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
    fallbackImageUrl,
    localPreviewUri,
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

function normalizeBroadcastItem(
  raw: Record<string, unknown>,
  metaMap: Record<string, LocalFileMeta>,
): DriveMediaItem | null {
  if (!raw || typeof raw !== 'object') return null;

  // Already a camelCase DriveMediaItem from broadcast
  if (typeof raw.driveFileId === 'string' || typeof raw.imageUrl === 'string') {
    const driveFileId =
      (typeof raw.driveFileId === 'string' ? raw.driveFileId.trim() : '') ||
      extractDriveFileId(typeof raw.driveUrl === 'string' ? raw.driveUrl : '') ||
      extractDriveFileId(typeof raw.imageUrl === 'string' ? raw.imageUrl : '') ||
      '';
    const fileName =
      typeof raw.fileName === 'string' && raw.fileName.trim() ? raw.fileName.trim() : 'Ảnh lớp 10T4';
    const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType : '';
    const itemType: DriveMediaKind =
      raw.itemType === 'photo' || raw.itemType === 'video' || raw.itemType === 'document'
        ? raw.itemType
        : detectDriveMediaKind(fileName, mimeType);
    const parsedUploader = parseUploaderMetadata(
      typeof raw.uploaderName === 'string' ? raw.uploaderName : 'Thành viên 10T4',
      typeof raw.uploaderRole === 'string' ? raw.uploaderRole : undefined,
      typeof raw.uploaderSubject === 'string' ? raw.uploaderSubject : undefined,
    );
    const driveUrl =
      (typeof raw.driveUrl === 'string' && raw.driveUrl.trim()) ||
      (driveFileId ? buildDriveViewUrl(driveFileId) : '');
    const imageUrl =
      itemType === 'photo' && driveFileId
        ? buildDriveThumbnailUrl(driveFileId, 800)
        : (typeof raw.imageUrl === 'string' && raw.imageUrl.trim()) || driveUrl;
    const category: DriveMediaCategory = isValidCategory(raw.category)
      ? raw.category
      : itemType === 'photo'
        ? 'class_photo'
        : itemType === 'video'
          ? 'media'
          : 'lecture';

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : `bcast_${driveFileId || Date.now()}`,
      uploaderName: parsedUploader.displayName,
      uploaderRole: parsedUploader.role,
      uploaderSubject: parsedUploader.subject,
      caption: typeof raw.caption === 'string' ? raw.caption : '',
      driveFileId,
      imageUrl,
      fallbackImageUrl:
        itemType === 'photo' && driveFileId ? buildDriveFallbackThumbnailUrl(driveFileId, 800) : null,
      localPreviewUri: driveFileId ? getLocalPreviewUri(driveFileId) : null,
      driveUrl,
      downloadUrl:
        (typeof raw.downloadUrl === 'string' && raw.downloadUrl.trim()) ||
        (driveFileId ? buildDriveDownloadUrl(driveFileId) : driveUrl),
      fileName,
      itemType,
      mimeType,
      sizeBytes: typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes) ? raw.sizeBytes : 0,
      category,
      folderName:
        typeof raw.folderName === 'string' && raw.folderName.trim()
          ? raw.folderName.trim()
          : DRIVE_CONFIG.folderName,
      createdAt:
        typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    };
  }

  // Raw snake_case row fallback
  return normalizeRow(raw as RawSupabaseRow, metaMap);
}

function toBroadcastPayload(item: DriveMediaItem): Record<string, unknown> {
  return {
    id: item.id,
    uploaderName: item.uploaderName,
    uploaderRole: item.uploaderRole,
    uploaderSubject: item.uploaderSubject,
    caption: item.caption,
    driveFileId: item.driveFileId,
    imageUrl: item.imageUrl,
    driveUrl: item.driveUrl,
    downloadUrl: item.downloadUrl,
    fileName: item.fileName,
    itemType: item.itemType,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    category: item.category,
    folderName: item.folderName,
    createdAt: item.createdAt,
  };
}

/** Build an instant (<50ms) optimistic card item while the file is uploading to Drive. */
export function buildOptimisticDriveMediaItem(params: {
  tempId: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  localUri?: string;
  kind: 'image' | 'video' | 'document';
  uploaderName: string;
  uploaderRole: DriveUploaderRole;
  uploaderSubject?: string | null;
  caption?: string;
  category?: DriveMediaCategory;
}): DriveMediaItem {
  const itemType: DriveMediaKind = params.kind === 'image' ? 'photo' : params.kind;
  const category: DriveMediaCategory =
    params.category ??
    (itemType === 'photo' ? 'class_photo' : itemType === 'video' ? 'media' : 'lecture');
  return {
    id: params.tempId,
    tempId: params.tempId,
    pending: true,
    uploaderName: params.uploaderName.trim() || 'Thành viên 10T4',
    uploaderRole: params.uploaderRole,
    uploaderSubject: params.uploaderSubject ?? null,
    caption: params.caption?.trim() || '',
    driveFileId: '',
    imageUrl: params.localUri || '',
    fallbackImageUrl: null,
    localPreviewUri: params.localUri || null,
    driveUrl: '',
    downloadUrl: '',
    fileName: params.fileName,
    itemType,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes ?? 0,
    category,
    folderName: DRIVE_CONFIG.folderName,
    createdAt: new Date().toISOString(),
  };
}

export async function fetchDriveMediaItems(): Promise<{
  items: DriveMediaItem[];
  source: 'cloud' | 'cache';
  error?: string;
}> {
  const [cached, metaMap] = await Promise.all([getCachedDriveMediaItems(), loadLocalMetaMap()]);

  if (!isSupabaseConfigured) {
    return { items: cached, source: 'cache' };
  }

  try {
    const { data, error } = await supabase
      .from('class_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return {
        items: cached,
        source: 'cache',
        error: `Không đồng bộ được danh sách từ Supabase (${error.message}). Đang hiển thị bản lưu cục bộ.`,
      };
    }

    const rows = (data as RawSupabaseRow[] | null) ?? [];

    // Auto-detect live DB schema columns on read so uploads NEVER waste a failing POST!
    if (rows.length > 0) {
      const hasExtended = Object.prototype.hasOwnProperty.call(rows[0], 'uploader_role');
      void persistSchemaMode(hasExtended ? 'extended' : 'legacy10');
    }

    const remoteItems = rows
      .map((r) => normalizeRow(r, metaMap))
      .filter((item) => !isRecentlyDeletedItem(item));
    const remoteFileIds = new Set(remoteItems.map((i) => i.driveFileId).filter(Boolean));
    const localOnlyExtras = cached.filter(
      (item) =>
        !isRecentlyDeletedItem(item) &&
        item.localOnly &&
        (!item.driveFileId || !remoteFileIds.has(item.driveFileId)),
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

function isCheckConstraintError(message: string, code?: string): boolean {
  if (code === '23514') return true;
  return /check constraint/i.test(message);
}

/**
 * Save uploaded Google Drive file metadata to Supabase `class_photos` in 1 single RTT
 * (using cached schema detection + `.select('*')`), update local cache immediately,
 * notify all mounted screens, and emit Realtime Broadcast so other devices update in <300ms.
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

  for (const f of files) {
    const cleanId = f.id?.trim();
    if (cleanId) {
      sessionUploadedDriveIds.add(cleanId);
      recentlyDeletedDriveIds.delete(cleanId);
    }
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
    const fastThumb =
      file.kind === 'photo' ? buildDriveThumbnailUrl(file.id, 800) : file.thumbnailUrl || file.url;
    return {
      id: `local_${Date.now()}_${idx}_${file.id.slice(0, 8)}`,
      uploaderName: cleanName,
      uploaderRole: meta.uploaderRole,
      uploaderSubject: meta.uploaderSubject ?? null,
      caption: cleanCaption,
      driveFileId: file.id,
      imageUrl: fastThumb,
      fallbackImageUrl: file.kind === 'photo' ? buildDriveFallbackThumbnailUrl(file.id, 800) : null,
      localPreviewUri: getLocalPreviewUri(file.id),
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

  const [schemaMode] = await Promise.all([
    loadSchemaMode(),
    saveLocalMetaEntries(localMetaPatch),
  ]);

  if (!isSupabaseConfigured) {
    const latestExisting = await getCachedDriveMediaItems();
    const merged = mergeItemLists(localItems, latestExisting);
    await saveCachedItems(merged);
    return { items: localItems, savedToCloud: false };
  }

  const buildExtendedRows = () =>
    files.map((file) => {
      const category: DriveMediaCategory =
        meta.category ??
        (file.kind === 'photo' ? 'class_photo' : file.kind === 'video' ? 'media' : 'lecture');
      const thumb =
        file.kind === 'photo' ? buildDriveThumbnailUrl(file.id, 800) : file.thumbnailUrl || file.url;
      return {
        uploader_name: cleanName,
        uploader_role: meta.uploaderRole,
        uploader_subject: meta.uploaderSubject ?? null,
        caption: cleanCaption,
        drive_file_id: file.id,
        image_url: thumb,
        file_name: file.name,
        item_type: file.kind,
        drive_url: file.url,
        file_size: file.sizeBytes,
        mime_type: file.mimeType || '',
        category,
        drive_folder_id: file.folderId,
        drive_folder_name: file.folderName,
      };
    });

  const buildLegacy10Rows = (clampVideoToDocument = false) => {
    const fallbackUploader = formatFallbackUploaderName(
      cleanName,
      meta.uploaderRole,
      meta.uploaderSubject,
    );
    return files.map((file) => {
      const thumb =
        file.kind === 'photo' ? buildDriveThumbnailUrl(file.id, 800) : file.thumbnailUrl || file.url;
      return {
        uploader_name: fallbackUploader,
        caption: cleanCaption,
        drive_file_id: file.id,
        image_url: thumb,
        file_name: file.name,
        mime_type: file.mimeType || '',
        item_type: clampVideoToDocument && file.kind === 'video' ? 'document' : file.kind,
        drive_url: file.url,
      };
    });
  };

  let insertedRows: RawSupabaseRow[] | null = null;
  let insertError: { message: string; code?: string } | null = null;

  if (schemaMode === 'legacy10') {
    const res = await supabase.from('class_photos').insert(buildLegacy10Rows(false)).select('*');
    insertedRows = (res.data as RawSupabaseRow[] | null) ?? null;
    insertError = res.error;
    if (insertError && isCheckConstraintError(insertError.message, insertError.code)) {
      const retry = await supabase.from('class_photos').insert(buildLegacy10Rows(true)).select('*');
      insertedRows = (retry.data as RawSupabaseRow[] | null) ?? null;
      insertError = retry.error;
    }
  } else {
    const res = await supabase.from('class_photos').insert(buildExtendedRows()).select('*');
    insertedRows = (res.data as RawSupabaseRow[] | null) ?? null;
    insertError = res.error;

    if (!insertError) {
      void persistSchemaMode('extended');
    } else if (isSchemaColumnMismatch(insertError.message, insertError.code)) {
      void persistSchemaMode('legacy10');
      const fallbackRes = await supabase
        .from('class_photos')
        .insert(buildLegacy10Rows(false))
        .select('*');
      insertedRows = (fallbackRes.data as RawSupabaseRow[] | null) ?? null;
      insertError = fallbackRes.error;
      if (insertError && isCheckConstraintError(insertError.message, insertError.code)) {
        const retry = await supabase
          .from('class_photos')
          .insert(buildLegacy10Rows(true))
          .select('*');
        insertedRows = (retry.data as RawSupabaseRow[] | null) ?? null;
        insertError = retry.error;
      }
    }
  }

  if (insertError) {
    const fallbackLocal = localItems.map((i) => ({ ...i, localOnly: true }));
    const latestExisting = await getCachedDriveMediaItems();
    const merged = mergeItemLists(fallbackLocal, latestExisting);
    await saveCachedItems(merged);
    return {
      items: fallbackLocal,
      savedToCloud: false,
      warning: `File đã lưu thành công trên Google Drive ${DRIVE_CONFIG.folderName}, nhưng chưa ghi được vào bảng Supabase (${insertError.message}). Đã lưu tạm trên máy.`,
    };
  }

  const metaMap = await loadLocalMetaMap();
  const canonicalItems =
    insertedRows && insertedRows.length > 0
      ? insertedRows.map((row) => normalizeRow(row, metaMap))
      : localItems;

  // Re-read the latest cache right after insert so parallel uploads never overwrite siblings.
  const latestExisting = await getCachedDriveMediaItems();
  const merged = mergeItemLists(canonicalItems, latestExisting);
  await saveCachedItems(merged);

  // Instantly push every new item to all other devices & browser tabs (<300ms)!
  for (const item of canonicalItems) {
    emitLiveBroadcast({
      type: 'photo-added',
      item: toBroadcastPayload(item),
    });
  }

  return { items: canonicalItems, savedToCloud: true };
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
    thumbnailUrl: kind === 'photo' ? buildDriveThumbnailUrl(fileId, 800) : null,
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

export type DeleteDriveMediaTarget = {
  id?: string;
  driveFileId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
};

export type DeleteDriveMediaResult = {
  ok: boolean;
  trashedDrive: boolean;
  removedSheetRows: number;
};

function isPersistableDbRowId(id: string): boolean {
  if (!id) return false;
  if (/^(local_|tmp_|opt_|drv_|bcast_)/i.test(id)) return false;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    /^\d+$/.test(id)
  );
}

/**
 * Universal deletion pipeline: removes an uploaded photo/file from:
 * 1. Local memory cache, AsyncStorage cache, meta map & local preview URI cache (instant 0ms UI)
 * 2. All open browser tabs & devices via Realtime Broadcast (`photo-deleted` with `id` + `driveFileId`)
 * 3. Supabase `public.class_photos` (by `drive_file_id` AND by row `id`, cleaning duplicates too)
 * 4. Google Drive (`K8T4_app`) Trash + any connected Google Sheets ("Excel") log rows via Apps Script.
 */
export async function deleteDriveFileEverywhere(
  target: DeleteDriveMediaTarget,
): Promise<DeleteDriveMediaResult> {
  const cleanId = target.id?.trim() || '';
  const driveFileId =
    target.driveFileId?.trim() ||
    extractDriveFileIdFromUrl(target.fileUrl) ||
    (cleanId && !isPersistableDbRowId(cleanId) && extractDriveFileId(cleanId)) ||
    null;

  if (!cleanId && !driveFileId) {
    return { ok: false, trashedDrive: false, removedSheetRows: 0 };
  }

  recordDeletedTargets(cleanId, driveFileId);

  // 1. Instant local cache + in-app subscriber removal (0ms UI update)
  const existing = await getCachedDriveMediaItems();
  const next = existing.filter((x) => {
    if (cleanId && (x.id === cleanId || x.driveFileId === cleanId)) return false;
    if (driveFileId && (x.driveFileId === driveFileId || x.id === driveFileId)) return false;
    return true;
  });
  await saveCachedItems(next);

  // 2. Broadcast cross-tab & cross-device immediately
  emitLiveBroadcast({
    type: 'photo-deleted',
    id: cleanId || driveFileId || '',
    driveFileId: driveFileId || undefined,
  });

  // 3. Delete in Supabase `class_photos` AND Google Drive + Google Sheets in parallel
  const supabaseDeleteTask = (async () => {
    if (!isSupabaseConfigured) return;
    try {
      if (driveFileId) {
        await supabase.from('class_photos').delete().eq('drive_file_id', driveFileId);
      }
      if (cleanId && isPersistableDbRowId(cleanId)) {
        await supabase.from('class_photos').delete().eq('id', cleanId);
      }
    } catch {
      // Non-fatal: cache & broadcast already updated cleanly
    }
  })();

  const driveDeleteTask = deleteFileFromDrive({
    fileId: driveFileId,
    fileUrl: target.fileUrl,
    fileName: target.fileName,
  }).catch(() => ({
    ok: false,
    trashedDrive: false,
    removedSheetRows: 0,
  }));

  const [, driveRes] = await Promise.all([supabaseDeleteTask, driveDeleteTask]);

  return {
    ok: true,
    trashedDrive: Boolean(driveRes.trashedDrive),
    removedSheetRows: typeof driveRes.removedSheetRows === 'number' ? driveRes.removedSheetRows : 0,
  };
}

export async function deleteDriveMediaItem(item: DriveMediaItem): Promise<DeleteDriveMediaResult> {
  return deleteDriveFileEverywhere({
    id: item.id,
    driveFileId: item.driveFileId,
    fileUrl: item.driveUrl || item.imageUrl,
    fileName: item.fileName,
  });
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

/* ---------- Live React Hook (`useDriveGallery`) ---------- */

export interface UseDriveGalleryOptions {
  limit?: number;
  pollMs?: number;
}

export interface UseDriveGalleryResult {
  items: DriveMediaItem[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  prependOptimistic: (pendingItems: DriveMediaItem[]) => void;
  linkOptimisticDriveId: (tempId: string, driveFileId: string) => void;
  resolveOptimistic: (tempId: string, savedItem: DriveMediaItem) => void;
  failOptimistic: (tempId: string) => void;
  removeItem: (item: DriveMediaItem) => Promise<DeleteDriveMediaResult>;
}

/**
 * Live gallery state hook with stale-while-revalidate instant cache, optimistic
 * upload cards, in-app pub/sub, Supabase Realtime Broadcast + `postgres_changes`,
 * visibility/focus refresh, and foreground polling.
 */
export function useDriveGallery(options: UseDriveGalleryOptions = {}): UseDriveGalleryResult {
  const { limit, pollMs = 5000 } = options;

  const [baseItems, setBaseItems] = useState<DriveMediaItem[]>(() => getMemoryDriveMediaItems());
  const [optimisticItems, setOptimisticItems] = useState<DriveMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(() => memoryItemsCache === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setRefreshing(true);
    }
    try {
      const result = await fetchDriveMediaItems();
      lastFetchAtRef.current = Date.now();
      if (!mountedRef.current) return;
      setBaseItems(result.items);
      setError(result.error ?? '');
      setLoading(false);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && !silent) {
        setRefreshing(false);
      }
    }
  }, []);

  // Hydrate AsyncStorage cache immediately, then silently fetch latest from cloud.
  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    void (async () => {
      if (memoryItemsCache === null) {
        const cached = await getCachedDriveMediaItems();
        if (!active) return;
        setBaseItems(cached);
        if (cached.length > 0) {
          setLoading(false);
        }
      }
      await refresh({ silent: true });
    })();

    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [refresh]);

  // In-app pub/sub + Cross-device Realtime Broadcast + Supabase postgres_changes
  useEffect(() => {
    const unsubLocal = subscribeDriveGallery((nextItems) => {
      if (!mountedRef.current) return;
      setBaseItems(nextItems);
      setLoading(false);
    });

    const unsubBroadcast = subscribeLiveBroadcast((event: LiveBroadcastEvent) => {
      if (!mountedRef.current) return;
      // Ignore self-emitted broadcasts: saveCachedItems already notified all in-process hooks.
      if (event.senderId === getRealtimeClientId()) return;
      if (event.type === 'photo-added') {
        void (async () => {
          const metaMap = await loadLocalMetaMap();
          const normalized = normalizeBroadcastItem(event.item, metaMap);
          if (!normalized || !mountedRef.current || isRecentlyDeletedItem(normalized)) return;
          const existing = await getCachedDriveMediaItems();
          const merged = mergeItemLists([normalized], existing);
          await saveCachedItems(merged);
        })();
      } else if (event.type === 'photo-deleted') {
        void (async () => {
          const eventId = event.id?.trim() || '';
          const eventDriveId = event.driveFileId?.trim() || '';
          if (!eventId && !eventDriveId) return;
          recordDeletedTargets(eventId, eventDriveId);
          const existing = await getCachedDriveMediaItems();
          const next = existing.filter((x) => {
            if (eventId && (x.id === eventId || x.driveFileId === eventId)) return false;
            if (eventDriveId && (x.driveFileId === eventDriveId || x.id === eventDriveId)) {
              return false;
            }
            return true;
          });
          if (next.length !== existing.length) {
            await saveCachedItems(next);
          }
        })();
      }
    });

    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      const channelName = `class-photos-live-${Math.random().toString(36).slice(2, 8)}`;
      realtimeChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'class_photos' },
          (payload) => {
            void (async () => {
              const row = payload.new as RawSupabaseRow | null;
              if (!row) return;
              const metaMap = await loadLocalMetaMap();
              const item = normalizeRow(row, metaMap);
              if (isRecentlyDeletedItem(item)) return;
              const existing = await getCachedDriveMediaItems();
              const merged = mergeItemLists([item], existing);
              await saveCachedItems(merged);
            })();
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'class_photos' },
          (payload) => {
            void (async () => {
              const oldRow = payload.old as RawSupabaseRow | null;
              const deletedId = oldRow?.id ? String(oldRow.id) : '';
              const deletedDriveId = oldRow?.drive_file_id?.trim() || '';
              if (!deletedId && !deletedDriveId) return;
              recordDeletedTargets(deletedId, deletedDriveId);
              const existing = await getCachedDriveMediaItems();
              const next = existing.filter((x) => {
                if (deletedId && x.id === deletedId) return false;
                if (deletedDriveId && x.driveFileId === deletedDriveId) return false;
                return true;
              });
              if (next.length !== existing.length) {
                await saveCachedItems(next);
              }
            })();
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'class_photos' },
          () => {
            void refresh({ silent: true });
          },
        )
        .subscribe();
    }

    return () => {
      unsubLocal();
      unsubBroadcast();
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [refresh]);

  // Foreground poll + Web focus/visibilitychange + Native AppState active refresh
  useEffect(() => {
    const maybeRefresh = () => {
      if (Date.now() - lastFetchAtRef.current < 1500) return;
      void refresh({ silent: true });
    };

    const isForeground = (): boolean => {
      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return false;
        }
        return true;
      }
      return AppState.currentState === 'active';
    };

    const timer =
      pollMs > 0
        ? setInterval(() => {
            if (isForeground()) {
              void refresh({ silent: true });
            }
          }, pollMs)
        : null;

    let appStateSub: { remove: () => void } | null = null;
    const onWebVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        maybeRefresh();
      }
    };
    const onWebFocus = () => {
      maybeRefresh();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', onWebFocus);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onWebVisible);
      }
    } else {
      appStateSub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          maybeRefresh();
        }
      });
    }

    return () => {
      if (timer) clearInterval(timer);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', onWebFocus);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onWebVisible);
        }
      }
      appStateSub?.remove();
    };
  }, [pollMs, refresh]);

  const prependOptimistic = useCallback((pendingItems: DriveMediaItem[]) => {
    if (pendingItems.length === 0) return;
    setOptimisticItems((prev) => {
      const incomingIds = new Set(pendingItems.map((i) => i.tempId || i.id));
      const kept = prev.filter((p) => !incomingIds.has(p.tempId || p.id));
      return [...pendingItems, ...kept];
    });
    setLoading(false);
  }, []);

  const linkOptimisticDriveId = useCallback((tempId: string, driveFileId: string) => {
    const cleanId = driveFileId.trim();
    if (!cleanId) return;
    setOptimisticItems((prev) =>
      prev.map((item) =>
        item.tempId === tempId || item.id === tempId ? { ...item, driveFileId: cleanId } : item,
      ),
    );
  }, []);

  const resolveOptimistic = useCallback((tempId: string, savedItem: DriveMediaItem) => {
    setOptimisticItems((prev) => prev.filter((p) => p.tempId !== tempId && p.id !== tempId));
    setBaseItems((prev) => mergeItemLists([savedItem], prev));
  }, []);

  const failOptimistic = useCallback((tempId: string) => {
    setOptimisticItems((prev) => prev.filter((p) => p.tempId !== tempId && p.id !== tempId));
  }, []);

  const removeItem = useCallback(async (item: DriveMediaItem): Promise<DeleteDriveMediaResult> => {
    setOptimisticItems((prev) =>
      prev.filter(
        (x) =>
          x.id !== item.id &&
          x.tempId !== item.tempId &&
          (!item.driveFileId || x.driveFileId !== item.driveFileId),
      ),
    );
    setBaseItems((prev) =>
      prev.filter((x) => x.id !== item.id && (!item.driveFileId || x.driveFileId !== item.driveFileId)),
    );
    return deleteDriveMediaItem(item);
  }, []);

  const items = useMemo(() => {
    const confirmedDriveIds = new Set(baseItems.map((b) => b.driveFileId).filter(Boolean));
    const activeOptimistic = optimisticItems.filter(
      (opt) => !opt.driveFileId || !confirmedDriveIds.has(opt.driveFileId),
    );
    const combined = [...activeOptimistic, ...baseItems];
    return typeof limit === 'number' && limit > 0 ? combined.slice(0, limit) : combined;
  }, [optimisticItems, baseItems, limit]);

  return {
    items,
    loading,
    refreshing,
    error,
    refresh,
    prependOptimistic,
    linkOptimisticDriveId,
    resolveOptimistic,
    failOptimistic,
    removeItem,
  };
}
