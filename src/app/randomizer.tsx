import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import type { Student } from '@/types/models';

type Mode = 'pick' | 'teams';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function RandomizerScreen() {
  const { students, role, quickReward } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [mode, setMode] = useState<Mode>('pick');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [noRepeat, setNoRepeat] = useState(true);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [displayStudent, setDisplayStudent] = useState<Student | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);

  // Team splitter state
  const [teamCount, setTeamCount] = useState(4);
  const [teams, setTeams] = useState<Student[][]>([]);

  const scale = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pool = useMemo(() => {
    return students.filter((s) => {
      const matchGroup = groupFilter === 'all' || (s.group?.trim() ?? '') === groupFilter;
      const matchRepeat = !noRepeat || !pickedIds.includes(s.id);
      return matchGroup && matchRepeat;
    });
  }, [students, groupFilter, noRepeat, pickedIds]);

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const s of students) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [students]);

  const spin = () => {
    if (spinning) return;
    if (pool.length === 0) {
      showToast('Đã gọi hết danh sách! Hãy bấm "Làm mới vòng gọi"', 'info');
      return;
    }

    setSpinning(true);
    setWinner(null);

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const totalTicks = pool.length === 1 ? 6 : 18;
    let tick = 0;

    const step = () => {
      tick += 1;
      if (tick >= totalTicks) {
        setDisplayStudent(chosen);
        setWinner(chosen);
        setSpinning(false);
        if (noRepeat) setPickedIds((prev) => [chosen.id, ...prev]);
        scale.value = withSequence(withSpring(1.06), withSpring(1));
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        return;
      }

      const randomPeek = pool[Math.floor(Math.random() * pool.length)];
      setDisplayStudent(randomPeek);
      if (Platform.OS !== 'web' && tick % 2 === 0) {
        Haptics.selectionAsync().catch(() => {});
      }
      const delay = 55 + tick * 14;
      timerRef.current = setTimeout(step, delay);
    };

    step();
  };

  const handleRewardWinner = () => {
    if (!winner) return;
    quickReward(winner.id, 'Phát biểu xây dựng bài (Gọi tên ngẫu nhiên)', 1, 'study', 'activity', 'class');
    showToast(`Đã cộng +1 điểm phát biểu cho ${winner.name}!`);
  };

  const generateTeams = () => {
    if (students.length === 0) return;
    const shuffled = shuffle(students);
    const count = Math.min(teamCount, Math.max(1, shuffled.length));
    const buckets: Student[][] = Array.from({ length: count }, () => []);
    shuffled.forEach((student, idx) => {
      buckets[idx % count].push(student);
    });
    setTeams(buckets);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    showToast(`Đã chia ${students.length} học sinh thành ${count} nhóm!`);
  };

  const copyTeams = async () => {
    if (teams.length === 0) return;
    const text = teams
      .map(
        (members, i) =>
          `Nhóm ${i + 1} (${members.length} bạn):\n` +
          members.map((m, j) => `  ${j + 1}. ${m.name}`).join('\n'),
      )
      .join('\n\n');
    const res = await shareOrCopyText(text, 'Danh sách chia nhóm');
    showToast(res === 'copied' ? 'Đã sao chép danh sách nhóm!' : 'Đã mở chia sẻ danh sách nhóm!');
  };

  const shown = displayStudent ?? winner;

  return (
    <Screen withTabBar={false}>
      <PageHeader title={'Gọi tên & Chia nhóm'} subtitle={'Công cụ tương tác sinh động trên lớp'} />

      {/* Mode Switcher */}
      <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {(
          [
            { key: 'pick', label: 'Quay gọi tên', icon: 'dice' },
            { key: 'teams', label: 'Chia nhóm', icon: 'git-network' },
          ] as const
        ).map((tab) => {
          const active = mode === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setMode(tab.key)}
              style={[
                styles.segBtn,
                active && { backgroundColor: theme.accentSoft },
              ]}>
              <Ionicons
                name={tab.icon}
                size={16}
                color={active ? theme.accentText : theme.textMuted}
              />
              <Text style={[styles.segText, { color: active ? theme.accentText : theme.textMuted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {students.length === 0 ? (
        <EmptyState
          icon={'people-outline'}
          title={'Chưa có học sinh nào'}
          message={'Hãy thêm học sinh vào lớp trước khi quay gọi tên hoặc chia nhóm.'}
        />
      ) : mode === 'pick' ? (
        <>
          {/* Filter by group */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {groups.map((g) => (
              <Chip
                key={g}
                label={g === 'all' ? 'Cả lớp' : g}
                selected={groupFilter === g}
                onPress={() => setGroupFilter(g)}
              />
            ))}
          </ScrollView>

          {/* Spotlight Stage */}
          <FadeIn index={0}>
            <Animated.View style={animStyle}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.stage, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
                <View style={styles.stageRingA} />
                <View style={styles.stageRingB} />
                <View style={styles.stageTopPill}>
                  <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                  <Text style={styles.stageTopText}>
                    {spinning
                      ? 'ĐANG CHỌN NGẪU NHIÊN...'
                      : winner
                        ? 'XIN MỜI BẠN!'
                        : `CÒN ${pool.length} HỌC SINH SẴN SÀNG`}
                  </Text>
                </View>

                {shown ? (
                  <>
                    <Avatar name={shown.name} size={88} ring />
                    <Text style={styles.winnerName}>{shown.name}</Text>
                    <Text style={styles.winnerSub}>
                      {[shown.code, shown.group, shown.position].filter(Boolean).join(' · ')}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.placeholderAvatar}>
                      <Ionicons name="help" size={44} color="#FFFFFF" />
                    </View>
                    <Text style={styles.winnerName}>Ai sẽ là người may mắn?</Text>
                    <Text style={styles.winnerSub}>Bấm nút bên dưới để bắt đầu vòng quay</Text>
                  </>
                )}
              </LinearGradient>
            </Animated.View>
          </FadeIn>

          {/* Controls */}
          <Button
            label={spinning ? 'Đang quay...' : 'Quay gọi tên ngay!'}
            icon={'shuffle'}
            disabled={spinning}
            onPress={spin}
          />

          {/* Quick Actions for Winner */}
          {winner && !spinning ? (
            <FadeIn index={1}>
              <Card style={styles.winnerActions}>
                <Text style={[styles.actionHint, { color: theme.textSecondary }]}>
                  Thao tác nhanh cho {winner.name}
                </Text>
                <View style={styles.actionRow}>
                  {role === 'teacher' ? (
                    <Button
                      label={'+1đ phát biểu'}
                      size={'sm'}
                      icon={'ribbon'}
                      style={styles.flex}
                      onPress={handleRewardWinner}
                    />
                  ) : null}
                  <Button
                    label={'Xem hồ sơ'}
                    size={'sm'}
                    variant={'soft'}
                    icon={'person-outline'}
                    style={styles.flex}
                    onPress={() =>
                      router.push({ pathname: '/student/[id]', params: { id: winner.id } } as never)
                    }
                  />
                </View>
              </Card>
            </FadeIn>
          ) : null}

          {/* Options & History */}
          <Card style={styles.optCard}>
            <Pressable
              onPress={() => setNoRepeat((v) => !v)}
              style={styles.optRow}>
              <View style={styles.flex}>
                <Text style={[styles.optTitle, { color: theme.text }]}>Không gọi lặp lại</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Mỗi bạn chỉ được gọi 1 lần cho đến khi làm mới vòng
                </Text>
              </View>
              <Ionicons
                name={noRepeat ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={noRepeat ? theme.accent : theme.textMuted}
              />
            </Pressable>

            {pickedIds.length > 0 ? (
              <View style={[styles.historyWrap, { borderColor: theme.border }]}>
                <View style={styles.historyHead}>
                  <Text style={[styles.optTitle, { color: theme.text }]}>
                    Đã gọi ({pickedIds.length})
                  </Text>
                  <Pressable onPress={() => { setPickedIds([]); showToast('Đã làm mới vòng gọi!', 'info'); }}>
                    <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
                      Làm mới
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.historyPills}>
                  {pickedIds.map((id) => {
                    const s = students.find((st) => st.id === id);
                    if (!s) return null;
                    return (
                      <Badge key={id} label={s.name} color={'accentText'} soft={'accentSoft'} />
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          {/* Team Splitter */}
          <Card style={styles.optCard}>
            <Text style={[styles.optTitle, { color: theme.text }]}>Số nhóm muốn chia</Text>
            <View style={styles.countRow}>
              {[2, 3, 4, 5, 6].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setTeamCount(n)}
                  style={[
                    styles.countBtn,
                    {
                      backgroundColor: teamCount === n ? theme.accent : theme.backgroundElement,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.countText,
                      { color: teamCount === n ? '#FFFFFF' : theme.text },
                    ]}>
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <Button
                label={'Chia nhóm ngẫu nhiên'}
                icon={'shuffle'}
                style={styles.flex}
                onPress={generateTeams}
              />
              {teams.length > 0 ? (
                <Button label={'Sao chép'} variant={'soft'} icon={'copy-outline'} onPress={copyTeams} />
              ) : null}
            </View>
          </Card>

          {teams.map((members, idx) => (
            <FadeIn key={idx} index={idx}>
              <Card style={styles.teamCard}>
                <View style={styles.teamHead}>
                  <Badge label={`Nhóm ${idx + 1}`} color={'accentText'} soft={'accentSoft'} />
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>
                    {members.length + ' thành viên'}
                  </Text>
                </View>
                <View style={styles.teamMembers}>
                  {members.map((m) => (
                    <View key={m.id} style={styles.memberRow}>
                      <Avatar name={m.name} size={32} />
                      <Text style={[styles.memberName, { color: theme.text }]}>{m.name}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>{m.group ?? ''}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeIn>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segment: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  segText: { fontSize: 13, fontWeight: '800' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  stage: {
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  stageRingA: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 24,
    borderColor: 'rgba(255,255,255,0.08)',
    top: -90,
    right: -80,
  },
  stageRingB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: -70,
    left: -50,
  },
  stageTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  stageTopText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  placeholderAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerName: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  winnerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  winnerActions: { gap: Spacing.two },
  actionHint: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: Spacing.two },
  optCard: { gap: Spacing.three },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  optTitle: { fontSize: 15, fontWeight: '800' },
  historyWrap: { gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  countRow: { flexDirection: 'row', gap: Spacing.two },
  countBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 16, fontWeight: '900' },
  teamCard: { gap: Spacing.two + 2 },
  teamHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamMembers: { gap: Spacing.two },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  memberName: { flex: 1, fontSize: 14, fontWeight: '700' },
});
