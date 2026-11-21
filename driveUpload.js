export async function uploadToDrive({ fileName, mimeType, base64Content }) {
  const url = process.env.EXPO_PUBLIC_DRIVE_API_URL;

  if (!url) {
    throw new Error("Chưa tìm thấy biến EXPO_PUBLIC_DRIVE_API_URL");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      fileName,
      mimeType,
      content: base64Content,
      isFile: true,
    }),
  });

  return await res.json();
}