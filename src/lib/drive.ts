/**
 * Google Drive (`K8T4_app`) upload & media utility layer.
 *
 * All heavy binary data (photos, videos, PDFs, Office docs, archives, backups)
 * is stored directly in the class Google Drive folder `K8T4_app` so the app
 * and Supabase only keep lightweight metadata links.
 */

import type { MemberRole } from '@/types/auth';

export type DriveUploaderRole = MemberRole;

export type DriveMediaKind = 'photo' | 'video' | 'document';

export const DRIVE_CONFIG = {
  folderName: process.env.EXPO_PUBLIC_DRIVE_FOLDER_NAME?.trim() || 'K8T4_app',
  folderId:
    process.env.EXPO_PUBLIC_DRIVE_FOLDER_ID?.trim() || '1mjTLnW1ztWKD2PvKJ0aW8uowiLD5eR_D',
  /** Direct upload through Google Apps Script safely handles up to ~25 MB per file. */
  maxDirectUploadBytes: 25 * 1024 * 1024,
} as const;

export const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_CONFIG.folderId}`;

export interface UploadedDriveFile {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  downloadUrl: string;
  mimeType: string;
  sizeBytes: number;
  kind: DriveMediaKind;
  folderId: string;
  folderName: string;
  createdAt: string;
}

export interface UploadToDriveParams {
  fileName: string;
  mimeType: string;
  base64Content: string;
  sizeBytes?: number;
  uploaderName?: string;
  uploaderRole?: DriveUploaderRole;
  category?: string;
}

const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|svg)$/i;
const VIDEO_EXT_REGEX = /\.(mp4|mov|m4v|webm|avi|mkv|3gp)$/i;

export function isDriveUploadConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_DRIVE_API_URL?.trim() &&
      process.env.EXPO_PUBLIC_DRIVE_API_KEY?.trim(),
  );
}

export function detectDriveMediaKind(fileName: string, mimeType?: string | null): DriveMediaKind {
  const cleanMime = (mimeType ?? '').toLowerCase();
  if (cleanMime.startsWith('image/') || IMAGE_EXT_REGEX.test(fileName)) {
    return 'photo';
  }
  if (cleanMime.startsWith('video/') || VIDEO_EXT_REGEX.test(fileName)) {
    return 'video';
  }
  return 'document';
}

export function buildDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildDriveThumbnailUrl(fileId: string, width = 1200): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

export function buildDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/** Extract a Google Drive file ID from any common Drive sharing URL. */
export function extractDriveFileId(rawUrl: string): string | null {
  const input = rawUrl.trim();
  if (!input) return null;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/document\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
  ];

  for (const regex of patterns) {
    const match = input.match(regex);
    if (match?.[1]) return match[1];
  }

  // Raw file ID pasted directly
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }

  return null;
}

export function isGoogleDriveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /drive\.google\.com|docs\.google\.com/i.test(url);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : idx >= 3 ? 2 : 1;
  return `${value.toFixed(digits)} ${units[idx]}`;
}

export function estimateBytesFromBase64(base64Content: string): number {
  const len = base64Content.length;
  if (len === 0) return 0;
  const padding = base64Content.endsWith('==') ? 2 : base64Content.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Cross-platform UTF-8 string to Base64 encoder (works in Web & React Native Hermes). */
export function utf8ToBase64(text: string): string {
  let bytes: Uint8Array;
  if (typeof TextEncoder !== 'undefined') {
    bytes = new TextEncoder().encode(text);
  } else {
    const utf8 = unescape(encodeURIComponent(text));
    bytes = new Uint8Array(utf8.length);
    for (let i = 0; i < utf8.length; i += 1) {
      bytes[i] = utf8.charCodeAt(i);
    }
  }

  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;

    output += BASE64_CHARS[(triple >> 18) & 63];
    output += BASE64_CHARS[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64_CHARS[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? BASE64_CHARS[triple & 63] : '=';
  }
  return output;
}

export function getFileExtension(fileName: string): string {
  const match = fileName.trim().match(/\.([a-zA-Z0-9]{1,8})$/);
  return match ? match[1].toUpperCase() : 'FILE';
}

export function getFileVisualMeta(fileName: string, mimeType?: string | null): {
  icon: 'image' | 'videocam' | 'document-text' | 'easel' | 'grid' | 'archive' | 'musical-notes' | 'document';
  badge: string;
  tone: 'accent' | 'danger' | 'success' | 'warning' | 'purple';
} {
  const kind = detectDriveMediaKind(fileName, mimeType);
  if (kind === 'photo') return { icon: 'image', badge: getFileExtension(fileName) || 'IMG', tone: 'accent' };
  if (kind === 'video') return { icon: 'videocam', badge: getFileExtension(fileName) || 'VIDEO', tone: 'purple' };

  const ext = getFileExtension(fileName).toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();

  if (ext === 'pdf' || mime.includes('pdf')) {
    return { icon: 'document-text', badge: 'PDF', tone: 'danger' };
  }
  if (['doc', 'docx', 'rtf', 'txt', 'md'].includes(ext) || mime.includes('word')) {
    return { icon: 'document-text', badge: ext.toUpperCase() || 'DOC', tone: 'accent' };
  }
  if (['ppt', 'pptx', 'key'].includes(ext) || mime.includes('presentation')) {
    return { icon: 'easel', badge: ext.toUpperCase() || 'PPT', tone: 'warning' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('sheet') || mime.includes('excel')) {
    return { icon: 'grid', badge: ext.toUpperCase() || 'XLS', tone: 'success' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return { icon: 'archive', badge: ext.toUpperCase() || 'ZIP', tone: 'purple' };
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext) || mime.startsWith('audio/')) {
    return { icon: 'musical-notes', badge: ext.toUpperCase() || 'AUDIO', tone: 'purple' };
  }
  return { icon: 'document', badge: ext.toUpperCase() || 'FILE', tone: 'accent' };
}

/**
 * Upload a Base64-encoded file directly into Google Drive folder `K8T4_app`
 * via the configured Google Apps Script Web App endpoint.
 */
export async function uploadFileToDrive(params: UploadToDriveParams): Promise<UploadedDriveFile> {
  const url = process.env.EXPO_PUBLIC_DRIVE_API_URL?.trim();
  const apiKey = process.env.EXPO_PUBLIC_DRIVE_API_KEY?.trim();

  if (!url || !apiKey) {
    throw new Error(
      'Chưa cấu hình EXPO_PUBLIC_DRIVE_API_URL hoặc EXPO_PUBLIC_DRIVE_API_KEY để kết nối Google Drive K8T4_app.',
    );
  }

  const cleanMime = params.mimeType?.trim() || 'application/octet-stream';
  const sizeBytes = params.sizeBytes ?? estimateBytesFromBase64(params.base64Content);

  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      apiKey,
      fileName: params.fileName,
      mimeType: cleanMime,
      fileBase64: params.base64Content,
      folderId: DRIVE_CONFIG.folderId,
      folderName: DRIVE_CONFIG.folderName,
      uploaderName: params.uploaderName,
      uploaderRole: params.uploaderRole,
      category: params.category,
    }),
  });

  const rawText = await response.text();
  let payload: {
    status?: string;
    message?: string;
    fileInfo?: {
      id?: string;
      name?: string;
      url?: string;
      createdAt?: string;
      size?: number;
      mimeType?: string;
    };
  } | null = null;

  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Google Drive API (${DRIVE_CONFIG.folderName}) trả về phản hồi không hợp lệ (HTTP ${response.status}). Hãy kiểm tra lại quyền Deploy Web App của Google Apps Script.`,
    );
  }

  if (!response.ok || payload?.status !== 'success' || !payload?.fileInfo?.id) {
    throw new Error(
      payload?.message || `Không thể tải "${params.fileName}" lên Google Drive ${DRIVE_CONFIG.folderName}.`,
    );
  }

  const info = payload.fileInfo;
  const fileId = String(info.id);
  const finalName = info.name?.trim() || params.fileName;
  const finalMime = info.mimeType?.trim() || cleanMime;
  const kind = detectDriveMediaKind(finalName, finalMime);

  return {
    id: fileId,
    name: finalName,
    url: info.url?.trim() || buildDriveViewUrl(fileId),
    thumbnailUrl: kind === 'photo' ? buildDriveThumbnailUrl(fileId) : null,
    downloadUrl: buildDriveDownloadUrl(fileId),
    mimeType: finalMime,
    sizeBytes: typeof info.size === 'number' && info.size > 0 ? info.size : sizeBytes,
    kind,
    folderId: DRIVE_CONFIG.folderId,
    folderName: DRIVE_CONFIG.folderName,
    createdAt: info.createdAt || new Date().toISOString(),
  };
}

/** Upload UTF-8 text (e.g. JSON class backup) straight into Google Drive folder `K8T4_app`. */
export async function uploadTextToDrive(params: {
  fileName: string;
  content: string;
  mimeType?: string;
  uploaderName?: string;
  uploaderRole?: DriveUploaderRole;
  category?: string;
}): Promise<UploadedDriveFile> {
  const base64Content = utf8ToBase64(params.content);
  return uploadFileToDrive({
    fileName: params.fileName,
    mimeType: params.mimeType ?? 'application/json',
    base64Content,
    sizeBytes: estimateBytesFromBase64(base64Content),
    uploaderName: params.uploaderName,
    uploaderRole: params.uploaderRole,
    category: params.category ?? 'backup',
  });
}

export function formatUploaderRoleLabel(
  role: DriveUploaderRole,
  subject?: string | null,
): string {
  if (role === 'teacher') return 'GV Chủ nhiệm';
  if (role === 'subject_teacher') return subject ? `GV ${subject}` : 'GV Bộ môn';
  if (role === 'editor') return 'Ban cán sự';
  return 'Học sinh';
}

/**
 * Format a clean human-readable uploader name when storing into legacy 7-column
 * Supabase `class_photos` tables that don't yet have `uploader_role`.
 */
export function formatFallbackUploaderName(
  displayName: string,
  role: DriveUploaderRole,
  subject?: string | null,
): string {
  const cleanName = displayName.trim() || 'Thành viên 10T4';
  if (role === 'teacher') return `GVCN · ${cleanName}`;
  if (role === 'subject_teacher') {
    return subject ? `GV ${subject} · ${cleanName}` : `GVBM · ${cleanName}`;
  }
  if (role === 'editor') return `Cán sự · ${cleanName}`;
  return `HS · ${cleanName}`;
}

export function parseUploaderMetadata(
  rawName: string,
  explicitRole?: string | null,
  explicitSubject?: string | null,
): {
  displayName: string;
  role: DriveUploaderRole;
  subject: string | null;
} {
  const trimmed = (rawName || 'Thành viên 10T4').trim();

  if (
    explicitRole === 'teacher' ||
    explicitRole === 'subject_teacher' ||
    explicitRole === 'editor' ||
    explicitRole === 'student'
  ) {
    return {
      displayName: trimmed,
      role: explicitRole,
      subject: explicitSubject?.trim() || null,
    };
  }

  const gvcnMatch = trimmed.match(/^(?:GVCN|\[GVCN\])\s*[·:-]\s*(.+)$/i);
  if (gvcnMatch) {
    return { displayName: gvcnMatch[1].trim(), role: 'teacher', subject: null };
  }

  const gvbmSubMatch = trimmed.match(/^(?:GVBM|GV)\s+([^·:-]+)\s*[·:-]\s*(.+)$/i);
  if (gvbmSubMatch) {
    return {
      displayName: gvbmSubMatch[2].trim(),
      role: 'subject_teacher',
      subject: gvbmSubMatch[1].trim(),
    };
  }

  const gvbmMatch = trimmed.match(/^(?:GVBM|\[GVBM\])\s*[·:-]\s*(.+)$/i);
  if (gvbmMatch) {
    return { displayName: gvbmMatch[1].trim(), role: 'subject_teacher', subject: null };
  }

  const editorMatch = trimmed.match(/^(?:Cán sự|CS|\[CS\])\s*[·:-]\s*(.+)$/i);
  if (editorMatch) {
    return { displayName: editorMatch[1].trim(), role: 'editor', subject: null };
  }

  const studentMatch = trimmed.match(/^(?:HS|Học sinh|\[HS\])\s*[·:-]\s*(.+)$/i);
  if (studentMatch) {
    return { displayName: studentMatch[1].trim(), role: 'student', subject: null };
  }

  return { displayName: trimmed, role: 'student', subject: explicitSubject?.trim() || null };
}
