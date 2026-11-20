import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryBars } from '@/components/charts/category-bars';
import { EntryCard } from '@/components/entry-card';
import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { KUDOS_STICKERS } from '@/constants/utilities-meta';
import { ENTRY_TEMPLATES } from '@/data/seed-extras';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { badgesForStudent } from '@/lib/badges';
import { ageOf, formatDate } from '@/lib/date';
import { buildStudentReportCard, shareOrCopyText } from '@/lib/export';
import { buildCategoryStats } from '@/lib/stats';
import { useClassStore } from '@/store/class-store';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    classInfo,
    ranking,
    getStudent,
    entriesOfStudent,
    statsOfStudent,
    attendanceStatsOfStudent,
    kudosOfStudent,
    seatOfStudent,
    quickReward,
    saveStudentPrivate,
    canEditClass,
    canViewAll,
    canViewNotes,
    canManagePrivate,
    canViewPrivateOf,
    currentStudentId,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const student = id ? getStudent(id) : undefined;
  const [editingPrivate, setEditingPrivate] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [addressDraft, setAddressDraft] = useState('');

  if (!student) {
    return (
      <Screen withTabBar={false}>
        <EmptyState
          icon={canViewAll ? 'person-outline' : 'lock-closed-outline'}
          title={canViewAll ? 'Không tìm thấy học sinh' : 'Trang hồ sơ riêng tư 🔒'}
          message={
            canViewAll
              ? 'Học sinh này không tồn tại hoặc đã bị xoá.'
              : 'Bạn chỉ được xem trang tên và dữ liệu của chính mình. Chỉ Giáo viên chủ nhiệm mới xem được hồ sơ của tất cả học sinh.'
          }
        />
        {!canViewAll && currentStudentId ? (
          <Button
            label={'Về trang hồ sơ của tôi'}
            icon={'person-circle'}
            onPress={() =>
              router.replace({ pathname: '/student/[id]', params: { id: currentStudentId } } as never)
            }
          />
        ) : null}
        <Button label={'Quay lại'} variant={'soft'} onPress={() => router.back()} />
      </Screen>
    );
  }

  const entries = entriesOfStudent(student.id);
  const stats = statsOfStudent(student.id);
  const att = attendanceStatsOfStudent(student.id);
  const studentKudos = kudosOfStudent(student.id);
  const seat = seatOfStudent(student.id);
  const rank = ranking.find((r) => r.student.id === student.id)?.rank ?? null;
  const age = ageOf(student.birthDate);
  const honours = badgesForStudent(entries, stats, att, rank ?? undefined);
  const catStats = buildCategoryStats(entries);

  const canSeePrivate = canViewPrivateOf(student.id);
  const isOwnProfile = currentStudentId !== null && currentStudentId === student.id;
  const canEditOwnContact = isOwnProfile || canManagePrivate;

  const openContactEdit = () => {
    setPhoneDraft(student.phone ?? '');
    setEmailDraft(student.email ?? '');
    setAddressDraft(student.address ?? '');
    setEditingPrivate((v) => !v);
  };

  const handleSavePrivate = async () => {
    try {
      await saveStudentPrivate(student.id, {
        phone: phoneDraft,
        email: emailDraft,
        address: addressDraft,
      });
      setEditingPrivate(false);
      showToast('Đã cập nhật thông tin liên hệ bảo mật!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể lưu liên hệ', 'danger');
    }
  };

  const handleShareReport = async () => {
    const report = buildStudentReportCard({
      classInfo,
      student,
      stats,
      attendance: att,
      rank,
      entries,
    });
    const res = await shareOrCopyText(report, `Phiếu thành tích - ${student.name}`);
    showToast(
      res === 'copied'
        ? 'Đã sao chép phiếu thành tích học sinh!'
        : 'Đã mở hộp thoại chia sẻ phiếu thành tích!',
    );
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={canViewAll ? 'Hồ sơ học sinh' : 'Trang cá nhân của tôi'}
        subtitle={
          canViewAll && rank
            ? `ID: ${student.code} · Hạng #${rank} thi đua lớp ${classInfo.name}`
            : `ID: ${student.code} · Lớp ${classInfo.name}`
        }
        rightIcon={'share-social-outline'}
        rightLabel={'Phiếu điểm'}
        onRightPress={handleShareReport}
      />

      {/* Profile Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.profile, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.bubbleA} />
          <View style={styles.bubbleB} />
          <Avatar name={student.name} size={88} ring />
          <Text style={styles.name}>{student.name}</Text>
          <View style={styles.tags}>
            {[`ID: ${student.code}`, student.position?.trim(), student.group, seat?.label].filter(Boolean).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.birth}>
            {student.birthDate
              ? 'Sinh ngày ' + formatDate(student.birthDate) + (age !== null ? ' (' + age + ' tuổi)' : '')
              : 'Ngày sinh: Chưa cập nhật'}
          </Text>

          {/* Quick Contact Row (only visible when authorized) */}
          {canSeePrivate && (student.phone || student.email) ? (
            <View style={styles.contactRow}>
              {student.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${student.phone}`).catch(() => {})}
                  style={styles.contactPill}>
                  <Ionicons name="call" size={14} color="#FFFFFF" />
                  <Text style={styles.contactText}>{student.phone}</Text>
                </Pressable>
              ) : null}
              {student.email ? (
                <Pressable
                  onPress={() => Linking.openURL(`mailto:${student.email}`).catch(() => {})}
                  style={styles.contactPill}>
                  <Ionicons name="mail" size={14} color="#FFFFFF" />
                  <Text style={styles.contactText} numberOfLines={1}>
                    {student.email}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Protected Personal Contact Card */}
      <FadeIn index={1}>
        <Card style={styles.honourCard}>
          <View style={styles.privHead}>
            <View style={[styles.privIcon, { backgroundColor: canSeePrivate ? theme.successSoft : theme.warningSoft }]}>
              <Ionicons
                name={canSeePrivate ? 'shield-checkmark' : 'lock-closed'}
                size={16}
                color={canSeePrivate ? theme.success : theme.warning}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.cardLabel, { color: theme.text }]}>
                Thông tin cá nhân (Bảo mật)
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                {canSeePrivate
                  ? isOwnProfile
                    ? 'Hồ sơ của bạn · Chỉ bạn và GVCN xem được'
                    : 'Bạn có quyền xem thông tin liên hệ này'
                  : 'Ẩn với người không có quyền trên máy chủ'}
              </Text>
            </View>
            {canEditOwnContact ? (
              <Button
                label={editingPrivate ? 'Đóng' : 'Sửa'}
                size={'sm'}
                variant={'soft'}
                onPress={openContactEdit}
              />
            ) : null}
          </View>

          {!canSeePrivate ? (
            <View style={[styles.lockedBox, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="eye-off-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.lockedText, { color: theme.textSecondary }]}>
                Số điện thoại, Email và Địa chỉ được bảo vệ bởi Supabase RLS. Chỉ GVCN, người được
                cấp quyền và chính học sinh mới xem được.
              </Text>
            </View>
          ) : editingPrivate ? (
            <View style={styles.editForm}>
              <TextField
                label={'Số điện thoại'}
                icon={'call-outline'}
                value={phoneDraft}
                onChangeText={setPhoneDraft}
                keyboardType={'phone-pad'}
              />
              <TextField
                label={'Email'}
                icon={'mail-outline'}
                value={emailDraft}
                onChangeText={setEmailDraft}
                keyboardType={'email-address'}
                autoCapitalize={'none'}
              />
              <TextField
                label={'Địa chỉ'}
                icon={'location-outline'}
                value={addressDraft}
                onChangeText={setAddressDraft}
              />
              <Button label={'Lưu thông tin bảo mật'} icon={'checkmark'} onPress={handleSavePrivate} />
            </View>
          ) : (
            <View style={styles.privDetails}>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {'📞 SĐT: ' + (student.phone || 'Chưa cập nhật')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {'✉️ Email: ' + (student.email || 'Chưa cập nhật')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {'📍 Địa chỉ: ' + (student.address || 'Chưa cập nhật')}
              </Text>
            </View>
          )}
        </Card>
      </FadeIn>

      {/* Auto-Earned Honour Badges */}
      <FadeIn index={2}>
        <Card style={styles.honourCard}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>Danh hiệu & Huy hiệu 🏅</Text>
          <View style={styles.honourList}>
            {honours.map((b) => (
              <Badge key={b.id} label={b.label} color={b.color} soft={b.soft} icon={b.icon} />
            ))}
          </View>
        </Card>
      </FadeIn>

      {/* Metrics */}
      <FadeIn index={3} style={styles.grid}>
        <StatCard label={'Điểm thi đua'} value={stats.points} icon={'ribbon'} tone={'success'} />
        <StatCard label={'Thành tích'} value={stats.achievements} icon={'trophy'} tone={'accent'} />
      </FadeIn>
      <FadeIn index={4} style={styles.grid}>
        <StatCard label={'Hoạt động'} value={stats.activities} icon={'sparkles'} tone={'purple'} />
        <StatCard
          label={'Chuyên cần'}
          value={att.rate !== null ? `${att.rate}%` : '--'}
          icon={'checkbox'}
          tone={'warning'}
          hint={
            att.total > 0
              ? `${att.present} có · ${att.late} muộn · ${att.excused + att.absent} vắng`
              : 'Chưa điểm danh'
          }
        />
      </FadeIn>

      {/* Teacher / Editor 1-Tap Quick Reward Bar */}
      {canEditClass ? (
        <FadeIn index={5}>
          <Card style={styles.rewardCard}>
            <View style={styles.rewardHead}>
              <Ionicons name="flash" size={16} color={theme.gold} />
              <Text style={[styles.cardLabel, { color: theme.text }]}>Khen thưởng nhanh 1 chạm</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rewardRow}>
              {ENTRY_TEMPLATES.slice(0, 4).map((tpl) => (
                <Pressable
                  key={tpl.label}
                  onPress={() => {
                    quickReward(student.id, tpl.title, tpl.points, tpl.category, tpl.kind, tpl.level);
                    showToast(`Đã thưởng +${tpl.points}đ (${tpl.title}) cho ${student.name}!`);
                  }}
                  style={({ pressed }) => [
                    styles.rewardPill,
                    { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.rewardText, { color: theme.accentText }]}>{tpl.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        </FadeIn>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        {canEditClass ? (
          <Button
            label={'Sửa & Mật khẩu'}
            variant={'soft'}
            icon={'create-outline'}
            style={styles.flex}
            onPress={() =>
              router.push({ pathname: '/student-form', params: { id: student.id } } as never)
            }
          />
        ) : null}
        {canEditClass || isOwnProfile ? (
          <Button
            label={'Ghi thành tích'}
            icon={'add-circle'}
            style={styles.flex}
            onPress={() =>
              router.push({ pathname: '/entry-form', params: { studentId: student.id } } as never)
            }
          />
        ) : null}
        <Button
          label={'Gửi Kudos'}
          variant={'soft'}
          icon={'heart'}
          onPress={() =>
            router.push({ pathname: '/kudos', params: { toStudentId: student.id } } as never)
          }
        />
      </View>

      {/* Kudos Received Showcase */}
      {studentKudos.length > 0 ? (
        <Card style={styles.honourCard}>
          <View style={styles.privHead}>
            <Text style={[styles.cardLabel, { color: theme.text, flex: 1 }]}>
              {`Lời khen Kudos đã nhận (${studentKudos.length}) 💖`}
            </Text>
            <Pressable onPress={() => router.push('/kudos' as never)}>
              <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
                Xem tường →
              </Text>
            </Pressable>
          </View>
          {studentKudos.slice(0, 3).map((k) => {
            const meta = KUDOS_STICKERS[k.sticker] ?? KUDOS_STICKERS.positive_vibes;
            return (
              <View
                key={k.id}
                style={[styles.lockedBox, { backgroundColor: theme.backgroundElement }]}>
                <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                    {'“' + k.message + '”'}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                    {`Từ ${k.anonymous ? 'Bạn giấu tên' : k.fromName} · 👏 ${k.claps}`}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Teacher Private Note (strictly hidden from students) */}
      {canViewNotes && student.note ? (
        <Card style={styles.honourCard}>
          <View style={styles.rewardHead}>
            <Ionicons name="lock-closed-outline" size={15} color={theme.purple} />
            <Text style={[styles.cardLabel, { color: theme.text }]}>Ghi chú riêng của GVCN</Text>
          </View>
          <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {student.note}
          </Text>
        </Card>
      ) : null}

      {/* Category Breakdown */}
      <CategoryBars stats={catStats} title={'Thế mạnh theo lĩnh vực'} />

      <SectionHeader title={'Thành tích & hoạt động'} subtitle={entries.length + ' mục'} />
      {entries.length === 0 ? (
        <EmptyState
          title={'Chưa có mục nào'}
          message={'Hãy ghi thành tích đầu tiên hoặc bấm khen thưởng nhanh cho học sinh này.'}
        />
      ) : (
        entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onPress={
              canEditClass
                ? () =>
                    router.push({ pathname: '/entry-form', params: { id: entry.id } } as never)
                : undefined
            }
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profile: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubbleA: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -90,
    right: -60,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bubbleB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -55,
    left: -35,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  tagText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  birth: { color: 'rgba(255,255,255,0.88)', fontSize: 12 },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  contactText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', maxWidth: 200 },
  privHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  privIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  lockedText: { flex: 1, fontSize: 12, lineHeight: 18 },
  editForm: { gap: Spacing.two + 2 },
  privDetails: { gap: 4 },
  honourCard: { gap: Spacing.two },
  cardLabel: { fontSize: 14, fontWeight: '800' },
  honourList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grid: { flexDirection: 'row', gap: Spacing.three },
  rewardCard: { gap: Spacing.two },
  rewardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardRow: { gap: Spacing.two, paddingRight: Spacing.two },
  rewardPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  rewardText: { fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
