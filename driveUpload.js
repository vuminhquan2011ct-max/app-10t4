export async function uploadToDrive({ fileName, mimeType, base64Content }) {
  const url = process.env.EXPO_PUBLIC_DRIVE_API_URL;
  const apiKey = process.env.EXPO_PUBLIC_DRIVE_API_KEY;

  if (!url || !apiKey) {
    throw new Error("Thiếu biến EXPO_PUBLIC_DRIVE_API_URL hoặc EXPO_PUBLIC_DRIVE_API_KEY");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      apiKey,
      fileName,
      mimeType,
      fileBase64: base64Content,
    }),
  });

  return await res.json();
}