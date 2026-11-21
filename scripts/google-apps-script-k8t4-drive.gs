/**
 * Google Apps Script Web App — Cổng lưu trữ Google Drive `K8T4_app` cho Lớp 10T4.
 *
 * Cách dùng (chỉ cần cập nhật nếu muốn tự động phân loại thư mục con / tự bật chia sẻ link):
 * 1. Mở https://script.google.com -> dự án Apps Script gắn với thư mục `K8T4_app`
 * 2. Dán nội dung file này, đảm bảo `API_SECRET_KEY` khớp `EXPO_PUBLIC_DRIVE_API_KEY`
 * 3. Bấm Deploy -> Manage deployments -> Edit -> New version -> Deploy
 *    (Execute as: Me | Who has access: Anyone)
 */

const CONFIG = {
  // ID thư mục K8T4_app trên Google Drive
  FOLDER_ID: '1mjTLnW1ztWKD2PvKJ0aW8uowiLD5eR_D',
  FOLDER_NAME: 'K8T4_app',
  // Khóa bảo mật khớp với EXPO_PUBLIC_DRIVE_API_KEY trong .env.local / Vercel / Netlify
  // (Thay bằng chuỗi khóa bí mật của bạn, VD giá trị trong cấu hình dự án)
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
    status: 'ok',
    folderName: CONFIG.FOLDER_NAME,
    folderId: CONFIG.FOLDER_ID,
    message: 'K8T4_app Google Drive Upload Gateway is active.',
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

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', message: 'Thiếu dữ liệu gửi lên.' });
    }

    const data = JSON.parse(e.postData.contents);

    if (data.apiKey !== CONFIG.API_SECRET_KEY) {
      return jsonResponse({ status: 'error', message: 'API Secret Key không hợp lệ.' });
    }

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

    return jsonResponse({
      status: 'success',
      fileInfo: {
        id: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        size: file.getSize(),
        mimeType: file.getMimeType(),
        folderName: CONFIG.FOLDER_NAME,
        createdAt: file.getDateCreated().toISOString(),
      },
    });
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err && err.message ? err.message : String(err),
    });
  }
}
