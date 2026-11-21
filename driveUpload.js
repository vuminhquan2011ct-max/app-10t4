const DEFAULT_FOLDER_ID = '1mjTLnW1ztWKD2PvKJ0aW8uowiLD5eR_D';
const DEFAULT_FOLDER_NAME = 'K8T4_app';

export async function uploadToDrive({
  fileName,
  mimeType,
  base64Content,
  uploaderName,
  uploaderRole,
  category,
}) {
  const url = process.env.EXPO_PUBLIC_DRIVE_API_URL;
  const apiKey = process.env.EXPO_PUBLIC_DRIVE_API_KEY;
  const folderId = process.env.EXPO_PUBLIC_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const folderName = process.env.EXPO_PUBLIC_DRIVE_FOLDER_NAME || DEFAULT_FOLDER_NAME;

  if (!url || !apiKey) {
    throw new Error('Thiếu biến EXPO_PUBLIC_DRIVE_API_URL hoặc EXPO_PUBLIC_DRIVE_API_KEY');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      apiKey,
      fileName,
      mimeType,
      fileBase64: base64Content,
      folderId,
      folderName,
      uploaderName,
      uploaderRole,
      category,
    }),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Google Drive API (${folderName}) trả về phản hồi không hợp lệ (HTTP ${res.status})`);
  }
}
