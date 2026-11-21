import { DriveUploadButton, UploadedDriveFile } from '@/components/ui/drive-upload-button';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Linking,
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

interface ClassItem {
  id: string;
  uploader_name: string;
  caption: string;
  drive_file_id: string;
  image_url: string;
  file_name?: string;
  item_type?: string;
  drive_url?: string;
  created_at: string;
}

const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp|bmp|heic|svg)$/i;

export default function GalleryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [uploaderName, setUploaderName] = useState('');
  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState<'all' | 'photo' | 'document'>('all');

  const loadItems = async () => {
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await supabase
      .from('class_photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg(`Không tải được danh sách: ${error.message}`);
    } else {
      setItems((data as ClassItem[]) || []);
    }
    setLoading(false);
  };

 useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('class_photos')
        .select('*')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        setErrorMsg(`Không tải được danh sách: ${error.message}`);
      } else {
        setItems((data as ClassItem[]) || []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleUploaded = async (files: UploadedDriveFile[]) => {
    if (files.length === 0) return;
    setSaving(true);
    setErrorMsg('');

    const rows = files.map((file) => {
      const isPhoto = IMAGE_REGEX.test(file.name);
      return {
        uploader_name: uploaderName.trim() || 'Thành viên 10T4',
        caption: caption.trim(),
        drive_file_id: file.id,
        image_url: isPhoto
          ? `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`
          : file.url,
        file_name: file.name,
        item_type: isPhoto ? 'photo' : 'document',
        drive_url: file.url,
      };
    });

    const { error } = await supabase.from('class_photos').insert(rows);

    if (error) {
      setErrorMsg(`Đã lưu vào Drive nhưng lỗi ghi Supabase: ${error.message}`);
    } else {
      setCaption('');
      await loadItems();
    }
    setSaving(false);
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;
    const type = item.item_type || (IMAGE_REGEX.test(item.file_name || '') ? 'photo' : 'photo');
    return type === filter;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        {/* Thanh tiêu đề */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.back()}
            style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e2e8f0', borderRadius: 8 }}
          >
            <Text style={{ fontWeight: '600', color: '#1e293b' }}>← Quay lại</Text>
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>
            Kho Ảnh & Tài Liệu 10T4
          </Text>
          <Pressable
            onPress={loadItems}
            style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e2e8f0', borderRadius: 8 }}
          >
            <Text style={{ fontWeight: '600', color: '#1e293b' }}>Làm mới</Text>
          </Pressable>
        </View>

        {/* Khung đăng ảnh / tài liệu lên Drive 5TB */}
        <View style={{ backgroundColor: '#ffffff', padding: 16, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
            Đăng ảnh hoặc tài liệu mới (Lưu trên Drive 5TB)
          </Text>

          <TextInput
            placeholder="Tên của bạn (VD: Minh Quân)..."
            value={uploaderName}
            onChangeText={setUploaderName}
            style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc' }}
          />

          <TextInput
            placeholder="Chú thích / tên môn học (không bắt buộc)..."
            value={caption}
            onChangeText={setCaption}
            style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc' }}
          />

          <DriveUploadButton
            label={saving ? 'Đang lưu thông tin...' : 'Chọn ảnh / tài liệu tải lên'}
            multiple
            accept="*/*"
            onUploaded={handleUploaded}
          />

          {!!errorMsg && (
            <Text style={{ color: '#dc2626', fontSize: 13 }}>{errorMsg}</Text>
          )}
        </View>

        {/* Bộ lọc Album ảnh / Tài liệu */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { key: 'all', label: `Tất cả (${items.length})` },
            { key: 'photo', label: 'Album ảnh' },
            { key: 'document', label: 'Tài liệu' },
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setFilter(tab.key as any)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  backgroundColor: active ? '#2563eb' : '#e2e8f0',
                }}
              >
                <Text style={{ color: active ? '#ffffff' : '#334155', fontWeight: '600' }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Danh sách hiển thị */}
        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
        ) : filteredItems.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#64748b', marginTop: 24 }}>
            Chưa có ảnh hay tài liệu nào. Hãy là người đầu tiên đăng lên nhé!
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {filteredItems.map((item) => {
              const isPhoto = item.item_type !== 'document';
              const openLink = item.drive_url || `https://drive.google.com/file/d/${item.drive_file_id}/view`;

              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    padding: 12,
                    gap: 8,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.uploader_name}</Text>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(item.created_at).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>

                  {!!item.caption && <Text style={{ color: '#334155' }}>{item.caption}</Text>}

                  {isPhoto ? (
                    <Pressable onPress={() => Linking.openURL(openLink)}>
                      <Image
                        source={{ uri: item.image_url }}
                        style={{ width: '100%', height: 260, borderRadius: 8, backgroundColor: '#e2e8f0' }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#f1f5f9',
                        padding: 12,
                        borderRadius: 8,
                        gap: 10,
                      }}
                    >
                      <Text style={{ flex: 1, fontWeight: '600', color: '#1e293b' }} numberOfLines={2}>
                        📄 {item.file_name || 'Tài liệu lớp'}
                      </Text>
                      <Pressable
                        onPress={() => Linking.openURL(openLink)}
                        style={{ backgroundColor: '#0ea5e9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '600' }}>Mở / Tải</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}