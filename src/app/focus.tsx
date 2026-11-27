/**
 * Classroom Countdown & Student Pomodoro Focus Studio (/focus).
 *
 * Dual-purpose timer:
 * - Teachers can project 5'/15' countdowns for quizzes & group discussions
 * - Students can run 25'/45' deep-focus Pomodoro study sessions with daily goal tracking
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { Fonts, Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { getLivePeriodStatus } from '@/lib/intelligence';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

const FOCUS_STORAGE_PREFIX = 'class10t4:focus-stats:v2:';

type FocusPreset = {
  id: string;
  label: string;
  subtitle: string;
  minutes: number;
  icon: keyof typeof Ionicons.glyphMap;
};

const PRESETS: FocusPreset[] = [
  { id: 'quick1', label: 'Khởi động 1p', subtitle: 'Tập trung nhanh & làm nóng não', minutes: 1, icon: 'flash' },
  { id: 'group5', label: 'Thảo luận 5p', subtitle: 'Hoạt động nhóm trên lớp', minutes: 5, icon: 'people' },
  { id: 'quiz15', label: 'Kiểm tra 15p', subtitle: 'Đồng hồ làm bài trên bảng', minutes: 15, icon: 'document-text' },
  { id: 'pomo25', label: 'Pomodoro 25p', subtitle: 'Tập trung sâu chuẩn quốc tế', minutes: 25, icon: 'flame' },
  { id: 'exam45', label: 'Ôn thi 45p', subtitle: 'Mô phỏng trọn vẹn 1 tiết học', minutes: 45, icon: 'school' },
  { id: 'break5', label: 'Nghỉ giải lao', subtitle: 'Thư giãn mắt & uống nước', minutes: 5, icon: 'cafe' },
];

const QUOTES = [
  'Kỷ luật tạo nên tự do — 25 phút tập trung trọn vẹn hơn 3 tiếng xao nhãng.',
  'K8T4 Mãi Đĩnh · Mỗi phiên học tập trung là một bước gần hơn tới mục tiêu!',
  'Đừng đợi có cảm hứng mới học — hãy bấm Bắt đầu và cảm hứng sẽ tự tới.',
  'Tập trung vào một việc duy nhất trong 25 phút tới. Bạn làm được!',
];

type FocusStats = {
  date: string;
  sessions: number;
  minutes: number;
};

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function FocusScreen() {
  const { accountScopeKey } = useAuth();
  const { classInfo, schedule } = useClassStore();
  const { recordMissionProgress } = useDecor();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const focusKey = `${FOCUS_STORAGE_PREFIX}${accountScopeKey}`;
  const [preset, setPreset] = useState<FocusPreset>(PRESETS[3]);
  const [totalSec, setTotalSec] = useState(PRESETS[3].minutes * 60);
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[3].minutes * 60);
  const [running, setRunning] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [stats, setStats] = useState<FocusStats>({ date: todayIso(), sessions: 0, minutes: 0 });

  const livePeriod = useMemo(() => getLivePeriodStatus(schedule), [schedule]);

  // Load daily focus stats scoped to the signed-in user
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(focusKey)
      .then((raw) => {
        if (!active) return;
        const parsed = raw ? (JSON.parse(raw) as Partial<FocusStats> | null) : null;
        if (parsed && parsed.date === todayIso()) {
          setStats({
            date: parsed.date,
            sessions: Number(parsed.sessions ?? 0),
            minutes: Number(parsed.minutes ?? 0),
          });
        } else {
          setStats({ date: todayIso(), sessions: 0, minutes: 0 });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [focusKey]);

  // Countdown tick
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRunning(false);
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          const completedMin = Math.max(1, Math.round(totalSec / 60));
          setStats((s) => {
            const next: FocusStats = {
              date: todayIso(),
              sessions: s.sessions + 1,
              minutes: s.minutes + completedMin,
            };
            AsyncStorage.setItem(focusKey, JSON.stringify(next)).catch(() => {});
            return next;
          });
          recordMissionProgress('focus_session', 1);
          showToast(`Hoàn thành phiên ${preset.label}! Hoàn thành nhiệm vụ Tập trung 🎉`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, totalSec, preset.label, showToast, recordMissionProgress, focusKey]);

  const selectPreset = (item: FocusPreset) => {
    setRunning(false);
    setPreset(item);
    setTotalSec(item.minutes * 60);
    setSecondsLeft(item.minutes * 60);
    setQuoteIdx((idx) => (idx + 1) % QUOTES.length);
  };

  const reset = () => {
    setRunning(false);
    setSecondsLeft(totalSec);
  };

  const addMinute = () => {
    setTotalSec((t) => t + 60);
    setSecondsLeft((s) => s + 60);
  };

  const progress = totalSec === 0 ? 0 : (totalSec - secondsLeft) / totalSec;
  const ringSize = 236;
  const stroke = 13;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const dailyGoalMin = 90;
  const dailyPct = Math.min(100, Math.round((stats.minutes / dailyGoalMin) * 100));

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Phòng Tập trung'}
        subtitle={`Pomodoro & Đồng hồ lớp học ${classInfo.name}`}
      />

      {/* Live Class Period Strip */}
      <FadeIn index={0}>
        <Card style={styles.periodCard} onPress={() => router.push('/schedule' as never)}>
          <View
            style={[
              styles.periodDot,
              { backgroundColor: livePeriod.state === 'live' ? theme.success : theme.accent },
            ]}
          />
          <View style={styles.flex}>
            <Text style={[styles.periodBadge, { color: theme.accentText }]}>{livePeriod.badge}</Text>
            <Text style={[styles.periodTitle, { color: theme.text }]} numberOfLines={1}>
              {livePeriod.title}
            </Text>
          </View>
          <Badge label={'TKB →'} color={'accentText'} soft={'accentSoft'} />
        </Card>
      </FadeIn>

      {/* Preset Selector */}
      <FadeIn index={1}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {PRESETS.map((item) => {
            const active = preset.id === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => selectPreset(item)}
                style={({ pressed }) => [
                  styles.presetChip,
                  {
                    backgroundColor: active ? theme.accent : theme.card,
                    borderColor: active ? theme.accent : theme.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={active ? '#FFFFFF' : theme.textSecondary}
                />
                <Text style={[styles.presetText, { color: active ? '#FFFFFF' : theme.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </FadeIn>

      {/* Main Countdown Dial */}
      <FadeIn index={2}>
        <Card style={styles.dialCard}>
          <Badge
            label={running ? 'Đang tập trung...' : secondsLeft === 0 ? 'Đã hoàn thành 🎉' : preset.subtitle}
            color={running ? 'success' : 'accentText'}
            soft={running ? 'successSoft' : 'accentSoft'}
            icon={running ? 'radio-button-on' : preset.icon}
          />

          <View style={styles.ringWrap}>
            <Svg width={ringSize} height={ringSize}>
              <Defs>
                <SvgGradient id="focusRingGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor={gradient[0]} />
                  <Stop offset="100%" stopColor={gradient[1]} />
                </SvgGradient>
              </Defs>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={theme.backgroundElement}
                strokeWidth={stroke}
                fill="none"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="url(#focusRingGrad)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                fill="none"
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={[styles.clockDigits, { color: theme.text }]}>
                {formatClock(secondsLeft)}
              </Text>
              <Text style={[styles.clockLabel, { color: theme.textMuted }]}>{preset.label}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.secBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="refresh" size={20} color={theme.textSecondary} />
            </Pressable>

            <Button
              label={running ? 'Tạm dừng' : secondsLeft === 0 ? 'Bắt đầu lại' : 'Bắt đầu tập trung'}
              icon={running ? 'pause' : 'play'}
              style={styles.flex}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                if (secondsLeft === 0) setSecondsLeft(totalSec);
                setRunning((v) => !v);
              }}
            />

            <Pressable
              onPress={addMinute}
              style={({ pressed }) => [
                styles.secBtn,
                { backgroundColor: theme.accentSoft },
                pressed && styles.pressed,
              ]}>
              <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '900' }}>+1p</Text>
            </Pressable>
          </View>
        </Card>
      </FadeIn>

      {/* Daily Progress */}
      <FadeIn index={3}>
        <Card style={styles.statsCard}>
          <View style={styles.statsTop}>
            <View style={styles.flex}>
              <Text style={[styles.statsTitle, { color: theme.text }]}>Mục tiêu tập trung hôm nay</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {`${stats.sessions} phiên xong · ${stats.minutes} / ${dailyGoalMin} phút (${dailyPct}%)`}
              </Text>
            </View>
            <Badge label={`🔥 ${stats.minutes}p`} color={'warning'} soft={'warningSoft'} />
          </View>
          <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fill, { width: `${Math.max(4, dailyPct)}%` as `${number}%` }]}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Motivation Quote */}
      <FadeIn index={4}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.quoteCard, Shadow.card]}>
          <Ionicons name="sparkles" size={18} color="rgba(255,255,255,0.85)" />
          <Text style={styles.quoteText}>{`“${QUOTES[quoteIdx]}”`}</Text>
        </LinearGradient>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  periodCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  periodDot: { width: 10, height: 10, borderRadius: 5 },
  periodBadge: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  periodTitle: { fontSize: 14, fontWeight: '800' },
  presetRow: { gap: Spacing.two, paddingRight: Spacing.two },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  presetText: { fontSize: 13, fontWeight: '800' },
  dialCard: { alignItems: 'center', gap: Spacing.four, paddingVertical: Spacing.four },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  clockDigits: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1,
    fontFamily: Fonts?.mono,
    fontVariant: ['tabular-nums'],
  },
  clockLabel: { fontSize: 13, fontWeight: '700' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, width: '100%' },
  secBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: { gap: Spacing.two + 2 },
  statsTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  statsTitle: { fontSize: 15, fontWeight: '800' },
  track: { height: 9, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 9, borderRadius: 5 },
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  quoteText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 20, fontStyle: 'italic' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
