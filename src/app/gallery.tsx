/**
 * Kho Ảnh & File Google Drive `K8T4_app` (/gallery).
 *
 * - Both Students (`student`) and Teachers (`teacher` / `subject_teacher` / `editor`)
 *   can upload photos, videos, PDFs, Office slides, exercises, and archives.
 * - Instant (<50ms) optimistic previews on pick, client-side image compression,
 *   concurrent uploads (concurrency=3), cached `expo-image` (`lh3` CDN + fallback),
 *   and sub-second cross-device updates via Supabase Realtime Broadcast + `postgres_changes`.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DriveImage } from '@/components/ui/drive-attachment-list';
import {
  DriveUploadButton,
  type PendingUploadPreview,
  type UploadedDriveFile,
} from '@/components/ui/drive-upload-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { Screen } from '@/components/ui/screen';
import { SkeletonCard } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useBrandGradient, useIsDark, useTheme } from '@/hooks/use-theme';
import {
  DRIVE_CONFIG,
  DRIVE_FOLDER_URL,
  formatBytes,
  formatUploaderRoleLabel,
  getFileVisualMeta,
  isDriveUploadConfigured,
  type DriveMediaKind,
  type DriveUploaderRole,
} from '@/lib/drive';
import {
  DRIVE_MEDIA_CATEGORIES,
  DRIVE_MEDIA_CATEGORY_LIST,
  buildOptimisticDriveMediaItem,
  computeDriveStorageStats,
  isSessionUploadedDriveFile,
  saveExternalDriveLinkToGallery,
  saveUploadedFilesToGallery,
  useDriveGallery,
  type DriveMediaCategory,
  type DriveMediaItem,
  type SaveDriveMediaMeta,
} from '@/lib/drive-gallery';
import {
  buildDriveMediaExcelCsv,
  downloadOrShareExcelCsv,
  shareOrCopyText,
} from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';

type RoleFilter = 'all' | 'teachers' | 'students';
type TypeFilter = 'all' | DriveMediaKind;

function roleBadgeStyle(role: DriveUploaderRole): {
  color: ThemeColor;
  soft: ThemeColor;
  icon: keyof typeof Ionicons.glyphMap;
} {
  if (role === 'teacher') {
    return { color: 'danger', soft: 'dangerSoft', icon: 'shield-checkmark' };
  }
  if (role === 'subject_teacher') {
    return { color: 'success', soft: 'successSoft', icon: 'book' };
  }
  if (role === 'editor') {
    return { color: 'warning', soft: 'warningSoft', icon: 'star' };
  }
  return { color: 'accentText', soft: 'accentSoft', icon: 'school' };
}

const GALLERY_PAGE_SIZE = 24;

function ListItemGap() {
  return <View style={styles.itemGap} />;
}

export default function GalleryScreen() {
  const auth = useAuth();
  const {
    classInfo,
    memberRole,
    isTeacher,
    isSubjectTeacher,
    canEditClass,
    subjectName,
    currentStudent,
    deleteUploadedFileEverywhere,
  } = useClassStore();
  const theme = useTheme();
  const isDark = useIsDark();
  const gradient = useBrandGradient();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const {
    items,
    loading,
    error: syncError,
    refresh,
    prependOptimistic,
    linkOptimisticDriveId,
    resolveOptimistic,
    failOptimistic,
  } = useDriveGallery({ pollMs: 5000 });

  const defaultUploaderName = useMemo(() => {
    const profileName = auth.profile?.displayName?.trim();
    if (profileName) return profileName;
    if (isTeacher) return classInfo.teacherName;
    if (isSubjectTeacher) return subjectName ? `GV ${subjectName}` : 'Giáo viên bộ môn';
    if (currentStudent?.name) return currentStudent.name;
    return 'Thành viên 10T4';
  }, [
    auth.profile?.displayName,
    isTeacher,
    classInfo.teacherName,
    isSubjectTeacher,
    subjectName,
    currentStudent?.name,
  ]);

  const [savingLarge, setSavingLarge] = useState(false);
  const [actionError, setActionError] = useState('');
  const bannerError = actionError || syncError;

  // Composer state (`null` tracks the signed-in account name automatically)
  const [uploaderNameDraft, setUploaderNameDraft] = useState<string | null>(null);
  const uploaderName = uploaderNameDraft ?? defaultUploaderName;
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<DriveMediaCategory>(
    isTeacher || isSubjectTeacher ? 'lecture' : 'class_photo',
  );

  // Large-file (>25MB / GB) direct Drive K8T4_app attach panel
  const [largePanelOpen, setLargePanelOpen] = useState(false);
  const [largeUrl, setLargeUrl] = useState('');
  const [largeName, setLargeName] = useState('');
  const [largeSizeMb, setLargeSizeMb] = useState('');
  const [largeKind, setLargeKind] = useState<DriveMediaKind>('video');

  // Filters & search
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [previewItem, setPreviewItem] = useState<DriveMediaItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Snapshot metadata per tempId so concurrent uploads keep exact caption/category.
  const pendingMetaRef = useRef<Map<string, SaveDriveMediaMeta>>(new Map());
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  // Refresh silently whenever the screen regains navigation focus.
  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: true });
    }, [refresh]),
  );

  const handlePullRefresh = useCallback(async () => {
    setActionError('');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = useMemo(() => computeDriveStorageStats(items), [items]);
  const driveReady = isDriveUploadConfigured();

  const filteredItems = useMemo(() => {
    const q = stripVietnamese(query);
    return items.filter((item) => {
      if (roleFilter === 'teachers') {
        if (item.uploaderRole !== 'teacher' && item.uploaderRole !== 'subject_teacher') {
          return false;
        }
      } else if (roleFilter === 'students') {
        if (item.uploaderRole === 'teacher' || item.uploaderRole === 'subject_teacher') {
          return false;
        }
      }

      if (typeFilter !== 'all' && item.itemType !== typeFilter) return false;

      if (!q) return true;
      const hay = stripVietnamese(
        `${item.fileName} ${item.caption} ${item.uploaderName} ${item.uploaderSubject ?? ''} ${DRIVE_MEDIA_CATEGORIES[item.category].label}`,
      );
      return hay.includes(q);
    });
  }, [items, roleFilter, typeFilter, query]);

  const handleSelectionStart = useCallback(
    (pending: PendingUploadPreview[]) => {
      setActionError('');
      const meta: SaveDriveMediaMeta = {
        uploaderName: uploaderName.trim() || defaultUploaderName,
        uploaderRole: memberRole,
        uploaderSubject: isSubjectTeacher ? subjectName : null,
        caption,
        category,
      };
      const optItems = pending.map((p) => {
        pendingMetaRef.current.set(p.tempId, meta);
        return buildOptimisticDriveMediaItem({
          tempId: p.tempId,
          fileName: p.fileName,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
          localUri: p.localUri,
          kind: p.kind,
          uploaderName: meta.uploaderName,
          uploaderRole: meta.uploaderRole,
          uploaderSubject: meta.uploaderSubject,
          caption: meta.caption,
          category: meta.category,
        });
      });
      prependOptimistic(optItems);
    },
    [
      uploaderName,
      defaultUploaderName,
      memberRole,
      isSubjectTeacher,
      subjectName,
      caption,
      category,
      prependOptimistic,
    ],
  );

  const handleItemUploaded = useCallback(
    async (file: UploadedDriveFile, tempId: string) => {
      linkOptimisticDriveId(tempId, file.id);
      const meta = pendingMetaRef.current.get(tempId) ?? {
        uploaderName: uploaderName.trim() || defaultUploaderName,
        uploaderRole: memberRole,
        uploaderSubject: isSubjectTeacher ? subjectName : null,
        caption,
        category,
      };
      pendingMetaRef.current.delete(tempId);

      try {
        const result = await saveUploadedFilesToGallery([file], meta);
        if (result.warning) {
          setActionError(result.warning);
        }
        const saved = result.items[0];
        if (saved) {
          resolveOptimistic(tempId, saved);
        } else {
          failOptimistic(tempId);
        }
      } catch (err) {
        failOptimistic(tempId);
        const msg = err instanceof Error ? err.message : 'Không lưu được thông tin tệp';
        setActionError(msg);
      }
    },
    [
      linkOptimisticDriveId,
      uploaderName,
      defaultUploaderName,
      memberRole,
      isSubjectTeacher,
      subjectName,
      caption,
      category,
      resolveOptimistic,
      failOptimistic,
    ],
  );

  const handleItemFailed = useCallback(
    (tempId: string, errMsg: string) => {
      pendingMetaRef.current.delete(tempId);
      failOptimistic(tempId);
      setActionError(errMsg);
    },
    [failOptimistic],
  );

  const handleBatchComplete = useCallback(
    (files: UploadedDriveFile[]) => {
      if (files.length === 0) return;
      setCaption('');
      showToast(
        `Đã cập nhật ${files.length} tệp tức thì lên Google Drive ${DRIVE_CONFIG.folderName}! ⚡`,
        'success',
      );
    },
    [showToast],
  );

  const handleAttachLargeDriveFile = async () => {
    if (!largeUrl.trim()) {
      showToast('Hãy dán link chia sẻ file từ Google Drive K8T4_app', 'warning');
      return;
    }
    setSavingLarge(true);
    setActionError('');
    try {
      const parsedMb = Number.parseFloat(largeSizeMb.replace(',', '.'));
      const res = await saveExternalDriveLinkToGallery({
        driveUrl: largeUrl,
        fileName: largeName.trim() || 'Tệp dung lượng lớn (GB)',
        sizeMb: Number.isFinite(parsedMb) && parsedMb > 0 ? parsedMb : undefined,
        mediaKind: largeKind,
        meta: {
          uploaderName: uploaderName.trim() || defaultUploaderName,
          uploaderRole: memberRole,
          uploaderSubject: isSubjectTeacher ? subjectName : null,
          caption,
          category: largeKind === 'video' ? 'media' : category,
        },
      });
      if (res.warning) setActionError(res.warning);
      setLargeUrl('');
      setLargeName('');
      setLargeSizeMb('');
      setCaption('');
      setLargePanelOpen(false);
      showToast(`Đã gắn tệp từ Google Drive ${DRIVE_CONFIG.folderName}!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Link Google Drive chưa hợp lệ';
      showToast(msg, 'danger');
    } finally {
      setSavingLarge(false);
    }
  };

  const canDeleteItem = (item: DriveMediaItem): boolean => {
    if (item.pending) return false;
    if (canEditClass) return true;
    if (isSessionUploadedDriveFile(item.driveFileId)) return true;
    return (
      item.uploaderName.trim().toLowerCase() === defaultUploaderName.trim().toLowerCase()
    );
  };

  const handleDelete = async (item: DriveMediaItem) => {
    if (deletingId) return;
    if (confirmDeleteId !== item.id) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(item.id);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmDeleteId(null);
      }, 3_500);
      showToast('Bấm lại lần nữa để xoá khỏi App, Google Drive & Excel', 'warning');
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmDeleteId(null);
    setDeletingId(item.id);
    try {
      const res = await deleteUploadedFileEverywhere({
        id: item.id,
        driveFileId: item.driveFileId,
        fileUrl: item.driveUrl || item.imageUrl,
        fileName: item.fileName,
      });
      if (previewItem?.id === item.id) setPreviewItem(null);
      showToast(
        res.trashedDrive || res.removedSheetRows > 0
          ? 'Đã xoá khỏi App, Google Drive & Excel!'
          : 'Đã gỡ khỏi Kho lớp & đồng bộ mọi thiết bị!',
        'info',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportExcel = async () => {
    if (exportingExcel) return;
    const exportable = items.filter((i) => !i.pending);
    if (exportable.length === 0) {
      showToast('Chưa có ảnh hoặc tệp nào để xuất Excel', 'warning');
      return;
    }
    setExportingExcel(true);
    try {
      const csv = buildDriveMediaExcelCsv(
        exportable.map((i) => ({
          id: i.id,
          fileName: i.fileName,
          itemType: i.itemType,
          uploaderName: i.uploaderName,
          uploaderRole: formatUploaderRoleLabel(i.uploaderRole, i.uploaderSubject),
          caption: i.caption,
          category: DRIVE_MEDIA_CATEGORIES[i.category]?.label ?? i.category,
          fileSize: i.sizeBytes,
          driveFileId: i.driveFileId,
          driveUrl: i.driveUrl,
          createdAt: i.createdAt,
        })),
      );
      await downloadOrShareExcelCsv('kho-anh-file-10t4.csv', csv);
      showToast(`Đã xuất file Excel (${exportable.length} ảnh & tệp hiện có)! 📊`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể xuất file Excel lúc này',
        'danger',
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const openDriveFolder = () => {
    Linking.openURL(DRIVE_FOLDER_URL).catch(() =>
      showToast('Không thể mở thư mục Google Drive', 'warning'),
    );
  };

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => showToast('Không thể mở liên kết tệp', 'warning'));
  };

  const filterKey = `${query}|${roleFilter}|${typeFilter}`;
  const [pageState, setPageState] = useState({ key: filterKey, limit: GALLERY_PAGE_SIZE });
  const visibleLimit = pageState.key === filterKey ? pageState.limit : GALLERY_PAGE_SIZE;
  const pagedItems = filteredItems.slice(0, visibleLimit);
  const remainingCount = Math.max(0, filteredItems.length - pagedItems.length);
  const isInitialLoading = loading && items.length === 0;
  const listData = isInitialLoading ? [] : pagedItems;

  const myRoleBadge = roleBadgeStyle(memberRole);

  const listHeader = (
    <View style={styles.listHeader}>
      <PageHeader
        title={`Kho Ảnh & File ${classInfo.name}`}
        subtitle={`Chuyển thẳng dữ liệu sang Google Drive · ${DRIVE_CONFIG.folderName}`}
        rightIcon={'grid-outline'}
        rightLabel={exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}
        onRightPress={() => void handleExportExcel()}
      />

      {/* Google Drive K8T4_app Cloud Storage Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={styles.heroOrbA} />
          <View style={styles.heroOrbB} />

          <View style={styles.heroTopRow}>
            <View style={styles.drivePill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: driveReady ? '#34D399' : '#FDE047' },
                ]}
              />
              <Text style={styles.drivePillText}>
                {`GOOGLE DRIVE · ${DRIVE_CONFIG.folderName} · TRỰC TIẾP`}
              </Text>
            </View>
            <Pressable
              onPress={openDriveFolder}
              style={({ pressed }) => [styles.openFolderBtn, pressed && styles.pressed]}>
              <Ionicons name="folder-open" size={13} color="#FFFFFF" />
              <Text style={styles.openFolderText}>Mở thư mục Drive →</Text>
            </Pressable>
          </View>

          <Text style={styles.heroTitle}>Học sinh & Thầy Cô cùng chia sẻ</Text>
          <Text style={styles.heroSub}>
            {`Ảnh được tự động tối ưu tốc độ cao, hiển thị tức thì và đồng bộ trực tiếp tới mọi thiết bị qua thư mục Google Drive "${DRIVE_CONFIG.folderName}".`}
          </Text>

          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiVal}>{stats.totalCount}</Text>
              <Text style={styles.kpiLab}>Tổng tệp</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiVal}>{stats.photoCount}</Text>
              <Text style={styles.kpiLab}>Ảnh lớp</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiVal}>{stats.documentCount + stats.videoCount}</Text>
              <Text style={styles.kpiLab}>File & Video</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiVal}>
                {stats.totalBytes > 0 ? formatBytes(stats.totalBytes) : 'Drive GB'}
              </Text>
              <Text style={styles.kpiLab}>Đã chuyển</Text>
            </View>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Unified Upload Composer for BOTH Students & Teachers */}
      <FadeIn index={1}>
        <Card style={styles.composer}>
          <View style={styles.composerHead}>
            <View style={[styles.composerIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="cloud-upload" size={20} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.composerTitle, { color: theme.text }]}>
                {`Tải ảnh / file lên Drive ${DRIVE_CONFIG.folderName}`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Tự nén ảnh siêu nhanh · Tải song song nhiều tệp · Hiện ngay không cần tải lại
              </Text>
            </View>
          </View>

          <View style={styles.roleStrip}>
            <Badge
              label={formatUploaderRoleLabel(memberRole, subjectName)}
              color={myRoleBadge.color}
              soft={myRoleBadge.soft}
              icon={myRoleBadge.icon}
            />
            {currentStudent?.code ? (
              <Badge
                label={`ID: ${currentStudent.code}`}
                color={'purple'}
                soft={'purpleSoft'}
                icon={'id-card-outline'}
              />
            ) : null}
            <Badge
              label={`Thư mục: ${DRIVE_CONFIG.folderName}`}
              color={'success'}
              soft={'successSoft'}
              icon={'cloud-done-outline'}
            />
          </View>

          <TextField
            label={'Người đăng (tự động nhận diện theo tài khoản)'}
            icon={'person-outline'}
            placeholder={'VD: Minh Quân / Thầy Ngô Vũ Hảo / Cô Minh Anh...'}
            value={uploaderName}
            onChangeText={setUploaderNameDraft}
          />

          <OptionPicker
            label={'Phân loại nội dung'}
            layout={'row'}
            options={DRIVE_MEDIA_CATEGORY_LIST.map((cat) => ({
              value: cat,
              label: DRIVE_MEDIA_CATEGORIES[cat].label,
              icon: DRIVE_MEDIA_CATEGORIES[cat].icon,
            }))}
            value={category}
            onChange={setCategory}
          />

          <TextField
            label={'Chú thích / Tên môn học / Nội dung (tuỳ chọn)'}
            icon={'chatbox-ellipses-outline'}
            placeholder={'VD: Ảnh dã ngoại 10T4, Đề cương Toán chương 2, Bài thuyết trình nhóm 3...'}
            value={caption}
            onChangeText={setCaption}
          />

          <DriveUploadButton
            mode={'both'}
            mediaLabel={'Tải Ảnh / Video'}
            fileLabel={'Tải File / Tài liệu'}
            multiple
            accept="*/*"
            uploaderName={uploaderName.trim() || defaultUploaderName}
            uploaderRole={memberRole}
            category={category}
            onSelectionStart={handleSelectionStart}
            onItemUploaded={handleItemUploaded}
            onItemFailed={handleItemFailed}
            onUploaded={handleBatchComplete}
            onLargeFileDetected={(name, size) => {
              setLargeName(name);
              setLargeSizeMb((size / (1024 * 1024)).toFixed(1));
              setLargePanelOpen(true);
            }}
          />

          {/* Large-File (25MB -> Multi-GB) Direct Google Drive K8T4_app Panel */}
          <Pressable
            onPress={() => setLargePanelOpen((v) => !v)}
            style={[
              styles.largeToggle,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <Ionicons name="rocket-outline" size={16} color={theme.purple} />
            <Text style={[styles.largeToggleText, { color: theme.text }]}>
              {`File siêu lớn (> 25 MB / hàng GB)? Tải thẳng vào ${DRIVE_CONFIG.folderName} & gắn link`}
            </Text>
            <Ionicons
              name={largePanelOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.textMuted}
            />
          </Pressable>

          {largePanelOpen ? (
            <View
              style={[
                styles.largeBox,
                { backgroundColor: theme.backgroundElement, borderColor: `${theme.purple}55` },
              ]}>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
                {`Với video kỷ yếu hoặc file nén nặng hàng trăm MB – nhiều GB, bấm nút bên dưới để thả trực tiếp vào thư mục Google Drive "${DRIVE_CONFIG.folderName}" ở tốc độ tối đa, rồi dán link chia sẻ vào đây để cả lớp cùng xem:`}
              </Text>
              <Button
                label={`1. Mở thư mục Google Drive ${DRIVE_CONFIG.folderName}`}
                icon={'folder-open'}
                variant={'soft'}
                size={'sm'}
                onPress={openDriveFolder}
              />
              <TextField
                label={'2. Dán link tệp từ Google Drive'}
                icon={'link-outline'}
                placeholder={'https://drive.google.com/file/d/.../view'}
                value={largeUrl}
                onChangeText={setLargeUrl}
                autoCapitalize={'none'}
              />
              <View style={styles.inlineInputs}>
                <View style={styles.flex}>
                  <TextField
                    label={'Tên hiển thị của file'}
                    placeholder={'VD: Video Ky Yeu 10T4.mp4'}
                    value={largeName}
                    onChangeText={setLargeName}
                  />
                </View>
                <View style={{ width: 112 }}>
                  <TextField
                    label={'Dung lượng (MB)'}
                    placeholder={'VD: 520'}
                    value={largeSizeMb}
                    onChangeText={setLargeSizeMb}
                    keyboardType={'decimal-pad'}
                  />
                </View>
              </View>
              <OptionPicker
                label={'Định dạng tệp lớn'}
                columns={3}
                options={[
                  { value: 'video', label: 'Video', icon: 'videocam-outline' },
                  { value: 'document', label: 'Tài liệu / ZIP', icon: 'document-outline' },
                  { value: 'photo', label: 'Ảnh gốc', icon: 'image-outline' },
                ]}
                value={largeKind}
                onChange={setLargeKind}
              />
              <Button
                label={savingLarge ? 'Đang lưu...' : `Lưu vào kho lớp (${DRIVE_CONFIG.folderName})`}
                icon={'checkmark-circle'}
                size={'sm'}
                disabled={savingLarge}
                onPress={handleAttachLargeDriveFile}
              />
            </View>
          ) : null}

          {bannerError ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: theme.dangerSoft, borderColor: `${theme.danger}44` },
              ]}>
              <Ionicons name="alert-circle" size={16} color={theme.danger} />
              <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700', flex: 1 }}>
                {bannerError}
              </Text>
            </View>
          ) : null}
        </Card>
      </FadeIn>

      {/* Search & Role/Type Filters */}
      <FadeIn index={2}>
        <Card style={styles.filterCard}>
          <TextField
            icon={'search'}
            placeholder={'Tìm tên ảnh, tài liệu, người đăng, môn học...'}
            value={query}
            onChangeText={setQuery}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            <Chip
              label={`Tất cả (${stats.totalCount})`}
              selected={roleFilter === 'all'}
              onPress={() => setRoleFilter('all')}
            />
            <Chip
              label={`Thầy / Cô (${stats.teacherCount})`}
              icon={'shield-checkmark-outline'}
              selected={roleFilter === 'teachers'}
              onPress={() => setRoleFilter('teachers')}
            />
            <Chip
              label={`Học sinh (${stats.studentCount})`}
              icon={'school-outline'}
              selected={roleFilter === 'students'}
              onPress={() => setRoleFilter('students')}
            />
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            <Chip
              label={'Mọi định dạng'}
              selected={typeFilter === 'all'}
              onPress={() => setTypeFilter('all')}
            />
            <Chip
              label={`Album ảnh (${stats.photoCount})`}
              icon={'images-outline'}
              selected={typeFilter === 'photo'}
              onPress={() => setTypeFilter('photo')}
            />
            <Chip
              label={`Tài liệu / File (${stats.documentCount})`}
              icon={'document-text-outline'}
              selected={typeFilter === 'document'}
              onPress={() => setTypeFilter('document')}
            />
            <Chip
              label={`Video (${stats.videoCount})`}
              icon={'videocam-outline'}
              selected={typeFilter === 'video'}
              onPress={() => setTypeFilter('video')}
            />
          </ScrollView>
        </Card>
      </FadeIn>
    </View>
  );

  const listEmpty = isInitialLoading ? (
    <View style={styles.skeletonList}>
      <Text style={[styles.skeletonHint, { color: theme.textSecondary }]}>
        {`Đang tải kho dữ liệu Google Drive ${DRIVE_CONFIG.folderName}...`}
      </Text>
      <SkeletonCard lines={3} showAvatar />
      <SkeletonCard lines={2} showAvatar />
      <SkeletonCard lines={3} showAvatar />
    </View>
  ) : (
    <EmptyState
      icon={'cloud-upload-outline'}
      title={'Chưa có ảnh hoặc tệp phù hợp'}
      message={`Cả Học sinh và Thầy/Cô đều có thể tải ảnh, đề cương, bài tập hoặc video lên thư mục Google Drive "${DRIVE_CONFIG.folderName}" ở khung phía trên!`}
    />
  );

  const listFooter =
    !isInitialLoading && remainingCount > 0 ? (
      <View style={styles.loadMoreWrap}>
        <Text style={[styles.loadMoreHint, { color: theme.textMuted }]}>
          {`Đang hiển thị ${pagedItems.length} / ${filteredItems.length} mục`}
        </Text>
        <Button
          label={`Tải thêm ${Math.min(GALLERY_PAGE_SIZE, remainingCount)} mục (còn ${remainingCount})`}
          variant={'soft'}
          icon={'chevron-down-circle-outline'}
          onPress={() =>
            setPageState({ key: filterKey, limit: visibleLimit + GALLERY_PAGE_SIZE })
          }
        />
      </View>
    ) : undefined;

  const renderMediaItem = ({ item }: { item: DriveMediaItem }) => {
    const isPhoto = item.itemType === 'photo';
    const roleMeta = roleBadgeStyle(item.uploaderRole);
    const catMeta = DRIVE_MEDIA_CATEGORIES[item.category] ?? DRIVE_MEDIA_CATEGORIES.other;
    const fileVisual = getFileVisualMeta(item.fileName, item.mimeType);
    const fileSoftKey = `${fileVisual.tone}Soft` as
      | 'accentSoft'
      | 'dangerSoft'
      | 'successSoft'
      | 'warningSoft'
      | 'purpleSoft';
    const deletable = canDeleteItem(item);

    return (
      <Card
        style={[
          styles.itemCard,
          item.pending && { borderColor: theme.accent, borderWidth: 1.2 },
        ]}>
        {/* Header: Avatar + Uploader + Role Badge + Timestamp */}
        <View style={styles.itemHead}>
          <Avatar name={item.uploaderName} size={36} />
          <View style={styles.flex}>
            <View style={styles.uploaderRow}>
              <Text style={[styles.uploaderName, { color: theme.text }]} numberOfLines={1}>
                {item.uploaderName}
              </Text>
              <Badge
                label={formatUploaderRoleLabel(item.uploaderRole, item.uploaderSubject)}
                color={roleMeta.color}
                soft={roleMeta.soft}
                icon={roleMeta.icon}
              />
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: '600' }}>
              {item.pending
                ? `Đang đồng bộ nhanh lên Google Drive ${item.folderName}...`
                : [
                    new Date(item.createdAt).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : null,
                    `Drive ${item.folderName}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>
          </View>
        </View>

        {/* Category + Status Badges */}
        <View style={styles.metaBadges}>
          <Badge
            label={catMeta.label}
            color={catMeta.color}
            soft={catMeta.soft}
            icon={catMeta.icon}
          />
          {item.sizeBytes > 0 ? (
            <Badge
              label={formatBytes(item.sizeBytes)}
              color={'textSecondary'}
              soft={'backgroundElement'}
              icon={'server-outline'}
            />
          ) : null}
          {item.pending ? (
            <Badge
              label={'Đang tải lên...'}
              color={'accentText'}
              soft={'accentSoft'}
              icon={'cloud-upload-outline'}
            />
          ) : item.localOnly ? (
            <Badge
              label={'Lưu cục bộ'}
              color={'warning'}
              soft={'warningSoft'}
              icon={'phone-portrait-outline'}
            />
          ) : null}
        </View>

        {item.caption ? (
          <Text style={[styles.caption, { color: theme.text }]}>{item.caption}</Text>
        ) : null}

        {/* Media Body */}
        {isPhoto ? (
          <Pressable
            disabled={Boolean(item.pending)}
            onPress={() => setPreviewItem(item)}
            style={({ pressed }) => [
              styles.photoFrame,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <DriveImage
              driveFileId={item.driveFileId}
              primaryUri={item.imageUrl}
              localUri={item.localPreviewUri}
              width={800}
              contentFit="cover"
              style={styles.photo}
            />
            {item.pending ? (
              <View style={styles.pendingBanner}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.photoOverlayText} numberOfLines={1}>
                  {`Đang đồng bộ "${item.fileName}"...`}
                </Text>
              </View>
            ) : (
              <View style={styles.photoOverlay}>
                <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
                <Text style={styles.photoOverlayText} numberOfLines={1}>
                  {item.fileName}
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          <View
            style={[
              styles.docBox,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={[styles.docIcon, { backgroundColor: theme[fileSoftKey] }]}>
              {item.pending ? (
                <ActivityIndicator size="small" color={theme[fileVisual.tone]} />
              ) : (
                <Ionicons name={fileVisual.icon} size={22} color={theme[fileVisual.tone]} />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.docName, { color: theme.text }]} numberOfLines={2}>
                {item.fileName}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: '600' }}>
                {item.pending
                  ? `Đang chuyển lên Google Drive ${DRIVE_CONFIG.folderName}...`
                  : [
                      fileVisual.badge,
                      item.sizeBytes > 0
                        ? formatBytes(item.sizeBytes)
                        : 'Lưu trên Google Drive',
                    ].join(' · ')}
              </Text>
            </View>
          </View>
        )}

        {/* Footer Actions */}
        {!item.pending ? (
          <View style={[styles.itemFooter, { borderColor: theme.border }]}>
            <Pressable
              onPress={() => openLink(item.driveUrl)}
              style={[styles.footerPill, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="open-outline" size={14} color={theme.accentText} />
              <Text style={[styles.footerPillText, { color: theme.accentText }]}>
                Mở trên Drive
              </Text>
            </Pressable>

            <Pressable
              onPress={() => openLink(item.downloadUrl)}
              style={[styles.footerPill, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="download-outline" size={14} color={theme.success} />
              <Text style={[styles.footerPillText, { color: theme.success }]}>Tải về</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                const res = await shareOrCopyText(item.driveUrl, item.fileName);
                showToast(
                  res === 'copied' ? 'Đã sao chép link Google Drive!' : 'Đã mở chia sẻ link!',
                );
              }}
              style={[styles.footerIconBtn, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="copy-outline" size={15} color={theme.textSecondary} />
            </Pressable>

            {deletable ? (
              <Pressable
                disabled={deletingId === item.id}
                onPress={() => void handleDelete(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  confirmDeleteId === item.id
                    ? `Xác nhận xoá ${item.fileName}`
                    : `Xoá ${item.fileName}`
                }
                style={[
                  styles.footerIconBtn,
                  {
                    backgroundColor:
                      confirmDeleteId === item.id ? theme.danger : theme.dangerSoft,
                  },
                ]}>
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color={theme.danger} />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={15}
                    color={confirmDeleteId === item.id ? '#FFFFFF' : theme.danger}
                  />
                )}
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen scrollable={false} withTabBar={false}>
      {/* Virtualized Feed List — instant cached render, ZERO full-screen spinner during uploads */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderMediaItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        ItemSeparatorComponent={ListItemGap}
        extraData={`${confirmDeleteId ?? ''}|${deletingId ?? ''}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        windowSize={5}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: Math.max(24, insets.bottom + Spacing.three),
          },
        ]}
      />

      {/* Fullscreen Photo Preview Modal */}
      <Modal
        visible={Boolean(previewItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}>
        <View
          style={[
            styles.modalBackdrop,
            { backgroundColor: isDark ? 'rgba(2, 6, 23, 0.92)' : 'rgba(15, 23, 42, 0.86)' },
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewItem(null)} />
          {previewItem ? (
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.modalHead}>
                <View style={styles.flex}>
                  <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                    {previewItem.fileName}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {`${previewItem.uploaderName} · ${formatUploaderRoleLabel(previewItem.uploaderRole, previewItem.uploaderSubject)}`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPreviewItem(null)}
                  style={[styles.closeCircle, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="close" size={18} color={theme.text} />
                </Pressable>
              </View>

              <DriveImage
                driveFileId={previewItem.driveFileId}
                primaryUri={previewItem.imageUrl}
                localUri={previewItem.localPreviewUri}
                width={1600}
                contentFit="contain"
                style={styles.modalImage}
              />

              {previewItem.caption ? (
                <Text style={{ color: theme.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
                  {previewItem.caption}
                </Text>
              ) : null}

              <View style={styles.modalActions}>
                <Button
                  label={'Mở Drive'}
                  icon={'open-outline'}
                  size={'sm'}
                  style={styles.flex}
                  onPress={() => openLink(previewItem.driveUrl)}
                />
                <Button
                  label={'Tải về'}
                  variant={'soft'}
                  icon={'download-outline'}
                  size={'sm'}
                  onPress={() => openLink(previewItem.downloadUrl)}
                />
                {canDeleteItem(previewItem) ? (
                  <Button
                    label={
                      deletingId === previewItem.id
                        ? 'Đang xoá...'
                        : confirmDeleteId === previewItem.id
                          ? 'Xác nhận xoá?'
                          : 'Xoá'
                    }
                    variant={'danger'}
                    icon={'trash-outline'}
                    size={'sm'}
                    disabled={deletingId === previewItem.id}
                    onPress={() => void handleDelete(previewItem)}
                  />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, width: '100%' },
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth + Spacing.three * 2,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  listHeader: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  itemGap: { height: Spacing.three },
  loadMoreWrap: {
    marginTop: Spacing.three,
    gap: Spacing.two,
    alignItems: 'center',
  },
  loadMoreHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  flex: { flex: 1 },
  hero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.two + 2,
    overflow: 'hidden',
  },
  heroOrbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -75,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroOrbB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -60,
    left: -35,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  drivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  drivePillText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  openFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  openFolderText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, lineHeight: 18 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  kpiBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  kpiVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  kpiLab: { color: 'rgba(255,255,255,0.88)', fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  composer: { gap: Spacing.three },
  composerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  composerIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerTitle: { fontSize: 16, fontWeight: '900' },
  roleStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  largeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  largeToggleText: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  largeBox: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two + 2,
  },
  inlineInputs: { flexDirection: 'row', gap: Spacing.two },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  filterCard: { gap: Spacing.two + 2 },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  skeletonList: { gap: Spacing.three },
  skeletonHint: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  itemCard: { gap: Spacing.two + 2 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  uploaderName: { fontSize: 14.5, fontWeight: '900', flexShrink: 1 },
  metaBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  photoFrame: {
    width: '100%',
    height: 260,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  pendingBanner: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  photoOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  photoOverlayText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', flex: 1 },
  docBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  footerPillText: { fontSize: 12.5, fontWeight: '800' },
  footerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 680,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    maxHeight: '90%',
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: Platform.OS === 'web' ? 420 : 340,
    borderRadius: Radius.lg,
    backgroundColor: '#0f172a',
  },
  modalActions: { flexDirection: 'row', gap: Spacing.two },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
