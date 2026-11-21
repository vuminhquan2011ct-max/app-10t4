import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
// @ts-ignore
import { uploadToDrive } from "../../../driveUpload";

export interface UploadedDriveFile {
  id: string;
  name: string;
  url: string;
  createdAt?: string;
}

interface DriveUploadButtonProps {
  label?: string;
  multiple?: boolean; // Cho phép chọn nhiều file cùng lúc
  accept?: string; // Mặc định "*/*" nhận tất cả loại file
  onUploaded?: (files: UploadedDriveFile[]) => void;
}

export function DriveUploadButton({
  label = "Tải file lên Drive",
  multiple = true,
  accept = "*/*",
  onUploaded,
}: DriveUploadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  const handlePress = () => {
    if (Platform.OS !== "web") {
      setStatus("Nút này đang cấu hình cho bản Web.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;

    input.onchange = async () => {
      const selectedFiles = Array.from(input.files || []);
      if (selectedFiles.length === 0) return;

      setLoading(true);
      setStatus(`Đang tải ${selectedFiles.length} file lên Drive...`);
      const uploadedList: UploadedDriveFile[] = [];

      try {
        for (const file of selectedFiles) {
          // Google Apps Script nên giữ mỗi file dưới 20MB để không bị ngắt kết nối
          if (file.size > 20 * 1024 * 1024) {
            throw new Error(`File "${file.name}" lớn hơn 20MB.`);
          }

          const base64Content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
            reader.onerror = () => reject(new Error(`Không đọc được file ${file.name}`));
            reader.readAsDataURL(file);
          });

          const res = await uploadToDrive({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64Content,
          });

          if (res?.status !== "success" || !res?.fileInfo) {
            throw new Error(res?.message || `Lỗi khi tải ${file.name}`);
          }

          uploadedList.push(res.fileInfo);
        }

        setStatus(`Đã tải xong ${uploadedList.length} file lên Drive.`);
        onUploaded?.(uploadedList);
      } catch (err: any) {
        setStatus(`Lỗi: ${err?.message || "Không thể tải file"}`);
      } finally {
        setLoading(false);
      }
    };

    input.click();
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={handlePress}
        disabled={loading}
        style={{
          backgroundColor: loading ? "#94a3b8" : "#2563eb",
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading && <ActivityIndicator size="small" color="#ffffff" />}
        <Text style={{ color: "#ffffff", fontWeight: "600" }}>
          {loading ? "Đang tải lên..." : label}
        </Text>
      </Pressable>

      {!!status && (
        <Text style={{ fontSize: 12, color: status.startsWith("Lỗi") ? "#dc2626" : "#16a34a" }}>
          {status}
        </Text>
      )}
    </View>
  );
}