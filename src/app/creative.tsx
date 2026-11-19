/**
 * Creative Playground, Student Mission Arena & Rare Sticker Vault (/creative):
 *  1. Student Missions (`missions`) — Complete real class tasks to unlock 16 exclusive Rare..Mythic Stickers + Coins
 *  2. Coin Chests & 45-Sticker Gallery (`vault`) — Daily Login Rewards, Coin Chests & Rarity Album
 *  3. Interactive Drag-and-Drop Sticker & Sticky-Note Canvas (`board`)
 *  4. 10T4 Greeting Card & Achievement Poster Designer (`card`)
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { MissionsPanel } from '@/components/rewards/missions-panel';
import {
  StickerRevealModal,
  type StickerRevealPayload,
} from '@/components/rewards/sticker-reveal-modal';
import { VaultPanel } from '@/components/rewards/vault-panel';
import { StickerBadge } from '@/components/stickers/sticker-art';
import { StickerCanvas } from '@/components/stickers/sticker-canvas';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  BOARD_BACKDROP_LIST,
  CARD_TEMPLATES,
  STICKER_CATALOG,
  STICKER_PACKS,
  STICKY_NOTE_COLORS,
  type CardTemplateId,
  type StickerPackId,
} from '@/constants/decor-meta';
import { MISSION_BY_STICKER, STUDENT_MISSIONS } from '@/constants/rewards-meta';
import { ACCENT_PRESET_LIST, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type CreativeTab = 'missions' | 'vault' | 'board' | 'card';

const CREATIVE_TABS: { key: CreativeTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'missions', label: 'Nhiệm vụ', icon: 'trophy' },
  { key: 'vault', label: 'Kho báu', icon: 'gift' },
  { key: 'board', label: 'Bảng dán', icon: 'easel' },
  { key: 'card', label: 'Thiệp', icon: 'mail-open' },
];

function isCreativeTab(val?: string): val is CreativeTab {
  return val === 'missions' || val === 'vault' || val === 'board' || val === 'card';
}

export default function CreativeStudioScreen() {
  const { tab: paramTab } = useLocalSearchParams<{ tab?: string }>();
  const { classInfo, students } = useClassStore();
  const decor = useDecor();
  const theme = useTheme();
  const { showToast } = useToast();

  const [tab, setTab] = useState<CreativeTab>(isCreativeTab(paramTab) ? paramTab : 'missions');
  const [prevParamTab, setPrevParamTab] = useState<string | undefined>(paramTab);
  const [revealPayload, setRevealPayload] = useState<StickerRevealPayload | null>(null);

  if (paramTab !== prevParamTab) {
    setPrevParamTab(paramTab);
    if (isCreativeTab(paramTab)) {
      setTab(paramTab);
    }
  }

  // --- Board state ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [packFilter, setPackFilter] = useState<StickerPackId>('mythic_quest');
  const [composerMode, setComposerMode] = useState<'none' | 'note' | 'ribbon'>('none');
  const [draftText, setDraftText] = useState('');
  const [noteColorId, setNoteColorId] = useState(STICKY_NOTE_COLORS[0].id);

  // --- Card studio state ---
  const [tplId, setTplId] = useState<CardTemplateId>('birthday');
  const [cardGradient, setCardGradient] = useState<[string, string]>(CARD_TEMPLATES[0].gradient);
  const [cardBadge, setCardBadge] = useState(CARD_TEMPLATES[0].defaultBadge);
  const [cardTitle, setCardTitle] = useState(CARD_TEMPLATES[0].defaultTitle);
  const [cardMessage, setCardMessage] = useState(CARD_TEMPLATES[0].defaultMessage);
  const [cardRecipientId, setCardRecipientId] = useState<string>(students[0]?.id ?? '');
  const [cardStickers, setCardStickers] = useState<[string, string, string]>(
    CARD_TEMPLATES[0].defaultStickers,
  );

  const selectedItem = useMemo(
    () => decor.canvasItems.find((it) => it.id === selectedId) ?? null,
    [decor.canvasItems, selectedId],
  );

  const cardRecipient = useMemo(
    () => students.find((s) => s.id === cardRecipientId) ?? students[0] ?? null,
    [students, cardRecipientId],
  );

  const rarePlusStats = useMemo(() => {
    const rareItems = STICKER_CATALOG.filter((s) => s.rarity !== 'common');
    const owned = rareItems.filter((s) => decor.unlockedStickers.includes(s.id)).length;
    return { owned, total: rareItems.length };
  }, [decor.unlockedStickers]);

  const haptic = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  /* ---------- Board Handlers ---------- */

  const handleScale = (delta: number) => {
    if (!selectedItem) return;
    haptic();
    const next = Math.max(0.65, Math.min(1.65, Math.round((selectedItem.scale + delta) * 100) / 100));
    decor.updateCanvasItem(selectedItem.id, { scale: next });
  };

  const handleRotate = (delta: number) => {
    if (!selectedItem) return;
    haptic();
    decor.updateCanvasItem(selectedItem.id, { rotation: selectedItem.rotation + delta });
  };

  const handleAddComposerItem = () => {
    if (!draftText.trim()) {
      showToast('Hãy nhập nội dung trước khi dán lên bảng nhé!', 'warning');
      return;
    }
    haptic();
    const id =
      composerMode === 'note'
        ? decor.addNoteToCanvas(draftText, noteColorId)
        : decor.addRibbonToCanvas(draftText);
    setSelectedId(id);
    setDraftText('');
    setComposerMode('none');
    showToast(composerMode === 'note' ? 'Đã dán Giấy nhớ lên bảng! 📌' : 'Đã dán Dải chữ lên bảng! 🎀');
  };

  const handlePlaceStickerFromAnywhere = (stickerId: string) => {
    haptic();
    const newId = decor.addStickerToCanvas(stickerId);
    setSelectedId(newId);
    setTab('board');
    showToast('Đã thả Sticker vào Bảng Sáng tạo! ✨');
  };

  /* ---------- Card Studio Handlers ---------- */

  const selectTemplate = (id: CardTemplateId) => {
    const tpl = CARD_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    haptic();
    setTplId(tpl.id);
    setCardGradient(tpl.gradient);
    setCardBadge(tpl.defaultBadge);
    setCardTitle(tpl.defaultTitle);
    setCardMessage(tpl.defaultMessage);
    setCardStickers(tpl.defaultStickers);
  };

  const randomizeCardGradient = () => {
    haptic();
    const next = ACCENT_PRESET_LIST[Math.floor(Math.random() * ACCENT_PRESET_LIST.length)];
    setCardGradient(next.preview);
  };

  const handleSendCardToKudos = () => {
    decor.completeQuest('card');
    decor.triggerCelebration();
    const msg = `${cardTitle} — ${cardMessage}`;
    router.push({
      pathname: '/kudos',
      params: {
        toStudentId: cardRecipient?.id ?? '',
        presetMessage: msg,
      },
    } as never);
  };

  const handleCopyCardText = async () => {
    decor.completeQuest('card');
    const text = [
      `✨ ${cardBadge} ✨`,
      cardRecipient ? `Gửi tới: ${cardRecipient.name} (${classInfo.name})` : `Lớp ${classInfo.name}`,
      `💌 ${cardTitle}`,
      `“${cardMessage}”`,
      `— Thiết kế từ Góc Sáng Tạo App ${classInfo.name} · ${classInfo.school}`,
    ].join('\n');
    const res = await shareOrCopyText(text, cardTitle);
    showToast(res === 'copied' ? 'Đã sao chép thiệp đẹp để gửi Zalo! 📋' : 'Đã mở hộp thoại chia sẻ!');
  };

  return (
    <Screen withTabBar={false} scrollEnabled={!dragging}>
      <PageHeader
        title={'Nhiệm Vụ & Kho Sticker'}
        subtitle={`45 Sticker siêu ngầu, Rương Xu 🪙 & Xưởng Sáng Tạo`}
        rightIcon={'color-wand'}
        rightLabel={'Studio'}
        onRightPress={() => router.push('/studio' as never)}
      />

      {/* Compact Wallet & Collector HUD Strip */}
      <FadeIn index={0}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hudRow}>
          <Pressable
            onPress={decor.openLoginRewardModal}
            style={({ pressed }) => [
              styles.hudPill,
              { backgroundColor: theme.goldSoft, borderColor: theme.gold },
              pressed && styles.pressed,
            ]}>
            <Text style={{ fontSize: 13 }}>🪙</Text>
            <Text style={[styles.hudText, { color: theme.warning }]}>{`${decor.coins} Xu`}</Text>
            {decor.canClaimLoginReward ? <View style={styles.hudDot} /> : null}
          </Pressable>

          <Pressable
            onPress={decor.openLoginRewardModal}
            style={[styles.hudPill, { backgroundColor: theme.dangerSoft, borderColor: 'transparent' }]}>
            <Text style={{ fontSize: 13 }}>🔥</Text>
            <Text style={[styles.hudText, { color: theme.danger }]}>
              {`Chuỗi ${decor.loginStreak} ngày`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('vault')}
            style={[styles.hudPill, { backgroundColor: theme.purpleSoft, borderColor: 'transparent' }]}>
            <Text style={{ fontSize: 13 }}>💎</Text>
            <Text style={[styles.hudText, { color: theme.purple }]}>
              {`${rarePlusStats.owned}/${rarePlusStats.total} Hiếm+`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab('missions')}
            style={[styles.hudPill, { backgroundColor: theme.accentSoft, borderColor: 'transparent' }]}>
            <Text style={{ fontSize: 13 }}>⚔️</Text>
            <Text style={[styles.hudText, { color: theme.accentText }]}>
              {`${decor.claimedMissions.length}/${STUDENT_MISSIONS.length} NV`}
            </Text>
          </Pressable>
        </ScrollView>
      </FadeIn>

      {/* 4-Way Mode Switcher */}
      <FadeIn index={0}>
        <View style={[styles.tabBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {CREATIVE_TABS.map((t) => {
            const active = tab === t.key;
            const showMissionCount = t.key === 'missions' && decor.claimableMissionCount > 0;
            const showVaultDot =
              t.key === 'vault' && (decor.canClaimDailySticker || decor.canClaimLoginReward);
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptic();
                  setTab(t.key);
                }}
                style={[styles.tabBtn, active && { backgroundColor: theme.accentSoft }]}>
                <Ionicons
                  name={t.icon}
                  size={15}
                  color={active ? theme.accentText : theme.textMuted}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? theme.accentText : theme.textMuted },
                  ]}
                  numberOfLines={1}>
                  {t.label}
                </Text>
                {showMissionCount ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{decor.claimableMissionCount}</Text>
                  </View>
                ) : showVaultDot ? (
                  <View style={styles.giftDot} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </FadeIn>

      {/* ==================== TAB 1: STUDENT MISSIONS ARENA ==================== */}
      {tab === 'missions' ? (
        <MissionsPanel
          onSelectCreativeTab={(next) => setTab(next)}
          onRevealSticker={setRevealPayload}
        />
      ) : null}

      {/* ==================== TAB 2: COIN CHESTS & 45-STICKER VAULT ==================== */}
      {tab === 'vault' ? (
        <VaultPanel
          onPlaceOnBoard={handlePlaceStickerFromAnywhere}
          onGoMissions={() => setTab('missions')}
          onRevealSticker={setRevealPayload}
        />
      ) : null}

      {/* ==================== TAB 3: INTERACTIVE STICKER BOARD ==================== */}
      {tab === 'board' ? (
        <>
          {/* Backdrop Picker */}
          <FadeIn index={1}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {BOARD_BACKDROP_LIST.map((b) => (
                <Chip
                  key={b.id}
                  label={`${b.emoji} ${b.label}`}
                  selected={decor.canvasBackdrop === b.id}
                  onPress={() => {
                    haptic();
                    decor.setCanvasBackdrop(b.id);
                  }}
                />
              ))}
            </ScrollView>
          </FadeIn>

          {/* Interactive Draggable Canvas */}
          <FadeIn index={2}>
            <StickerCanvas
              backdrop={decor.canvasBackdrop}
              items={decor.canvasItems}
              height={348}
              interactive
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                if (id) decor.bringCanvasItemToFront(id);
              }}
              onMove={(id, x, y) => decor.updateCanvasItem(id, { x, y })}
              onDragStateChange={setDragging}
            />
          </FadeIn>

          {/* Selected Item Transform Toolbar */}
          {selectedItem ? (
            <FadeIn index={0}>
              <Card style={styles.toolbarCard}>
                <View style={styles.toolHead}>
                  <Badge label={'Đang chọn vật phẩm'} color={'accentText'} soft={'accentSoft'} icon={'move'} />
                  <Pressable onPress={() => setSelectedId(null)} hitSlop={8}>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '800' }}>
                      Xong
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.toolBtns}>
                  <Pressable
                    onPress={() => handleScale(-0.14)}
                    style={[styles.toolBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="remove-circle-outline" size={18} color={theme.text} />
                    <Text style={[styles.toolBtnText, { color: theme.text }]}>Nhỏ</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleScale(0.14)}
                    style={[styles.toolBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="add-circle-outline" size={18} color={theme.text} />
                    <Text style={[styles.toolBtnText, { color: theme.text }]}>To</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRotate(-12)}
                    style={[styles.toolBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons
                      name="refresh-outline"
                      size={18}
                      color={theme.text}
                      style={{ transform: [{ scaleX: -1 }] }}
                    />
                    <Text style={[styles.toolBtnText, { color: theme.text }]}>Xoay trái</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRotate(12)}
                    style={[styles.toolBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="refresh-outline" size={18} color={theme.text} />
                    <Text style={[styles.toolBtnText, { color: theme.text }]}>Xoay phải</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptic();
                      const copyId = decor.duplicateCanvasItem(selectedItem.id);
                      if (copyId) setSelectedId(copyId);
                    }}
                    style={[styles.toolBtn, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="copy-outline" size={18} color={theme.accentText} />
                    <Text style={[styles.toolBtnText, { color: theme.accentText }]}>Nhân bản</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptic();
                      decor.removeCanvasItem(selectedItem.id);
                      setSelectedId(null);
                    }}
                    style={[styles.toolBtn, { backgroundColor: theme.dangerSoft }]}>
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    <Text style={[styles.toolBtnText, { color: theme.danger }]}>Xoá</Text>
                  </Pressable>
                </View>
              </Card>
            </FadeIn>
          ) : null}

          {/* Quick Board Actions */}
          <FadeIn index={3}>
            <Card style={styles.card}>
              <View style={styles.quickActionRow}>
                <Pressable
                  onPress={() => setComposerMode((m) => (m === 'note' ? 'none' : 'note'))}
                  style={[
                    styles.actionChip,
                    {
                      backgroundColor:
                        composerMode === 'note' ? theme.warningSoft : theme.backgroundElement,
                      borderColor: composerMode === 'note' ? theme.warning : 'transparent',
                    },
                  ]}>
                  <Ionicons name="document-text" size={15} color={theme.warning} />
                  <Text style={[styles.actionChipText, { color: theme.text }]}>+ Giấy nhớ</Text>
                </Pressable>

                <Pressable
                  onPress={() => setComposerMode((m) => (m === 'ribbon' ? 'none' : 'ribbon'))}
                  style={[
                    styles.actionChip,
                    {
                      backgroundColor:
                        composerMode === 'ribbon' ? theme.purpleSoft : theme.backgroundElement,
                      borderColor: composerMode === 'ribbon' ? theme.purple : 'transparent',
                    },
                  ]}>
                  <Ionicons name="ribbon" size={15} color={theme.purple} />
                  <Text style={[styles.actionChipText, { color: theme.text }]}>+ Dải chữ</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    haptic();
                    decor.shuffleCanvasBoard();
                    setSelectedId(null);
                    showToast('Đã tự động xếp một bố cục sáng tạo mới! ✨');
                  }}
                  style={[
                    styles.actionChip,
                    { backgroundColor: theme.accentSoft, borderColor: 'transparent' },
                  ]}>
                  <Ionicons name="sparkles" size={15} color={theme.accentText} />
                  <Text style={[styles.actionChipText, { color: theme.accentText }]}>
                    Xếp ngẫu nhiên
                  </Text>
                </Pressable>
              </View>

              {/* Inline Note / Ribbon Composer */}
              {composerMode !== 'none' ? (
                <View style={[styles.composerBox, { backgroundColor: theme.backgroundElement }]}>
                  <TextField
                    label={composerMode === 'note' ? 'Nội dung Giấy nhớ' : 'Chữ trên Dải ruy-băng'}
                    placeholder={
                      composerMode === 'note'
                        ? 'VD: Quyết tâm đạt 10 điểm Toán tuần này! 🔥'
                        : 'VD: Tổ 1 Vô Địch · K8T4 Mãi Đĩnh!'
                    }
                    value={draftText}
                    onChangeText={setDraftText}
                    multiline={composerMode === 'note'}
                  />
                  {composerMode === 'note' ? (
                    <View style={styles.noteColorRow}>
                      {STICKY_NOTE_COLORS.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => setNoteColorId(c.id)}
                          style={[
                            styles.colorDot,
                            {
                              backgroundColor: c.bg,
                              borderColor: noteColorId === c.id ? theme.text : 'transparent',
                            },
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                  <Button
                    label={composerMode === 'note' ? 'Dán Giấy nhớ lên bảng' : 'Dán Dải chữ lên bảng'}
                    icon={'add-circle'}
                    size={'sm'}
                    onPress={handleAddComposerItem}
                  />
                </View>
              ) : null}

              {/* Pin to Home Toggle & Clear */}
              <View style={styles.pinBar}>
                <Pressable
                  onPress={() => {
                    haptic();
                    const next = !decor.pinBoardToHome;
                    decor.setPinBoardToHome(next);
                    showToast(
                      next
                        ? 'Đã ghim Bảng Sticker lên Trang Tổng quan! 📌'
                        : 'Đã gỡ Bảng Sticker khỏi Trang Tổng quan',
                      'info',
                    );
                  }}
                  style={[
                    styles.pinToggle,
                    {
                      backgroundColor: decor.pinBoardToHome
                        ? theme.successSoft
                        : theme.backgroundElement,
                      borderColor: decor.pinBoardToHome ? theme.success : 'transparent',
                    },
                  ]}>
                  <Ionicons
                    name={decor.pinBoardToHome ? 'pin' : 'pin-outline'}
                    size={16}
                    color={decor.pinBoardToHome ? theme.success : theme.textSecondary}
                  />
                  <Text
                    style={{
                      color: decor.pinBoardToHome ? theme.success : theme.text,
                      fontSize: 12,
                      fontWeight: '800',
                    }}>
                    {decor.pinBoardToHome ? 'Đang hiện trên Trang Chủ' : 'Ghim bảng lên Trang Chủ'}
                  </Text>
                </Pressable>

                {decor.canvasItems.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      decor.clearCanvasBoard();
                      setSelectedId(null);
                      showToast('Đã làm trống bảng', 'warning');
                    }}
                    style={[styles.clearBtn, { backgroundColor: theme.dangerSoft }]}>
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  </Pressable>
                ) : null}
              </View>
            </Card>
          </FadeIn>

          {/* Sticker Drawer */}
          <FadeIn index={4}>
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Kho Sticker Độc Quyền (chạm để thả lên bảng)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}>
                {STICKER_PACKS.map((p) => (
                  <Chip
                    key={p.id}
                    label={`${p.emoji} ${p.label}`}
                    selected={packFilter === p.id}
                    onPress={() => setPackFilter(p.id)}
                  />
                ))}
              </ScrollView>

              <View style={styles.stickerGrid}>
                {STICKER_CATALOG.filter((s) => s.pack === packFilter).map((stk) => {
                  const unlocked = decor.unlockedStickers.includes(stk.id);
                  const mission = MISSION_BY_STICKER[stk.id];
                  return (
                    <Pressable
                      key={stk.id}
                      onPress={() => {
                        if (!unlocked) {
                          if (stk.missionOnly && mission) {
                            setTab('missions');
                            showToast(`Hoàn thành NV "${mission.title}" để mở khóa mẫu này! ⚔️`, 'info');
                          } else {
                            setTab('vault');
                            showToast('Mở Rương Xu 🪙 hoặc Quà Đăng Nhập để sưu tầm mẫu này!', 'info');
                          }
                          return;
                        }
                        haptic();
                        const newId = decor.addStickerToCanvas(stk.id);
                        setSelectedId(newId);
                      }}
                      style={({ pressed }) => [
                        styles.stickerCell,
                        { backgroundColor: theme.backgroundElement },
                        pressed && styles.pressed,
                      ]}>
                      <StickerBadge id={stk.id} size={56} showRibbon locked={!unlocked} />
                      <Text
                        style={{
                          color: unlocked ? theme.text : theme.textMuted,
                          fontSize: 10,
                          fontWeight: '800',
                          textAlign: 'center',
                          marginTop: 4,
                        }}
                        numberOfLines={1}>
                        {unlocked ? stk.label : stk.missionOnly ? '⚔️ Làm NV' : '🔒 Kho báu'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          </FadeIn>
        </>
      ) : null}

      {/* ==================== TAB 4: CREATIVE CARD & POSTER STUDIO ==================== */}
      {tab === 'card' ? (
        <>
          <FadeIn index={1}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {CARD_TEMPLATES.map((tpl) => (
                <Chip
                  key={tpl.id}
                  label={`${tpl.emoji} ${tpl.label}`}
                  selected={tplId === tpl.id}
                  onPress={() => selectTemplate(tpl.id)}
                />
              ))}
            </ScrollView>
          </FadeIn>

          {/* Live Designed Card Preview */}
          <FadeIn index={2}>
            <LinearGradient
              colors={cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.posterCard,
                Shadow.floating,
                { shadowColor: cardGradient[0], shadowOpacity: 0.34 },
              ]}>
              <View style={styles.posterBubbleA} />
              <View style={styles.posterBubbleB} />

              <View style={styles.posterTop}>
                <View style={styles.posterBadge}>
                  <Text style={styles.posterBadgeText}>{cardBadge}</Text>
                </View>
                <Pressable onPress={randomizeCardGradient} style={styles.colorDice}>
                  <Ionicons name="color-palette" size={16} color="#FFFFFF" />
                </Pressable>
              </View>

              <View style={styles.posterCenter}>
                {cardRecipient ? (
                  <Avatar name={cardRecipient.name} size={66} ring frame={decor.avatarFrame} />
                ) : null}
                {cardRecipient ? (
                  <Text style={styles.posterRecipient}>{cardRecipient.name}</Text>
                ) : null}
                <Text style={styles.posterTitle}>{cardTitle || 'Lớp 10T4 Mãi Đĩnh'}</Text>
                <Text style={styles.posterMessage}>
                  {`“${cardMessage || 'Gửi ngàn lời chúc tốt đẹp nhất đến bạn!'}”`}
                </Text>
              </View>

              <View style={styles.posterStickers}>
                {cardStickers.map((sid, idx) => (
                  <StickerBadge key={`${sid}-${idx}`} id={sid} size={50} showRibbon={false} />
                ))}
              </View>

              <Text style={styles.posterFooter}>
                {`Lớp ${classInfo.name} · ${classInfo.school} · ${classInfo.year}`}
              </Text>
            </LinearGradient>
          </FadeIn>

          {/* Card Controls */}
          <FadeIn index={3}>
            <Card style={styles.card}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Chọn nhân vật trên thiệp
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}>
                {students.slice(0, 18).map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={cardRecipient?.id === s.id}
                    onPress={() => setCardRecipientId(s.id)}
                  />
                ))}
              </ScrollView>

              <TextField label={'Nhãn nổi bật'} value={cardBadge} onChangeText={setCardBadge} />
              <TextField
                label={'Tiêu đề thiệp / poster'}
                value={cardTitle}
                onChangeText={setCardTitle}
              />
              <TextField
                label={'Lời chúc / Thông điệp'}
                value={cardMessage}
                onChangeText={setCardMessage}
                multiline
                style={styles.textarea}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Chạm Sticker đã mở để đổi bộ 3 trang trí trên thiệp
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.miniStickerRow}>
                {STICKER_CATALOG.filter((s) => decor.unlockedStickers.includes(s.id)).map((stk) => {
                  const chosen = cardStickers.includes(stk.id);
                  return (
                    <Pressable
                      key={stk.id}
                      onPress={() => {
                        haptic();
                        setCardStickers((prev) => [prev[1], prev[2], stk.id]);
                      }}
                      style={[
                        styles.miniStickerBtn,
                        {
                          backgroundColor: chosen ? theme.accentSoft : theme.backgroundElement,
                          borderColor: chosen ? theme.accent : 'transparent',
                        },
                      ]}>
                      <StickerBadge id={stk.id} size={42} showRibbon={false} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.cardCtas}>
                <Button
                  label={'Gửi lên Kudos 💖'}
                  icon={'heart'}
                  style={styles.flex}
                  onPress={handleSendCardToKudos}
                />
                <Button
                  label={'Chép gửi Zalo'}
                  variant={'soft'}
                  icon={'share-social'}
                  onPress={handleCopyCardText}
                />
              </View>
            </Card>
          </FadeIn>
        </>
      ) : null}

      {/* Holographic Sticker Unlock Showcase Modal */}
      <StickerRevealModal
        payload={revealPayload}
        onClose={() => setRevealPayload(null)}
        onPlaceOnBoard={handlePlaceStickerFromAnywhere}
        onPinToHome={(sid) => {
          decor.toggleHeroSticker(sid);
          showToast('Đã ghim Sticker lên Trang Chủ 10T4! 📌');
        }}
        isPinnedToHome={
          revealPayload ? decor.heroStickerIds.includes(revealPayload.stickerId) : false
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hudRow: { gap: Spacing.two, paddingRight: Spacing.two },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  hudText: { fontSize: 12, fontWeight: '900' },
  hudDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444' },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
  },
  tabLabel: { fontSize: 11.5, fontWeight: '800' },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900' },
  giftDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  chipsRow: { gap: Spacing.two, paddingRight: Spacing.two },
  toolbarCard: { gap: Spacing.two + 2 },
  toolHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  toolBtnText: { fontSize: 11, fontWeight: '800' },
  card: { gap: Spacing.three },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  fieldLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  quickActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  actionChipText: { fontSize: 12, fontWeight: '800' },
  composerBox: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two + 2,
  },
  noteColorRow: { flexDirection: 'row', gap: 10 },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
  },
  pinBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pinToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  clearBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stickerCell: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.lg,
  },
  posterCard: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
    alignItems: 'center',
  },
  posterBubbleA: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -90,
    right: -55,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  posterBubbleB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -60,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  posterTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterBadge: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  posterBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  colorDice: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterCenter: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  posterRecipient: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
  },
  posterTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  posterMessage: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
  },
  posterStickers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  posterFooter: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
  },
  textarea: { minHeight: 82, textAlignVertical: 'top' },
  miniStickerRow: { gap: 8, paddingVertical: 4 },
  miniStickerBtn: {
    padding: 6,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  cardCtas: { flexDirection: 'row', gap: Spacing.two },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
