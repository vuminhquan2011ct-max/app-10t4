/**
 * Google Apps Script Web App — Cổng lưu trữ Google Drive `K8T4_app` + Google Sheets (Excel) cho Lớp 10T4.
 *
 * Tính năng:
 * - `action: 'upload'` (mặc định): Lưu tệp vào thư mục Google Drive `K8T4_app` (phân loại thư mục con),
 *   bật chia sẻ xem bằng liên kết và tự động ghi 1 dòng vào Google Sheet (nếu dự án gắn với Sheet).
 * - `action: 'delete'`: Đưa tệp vào Thùng rác trên Google Drive (`setTrashed(true)`) VÀ xoá sạch
 *   toàn bộ các dòng khớp `fileId` / `fileUrl` trên TẤT CẢ các trang tính (Sheet) của Google Sheet ("Excel").
 *
 * Cách cập nhật:
 * 1. Mở https://script.google.com -> dự án Apps Script gắn với thư mục `K8T4_app` (hoặc Google Sheet của bạn)
 * 2. Dán toàn bộ nội dung file này, điền `API_SECRET_KEY` khớp `EXPO_PUBLIC_DRIVE_API_KEY`
 *    (nếu Apps Script độc lập và muốn đồng bộ với 1 file Google Sheet cụ thể, điền thêm `SPREADSHEET_ID`)
 * 3. Bấm Deploy -> Manage deployments -> Edit -> New version -> Deploy
 *    (Execute as: Me | Who has access: Anyone)
 */

const CONFIG = {
  // ID thư mục K8T4_app trên Google Drive (khoá cứng phía server — bỏ qua mọi folderId từ client)
  FOLDER_ID: '1mjTLnW1ztWKD2PvKJ0aW8uowiLD5eR_D',
  FOLDER_NAME: 'K8T4_app',
  // Tuỳ chọn: ID Google Sheet ("Excel online"). Để trống '' nếu Apps Script đã gắn trực tiếp trong Google Sheet.
  SPREADSHEET_ID: '',
  // Tên trang tính mặc định để ghi log upload (nếu chưa có sẽ tự dùng trang đầu tiên)
  LOG_SHEET_NAME: 'DanhSach_Anh_File',
  // Khóa bảo mật khớp với EXPO_PUBLIC_DRIVE_API_KEY trong .env.local / Vercel / Netlify
  API_SECRET_KEY: 'THAY_BANG_EXPO_PUBLIC_DRIVE_API_KEY_CUA_BAN',
  // Bật chia sẻ "Bất kỳ ai có liên kết đều xem được" để học sinh & thầy cô xem ảnh/tải file trong App
  SHARE_ANYONE_VIEW: true,
  // Giới hạn dung lượng tối đa cho mỗi tệp tải lên trực tiếp (25 MB)
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  // Độ sâu tối đa khi kiểm tra thư mục cha trên Google Drive (chống xoá tệp ngoài K8T4_app)
  MAX_PARENT_WALK_DEPTH: 6,
};

const VALID_DRIVE_FILE_ID_REGEX = /^[A-Za-z0-9_-]{15,120}$/;

const BLOCKED_EXTENSIONS = {
  html: true,
  htm: true,
  svg: true,
  js: true,
  mjs: true,
  exe: true,
  bat: true,
  cmd: true,
  sh: true,
  msi: true,
  scr: true,
  vbs: true,
  ps1: true,
};

const BLOCKED_MIME_TYPES = {
  'text/html': true,
  'application/xhtml+xml': true,
  'image/svg+xml': true,
  'application/javascript': true,
  'text/javascript': true,
  'application/ecmascript': true,
  'application/x-javascript': true,
  'application/x-msdownload': true,
  'application/x-msdos-program': true,
  'application/x-sh': true,
  'application/x-bat': true,
  'application/x-powershell': true,
};

const FORMULA_INJECTION_REGEX = /^[\s]*[=+\-@\t\r]/;

function sanitizeSheetCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const str = String(value);
  if (FORMULA_INJECTION_REGEX.test(str)) {
    return "'" + str;
  }
  return str;
}

function sanitizeFileName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\u0000-\u001F\u007F/\\]/g, '_')
    .trim();
  return cleaned || 'file_' + Date.now();
}

function extractFileExtension(fileName) {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx === fileName.length - 1) return '';
  return fileName.slice(idx + 1).toLowerCase();
}

function isBlockedUploadType(fileName, mimeType) {
  const ext = extractFileExtension(fileName);
  if (ext && BLOCKED_EXTENSIONS[ext]) {
    return true;
  }
  const normalizedMime = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (normalizedMime && BLOCKED_MIME_TYPES[normalizedMime]) {
    return true;
  }
  return false;
}

function normalizeValidDriveFileId(rawFileId, rawFileUrl) {
  const direct = rawFileId ? String(rawFileId).trim() : '';
  const candidate = direct || extractDriveFileIdFromUrl(rawFileUrl);
  return VALID_DRIVE_FILE_ID_REGEX.test(candidate) ? candidate : '';
}

/**
 * Walk ancestor folders recursively (cycle-safe, bounded depth) to guarantee
 * a Drive file belongs strictly inside CONFIG.FOLDER_ID (`K8T4_app`).
 */
function isFileInsideRootFolder(file, rootFolderId, maxDepth) {
  if (!file || !rootFolderId) return false;
  const limit = typeof maxDepth === 'number' && maxDepth > 0 ? maxDepth : 6;
  const visited = {};
  const queue = [];

  const directParents = file.getParents();
  while (directParents.hasNext()) {
    queue.push({ folder: directParents.next(), depth: 1 });
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const folder = current.folder;
    const folderId = folder.getId();
    if (folderId === rootFolderId) return true;
    if (visited[folderId]) continue;
    visited[folderId] = true;

    if (current.depth >= limit) continue;

    const parents = folder.getParents();
    while (parents.hasNext()) {
      const parentFolder = parents.next();
      const parentId = parentFolder.getId();
      if (parentId === rootFolderId) return true;
      if (!visited[parentId]) {
        queue.push({ folder: parentFolder, depth: current.depth + 1 });
      }
    }
  }

  return false;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet() {
  return jsonResponse({
    ok: true,
    code: 200,
    status: 'online',
    service: 'K8T4_app Drive & Excel Integration API',
    folderName: CONFIG.FOLDER_NAME,
    folderId: CONFIG.FOLDER_ID,
    supportsDelete: true,
    timestamp: new Date().toISOString(),
  });
}

function getOrCreateSubfolder(parentFolder, subName) {
  const iter = parentFolder.getFoldersByName(subName);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(subName);
}

function resolveSubfolderName(uploaderRole, category) {
  if (category === 'backup') return 'SaoLuu_DuLieu_Lop';
  if (uploaderRole === 'teacher' || uploaderRole === 'subject_teacher') {
    return 'ThayCo_TaiLen';
  }
  if (uploaderRole === 'student' || uploaderRole === 'editor') {
    return 'HocSinh_TaiLen';
  }
  return '';
}

function resolveSpreadsheet() {
  try {
    if (CONFIG.SPREADSHEET_ID && String(CONFIG.SPREADSHEET_ID).trim()) {
      return SpreadsheetApp.openById(String(CONFIG.SPREADSHEET_ID).trim());
    }
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    return null;
  }
}

function appendUploadRowToSheet(fileInfo, data) {
  try {
    const ss = resolveSpreadsheet();
    if (!ss) return;

    let sheet = CONFIG.LOG_SHEET_NAME ? ss.getSheetByName(CONFIG.LOG_SHEET_NAME) : null;
    if (!sheet) {
      sheet = ss.getSheets()[0] || ss.insertSheet(CONFIG.LOG_SHEET_NAME || 'DanhSach_Anh_File');
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Thời gian',
        'Mã Drive (fileId)',
        'Tên tệp',
        'Loại MIME',
        'Dung lượng (bytes)',
        'Người đăng',
        'Vai trò',
        'Danh mục',
        'Liên kết Drive',
      ]);
    }

    sheet.appendRow([
      sanitizeSheetCell(fileInfo.createdAt || new Date().toISOString()),
      sanitizeSheetCell(fileInfo.id || ''),
      sanitizeSheetCell(fileInfo.name || ''),
      sanitizeSheetCell(fileInfo.mimeType || ''),
      typeof fileInfo.size === 'number' && isFinite(fileInfo.size) ? fileInfo.size : 0,
      sanitizeSheetCell(data.uploaderName || ''),
      sanitizeSheetCell(data.uploaderRole || ''),
      sanitizeSheetCell(data.category || ''),
      sanitizeSheetCell(fileInfo.url || ''),
    ]);
  } catch (err) {
    // Upload to Drive must never fail if Spreadsheet logging is unavailable.
  }
}

function extractDriveFileIdFromUrl(rawUrl) {
  const input = rawUrl ? String(rawUrl).trim() : '';
  if (!input) return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{15,120})/,
    /\/document\/d\/([a-zA-Z0-9_-]{15,120})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,120})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{15,120})/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,120})/i,
    /[?&]id=([a-zA-Z0-9_-]{15,120})/,
    /\/d\/([a-zA-Z0-9_-]{15,120})/,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const m = input.match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  return VALID_DRIVE_FILE_ID_REGEX.test(input) ? input : '';
}

function removeMatchingRowsFromSheets(fileId, fileUrl) {
  const ss = resolveSpreadsheet();
  if (!ss) return 0;

  // Strictly require a valid Drive fileId — NEVER match arbitrary substring fileUrl (prevents full Sheet wipe).
  const targetId = normalizeValidDriveFileId(fileId, fileUrl);
  if (!targetId) return 0;

  // Match exact fileId token (standalone cell or embedded Drive URL segment, never partial ID prefix).
  const exactIdTokenRegex = new RegExp('(?:^|[^A-Za-z0-9_-])' + targetId + '(?:$|[^A-Za-z0-9_-])');

  let removedCount = 0;
  const sheets = ss.getSheets();

  for (let s = 0; s < sheets.length; s += 1) {
    const sheet = sheets[s];
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol <= 0) continue;

    const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    // Iterate bottom-to-top and stop at r >= 1 to protect Row 1 header.
    for (let r = values.length - 1; r >= 1; r -= 1) {
      const row = values[r];
      let matched = false;
      for (let c = 0; c < row.length; c += 1) {
        const cell = String(row[c] || '').trim();
        if (!cell) continue;
        if (
          cell === targetId ||
          extractDriveFileIdFromUrl(cell) === targetId ||
          exactIdTokenRegex.test(cell)
        ) {
          matched = true;
          break;
        }
      }
      if (matched) {
        sheet.deleteRow(r + 1);
        removedCount += 1;
      }
    }
  }

  return removedCount;
}

function handleDelete(data) {
  const fileUrl = data.fileUrl ? String(data.fileUrl).trim() : '';
  const rawFileId = data.fileId ? String(data.fileId).trim() : '';
  const fileId = normalizeValidDriveFileId(rawFileId, fileUrl);

  if (!fileId) {
    return jsonResponse({
      ok: false,
      status: 'error',
      error: 'Invalid or missing Drive fileId',
      message: 'Thiếu hoặc mã Drive fileId không hợp lệ.',
    });
  }

  let trashedDrive = false;
  let file = null;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    // File may already be permanently deleted or inaccessible; still proceed to clean exact fileId Sheet rows.
    file = null;
  }

  if (file) {
    if (!isFileInsideRootFolder(file, CONFIG.FOLDER_ID, CONFIG.MAX_PARENT_WALK_DEPTH)) {
      return jsonResponse({
        ok: false,
        status: 'error',
        error: 'Forbidden: file is outside K8T4_app folder',
        message: 'Từ chối xoá: tệp không nằm trong thư mục K8T4_app.',
      });
    }
    try {
      if (!file.isTrashed()) {
        file.setTrashed(true);
      }
      trashedDrive = true;
    } catch (err) {
      trashedDrive = false;
    }
  }

  let removedSheetRows = 0;
  try {
    removedSheetRows = removeMatchingRowsFromSheets(fileId, fileUrl);
  } catch (err) {
    removedSheetRows = 0;
  }

  return jsonResponse({
    ok: true,
    status: 'deleted',
    fileId: fileId,
    trashedDrive: trashedDrive,
    removedSheetRows: removedSheetRows,
  });
}

function handleUpload(data) {
  if (!data.fileName || !data.fileBase64) {
    return jsonResponse({ status: 'error', message: 'Thiếu tên tệp hoặc dữ liệu fileBase64.' });
  }

  const safeFileName = sanitizeFileName(data.fileName);
  const mimeType = String(data.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';

  if (isBlockedUploadType(safeFileName, mimeType)) {
    return jsonResponse({
      status: 'error',
      error: 'Forbidden file type',
      message: 'Định dạng tệp không được phép tải lên vì lý do bảo mật.',
    });
  }

  const rawBase64 = String(data.fileBase64).trim();
  const estimatedBytes = Math.ceil((rawBase64.length * 3) / 4);
  if (estimatedBytes > CONFIG.MAX_UPLOAD_BYTES + 1024) {
    return jsonResponse({
      status: 'error',
      error: 'File too large',
      message: 'Tệp vượt quá giới hạn dung lượng 25 MB.',
    });
  }

  const bytes = Utilities.base64Decode(rawBase64);
  if (bytes.length > CONFIG.MAX_UPLOAD_BYTES) {
    return jsonResponse({
      status: 'error',
      error: 'File too large',
      message: 'Tệp vượt quá giới hạn dung lượng 25 MB.',
    });
  }

  // Strictly lock uploads inside server-configured CONFIG.FOLDER_ID (ignore client data.folderId).
  const rootFolder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const subName = resolveSubfolderName(data.uploaderRole, data.category);
  const destFolder = subName ? getOrCreateSubfolder(rootFolder, subName) : rootFolder;

  const blob = Utilities.newBlob(bytes, mimeType, safeFileName);
  const file = destFolder.createFile(blob);

  if (CONFIG.SHARE_ANYONE_VIEW) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  const fileInfo = {
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    folderName: CONFIG.FOLDER_NAME,
    createdAt: file.getDateCreated().toISOString(),
  };

  appendUploadRowToSheet(fileInfo, data);

  return jsonResponse({
    status: 'success',
    fileInfo: fileInfo,
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'Thiếu dữ liệu gửi lên.' });
    }

    const data = JSON.parse(e.postData.contents);

    if (data.apiKey !== CONFIG.API_SECRET_KEY) {
      return jsonResponse({ status: 'error', message: 'API Secret Key không hợp lệ.' });
    }

    const action = data.action ? String(data.action).trim().toLowerCase() : 'upload';
    if (action === 'delete') {
      return handleDelete(data);
    }

    return handleUpload(data);
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err && err.message ? err.message : String(err),
    });
  }
}
