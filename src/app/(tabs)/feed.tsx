import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_LEVELS,
  ENTRY_STATUSES,
} from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import {
  buildDriveFallbackThumbnailUrl,
  buildDriveThumbnailUrl,
  extractDriveFileId,
  getLocalPreviewUri,
  isGoogleDriveUrl,
} from '@/lib/drive';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import type { EntryCategory, EntryStatus } from '@/types/models';

function FeedProofPreview({
  proofUrl,
  onPress,
}: {
  proofUrl: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [attempt, setAttempt] = useState({ url: proofUrl, index: 0 });

  const isDocLink = /\/(document|spreadsheets|presentation)\/d\//i.test(proofUrl);
  const driveId = isDocLink ? null : extractDriveFileId(proofUrl);
  if (!driveId) return null;

  const localUri = getLocalPreviewUri(driveId);
  const primary = buildDriveThumbnailUrl(driveId, 600);
  const fallback = buildDriveFallbackThumbnailUrl(driveId, 600);

  const candidates: string[] = [];
  for (const candidate of [localUri, primary, fallback]) {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  const activeIdx = attempt.url === proofUrl ? attempt.index : 0;
  if (activeIdx >= candidates.length) return null;

  const uri = candidates[activeIdx];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.proofThumbWrap,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { opacity: 0.9 },
      ]}>
      <Image
        source={{ uri }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={120}
        onError={() =>
          setAttempt((prev) => {
            const current = prev.url === proofUrl ? prev.index : 0;
            return { url: proofUrl, index: current + 1 };
          })
        }
        style={styles.proofThumbImg}
      />
      <View style={styles.proofThumbBadge}>
        <Ionicons name="image-outline" size={11} color="#FFFFFF" />
        <Text style={styles.proofThumbBadgeText}>Ảnh minh chứng · Chạm để mở</Text>
      </View>
    </Pressable>
  );
}

type Filter = 'all' | EntryStatus;
type CatFilter = 'all' | EntryCategory;
type KindFilter = 'all' | 'study' | 'achievement' | 'academic' | 'violation' | 'duty';

const FILTERS: { value: Filter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'Tất cả', icon: 'layers-outline' },
  { value: 'pending', label: 'Chờ duyệt', icon: 'time-outline' },
  { value: 'approved', label: 'Đã duyệt', icon: 'checkmark-circle-outline' },
  { value: 'rejected', label: 'Từ chối', icon: 'close-circle-outline' },
];

const KIND_FILTERS: { value: KindFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'Tất cả', icon: 'apps-outline' },
  { value: 'study', label: '📚 Phát biểu', icon: 'book-outline' },
  { value: 'achievement', label: '🏆 Thành tích', icon: 'trophy-outline' },
  { value: 'academic', label: '🎓 Học thuật', icon: 'school-outline' },
  { value: 'violation', label: '⚠️ Vi phạm', icon: 'alert-circle-outline' },
  { value: 'duty', label: '🧹 Trực nhật', icon: 'leaf-outline' },
];

export default function FeedScreen() {
  const {
    entries,
    role,
    canViewAll,
    canEditClass,
    isOfficer,
    officerPositionLabel,
    canRecordStudy,
    canRecordBonus,
    canRecordViolation,
    classRosterPublic,
    currentStudentId,
    getStudent,
    setEntryStatus,
    clearEntryProof,
    approveAllPending,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [confirmProofEntryId, setConfirmProofEntryId] = useState<string | null>(null);
  const [deletingProofEntryId, setDeletingProofEntryId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rosterById = useMemo(
    () => new Map(classRosterPublic.map((s) => [s.id, s])),
    [classRosterPublic],
  );

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: entries.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const entry of entries) result[entry.status] += 1;
    return result;
  }, [entries]);

  const kindCounts = useMemo(() => {
    const c: Record<KindFilter, number> = {
      all: entries.length,
      study: 0,
      achievement: 0,
      academic: 0,
      violation: 0,
      duty: 0,
    };
    for (const entry of entries) {
      const isViol = entry.kind === 'violation' || entry.points < 0;
      const isDuty = entry.source === 'duty_diligence';
      const isStudy = entry.kind === 'study';
      const isAcademic = entry.category === 'academic';
      if (isStudy) c.study += 1;
      if (entry.kind === 'achievement') c.achievement += 1;
      if (isAcademic) c.academic += 1;
      if (isViol) c.violation += 1;
      if (isDuty) c.duty += 1;
    }
    return c;
  }, [entries]);

  const sorted = useMemo(() => {
    const q = stripVietnamese(query);
    return entries
      .filter((entry) => {
        const matchStatus = filter === 'all' || entry.status === filter;
        const matchCat = catFilter === 'all' || entry.category === catFilter;
        const isViol = entry.kind === 'violation' || entry.points < 0;
        const isDuty = entry.source === 'duty_diligence';
        const isStudy = entry.kind === 'study';
        const matchKind =
          kindFilter === 'all'
            ? true
            : kindFilter === 'study'
              ? isStudy
              : kindFilter === 'achievement'
                ? entry.kind === 'achievement'
                : kindFilter === 'academic'
                  ? entry.category === 'academic'
                  : kindFilter === 'violation'
                    ? isViol
                    : isDuty;
        const studentName =
          getStudent(entry.studentId)?.name ?? rosterById.get(entry.studentId)?.name ?? '';
        const matchQuery =
          !q ||
          stripVietnamese(
            `${entry.title} ${entry.subject ?? ''} ${studentName} ${entry.description ?? ''} ${entry.recordedByName ?? ''} ${entry.recordedByPosition ?? ''}`,
          ).includes(q);
        return matchStatus && matchCat && matchKind && matchQuery;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, filter, kindFilter, catFilter, query, getStudent, rosterById]);

  const handleApproveAll = () => {
    approveAllPending();
    showToast(`Đã duyệt tất cả ${counts.pending} mục chờ duyệt!`);
  };

  const openProof = (url: string) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(target).catch(() => showToast('Không thể mở liên kết minh chứng', 'warning'));
  };

  const handleRemoveEntryProof = async (entryId: string) => {
    if (deletingProofEntryId) return;
    if (confirmProofEntryId !== entryId) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmProofEntryId(entryId);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmProofEntryId(null);
      }, 3_500);
      showToast('Bấm lại lần nữa để xoá tệp minh chứng khỏi bài, Drive & Excel', 'warning');
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmProofEntryId(null);
    setDeletingProofEntryId(entryId);
    try {
      await clearEntryProof(entryId);
      showToast('Đã xoá tệp minh chứng khỏi bài đăng, Drive & Excel!', 'info');
    } finally {
      setDeletingProofEntryId(null);
    }
  };

  const primaryCtaLabel =
    canRecordViolation && !canRecordBonus && !canEditClass
      ? 'Ghi học sinh vi phạm'
      : canRecordStudy && !canRecordBonus && !canEditClass
        ? 'Ghi phát biểu Môn'
        : canRecordBonus && !canEditClass && !canRecordViolation
          ? 'Ghi điểm cộng Tổ'
          : canRecordBonus && canRecordViolation && !canEditClass
            ? 'Ghi điểm / Vi phạm'
            : 'Ghi thành tích mới';

  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={canViewAll || isOfficer ? 'Nhật ký thi đua & Học tập' : 'Bài đăng của tôi'}
          subtitle={
            canViewAll
              ? sorted.length + ' / ' + entries.length + ' mục toàn lớp · Phát biểu, Thành tích Học thuật & Kỷ luật'
              : isOfficer
                ? `${sorted.length} mục thuộc phạm vi ${officerPositionLabel ?? 'Ban cán sự'}`
                : sorted.length + ' mục của riêng bạn · Chỉ bạn & GVCN thấy'
          }
        />
      </FadeIn>

      {/* Live Journal KPI Banner */}
      <FadeIn index={1}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.kpiBanner,
            Shadow.floating,
            { shadowColor: gradient[0], shadowOpacity: 0.26 },
          ]}>
          <View style={styles.bannerOrbA} />
          <View style={styles.bannerOrbB} />

          <View style={styles.bannerTopRow}>
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTagText}>
                {canViewAll
                  ? 'SỔ VÀNG THI ĐUA LỚP 10T4'
                  : isOfficer
                    ? `BAN CÁN SỰ · ${(officerPositionLabel || 'ĐIỀU PHỐI').toUpperCase()}`
                    : 'NHẬT KÝ CÁ NHÂN'}
              </Text>
            </View>
            <Text style={styles.bannerCountHint}>{`Hiển thị ${sorted.length} mục`}</Text>
          </View>

          <View style={styles.kpiRow}>
            <Pressable
              onPress={() => setFilter('all')}
              style={[
                styles.kpiBox,
                filter === 'all' && styles.kpiBoxActive,
              ]}>
              <View style={styles.kpiIconBadge}>
                <Ionicons name="albums" size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.kpiVal}>{counts.all}</Text>
              <Text style={styles.kpiLab}>Tổng ghi nhận</Text>
            </Pressable>

            <Pressable
              onPress={() => setFilter('approved')}
              style={[
                styles.kpiBox,
                filter === 'approved' && styles.kpiBoxActive,
              ]}>
              <View style={styles.kpiIconBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#A7F3D0" />
              </View>
              <Text style={styles.kpiVal}>{counts.approved}</Text>
              <Text style={styles.kpiLab}>Đã duyệt</Text>
            </Pressable>

            <Pressable
              onPress={() => setFilter('pending')}
              style={[
                styles.kpiBox,
                filter === 'pending' && styles.kpiBoxActive,
              ]}>
              <View style={styles.kpiIconBadge}>
                <Ionicons name="time" size={14} color="#FDE68A" />
              </View>
              <Text style={styles.kpiVal}>{counts.pending}</Text>
              <Text style={styles.kpiLab}>Chờ duyệt</Text>
            </Pressable>
          </View>

          <View style={styles.bannerActions}>
            <Pressable
              onPress={() => router.push('/entry-form' as never)}
              style={({ pressed }) => [
                styles.bannerPrimaryBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}>
              <Ionicons name="add-circle" size={17} color={gradient[0]} />
              <Text style={[styles.bannerPrimaryText, { color: gradient[0] }]}>
                {primaryCtaLabel}
              </Text>
            </Pressable>

            {role === 'teacher' && counts.pending > 0 ? (
              <Pressable
                onPress={handleApproveAll}
                style={({ pressed }) => [
                  styles.bannerGlassBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}>
                <Ionicons name="checkmark-done" size={17} color="#FFFFFF" />
                <Text style={styles.bannerGlassText}>{`Duyệt hết (${counts.pending})`}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/study' as never)}
                style={({ pressed }) => [
                  styles.bannerGlassBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}>
                <Ionicons name="book" size={16} color="#FFFFFF" />
                <Text style={styles.bannerGlassText}>Thống kê HK I →</Text>
              </Pressable>
            )}
          </View>

          {role === 'teacher' && counts.pending > 0 ? (
            <Pressable
              onPress={() => router.push('/study' as never)}
              style={({ pressed }) => [
                styles.bannerGlassBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}>
              <Ionicons name="book" size={15} color="#A7F3D0" />
              <Text style={styles.bannerGlassText}>
                Xem thống kê phát biểu tuần & cộng dồn HK I →
              </Text>
            </Pressable>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Search & Filter Control Bar */}
      <FadeIn index={2}>
        <Card style={styles.filterCard}>
          <TextField
            icon={'search'}
            placeholder={'Tìm phát biểu, môn học, thành tích học thuật, vi phạm...'}
            value={query}
            onChangeText={setQuery}
          />

          {/* Kind Filter Chips: Tất cả | Phát biểu | Thành tích | Học thuật | Vi phạm | Trực nhật */}
          <View style={styles.filterGroup}>
            <Text style={[styles.filterHeading, { color: theme.textMuted }]}>PHÂN LOẠI GHI NHẬN</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}>
              {KIND_FILTERS.map((item) => (
                <Chip
                  key={item.value}
                  label={`${item.label} · ${kindCounts[item.value]}`}
                  icon={item.icon}
                  selected={kindFilter === item.value}
                  onPress={() => setKindFilter(item.value)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Status Filter Chips */}
          <View style={styles.filterGroup}>
            <Text style={[styles.filterHeading, { color: theme.textMuted }]}>TRẠNG THÁI DUYỆT</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}>
              {FILTERS.map((item) => (
                <Chip
                  key={item.value}
                  label={item.label + ' · ' + counts[item.value]}
                  icon={item.icon}
                  selected={filter === item.value}
                  onPress={() => setFilter(item.value)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Category Filter Chips */}
          <View style={styles.filterGroup}>
            <Text style={[styles.filterHeading, { color: theme.textMuted }]}>
              LĨNH VỰC HOẠT ĐỘNG
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}>
              <Chip
                label={'Mọi lĩnh vực'}
                icon={'grid-outline'}
                selected={catFilter === 'all'}
                onPress={() => setCatFilter('all')}
              />
              {ENTRY_CATEGORY_LIST.map((cat) => (
                <Chip
                  key={cat}
                  label={ENTRY_CATEGORIES[cat].label}
                  icon={ENTRY_CATEGORIES[cat].icon}
                  selected={catFilter === cat}
                  onPress={() => setCatFilter(cat)}
                />
              ))}
            </ScrollView>
          </View>
        </Card>
      </FadeIn>

      {sorted.length === 0 ? (
        <EmptyState
          title={'Chưa có mục phù hợp'}
          message={'Thử bỏ bộ lọc hoặc bấm nút thêm mới ở trên để ghi nhận nhé.'}
        />
      ) : (
        sorted.map((entry, i) => {
          const status = ENTRY_STATUSES[entry.status];
          const isViolation = entry.kind === 'violation' || entry.points < 0;
          const isStudy = entry.kind === 'study';
          const isAcademic = entry.category === 'academic';
          const isDuty = entry.source === 'duty_diligence';
          const kind = ENTRY_KINDS[entry.kind] ?? ENTRY_KINDS.achievement;
          const accentColor = isViolation ? 'danger' : isStudy ? 'success' : kind.color;
          const accentSoft = isViolation ? 'dangerSoft' : isStudy ? 'successSoft' : kind.soft;
          const speechCount = isStudy ? Math.max(1, Math.round(entry.speechCount ?? 1)) : 0;
          const category = ENTRY_CATEGORIES[entry.category] ?? ENTRY_CATEGORIES.other;
          const student = getStudent(entry.studentId);
          const pubStudent = rosterById.get(entry.studentId);
          const studentName = student?.name ?? pubStudent?.name ?? 'Học sinh';
          const studentGroup = student?.group ?? pubStudent?.group ?? null;
          const canOpenForm =
            canEditClass || (entry.status === 'pending' && entry.studentId === currentStudentId);
          const canOpenStudent = canViewAll || entry.studentId === currentStudentId;
          const attributionText =
            entry.recordedByPosition && entry.recordedByName
              ? `Ghi bởi ${entry.recordedByPosition}: ${entry.recordedByName}`
              : entry.recordedByPosition || entry.recordedByName
                ? `Ghi bởi ${entry.recordedByPosition || entry.recordedByName}`
                : null;

          return (
            <FadeIn key={entry.id} index={Math.min(i + 3, 10)}>
              <Card
                style={[
                  styles.card,
                  entry.status === 'pending' && {
                    borderColor: theme.warning,
                    borderWidth: 1,
                  },
                  isViolation &&
                    entry.status !== 'pending' && {
                      borderColor: theme.danger,
                      borderWidth: 1,
                    },
                  isStudy &&
                    entry.status !== 'pending' && {
                      borderColor: theme.success,
                      borderWidth: 1,
                    },
                ]}
                onPress={
                  canOpenForm
                    ? () =>
                        router.push({ pathname: '/entry-form', params: { id: entry.id } } as never)
                    : canOpenStudent
                      ? () =>
                          router.push({
                            pathname: '/student/[id]',
                            params: { id: entry.studentId },
                          } as never)
                      : undefined
                }>
                {/* Left Accent Timeline Stripe */}
                <View
                  style={[
                    styles.timelineStripe,
                    { backgroundColor: theme[accentColor] },
                  ]}
                />

                {/* Top Meta Header: Student Avatar + Name + Date */}
                <View style={styles.metaTopRow}>
                  <View style={styles.studentPill}>
                    <Avatar name={studentName} size={24} />
                    <Text style={[styles.studentNameText, { color: theme.text }]} numberOfLines={1}>
                      {studentName}
                    </Text>
                    {studentGroup ? (
                      <Text style={[styles.studentGroupText, { color: theme.textMuted }]}>
                        {`· ${studentGroup}`}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.dateChip, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="calendar-outline" size={11} color={theme.textSecondary} />
                    <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                      {formatDate(entry.date)}
                    </Text>
                  </View>
                </View>

                {/* Main Entry Row: Kind Squircle Icon + Title + Points Pill */}
                <View style={styles.head}>
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: theme[accentSoft],
                        borderColor: theme[accentColor],
                      },
                    ]}>
                    <Ionicons
                      name={isViolation ? 'alert-circle' : isStudy ? 'book' : kind.icon}
                      size={21}
                      color={theme[accentColor]}
                    />
                  </View>
                  <View style={styles.headBody}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                      {entry.title}
                    </Text>
                    <Text style={[styles.kindLabelText, { color: theme[accentColor] }]}>
                      {isViolation
                        ? 'Vi phạm / Nhắc nhở'
                        : isStudy
                          ? entry.subject
                            ? `Học tập · Môn ${entry.subject} (${speechCount} lượt)`
                            : `Học tập · Phát biểu (${speechCount} lượt)`
                          : kind.label}
                    </Text>
                  </View>
                  {entry.points !== 0 ? (
                    <View
                      style={[
                        styles.points,
                        {
                          backgroundColor: theme[accentSoft],
                          borderColor: theme[accentColor],
                        },
                      ]}>
                      <Ionicons
                        name={entry.points < 0 ? 'alert-circle' : isStudy ? 'book' : 'sparkles'}
                        size={11}
                        color={theme[accentColor]}
                      />
                      <Text style={[styles.pointsValue, { color: theme[accentColor] }]}>
                        {entry.points > 0 ? `+${entry.points}đ` : `${entry.points}đ`}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {entry.description ? (
                  <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={2}>
                    {entry.description}
                  </Text>
                ) : null}

                {entry.proofUrl && isGoogleDriveUrl(entry.proofUrl) ? (
                  <FeedProofPreview
                    proofUrl={entry.proofUrl}
                    onPress={() => openProof(entry.proofUrl!)}
                  />
                ) : null}

                {/* Badges Row */}
                <View style={styles.badges}>
                  {isStudy ? (
                    <>
                      <Badge
                        label={entry.subject ? `Phát biểu · ${entry.subject}` : 'Học tập · Phát biểu'}
                        color={'success'}
                        soft={'successSoft'}
                        icon={'book'}
                      />
                      <Badge
                        label={`${speechCount} lượt`}
                        color={'success'}
                        soft={'successSoft'}
                        icon={'hand-left-outline'}
                      />
                    </>
                  ) : null}
                  {isAcademic ? (
                    <Badge
                      label={'Thành tích Học thuật'}
                      color={'gold'}
                      soft={'goldSoft'}
                      icon={'school'}
                    />
                  ) : null}
                  {isViolation ? (
                    <Badge
                      label={'Vi phạm'}
                      color={'danger'}
                      soft={'dangerSoft'}
                      icon={'alert-circle'}
                    />
                  ) : null}
                  {isDuty ? (
                    <Badge
                      label={'Trực nhật · Chuyên cần'}
                      color={entry.points < 0 ? 'danger' : 'success'}
                      soft={entry.points < 0 ? 'dangerSoft' : 'successSoft'}
                      icon={'leaf'}
                    />
                  ) : null}
                  {attributionText ? (
                    <Badge
                      label={attributionText}
                      color={'purple'}
                      soft={'purpleSoft'}
                      icon={'shield-checkmark-outline'}
                    />
                  ) : null}
                  <Badge
                    label={status.label}
                    color={status.color}
                    soft={status.soft}
                    icon={status.icon}
                  />
                  {!isStudy && !isAcademic ? (
                    <Badge
                      label={category.label}
                      color={'purple'}
                      soft={'purpleSoft'}
                      icon={category.icon}
                    />
                  ) : null}
                  <Badge
                    label={ENTRY_LEVELS[entry.level].label}
                    color={'accentText'}
                    soft={'accentSoft'}
                  />
                  {entry.proofUrl ? (
                    <>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          openProof(entry.proofUrl!);
                        }}
                        style={[
                          styles.proofChip,
                          {
                            backgroundColor: theme.accentSoft,
                            borderColor: theme.accent,
                          },
                        ]}>
                        <Ionicons
                          name={isGoogleDriveUrl(entry.proofUrl) ? 'cloud-done-outline' : 'link'}
                          size={12}
                          color={theme.accentText}
                        />
                        <Text style={[styles.proofText, { color: theme.accentText }]}>
                          {isGoogleDriveUrl(entry.proofUrl) ? 'Minh chứng Drive' : 'Minh chứng'}
                        </Text>
                      </Pressable>

                      {canEditClass ||
                      (Boolean(currentStudentId) &&
                        entry.studentId === currentStudentId &&
                        entry.status === 'pending') ? (
                        <Pressable
                          disabled={deletingProofEntryId === entry.id}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            void handleRemoveEntryProof(entry.id);
                          }}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={
                            confirmProofEntryId === entry.id
                              ? 'Xác nhận xoá tệp minh chứng'
                              : 'Xoá tệp minh chứng'
                          }
                          style={[
                            styles.proofChip,
                            {
                              backgroundColor:
                                confirmProofEntryId === entry.id ? theme.danger : theme.dangerSoft,
                              borderColor: theme.danger,
                            },
                          ]}>
                          {deletingProofEntryId === entry.id ? (
                            <ActivityIndicator size="small" color={theme.danger} />
                          ) : (
                            <Ionicons
                              name={confirmProofEntryId === entry.id ? 'trash' : 'trash-outline'}
                              size={12}
                              color={confirmProofEntryId === entry.id ? '#FFFFFF' : theme.danger}
                            />
                          )}
                          <Text
                            style={[
                              styles.proofText,
                              { color: confirmProofEntryId === entry.id ? '#FFFFFF' : theme.danger },
                            ]}>
                            {deletingProofEntryId === entry.id
                              ? 'Đang xoá...'
                              : confirmProofEntryId === entry.id
                                ? 'Xác nhận xoá?'
                                : 'Xoá tệp'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>

                {entry.reviewNote ? (
                  <View
                    style={[
                      styles.noteBox,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}>
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={14}
                      color={theme.accent}
                    />
                    <Text style={[styles.noteText, { color: theme.textSecondary }]}>
                      {'Nhận xét GVCN: ' + entry.reviewNote}
                    </Text>
                  </View>
                ) : null}

                {/* Smooth Teacher Approval Controls */}
                {role === 'teacher' && entry.status === 'pending' ? (
                  <View style={[styles.actions, { borderColor: theme.border }]}>
                    <Button
                      label={'Duyệt ngay'}
                      size={'sm'}
                      icon={'checkmark-circle'}
                      style={styles.flex}
                      onPress={() => {
                        setEntryStatus(entry.id, 'approved');
                        showToast('Đã duyệt thành tích!');
                      }}
                    />
                    <Button
                      label={'Từ chối'}
                      size={'sm'}
                      variant={'danger'}
                      icon={'close-circle'}
                      style={styles.flex}
                      onPress={() => {
                        setEntryStatus(entry.id, 'rejected');
                        showToast('Đã từ chối mục này', 'warning');
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiBanner: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  bannerOrbA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -70,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bannerOrbB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -55,
    left: -35,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  liveTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  bannerCountHint: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11.5,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  kpiBoxActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: '#FFFFFF',
  },
  kpiIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  kpiVal: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  kpiLab: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10.5,
    fontWeight: '700',
  },
  bannerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bannerPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  bannerPrimaryText: {
    fontSize: 13,
    fontWeight: '900',
  },
  bannerGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.38)',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  bannerGlassText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  filterCard: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  filterGroup: {
    gap: 6,
  },
  filterHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  filters: { gap: Spacing.two, paddingRight: Spacing.three },
  card: {
    gap: Spacing.two + 4,
    overflow: 'hidden',
  },
  timelineStripe: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  studentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  studentNameText: {
    fontSize: 12.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  studentGroupText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: { flex: 1, gap: 2 },
  title: { fontSize: 15.5, fontWeight: '800', lineHeight: 21 },
  kindLabelText: { fontSize: 11.5, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 19 },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pointsValue: { fontSize: 14, fontWeight: '900' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  proofChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  proofText: { fontSize: 11, fontWeight: '800' },
  proofThumbWrap: {
    width: '100%',
    height: 176,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  proofThumbImg: {
    width: '100%',
    height: '100%',
  },
  proofThumbBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  proofThumbBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { fontSize: 12, flex: 1, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
