/**
 * Client-side image optimization & preview helpers (zero extra native deps).
 *
 * - On Web: downscales huge camera/desktop photos to max 1600px on the longest
 *   edge and re-encodes as JPEG (quality 0.82) via HTML5 Canvas, shrinking typical
 *   4–12 MB phone photos down to ~150–350 KB (10–25x faster Drive uploads).
 * - Automatically skips GIFs, SVGs, non-images, and already-small images (<220 KB),
 *   and falls back cleanly to raw FileReader base64 if canvas decoding fails or
 *   doesn't save bytes.
 */

const COMPRESSIBLE_IMAGE_EXT = /\.(jpe?g|png|webp|bmp|heic|heif|avif)$/i;
const SKIP_IMAGE_EXT = /\.(gif|svg)$/i;

export interface OptimizeWebImageOptions {
  /** Maximum width or height in pixels. Default: 1600. */
  maxEdge?: number;
  /** JPEG output quality (0..1). Default: 0.82. */
  quality?: number;
  /** Skip re-encoding images already smaller than this threshold. Default: 220 KB. */
  minBytesToCompress?: number;
  /** Reuse an already-created object URL so we never leak a duplicate blob URL. */
  existingPreviewUri?: string;
}

export interface OptimizedWebImageResult {
  base64: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  localPreviewUri: string;
}

/** Safely create a blob object URL on Web for instant (<50ms) optimistic image previews. */
export function createObjectUrlSafe(file: globalThis.File | globalThis.Blob): string {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(file);
    }
  } catch {
    // Ignore unsupported environments
  }
  return '';
}

/** Read a Web File or Blob into a raw Base64 payload (without the `data:*;base64,` prefix). */
export function readWebBlobAsBase64(blob: globalThis.Blob, label = 'file'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Không đọc được tệp "${label}"`));
    reader.readAsDataURL(blob);
  });
}

function isCompressibleImage(file: globalThis.File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'image/gif' || mime === 'image/svg+xml' || SKIP_IMAGE_EXT.test(file.name)) {
    return false;
  }
  return mime.startsWith('image/') || COMPRESSIBLE_IMAGE_EXT.test(file.name);
}

function toJpegFileName(originalName: string): string {
  const trimmed = originalName.trim() || `photo_${Date.now()}.jpg`;
  if (/\.(jpe?g)$/i.test(trimmed)) return trimmed;
  if (/\.[^./\\]{1,8}$/.test(trimmed)) {
    return trimmed.replace(/\.[^./\\]{1,8}$/, '.jpg');
  }
  return `${trimmed}.jpg`;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<globalThis.Blob | null> {
  return new Promise<globalThis.Blob | null>((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const commaIdx = dataUrl.indexOf(',');
      const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) {
        bytes[i] = bin.charCodeAt(i);
      }
      resolve(new Blob([bytes], { type: 'image/jpeg' }));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Resize & compress a Web image file before Base64 upload while returning an
 * instant local preview object URL. Non-images and small images pass straight through.
 */
export async function optimizeWebImageFile(
  file: globalThis.File,
  options: OptimizeWebImageOptions = {},
): Promise<OptimizedWebImageResult> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const minBytesToCompress = options.minBytesToCompress ?? 220 * 1024;
  const localPreviewUri = options.existingPreviewUri || createObjectUrlSafe(file);
  const rawMime = file.type || 'application/octet-stream';

  if (
    typeof document === 'undefined' ||
    !isCompressibleImage(file) ||
    (file.size > 0 && file.size < minBytesToCompress)
  ) {
    const base64 = await readWebBlobAsBase64(file, file.name);
    return {
      base64,
      mimeType: rawMime,
      sizeBytes: file.size,
      fileName: file.name,
      localPreviewUri,
    };
  }

  let bitmapToClose: ImageBitmap | null = null;
  let tempDecodeUrl = '';
  try {
    let source: ImageBitmap | HTMLImageElement | null = null;
    let width = 0;
    let height = 0;

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        source = bitmap;
        bitmapToClose = bitmap;
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        // Fall through to HTMLImageElement
      }
    }

    if (!source) {
      let previewSrc = localPreviewUri;
      if (!previewSrc) {
        tempDecodeUrl = createObjectUrlSafe(file);
        previewSrc = tempDecodeUrl;
      }
      if (previewSrc) {
        const img = await loadHtmlImage(previewSrc);
        source = img;
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
      }
    }

    if (!source || width <= 0 || height <= 0) {
      const base64 = await readWebBlobAsBase64(file, file.name);
      return {
        base64,
        mimeType: rawMime,
        sizeBytes: file.size,
        fileName: file.name,
        localPreviewUri,
      };
    }

    const longest = Math.max(width, height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const base64 = await readWebBlobAsBase64(file, file.name);
      return {
        base64,
        mimeType: rawMime,
        sizeBytes: file.size,
        fileName: file.name,
        localPreviewUri,
      };
    }

    // Fill white backdrop so transparent PNG/WebP images encode cleanly as JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(source, 0, 0, targetW, targetH);

    const compressedBlob = await canvasToJpegBlob(canvas, quality);
    // Free canvas backing store promptly.
    canvas.width = 0;
    canvas.height = 0;

    if (compressedBlob && compressedBlob.size > 0 && compressedBlob.size < file.size) {
      const base64 = await readWebBlobAsBase64(compressedBlob, file.name);
      return {
        base64,
        mimeType: 'image/jpeg',
        sizeBytes: compressedBlob.size,
        fileName: toJpegFileName(file.name),
        localPreviewUri,
      };
    }
  } catch {
    // Graceful fallback to original bytes on any canvas/codec edge case
  } finally {
    bitmapToClose?.close();
    if (tempDecodeUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(tempDecodeUrl);
      } catch {
        // Ignore revoke errors
      }
    }
  }

  const base64 = await readWebBlobAsBase64(file, file.name);
  return {
    base64,
    mimeType: rawMime,
    sizeBytes: file.size,
    fileName: file.name,
    localPreviewUri,
  };
}
