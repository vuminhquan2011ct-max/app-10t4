/**
 * Kudos & Peer Recognition Wall (Bức tường Vinh danh Lớp 10T4).
 *
 * Every approved class member (teacher, editor, student) can celebrate
 * classmates with colorful stickers, kind notes, and animated claps.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { KUDOS_STICKERS, KUDOS_STICKER_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { KudosSticker } from '@/types/models';

type FilterKey = 'all' | 'mine' | KudosSticker;

export default function KudosScreen() {
  const { toStudentId: preselectId, presetMessage } = useLocalSearchParams<{
    toStudentId?: string;
    presetMessage?: string;
  }>();
  const {
    classInfo,
    students,
    kudos,
    currentStudentId,
    canEditClass,
    getStudent,
    sendKudos,
    clapKudos,
    removeKudos,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const [composerOpen, setComposerOpen] = useState(Boolean(preselectId));
  const [recipientId, setRecipientId] = useState<string>(
    preselectId && students.some((s) => s.id === preselectId)
      ? preselectId
      : (students[0]?.id ?? ''),
  );
  const [sticker, setSticker] = useState<KudosSticker>('positive_vibes');
  const [message, setMessage] = useState(presetMessage ?? '');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [clappedIds, setClappedIds] = useState<Record<string, boolean>>({});

  const totalClaps = useMemo(() => kudos.reduce((sum, k) => sum + k.claps, 0), [kudos]);

  const topReceivers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of kudos) {
      counts.set(k.toStudentId, (counts.get(k.toStudentId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ student: getStudent(id), count }))
      .filter((x) => Boolean(x.student))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [kudos, getStudent]);

  const visible = useMemo(() => {
    return kudos.filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'mine') return currentStudentId !== null && item.toStudentId === currentStudentId;
      return item.sticker === filter;
    });
  }, [kudos, filter, currentStudentId]);

  const handleSend = async () => {
    const target = recipientId || students[0]?.id;
    if (!target) {
      showToast('Hãy chọn người nhận lời khen', 'warning');
      return;
    }
    if (!message.trim()) {
      showToast('Hãy viết vài lời khen chân thành gửi tới bạn nhé!', 'warning');
      return;
    }
    setSending(true);
    try {
      await sendKudos({
        toStudentId: target,
        sticker,
        message,
        anonymous,
      });
      decor.recordMissionProgress('send_kudos', 1);
      setMessage('');
      setComposerOpen(false);
      showToast('Đã gửi thiệp Kudos lên bức tường vinh danh! 🎉');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể gửi Kudos', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleClap = async (id: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setClappedIds((prev) => ({ ...prev, [id]: true }));
    await clapKudos(id);
  };

  return (
    <Screen withTabBar={false} onRefresh={pullNow}>
      <PageHeader
        title={'Bức tường Kudos'}
        subtitle={`Lan toả năng lượng tích cực lớp ${classInfo.name}`}
        rightIcon={composerOpen ? 'close' : 'heart'}
        rightLabel={composerOpen ? 'Đóng' : 'Gửi khen'}
        onRightPress={() => setComposerOpen((v) => !v)}
      />

      {/* Celebratory Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.bubble} />
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.heroEyebrow}>VĂN HOÁ TRI ÂN & ĐỘNG VIÊN</Text>
              <Text style={styles.heroTitle}>{`${kudos.length} lời khen · ${totalClaps} 👏`}</Text>
              <Text style={styles.heroSub}>
                Ghi nhận sự giúp đỡ, nỗ lực và khoảnh khắc đẹp của bạn bè mỗi ngày.
              </Text>
            </View>
            <View style={styles.sparkOrb}>
              <Ionicons name="heart" size={28} color="#FFFFFF" />
            </View>
          </View>

          {topReceivers.length > 0 ? (
            <View style={styles.starStrip}>
              {topReceivers.map(({ student, count }) => (
                <Pressable
                  key={student!.id}
                  onPress={() =>
                    router.push({ pathname: '/student/[id]', params: { id: student!.id } } as never)
                  }
                  style={styles.starPill}>
                  <Avatar name={student!.name} size={22} />
                  <Text style={styles.starName} numberOfLines={1}>
                    {student!.name.split(' ').slice(-2).join(' ')}
                  </Text>
                  <Text style={styles.starCount}>{`×${count}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Kudos Composer */}
      {composerOpen ? (
        <FadeIn index={0}>
          <Card style={styles.composer}>
            <Text style={[styles.compTitle, { color: theme.text }]}>Tạo thiệp Kudos mới ✨</Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Gửi tới bạn</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {students.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={(recipientId || students[0]?.id) === s.id}
                  onPress={() => setRecipientId(s.id)}
                />
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Chọn huy hiệu khen tặng</Text>
            <View style={styles.stickerGrid}>
              {KUDOS_STICKER_LIST.map((key) => {
                const meta = KUDOS_STICKERS[key];
                const active = sticker === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSticker(key)}
                    style={({ pressed }) => [
                      styles.stickerTile,
                      {
                        backgroundColor: active ? theme[meta.soft] : theme.backgroundElement,
                        borderColor: active ? theme[meta.color] : 'transparent',
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={styles.stickerEmoji}>{meta.emoji}</Text>
                    <Text
                      style={[
                        styles.stickerLabel,
                        { color: active ? theme[meta.color] : theme.textSecondary },
                      ]}
                      numberOfLines={1}>
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextField
              label={'Lời nhắn gửi'}
              placeholder={'Ví dụ: Cảm ơn bạn đã giảng lại bài Toán hôm nay siêu dễ hiểu!'}
              value={message}
              onChangeText={setMessage}
              multiline
              style={styles.textarea}
            />

            <Pressable
              onPress={() => setAnonymous((v) => !v)}
              style={[styles.anonRow, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons
                name={anonymous ? 'glasses' : 'person-circle'}
                size={20}
                color={anonymous ? theme.purple : theme.accent}
              />
              <Text style={[styles.anonText, { color: theme.text }]}>
                {anonymous ? 'Gửi ẩn danh (Bạn giấu tên)' : 'Hiện tên người gửi'}
              </Text>
              <Ionicons
                name={anonymous ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={anonymous ? theme.purple : theme.textMuted}
              />
            </Pressable>

            <Button
              label={sending ? 'Đang gửi...' : 'Đăng lên Bức tường Kudos'}
              icon={'sparkles'}
              disabled={sending}
              onPress={handleSend}
            />
          </Card>
        </FadeIn>
      ) : null}

      {/* Filter Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={`Tất cả (${kudos.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        {currentStudentId ? (
          <Chip
            label={'Dành cho tôi'}
            icon={'heart-outline'}
            selected={filter === 'mine'}
            onPress={() => setFilter('mine')}
          />
        ) : null}
        {KUDOS_STICKER_LIST.map((key) => (
          <Chip
            key={key}
            label={`${KUDOS_STICKERS[key].emoji} ${KUDOS_STICKERS[key].label}`}
            selected={filter === key}
            onPress={() => setFilter(key)}
          />
        ))}
      </ScrollView>

      {/* Kudos Feed */}
      {visible.length === 0 ? (
        <EmptyState
          icon={'heart-outline'}
          title={'Chưa có lời khen nào ở mục này'}
          message={'Hãy bấm "Gửi khen" để mang lại niềm vui bất ngờ cho một người bạn lớp 10T4!'}
        />
      ) : (
        visible.map((item, idx) => {
          const recipient = getStudent(item.toStudentId);
          const meta = KUDOS_STICKERS[item.sticker] ?? KUDOS_STICKERS.positive_vibes;
          const clapped = Boolean(clappedIds[item.id]);

          return (
            <FadeIn key={item.id} index={Math.min(idx + 1, 8)}>
              <Card
                style={[
                  styles.kudosCard,
                  { borderLeftWidth: 4, borderLeftColor: theme[meta.color] },
                ]}>
                <View style={styles.kudosHead}>
                  <Pressable
                    onPress={() => {
                      if (recipient) {
                        router.push({ pathname: '/student/[id]', params: { id: recipient.id } } as never);
                      }
                    }}
                    style={styles.recipientRow}>
                    <Avatar name={recipient?.name ?? '?'} size={42} ring />
                    <View style={styles.flex}>
                      <Text style={[styles.recipientName, { color: theme.text }]} numberOfLines={1}>
                        {recipient?.name ?? 'Thành viên lớp'}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                        {'Từ ' + (item.anonymous ? 'Bạn giấu tên' : item.fromName)}
                      </Text>
                    </View>
                  </Pressable>
                  <Badge
                    label={`${meta.emoji} ${meta.label}`}
                    color={meta.color}
                    soft={meta.soft}
                  />
                </View>

                <Text style={[styles.kudosMsg, { color: theme.text }]}>
                  {'“' + item.message + '”'}
                </Text>

                <View style={[styles.kudosFooter, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                  </Text>
                  <View style={styles.footerRight}>
                    <Pressable
                      onPress={() => handleClap(item.id)}
                      style={({ pressed }) => [
                        styles.clapBtn,
                        { backgroundColor: clapped ? theme.goldSoft : theme.backgroundElement },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={styles.clapEmoji}>👏</Text>
                      <Text
                        style={[
                          styles.clapCount,
                          { color: clapped ? theme.gold : theme.textSecondary },
                        ]}>
                        {item.claps}
                      </Text>
                    </Pressable>
                    {canEditClass ? (
                      <Pressable
                        onPress={() => {
                          removeKudos(item.id);
                          showToast('Đã xoá lời khen', 'warning');
                        }}
                        hitSlop={8}>
                        <Ionicons name="trash-outline" size={15} color={theme.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroEyebrow: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 17, marginTop: 2 },
  sparkOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  starPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  starName: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', maxWidth: 110 },
  starCount: { color: '#FDE68A', fontSize: 11, fontWeight: '900' },
  composer: { gap: Spacing.two + 2 },
  compTitle: { fontSize: 16, fontWeight: '900' },
  fieldLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stickerTile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  stickerEmoji: { fontSize: 16 },
  stickerLabel: { fontSize: 12, fontWeight: '800', flex: 1 },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  anonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  anonText: { flex: 1, fontSize: 13, fontWeight: '700' },
  kudosCard: { gap: Spacing.two + 2 },
  kudosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  recipientRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, flex: 1, minWidth: 150 },
  recipientName: { fontSize: 15, fontWeight: '800' },
  kudosMsg: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  kudosFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  clapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  clapEmoji: { fontSize: 14 },
  clapCount: { fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
