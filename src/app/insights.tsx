/**
 * Smart Class Intelligence & Interactive Vietnamese Copilot Screen.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { formatPoints } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { formatVnd, shareOrCopyText } from '@/lib/export';
import {
  COPILOT_QUICK_PROMPTS,
  answerClassQuery,
  computeClassHealth,
  getLivePeriodStatus,
  type CopilotReply,
  type SmartAlert,
} from '@/lib/intelligence';
import {
  buildWeeklyZaloReport,
  type WeeklyZaloPreset,
} from '@/lib/weekly-zalo-report';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type ChatMessage = {
  id: string;
  question: string;
  reply: CopilotReply;
};

const SEVERITY_STYLE: Record<
  SmartAlert['severity'],
  { color: ThemeColor; soft: ThemeColor; label: string }
> = {
  urgent: { color: 'danger', soft: 'dangerSoft', label: 'Ưu tiên cao' },
  warning: { color: 'warning', soft: 'warningSoft', label: 'Cần chú ý' },
  opportunity: { color: 'accent', soft: 'accentSoft', label: 'Gợi ý hay' },
  celebrate: { color: 'success', soft: 'successSoft', label: 'Nổi bật' },
};

export default function InsightsScreen() {
  const store = useClassStore();
  const decor = useDecor();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [zaloPreset, setZaloPreset] = useState<WeeklyZaloPreset>('parents');
  const [zaloPreviewOpen, setZaloPreviewOpen] = useState(false);

  const health = useMemo(() => computeClassHealth(store), [store]);
  const livePeriod = useMemo(() => getLivePeriodStatus(store.schedule), [store.schedule]);
  const studyReport = store.getStudyParticipationReport();
  const zaloReport = useMemo(
    () =>
      buildWeeklyZaloReport({
        classInfo: store.classInfo,
        students: store.students,
        entries: store.entries,
        attendance: store.attendance,
        dutyLogs: store.dutyLogs,
        fundTransactions: store.fundTransactions,
        fundPaid: store.fundPaid,
        tasks: store.tasks,
        preset: zaloPreset,
      }),
    [
      store.classInfo,
      store.students,
      store.entries,
      store.attendance,
      store.dutyLogs,
      store.fundTransactions,
      store.fundPaid,
      store.tasks,
      zaloPreset,
    ],
  );

  const handleCopyZaloReport = async () => {
    const res = await shareOrCopyText(zaloReport.text, zaloReport.title);
    showToast(
      res === 'copied'
        ? `Đã sao chép ${zaloPreset === 'parents' ? 'Bản tin Phụ huynh' : 'Bản tin Lớp 10T4'} để dán lên Zalo!`
        : res === 'shared'
          ? 'Đã mở hộp thoại chia sẻ bản tin Zalo!'
          : 'Không thể sao chép bản tin lúc này',
      res === 'failed' ? 'danger' : 'success',
    );
  };

  const handleShareZaloReport = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: zaloReport.title, text: zaloReport.text });
        showToast('Đã mở chia sẻ bản tin tổng kết tuần!', 'success');
        return;
      } catch {
        // User dismissed or Web Share unavailable; fall back to copy.
      }
    } else if (Platform.OS !== 'web') {
      try {
        await Share.share({ title: zaloReport.title, message: zaloReport.text });
        showToast('Đã mở hộp thoại chia sẻ Zalo!', 'success');
        return;
      } catch {
        // Fall through to copy fallback.
      }
    }
    await handleCopyZaloReport();
  };
  const academicAchCount = useMemo(
    () =>
      store.entries.filter(
        (e) => e.status === 'approved' && e.kind === 'achievement' && e.category === 'academic',
      ).length,
    [store.entries],
  );

  const ask = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    const reply = answerClassQuery(clean, store);
    setHistory((prev) => [{ id: `${Date.now()}`, question: clean, reply }, ...prev.slice(0, 7)]);
    setQuestion('');
  };

  const copyReply = async (reply: CopilotReply) => {
    const text = [
      `✨ ${reply.title}${reply.badge ? ` (${reply.badge})` : ''}`,
      reply.summary,
      ...reply.bullets.map((b) => `• ${b}`),
    ].join('\n');
    const res = await shareOrCopyText(text, reply.title);
    showToast(res === 'copied' ? 'Đã sao chép kết quả phân tích!' : 'Đã mở hộp thoại chia sẻ!');
  };

  return (
    <Screen withTabBar={false} onRefresh={store.pullNow}>
      <PageHeader
        title={'Trợ lý Thông minh'}
        subtitle={`Phân tích thời gian thực lớp ${store.classInfo.name}`}
        rightIcon={'compass'}
        rightLabel={'Tour 7 bước'}
        onRightPress={() => decor.startTour()}
      />

      {/* Executive Health Score Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={styles.bubbleA} />
          <View style={styles.bubbleB} />
          <View style={styles.heroTop}>
            <View style={styles.heroTexts}>
              <View style={styles.glassPill}>
                <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                <Text style={styles.glassText}>CHỈ SỐ SỨC KHOẺ LỚP · HẠNG {health.grade}</Text>
              </View>
              <Text style={styles.heroTitle}>{health.score + ' / 100 điểm'}</Text>
              <Text style={styles.heroSub}>{health.headline}</Text>
            </View>
            <ProgressRing
              progress={health.score / 100}
              size={92}
              color={'#FFFFFF'}
              trackColor={'rgba(255,255,255,0.24)'}
              label={health.grade}
              caption={`${health.score}%`}
              textColor={'#FFFFFF'}
              captionColor={'rgba(255,255,255,0.86)'}
            />
          </View>

          {/* Live Period Strip inside Hero */}
          <Pressable
            onPress={() => router.push('/schedule' as never)}
            style={styles.liveStrip}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: livePeriod.state === 'live' ? '#34D399' : '#FBBF24' },
              ]}
            />
            <View style={styles.flex}>
              <Text style={styles.liveLabel}>{livePeriod.badge}</Text>
              <Text style={styles.liveTitle} numberOfLines={1}>
                {livePeriod.title}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </LinearGradient>
      </FadeIn>

      {/* 4 Health Pillars */}
      <FadeIn index={1} style={styles.pillarGrid}>
        {health.pillars.map((p) => (
          <Card key={p.id} style={styles.pillarCard}>
            <View style={styles.pillarHead}>
              <View style={[styles.pillarIcon, { backgroundColor: theme[p.soft] }]}>
                <Ionicons name={p.icon} size={17} color={theme[p.color]} />
              </View>
              <Text style={[styles.pillarScore, { color: theme[p.color] }]}>{p.score}%</Text>
            </View>
            <Text style={[styles.pillarLabel, { color: theme.text }]}>{p.label}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
              {p.metric}
            </Text>
            <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: theme[p.color],
                    width: `${Math.max(6, p.score)}%` as `${number}%`,
                  },
                ]}
              />
            </View>
          </Card>
        ))}
      </FadeIn>

      {/* Study Participation (Weekly + HK I) & Academic Achievements Spotlight */}
      <FadeIn index={2}>
        <Card
          style={[styles.copilotCard, { borderColor: `${theme.success}55`, borderWidth: 1.2 }]}
          onPress={() => router.push('/study' as never)}>
          <View style={styles.alertHead}>
            <View style={[styles.alertIcon, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="book" size={19} color={theme.success} />
            </View>
            <View style={styles.flex}>
              <Badge
                label={`HỌC TẬP · ${studyReport.semester1.label.toUpperCase()}`}
                color={'success'}
                soft={'successSoft'}
                icon={'book-outline'}
              />
              <Text style={[styles.alertTitle, { color: theme.text }]}>
                Stamp phát biểu theo Môn & Thành tích Học thuật
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                {`Tuần này: ${studyReport.weekly.totalSpeeches} stamps (+${formatPoints(studyReport.weekly.totalPoints)}đ) · Cộng dồn HK I: ${studyReport.semester1.totalSpeeches} stamps (+${formatPoints(studyReport.semester1.totalPoints)}đ) · 0,25đ/stamp · 🎓 ${academicAchCount} thành tích Học thuật`}
              </Text>
            </View>
          </View>
          <View style={styles.replyActions}>
            <Button
              label={'Ghi phát biểu'}
              size={'sm'}
              icon={'hand-left-outline'}
              style={styles.flex}
              onPress={() =>
                router.push({ pathname: '/study', params: { tab: 'record' } } as never)
              }
            />
            <Button
              label={'Thống kê HK I →'}
              size={'sm'}
              variant={'soft'}
              icon={'bar-chart-outline'}
              style={styles.flex}
              onPress={() =>
                router.push({ pathname: '/study', params: { tab: 'semester1' } } as never)
              }
            />
          </View>
        </Card>
      </FadeIn>

      {/* 1-Tap Weekly Zalo Class Summary Card */}
      <FadeIn index={2}>
        <Card style={[styles.copilotCard, { borderColor: `${theme.accent}44`, borderWidth: 1.2 }]}>
          <Pressable
            onPress={() => setZaloPreviewOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mở hoặc thu gọn bản tin tổng kết tuần Zalo"
            style={styles.alertHead}>
            <View style={[styles.alertIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="chatbubble-ellipses" size={19} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Badge
                label={`ZALO 1-CHẠM · ${zaloReport.weekLabel.toUpperCase()}`}
                color={'accentText'}
                soft={'accentSoft'}
                icon={'paper-plane-outline'}
              />
              <Text style={[styles.alertTitle, { color: theme.text }]}>
                Bản tin Tổng kết Tuần (Zalo 1-chạm)
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                {`${zaloReport.metrics.weeklySpeeches} stamps tuần (+${formatPoints(zaloReport.metrics.weeklyStudyPoints)}đ) · ${zaloReport.metrics.attendanceRate !== null ? `Chuyên cần ${zaloReport.metrics.attendanceRate}%` : 'Chuyên cần ổn định'} · Quỹ ${formatVnd(zaloReport.metrics.fundBalance)} · ${zaloReport.metrics.upcomingTasksCount} deadline 7 ngày tới`}
              </Text>
            </View>
            <Ionicons
              name={zaloPreviewOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textMuted}
            />
          </Pressable>

          {/* 2 Preset Selector Pills */}
          <View style={styles.zaloPresetRow}>
            {(
              [
                { key: 'parents', label: 'Bản tin Phụ huynh (Zalo)', icon: 'people-outline' },
                { key: 'class', label: 'Bản tin Lớp 10T4', icon: 'flame-outline' },
              ] as const
            ).map((opt) => {
              const active = zaloPreset === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setZaloPreset(opt.key)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  style={({ pressed }) => [
                    styles.zaloPresetBtn,
                    {
                      backgroundColor: active ? theme.accent : theme.backgroundElement,
                      borderColor: active ? theme.accent : theme.border,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={opt.icon}
                    size={14}
                    color={active ? theme.accentOnFill : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.zaloPresetText,
                      { color: active ? theme.accentOnFill : theme.textSecondary },
                    ]}
                    numberOfLines={1}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {zaloPreviewOpen ? (
            <View
              style={[
                styles.zaloPreviewBox,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Text selectable style={[styles.zaloPreviewText, { color: theme.text }]}>
                {zaloReport.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.replyActions}>
            <Button
              label={'Copy Zalo'}
              size={'sm'}
              icon={'copy-outline'}
              style={styles.flex}
              onPress={() => void handleCopyZaloReport()}
            />
            <Button
              label={'Chia sẻ'}
              size={'sm'}
              variant={'soft'}
              icon={'share-social-outline'}
              style={styles.flex}
              onPress={() => void handleShareZaloReport()}
            />
            <Button
              label={zaloPreviewOpen ? 'Ẩn xem' : 'Xem trước'}
              size={'sm'}
              variant={'soft'}
              icon={zaloPreviewOpen ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setZaloPreviewOpen((v) => !v)}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Interactive Copilot Q&A */}
      <FadeIn index={2}>
        <SectionHeader
          title={'Hỏi đáp nhanh 10T4 Copilot'}
          subtitle={'Nhập câu hỏi hoặc tên học sinh bất kỳ — trả lời tức thì'}
        />
      </FadeIn>

      <FadeIn index={3}>
        <Card style={styles.copilotCard}>
          <Pressable
            onPress={() => decor.openAssistant('chat')}
            style={[styles.mascotBanner, { backgroundColor: theme.backgroundElement }]}>
            <MascotAvatar mascotId={decor.mascotId} size={42} mood="happy" />
            <View style={styles.flex}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>
                Mở Trợ lý Linh vật & Hướng dẫn viên toàn App
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                Hỏi dữ liệu lớp, soạn tin Zalo hoặc ra lệnh đổi giao diện tức thì ✨
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.accent} />
          </Pressable>

          <View style={styles.askRow}>
            <View style={styles.flex}>
              <TextField
                icon={'sparkles'}
                clearable
                placeholder={'VD: Hôm nay học gì? Quỹ lớp? Tên học sinh...'}
                value={question}
                onChangeText={setQuestion}
                returnKeyType="send"
                onSubmitEditing={() => ask(question)}
              />
            </View>
            <Pressable
              onPress={() => ask(question)}
              style={({ pressed }) => [
                styles.sendBtn,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.prompts}>
            {COPILOT_QUICK_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                onPress={() => ask(prompt)}
                style={({ pressed }) => [
                  styles.promptChip,
                  { backgroundColor: theme.accentSoft, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="flash" size={12} color={theme.accentText} />
                <Text style={[styles.promptText, { color: theme.accentText }]}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {history.map((msg) => (
            <View
              key={msg.id}
              style={[styles.replyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Text style={[styles.askedText, { color: theme.textMuted }]}>
                {'Bạn hỏi: “' + msg.question + '”'}
              </Text>
              <View style={styles.replyHead}>
                <Text style={[styles.replyTitle, { color: theme.text }]}>{msg.reply.title}</Text>
                {msg.reply.badge ? (
                  <Badge label={msg.reply.badge} color={'accentText'} soft={'accentSoft'} />
                ) : null}
              </View>
              <Text style={[styles.replySummary, { color: theme.textSecondary }]}>
                {msg.reply.summary}
              </Text>
              <View style={styles.bulletList}>
                {msg.reply.bullets.map((b, idx) => (
                  <View key={idx} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: theme.accent }]} />
                    <Text style={[styles.bulletText, { color: theme.text }]}>{b}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.replyActions}>
                {msg.reply.actionRoute && msg.reply.actionLabel ? (
                  <Button
                    label={msg.reply.actionLabel}
                    size={'sm'}
                    icon={'arrow-forward'}
                    style={styles.flex}
                    onPress={() => router.push(msg.reply.actionRoute as never)}
                  />
                ) : null}
                <Button
                  label={'Sao chép'}
                  size={'sm'}
                  variant={'soft'}
                  icon={'copy-outline'}
                  onPress={() => copyReply(msg.reply)}
                />
              </View>
            </View>
          ))}
        </Card>
      </FadeIn>

      {/* Proactive Smart Alerts */}
      <FadeIn index={4}>
        <SectionHeader
          title={'Đề xuất & Cảnh báo thông minh'}
          subtitle={`${health.alerts.length} tín hiệu ưu tiên được hệ thống phát hiện`}
        />
      </FadeIn>

      {health.alerts.map((alert, i) => {
        const sev = SEVERITY_STYLE[alert.severity];
        return (
          <FadeIn key={alert.id} index={Math.min(i + 5, 10)}>
            <Card
              style={[styles.alertCard, { borderLeftWidth: 4, borderLeftColor: theme[sev.color] }]}
              onPress={() => router.push(alert.route as never)}>
              <View style={styles.alertHead}>
                <View style={[styles.alertIcon, { backgroundColor: theme[sev.soft] }]}>
                  <Ionicons name={alert.icon} size={18} color={theme[sev.color]} />
                </View>
                <View style={styles.flex}>
                  <Badge label={sev.label} color={sev.color} soft={sev.soft} />
                  <Text style={[styles.alertTitle, { color: theme.text }]}>{alert.title}</Text>
                </View>
              </View>
              <Text style={[styles.alertDetail, { color: theme.textSecondary }]}>
                {alert.detail}
              </Text>
              <View style={styles.alertFooter}>
                <Text style={[styles.alertCta, { color: theme[sev.color] }]}>
                  {alert.actionLabel + ' →'}
                </Text>
              </View>
            </Card>
          </FadeIn>
        );
      })}
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
  bubbleA: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -90,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  bubbleB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -60,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroTexts: { flex: 1, gap: 6 },
  glassPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  glassText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  heroTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 18 },
  liveStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  liveDot: { width: 9, height: 9, borderRadius: 4.5 },
  liveLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  liveTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pillarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two + 2 },
  pillarCard: { width: '48%', flexGrow: 1, minWidth: 150, gap: 6 },
  pillarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pillarIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  pillarScore: { fontSize: 18, fontWeight: '900' },
  pillarLabel: { fontSize: 14, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  fill: { height: 6, borderRadius: 3 },
  copilotCard: { gap: Spacing.three },
  mascotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompts: { gap: Spacing.two, paddingRight: Spacing.two },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  promptText: { fontSize: 12, fontWeight: '800' },
  replyCard: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  askedText: { fontSize: 11, fontWeight: '700', fontStyle: 'italic' },
  replyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  replyTitle: { fontSize: 15, fontWeight: '900', flex: 1 },
  replySummary: { fontSize: 13, lineHeight: 19 },
  bulletList: { gap: 5 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  replyActions: { flexDirection: 'row', gap: Spacing.two, marginTop: 4 },
  alertCard: { gap: Spacing.two },
  alertHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  alertIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  alertDetail: { fontSize: 13, lineHeight: 19 },
  alertFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
  alertCta: { fontSize: 12, fontWeight: '800' },
  zaloPresetRow: { flexDirection: 'row', gap: Spacing.two },
  zaloPresetBtn: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  zaloPresetText: { fontSize: 12, fontWeight: '800' },
  zaloPreviewBox: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  zaloPreviewText: { fontSize: 12.5, lineHeight: 19 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
});
