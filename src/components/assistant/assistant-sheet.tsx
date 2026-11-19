/**
 * 3-in-1 In-App Companion Drawer:
 *  1. Smart Vietnamese Chat Copilot (live class brain + real app-control commands + Zalo drafts)
 *  2. Interactive Tour Guide & Current-Screen Manual + Feature Atlas
 *  3. Quick Controls, Mascot Switcher & Discovery Quests
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AESTHETIC_COMBOS,
  MASCOTS,
  MASCOT_LIST,
  type MascotMood,
} from '@/constants/decor-meta';
import {
  DISCOVERY_QUESTS,
  FEATURE_ATLAS,
  getPageGuide,
} from '@/constants/guide-data';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useIsDark, useTheme, useThemePreference } from '@/hooks/use-theme';
import {
  answerAssistantMessage,
  type AssistantCommand,
  type AssistantResponse,
} from '@/lib/assistant-brain';
import { buildClassSummaryReport, shareOrCopyText } from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import { useDecor, type AssistantTabKey } from '@/store/decor-store';

type ChatEntry = {
  id: string;
  question: string;
  response: AssistantResponse;
};

type AssistantSheetProps = {
  visible: boolean;
  pathname: string;
  onClose: () => void;
};

const TABS: { key: AssistantTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'chat', label: 'Trợ lý Chat', icon: 'chatbubbles' },
  { key: 'guide', label: 'Hướng dẫn viên', icon: 'compass' },
  { key: 'actions', label: 'Nhanh & Quà', icon: 'flash' },
];

export function AssistantSheet({ visible, pathname, onClose }: AssistantSheetProps) {
  const store = useClassStore();
  const decor = useDecor();
  const theme = useTheme();
  const isDark = useIsDark();
  const { toggleDark, setMode, setAccentKey } = useThemePreference();
  const { showToast } = useToast();

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [mascotMood, setMascotMood] = useState<MascotMood>('waving');
  const [atlasSearch, setAtlasSearch] = useState('');
  const chatScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const mascot = MASCOTS[decor.mascotId] ?? MASCOTS.foxy;
  const pageGuide = useMemo(() => getPageGuide(pathname), [pathname]);

  const executeCommands = (commands?: AssistantCommand[]) => {
    if (!commands || commands.length === 0) return;
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'mode':
          setMode(cmd.mode);
          break;
        case 'accent':
          setAccentKey(cmd.accent);
          break;
        case 'effect':
          decor.setAmbientEffect(cmd.effect);
          break;
        case 'card-style':
          decor.setCardStyle(cmd.cardStyle);
          break;
        case 'combo': {
          const found = AESTHETIC_COMBOS.find((c) => c.id === cmd.comboId);
          if (found) decor.applyCombo(found);
          break;
        }
        case 'mascot':
          decor.setMascotId(cmd.mascotId);
          break;
        case 'start-tour':
          setTimeout(() => decor.startTour(), 320);
          break;
        case 'celebrate':
          decor.triggerCelebration();
          break;
      }
    }
  };

  const handleAsk = (raw: string) => {
    const clean = raw.trim();
    if (!clean || thinking) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});

    setInput('');
    setThinking(true);
    setMascotMood('thinking');
    decor.completeQuest('chat');

    setTimeout(() => {
      const response = answerAssistantMessage(clean, store, decor.mascotId);
      setChatLog((prev) => [
        ...prev.slice(-11),
        { id: `${Date.now()}`, question: clean, response },
      ]);
      setThinking(false);
      setMascotMood(response.mood);
      executeCommands(response.commands);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }, 240);
  };

  const handleCopy = async (text: string, title: string) => {
    const res = await shareOrCopyText(text, title);
    showToast(res === 'copied' ? 'Đã sao chép nội dung!' : 'Đã mở chia sẻ!');
  };

  const go = (route: string) => {
    onClose();
    router.push(route as never);
  };

  const filteredAtlas = useMemo(() => {
    const q = stripVietnamese(atlasSearch);
    if (!q) return FEATURE_ATLAS;
    return FEATURE_ATLAS.filter((item) =>
      stripVietnamese(`${item.title} ${item.desc} ${item.category}`).includes(q),
    );
  }, [atlasSearch]);

  const questDoneCount = decor.completedQuests.length;
  const questTotal = DISCOVERY_QUESTS.length;
  const questPct = Math.round((questDoneCount / questTotal) * 100);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(160)}
          style={[
            styles.backdrop,
            { backgroundColor: isDark ? 'rgba(4, 7, 15, 0.78)' : 'rgba(11, 18, 32, 0.48)' },
            Platform.OS === 'web' &&
              ({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as object),
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View
            entering={FadeInDown.springify().damping(20)}
            style={[
              styles.sheet,
              Shadow.floating,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            {/* Vibrant Mascot Header */}
            <LinearGradient
              colors={mascot.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}>
              <View style={styles.headerBubble} />
              <MascotAvatar mascotId={decor.mascotId} size={54} mood={mascotMood} />
              <View style={styles.headerTexts}>
                <View style={styles.headerNameRow}>
                  <Text style={styles.headerName}>{mascot.name}</Text>
                  <View style={styles.onlinePill}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Trực tuyến</Text>
                  </View>
                </View>
                <Text style={styles.headerRole} numberOfLines={1}>
                  {mascot.roleTitle} · {pageGuide.emoji} {pageGuide.title}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </LinearGradient>

            {/* 3-Tab Switcher */}
            <View style={[styles.tabBar, { backgroundColor: theme.backgroundElement }]}>
              {TABS.map((t) => {
                const active = decor.assistantTab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => decor.setAssistantTab(t.key)}
                    style={[
                      styles.tabBtn,
                      active && { backgroundColor: theme.card, ...Shadow.card },
                    ]}>
                    <Ionicons
                      name={t.icon}
                      size={15}
                      color={active ? theme.accent : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        { color: active ? theme.text : theme.textMuted },
                      ]}
                      numberOfLines={1}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* TAB 1: SMART CHAT */}
            {decor.assistantTab === 'chat' ? (
              <View style={styles.tabBody}>
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.scrollArea}
                  contentContainerStyle={styles.chatContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  {/* Welcome Mascot Bubble */}
                  <View
                    style={[
                      styles.botBubble,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <Text style={[styles.botTitle, { color: theme.text }]}>
                      {mascot.greetings[0]}
                    </Text>
                    <Text style={[styles.botSub, { color: theme.textSecondary }]}>
                      Bạn có thể hỏi bất cứ dữ liệu nào của lớp {store.classInfo.name}, nhờ soạn tin
                      nhắn Zalo, hỏi cách dùng tính năng, hoặc ra lệnh trang trí ngay tại đây (VD:
                      “Bật hoa anh đào”, “Bật tuyết rơi”, “Chế độ tối Neon”).
                    </Text>
                    <View style={styles.inlineBtns}>
                      <Pressable
                        onPress={() => decor.startTour()}
                        style={[styles.miniCta, { backgroundColor: theme.accentSoft }]}>
                        <Ionicons name="compass" size={14} color={theme.accentText} />
                        <Text style={[styles.miniCtaText, { color: theme.accentText }]}>
                          Tham quan App 7 bước
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => go('/studio')}
                        style={[styles.miniCta, { backgroundColor: theme.purpleSoft }]}>
                        <Ionicons name="color-wand" size={14} color={theme.purple} />
                        <Text style={[styles.miniCtaText, { color: theme.purple }]}>
                          Studio Trang trí
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Chat History */}
                  {chatLog.map((item) => (
                    <View key={item.id} style={styles.exchange}>
                      <View style={[styles.userBubble, { backgroundColor: theme.accent }]}>
                        <Text style={styles.userText}>{item.question}</Text>
                      </View>

                      <View
                        style={[
                          styles.botBubble,
                          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                        ]}>
                        <View style={styles.replyHead}>
                          <Text style={[styles.botTitle, { color: theme.text, flex: 1 }]}>
                            {item.response.title}
                          </Text>
                          {item.response.badge ? (
                            <Badge
                              label={item.response.badge}
                              color={'accentText'}
                              soft={'accentSoft'}
                            />
                          ) : null}
                        </View>
                        <Text style={[styles.botSub, { color: theme.textSecondary }]}>
                          {item.response.summary}
                        </Text>
                        {item.response.bullets.length > 0 ? (
                          <View style={styles.bullets}>
                            {item.response.bullets.map((b, idx) => (
                              <View key={idx} style={styles.bulletRow}>
                                <View
                                  style={[styles.bulletDot, { backgroundColor: theme.accent }]}
                                />
                                <Text style={[styles.bulletText, { color: theme.text }]}>{b}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        <View style={styles.replyActions}>
                          {item.response.actionRoute && item.response.actionLabel ? (
                            <Button
                              label={item.response.actionLabel}
                              size={'sm'}
                              icon={'arrow-forward'}
                              style={styles.flex}
                              onPress={() => go(item.response.actionRoute!)}
                            />
                          ) : null}
                          {item.response.copyText ? (
                            <Button
                              label={item.response.copyLabel ?? 'Sao chép'}
                              size={'sm'}
                              variant={'soft'}
                              icon={'copy-outline'}
                              onPress={() =>
                                handleCopy(item.response.copyText!, item.response.title)
                              }
                            />
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))}

                  {thinking ? (
                    <View
                      style={[
                        styles.thinkingPill,
                        { backgroundColor: theme.accentSoft },
                      ]}>
                      <Ionicons name="sparkles" size={14} color={theme.accentText} />
                      <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '700' }}>
                        {mascot.name} đang suy nghĩ...
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Context-Aware Quick Prompt Bar */}
                <View style={[styles.composerWrap, { borderColor: theme.border }]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.promptRow}>
                    {pageGuide.quickPrompts.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => handleAsk(p)}
                        style={({ pressed }) => [
                          styles.promptChip,
                          { backgroundColor: theme.accentSoft, borderColor: theme.border },
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.promptText, { color: theme.accentText }]}>{p}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={styles.inputRow}>
                    <TextInput
                      value={input}
                      onChangeText={setInput}
                      placeholder={`Hỏi ${mascot.name} hoặc ra lệnh đổi giao diện...`}
                      placeholderTextColor={theme.textMuted}
                      returnKeyType="send"
                      onSubmitEditing={() => handleAsk(input)}
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.backgroundElement,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                    />
                    <Pressable
                      onPress={() => handleAsk(input)}
                      style={({ pressed }) => [
                        styles.sendBtn,
                        { backgroundColor: theme.accent },
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {/* TAB 2: INTERACTIVE TOUR GUIDE & FEATURE ATLAS */}
            {decor.assistantTab === 'guide' ? (
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.guideContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                {/* 7-Step Interactive Tour Hero */}
                <LinearGradient
                  colors={mascot.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tourBanner}>
                  <View style={styles.flex}>
                    <Text style={styles.tourEyebrow}>
                      {decor.tourCompleted
                        ? 'ĐÃ HOÀN THÀNH · XEM LẠI BẤT CỨ LÚC NÀO'
                        : 'DÀNH CHO THÀNH VIÊN 10T4'}
                    </Text>
                    <Text style={styles.tourTitle}>Tour Hướng dẫn viên 7 bước 🧭</Text>
                    <Text style={styles.tourDesc}>
                      {mascot.name} sẽ trực tiếp dẫn bạn đi từng màn hình và bật mí mẹo dùng cực hay!
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => decor.startTour()}
                    style={({ pressed }) => [styles.tourGoBtn, pressed && styles.pressed]}>
                    <Ionicons name="play" size={16} color={mascot.badgeColor} />
                    <Text style={[styles.tourGoText, { color: mascot.badgeColor }]}>
                      {decor.tourCompleted ? 'Đi lại' : 'Bắt đầu'}
                    </Text>
                  </Pressable>
                </LinearGradient>

                {/* Current Page Contextual Guide */}
                <View
                  style={[
                    styles.sectionCard,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <View style={styles.guideHead}>
                    <Text style={{ fontSize: 22 }}>{pageGuide.emoji}</Text>
                    <View style={styles.flex}>
                      <Text style={[styles.sectionEyebrow, { color: theme.accentText }]}>
                        HƯỚNG DẪN TRANG BẠN ĐANG XEM
                      </Text>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>
                        {pageGuide.title}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.botSub, { color: theme.textSecondary }]}>
                    {pageGuide.summary}
                  </Text>
                  <View style={styles.stepList}>
                    {pageGuide.steps.map((step, idx) => (
                      <View key={idx} style={styles.stepRow}>
                        <View style={[styles.stepNum, { backgroundColor: theme.accent }]}>
                          <Text style={styles.stepNumText}>{idx + 1}</Text>
                        </View>
                        <Text style={[styles.bulletText, { color: theme.text }]}>{step}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.tipBox, { backgroundColor: theme.warningSoft }]}>
                    <Ionicons name="bulb" size={16} color={theme.warning} />
                    <Text style={[styles.tipText, { color: theme.text }]}>{pageGuide.proTip}</Text>
                  </View>
                </View>

                {/* Feature Atlas */}
                <View style={styles.atlasWrap}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Bản đồ toàn bộ 15+ tính năng 🗺️
                  </Text>
                  <TextInput
                    value={atlasSearch}
                    onChangeText={setAtlasSearch}
                    placeholder={'Tìm tính năng (VD: sticker, điểm danh, quỹ, sơ đồ)...'}
                    placeholderTextColor={theme.textMuted}
                    style={[
                      styles.atlasInput,
                      {
                        backgroundColor: theme.backgroundElement,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  {filteredAtlas.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => go(item.route)}
                      style={({ pressed }) => [
                        styles.atlasRow,
                        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                        pressed && styles.pressed,
                      ]}>
                      <View style={[styles.atlasIcon, { backgroundColor: theme[item.soft] }]}>
                        <Ionicons name={item.icon} size={18} color={theme[item.color]} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[styles.atlasTitle, { color: theme.text }]}>{item.title}</Text>
                        <Text
                          style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 16 }}
                          numberOfLines={2}>
                          {item.desc}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : null}

            {/* TAB 3: QUICK CONTROLS, MASCOT SWITCHER & QUESTS */}
            {decor.assistantTab === 'actions' ? (
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.guideContent}
                showsVerticalScrollIndicator={false}>
                {/* Mascot Switcher */}
                <View style={styles.atlasWrap}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Chọn Linh vật Trợ lý của bạn
                  </Text>
                  <View style={styles.mascotGrid}>
                    {MASCOT_LIST.map((m) => {
                      const active = decor.mascotId === m.id;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => {
                            decor.setMascotId(m.id);
                            setMascotMood('celebrating');
                            showToast(`Đã chọn ${m.name} đồng hành cùng bạn! ${m.emoji}`, 'info');
                          }}
                          style={({ pressed }) => [
                            styles.mascotCard,
                            {
                              backgroundColor: active
                                ? theme.accentSoft
                                : theme.backgroundElement,
                              borderColor: active ? theme.accent : 'transparent',
                            },
                            pressed && styles.pressed,
                          ]}>
                          <MascotAvatar mascotId={m.id} size={46} animate={active} />
                          <Text
                            style={[styles.atlasTitle, { color: theme.text, marginTop: 4 }]}
                            numberOfLines={1}>
                            {m.name}
                          </Text>
                          <Text
                            style={{ color: theme.textSecondary, fontSize: 10, textAlign: 'center' }}
                            numberOfLines={2}>
                            {m.roleTitle}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Instant Action Pills */}
                <View style={styles.atlasWrap}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Thao tác nhanh 1 chạm ⚡
                  </Text>
                  <View style={styles.quickGrid}>
                    <Pressable
                      onPress={() => go('/studio')}
                      style={[styles.quickBtn, { backgroundColor: theme.purpleSoft }]}>
                      <Ionicons name="color-wand" size={18} color={theme.purple} />
                      <Text style={[styles.quickBtnText, { color: theme.purple }]}>
                        Studio Trang trí
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => go('/creative')}
                      style={[styles.quickBtn, { backgroundColor: theme.dangerSoft }]}>
                      <Ionicons name="sparkles" size={18} color={theme.danger} />
                      <Text style={[styles.quickBtnText, { color: theme.danger }]}>
                        Bảng Sticker
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        toggleDark();
                        showToast(isDark ? 'Đã bật Chế độ Sáng ☀️' : 'Đã bật Chế độ Tối 🌙', 'info');
                      }}
                      style={[styles.quickBtn, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name={isDark ? 'sunny' : 'moon'} size={18} color={theme.accent} />
                      <Text style={[styles.quickBtnText, { color: theme.accentText }]}>
                        {isDark ? 'Chế độ Sáng' : 'Chế độ Tối'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const next = decor.ambientEffect === 'sakura' ? 'none' : 'sakura';
                        decor.setAmbientEffect(next);
                        showToast(
                          next === 'sakura' ? 'Đã bật Hoa anh đào rơi 🌸' : 'Đã tắt hiệu ứng bay',
                          'info',
                        );
                      }}
                      style={[styles.quickBtn, { backgroundColor: theme.warningSoft }]}>
                      <Text style={{ fontSize: 17 }}>🌸</Text>
                      <Text style={[styles.quickBtnText, { color: theme.warning }]}>
                        {decor.ambientEffect === 'sakura' ? 'Tắt Hoa rơi' : 'Bật Hoa rơi'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        const report = buildClassSummaryReport({
                          classInfo: store.classInfo,
                          totals: store.totals,
                          ranking: store.ranking,
                          fundBalance: store.fundSummary.balance,
                          streak: store.classStreak,
                        });
                        await handleCopy(report, `Báo cáo lớp ${store.classInfo.name}`);
                      }}
                      style={[styles.quickBtn, { backgroundColor: theme.successSoft }]}>
                      <Ionicons name="share-social" size={18} color={theme.success} />
                      <Text style={[styles.quickBtnText, { color: theme.success }]}>
                        Xuất báo cáo Zalo
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        decor.setAssistantMinimized(!decor.assistantMinimized);
                        onClose();
                        showToast(
                          decor.assistantMinimized
                            ? 'Đã mở rộng nút Linh vật'
                            : 'Đã thu gọn nút Linh vật sang mép phải',
                          'info',
                        );
                      }}
                      style={[styles.quickBtn, { backgroundColor: theme.backgroundElement }]}>
                      <Ionicons
                        name={decor.assistantMinimized ? 'expand' : 'contract'}
                        size={18}
                        color={theme.textSecondary}
                      />
                      <Text style={[styles.quickBtnText, { color: theme.textSecondary }]}>
                        {decor.assistantMinimized ? 'Phóng to nút nổi' : 'Thu gọn nút nổi'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Discovery Quests */}
                <View
                  style={[
                    styles.sectionCard,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <View style={styles.replyHead}>
                    <View style={styles.flex}>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>
                        Thử thách Khám phá 10T4 🏅
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                        {`Đã xong ${questDoneCount}/${questTotal} nhiệm vụ (${questPct}%)`}
                      </Text>
                    </View>
                    <Badge
                      label={`${questDoneCount * 50} XP`}
                      color={'gold'}
                      soft={'goldSoft'}
                    />
                  </View>

                  <View style={[styles.questTrack, { backgroundColor: theme.card }]}>
                    <LinearGradient
                      colors={mascot.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.questFill,
                        { width: `${Math.max(5, questPct)}%` as `${number}%` },
                      ]}
                    />
                  </View>

                  {DISCOVERY_QUESTS.map((q) => {
                    const done = decor.completedQuests.includes(q.id);
                    return (
                      <Pressable
                        key={q.id}
                        onPress={() => {
                          if (q.id === 'tour') decor.startTour();
                          else if (q.id === 'chat') decor.setAssistantTab('chat');
                          else if (q.route) go(q.route);
                        }}
                        style={[
                          styles.questRow,
                          {
                            backgroundColor: theme.card,
                            borderColor: done ? theme.success : theme.border,
                          },
                        ]}>
                        <Text style={{ fontSize: 20 }}>{q.emoji}</Text>
                        <View style={styles.flex}>
                          <Text
                            style={[
                              styles.atlasTitle,
                              {
                                color: theme.text,
                                textDecorationLine: done ? 'line-through' : 'none',
                              },
                            ]}>
                            {q.title}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{q.desc}</Text>
                        </View>
                        <Ionicons
                          name={done ? 'checkmark-circle' : 'chevron-forward'}
                          size={18}
                          color={done ? theme.success : theme.textMuted}
                        />
                      </Pressable>
                    );
                  })}

                  <Button
                    label={`Mở 16 Nhiệm vụ Sticker Hiếm & 🪙 ${decor.coins} Xu`}
                    icon={'trophy'}
                    size={'sm'}
                    onPress={() => {
                      onClose();
                      router.push({ pathname: '/creative', params: { tab: 'missions' } } as never);
                    }}
                  />
                </View>
              </ScrollView>
            ) : null}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 36 : 48,
    paddingHorizontal: Platform.OS === 'web' ? Spacing.three : 0,
    paddingBottom: Platform.OS === 'web' ? Spacing.three : 0,
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    height: Platform.OS === 'web' ? '88%' : '90%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomLeftRadius: Platform.OS === 'web' ? Radius.xl : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? Radius.xl : 0,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    overflow: 'hidden',
  },
  headerBubble: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    top: -60,
    right: -30,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerTexts: { flex: 1, gap: 2 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerName: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  onlineText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  headerRole: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    margin: Spacing.two + 2,
    padding: 4,
    borderRadius: Radius.md,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  tabText: { fontSize: 12, fontWeight: '800' },
  tabBody: { flex: 1 },
  scrollArea: { flex: 1 },
  chatContent: { padding: Spacing.three, paddingTop: Spacing.one, gap: Spacing.three },
  guideContent: { padding: Spacing.three, paddingTop: Spacing.one, gap: Spacing.three, paddingBottom: Spacing.five },
  exchange: { gap: Spacing.two },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderBottomRightRadius: 4,
  },
  userText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  botBubble: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderTopLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  botTitle: { fontSize: 14, fontWeight: '900', lineHeight: 20 },
  botSub: { fontSize: 13, lineHeight: 19 },
  inlineBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: 2 },
  miniCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  miniCtaText: { fontSize: 12, fontWeight: '800' },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bullets: { gap: 5 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  replyActions: { flexDirection: 'row', gap: Spacing.two, marginTop: 2 },
  thinkingPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === 'ios' ? Spacing.four : Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  promptRow: { gap: 6, paddingRight: Spacing.two },
  promptChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  promptText: { fontSize: 11, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    fontWeight: '600',
    ...({ outlineStyle: 'none' } as object),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  tourEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  tourTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 2 },
  tourDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 17, marginTop: 2 },
  tourGoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  tourGoText: { fontSize: 12, fontWeight: '900' },
  sectionCard: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two + 2,
  },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  sectionEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  sectionTitle: { fontSize: 15, fontWeight: '900' },
  stepList: { gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  atlasWrap: { gap: Spacing.two },
  atlasInput: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    fontWeight: '600',
    ...({ outlineStyle: 'none' } as object),
  },
  atlasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  atlasIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atlasTitle: { fontSize: 13, fontWeight: '800' },
  mascotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  mascotCard: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    padding: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    gap: 2,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  quickBtn: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  quickBtnText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  questTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  questFill: { height: 8, borderRadius: 4 },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
