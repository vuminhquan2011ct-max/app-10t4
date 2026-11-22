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
  // ID thư mục K8T4_app trên Google Drive
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
};

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
      fileInfo.createdAt || new Date().toISOString(),
      fileInfo.id || '',
      fileInfo.name || '',
      fileInfo.mimeType || '',
      fileInfo.size || 0,
      data.uploaderName || '',
      data.uploaderRole || '',
      data.category || '',
      fileInfo.url || '',
    ]);
  } catch (err) {
    // Upload to Drive must never fail if Spreadsheet logging is unavailable.
  }
}

function extractDriveFileIdFromUrl(rawUrl) {
  const input = rawUrl ? String(rawUrl).trim() : '';
  if (!input) return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/document\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/presentation\/d\/([a-zA-Z0-9_-]{10,})/,
    /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/i,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const m = input.match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  return /^[a-zA-Z0-9_-]{20,}$/.test(input) ? input : '';
}

function removeMatchingRowsFromSheets(fileId, fileUrl) {
  const ss = resolveSpreadsheet();
  if (!ss) return 0;

  const rawId = fileId ? String(fileId).trim() : '';
  const targetId = rawId.length >= 10 ? rawId : '';
  const targetUrl = fileUrl ? String(fileUrl).trim() : '';
  if (!targetId && !targetUrl) return 0;

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
        const cell = String(row[c] || '');
        if (!cell) continue;
        if (
          (targetId && cell.indexOf(targetId) !== -1) ||
          (targetUrl && cell.indexOf(targetUrl) !== -1)
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
  const fileId = rawFileId || extractDriveFileIdFromUrl(fileUrl);

  if (!fileId && !fileUrl) {
    return jsonResponse({ ok: false, status: 'error', message: 'Thiếu fileId hoặc fileUrl cần xoá.' });
  }

  let trashedDrive = false;
  if (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      if (file) {
        if (!file.isTrashed()) {
          file.setTrashed(true);
        }
        trashedDrive = true;
      }
    } catch (err) {
      // File may already be deleted or inaccessible; still proceed to clean Google Sheets rows.
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

  const targetFolderId = data.folderId || CONFIG.FOLDER_ID;
  const rootFolder = DriveApp.getFolderById(targetFolderId);
  const subName = resolveSubfolderName(data.uploaderRole, data.category);
  const destFolder = subName ? getOrCreateSubfolder(rootFolder, subName) : rootFolder;

  const bytes = Utilities.base64Decode(data.fileBase64);
  const mimeType = data.mimeType || 'application/octet-stream';
  const blob = Utilities.newBlob(bytes, mimeType, data.fileName);
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
