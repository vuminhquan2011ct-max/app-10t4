/**
 * App Decoration & Personalization Studio (/studio).
 *
 * Lets every student and teacher customize their own app experience:
 *  - 5 One-Tap Aesthetic Combo Presets
 *  - 10 Brand Color Palettes + Light/Dark/System
 *  - 6 App-Wide SVG Wallpaper Patterns
 *  - 6 Animated Ambient Effects (Sakura, Snow, Sparkles, Fireflies, Confetti)
 *  - 5 Visual Card Styles (Classic, Glass, Neon, Pastel, Sketch)
 *  - 7 Avatar Frames + Personal Mood Status
 *  - Pinned Die-Cut Stickers on Dashboard Hero Banner
 *  - 4 Animated Companion Mascots + Assistant Controls & Guided Tour
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { PageHeader } from '@/components/page-header';
import { StickerBadge } from '@/components/stickers/sticker-art';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  AESTHETIC_COMBOS,
  AMBIENT_EFFECT_LIST,
  AVATAR_FRAME_LIST,
  CARD_STYLE_LIST,
  MASCOT_LIST,
  MOOD_PRESETS,
  STICKER_CATALOG,
  WALLPAPER_LIST,
} from '@/constants/decor-meta';
import { ACCENT_PRESET_LIST, Radius, Shadow, Spacing, type ThemeMode } from '@/constants/theme';
import { useBrandGradient, useTheme, useThemePreference } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const THEME_MODES: { value: ThemeMode; label: string; icon: IoniconName }[] = [
  { value: 'system', label: 'Tự động', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Sáng', icon: 'sunny-outline' },
  { value: 'dark', label: 'Tối', icon: 'moon-outline' },
];

export default function DecorationStudioScreen() {
  const auth = useAuth();
  const { classInfo, currentStudent, memberRole, subjectName } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { mode, setMode, accentKey, setAccentKey } = useThemePreference();
  const decor = useDecor();
  const { showToast } = useToast();

  const [customMood, setCustomMood] = useState(decor.moodText);

  const displayName =
    auth.profile?.displayName?.trim() ||
    (memberRole === 'teacher'
      ? classInfo.teacherName
      : memberRole === 'subject_teacher'
        ? `GV Bộ môn ${subjectName ?? ''}`.trim()
        : (currentStudent?.name ?? 'Thành viên 10T4'));

  const hapticTap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Studio Trang Trí App'}
        subtitle={'Biến hóa giao diện, hiệu ứng & linh vật theo chất riêng'}
        rightIcon={'sparkles'}
        rightLabel={'Sticker'}
        onRightPress={() => router.push('/creative' as never)}
      />

      {/* Live Preview Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.previewHero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={styles.bubbleA} />
          <View style={styles.bubbleB} />
          <View style={styles.previewTop}>
            <Avatar
              name={displayName}
              imageUrl={auth.isCloudActive ? auth.profile?.avatarUrl : null}
              size={60}
              ring
              frame={decor.avatarFrame}
            />
            <View style={styles.flex}>
              <Text style={styles.previewEyebrow}>XEM TRƯỚC PHONG CÁCH CỦA BẠN</Text>
              <Text style={styles.previewName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.moodGlass}>
                <Text style={{ fontSize: 13 }}>{decor.moodEmoji}</Text>
                <Text style={styles.moodGlassText} numberOfLines={1}>
                  {decor.moodText}
                </Text>
              </View>
            </View>
            <MascotAvatar mascotId={decor.mascotId} size={56} mood="celebrating" />
          </View>

          {decor.heroStickerIds.length > 0 ? (
            <View style={styles.previewStickers}>
              {decor.heroStickerIds.map((sid) => (
                <StickerBadge
                  key={sid}
                  id={sid}
                  size={44}
                  showRibbon={false}
                  onPress={() => showToast('Sticker đã được ghim lên Trang Tổng quan! ✨', 'info')}
                />
              ))}
            </View>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* 1-Tap Aesthetic Combo Presets */}
      <FadeIn index={1}>
        <SectionHeader
          title={'Gói Phong Cách 1 Chạm ✨'}
          subtitle={'Đổi trọn bộ màu, họa tiết, hiệu ứng bay & linh vật ngay lập tức'}
        />
      </FadeIn>

      <FadeIn index={1}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.comboRow}>
          {AESTHETIC_COMBOS.map((combo) => (
            <Pressable
              key={combo.id}
              onPress={() => {
                hapticTap();
                decor.applyCombo(combo);
                showToast(`Đã áp dụng phong cách "${combo.name}"! 🎨`);
              }}
              style={({ pressed }) => [styles.comboWrap, pressed && styles.pressed]}>
              <LinearGradient
                colors={combo.preview}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.comboCard, Shadow.card]}>
                <View style={styles.comboHead}>
                  <View style={styles.comboBadge}>
                    <Text style={styles.comboBadgeText}>{combo.badge}</Text>
                  </View>
                  <MascotAvatar mascotId={combo.mascotId} size={34} animate={false} />
                </View>
                <Text style={styles.comboTitle}>{combo.name}</Text>
                <Text style={styles.comboDesc} numberOfLines={2}>
                  {combo.desc}
                </Text>
                <View style={styles.comboCta}>
                  <Text style={styles.comboCtaText}>Áp dụng ngay →</Text>
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>
      </FadeIn>

      {/* Brand Color & Light/Dark */}
      <FadeIn index={2}>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Chế độ & 10 Bảng màu</Text>

          <View style={styles.modeRow}>
            {THEME_MODES.map((m) => {
              const active = mode === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => {
                    hapticTap();
                    setMode(m.value);
                  }}
                  style={[
                    styles.modePill,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                  ]}>
                  <Ionicons
                    name={m.icon}
                    size={15}
                    color={active ? theme.accentText : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.modeText,
                      { color: active ? theme.accentText : theme.textSecondary },
                    ]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.paletteGrid}>
            {ACCENT_PRESET_LIST.map((preset) => {
              const selected = accentKey === preset.key;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    hapticTap();
                    setAccentKey(preset.key);
                    decor.completeQuest('decorate');
                    showToast(`Đã đổi bảng màu ${preset.label}`, 'info');
                  }}
                  style={({ pressed }) => [styles.paletteItem, pressed && styles.pressed]}>
                  <View
                    style={[
                      styles.orbRing,
                      { borderColor: selected ? preset.preview[0] : 'transparent' },
                    ]}>
                    <LinearGradient
                      colors={preset.preview}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.orb}>
                      {selected ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                    </LinearGradient>
                  </View>
                  <Text
                    style={[
                      styles.paletteName,
                      { color: selected ? theme.text : theme.textSecondary },
                    ]}
                    numberOfLines={1}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Wallpaper Patterns */}
      <FadeIn index={3}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Họa tiết nền toàn App</Text>
            <Badge label={'SVG sắc nét'} color={'accentText'} soft={'accentSoft'} />
          </View>
          <View style={styles.tileGrid}>
            {WALLPAPER_LIST.map((item) => {
              const active = decor.wallpaper === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    hapticTap();
                    decor.setWallpaper(item.key);
                    showToast(`Họa tiết nền: ${item.label}`, 'info');
                  }}
                  style={({ pressed }) => [
                    styles.choiceTile,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                  <Text
                    style={[
                      styles.tileTitle,
                      { color: active ? theme.accentText : theme.text },
                    ]}>
                    {item.label}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }} numberOfLines={1}>
                    {item.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Animated Ambient Effects */}
      <FadeIn index={4}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Hiệu ứng khí quyển bay</Text>
            <Badge label={'Chuyển động mượt'} color={'purple'} soft={'purpleSoft'} />
          </View>
          <View style={styles.tileGrid}>
            {AMBIENT_EFFECT_LIST.map((item) => {
              const active = decor.ambientEffect === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    hapticTap();
                    decor.setAmbientEffect(item.key);
                    showToast(`Hiệu ứng: ${item.label} ${item.emoji}`, 'info');
                  }}
                  style={({ pressed }) => [
                    styles.choiceTile,
                    {
                      backgroundColor: active ? theme.purpleSoft : theme.backgroundElement,
                      borderColor: active ? theme.purple : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                  <Text
                    style={[
                      styles.tileTitle,
                      { color: active ? theme.purple : theme.text },
                    ]}>
                    {item.label}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 10 }} numberOfLines={1}>
                    {item.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Card Visual Style */}
      <FadeIn index={5}>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Phong cách Thẻ giao diện</Text>
          <View style={styles.cardStyleList}>
            {CARD_STYLE_LIST.map((cs) => {
              const active = decor.cardStyle === cs.key;
              return (
                <Pressable
                  key={cs.key}
                  onPress={() => {
                    hapticTap();
                    decor.setCardStyle(cs.key);
                    showToast(`Kiểu thẻ: ${cs.label}`, 'info');
                  }}
                  style={({ pressed }) => [
                    styles.cardStyleRow,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name={cs.icon}
                    size={19}
                    color={active ? theme.accentText : theme.textSecondary}
                  />
                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.tileTitle,
                        { color: active ? theme.accentText : theme.text },
                      ]}>
                      {cs.label}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>{cs.desc}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Avatar Frame & Mood Status */}
      <FadeIn index={6}>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Khung Avatar & Tâm trạng</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.frameRow}>
            {AVATAR_FRAME_LIST.map((f) => {
              const active = decor.avatarFrame === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => {
                    hapticTap();
                    decor.setAvatarFrame(f.key);
                  }}
                  style={({ pressed }) => [
                    styles.frameItem,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Avatar name={displayName} size={40} frame={f.key} />
                  <Text
                    style={{
                      color: active ? theme.accentText : theme.textSecondary,
                      fontSize: 11,
                      fontWeight: '800',
                    }}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
            Chọn trạng thái hiển thị ở Trang chủ
          </Text>
          <View style={styles.moodWrap}>
            {MOOD_PRESETS.map((m) => {
              const active = decor.moodEmoji === m.emoji && decor.moodText === m.text;
              return (
                <Pressable
                  key={m.text}
                  onPress={() => {
                    hapticTap();
                    decor.setMood(m.emoji, m.text);
                    setCustomMood(m.text);
                  }}
                  style={[
                    styles.moodChip,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                  ]}>
                  <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
                  <Text
                    style={{
                      color: active ? theme.accentText : theme.textSecondary,
                      fontSize: 11,
                      fontWeight: '700',
                    }}>
                    {m.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.moodInputRow}>
            <View style={styles.flex}>
              <TextField
                placeholder={'Hoặc tự viết dòng trạng thái cá tính...'}
                value={customMood}
                onChangeText={setCustomMood}
              />
            </View>
            <Button
              label={'Lưu'}
              size={'sm'}
              onPress={() => {
                decor.setMood(decor.moodEmoji, customMood.trim() || 'Năng lượng tràn đầy');
                showToast('Đã cập nhật trạng thái tâm trạng! ✨');
              }}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Pin Die-Cut Stickers to Home Banner */}
      <FadeIn index={7}>
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Ghim Sticker lên Trang Chủ
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {`Đã chọn ${decor.heroStickerIds.length}/6 sticker · Chạm để bật/tắt`}
              </Text>
            </View>
            <Button
              label={'Mở xưởng'}
              size={'sm'}
              variant={'soft'}
              icon={'sparkles'}
              onPress={() => router.push('/creative' as never)}
            />
          </View>

          <View style={styles.stickerGrid}>
            {STICKER_CATALOG.filter((s) => decor.unlockedStickers.includes(s.id)).map((stk) => {
              const pinned = decor.heroStickerIds.includes(stk.id);
              return (
                <Pressable
                  key={stk.id}
                  onPress={() => {
                    hapticTap();
                    decor.toggleHeroSticker(stk.id);
                  }}
                  style={[
                    styles.stickerPick,
                    {
                      backgroundColor: pinned ? theme.accentSoft : theme.backgroundElement,
                      borderColor: pinned ? theme.accent : 'transparent',
                    },
                  ]}>
                  <StickerBadge id={stk.id} size={50} showRibbon={false} />
                  <Text
                    style={{
                      color: pinned ? theme.accentText : theme.textSecondary,
                      fontSize: 10,
                      fontWeight: '800',
                      textAlign: 'center',
                    }}
                    numberOfLines={1}>
                    {stk.label}
                  </Text>
                  {pinned ? (
                    <View style={[styles.pinCheck, { backgroundColor: theme.accent }]}>
                      <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Mascot & Tour Guide Settings */}
      <FadeIn index={8}>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Linh vật Trợ lý & Hướng dẫn viên
          </Text>
          <View style={styles.mascotGrid}>
            {MASCOT_LIST.map((m) => {
              const active = decor.mascotId === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    hapticTap();
                    decor.setMascotId(m.id);
                    showToast(`${m.name} đã sẵn sàng đồng hành cùng bạn! ${m.emoji}`, 'info');
                  }}
                  style={({ pressed }) => [
                    styles.mascotTile,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.backgroundElement,
                      borderColor: active ? theme.accent : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <MascotAvatar mascotId={m.id} size={54} animate={active} />
                  <Text style={[styles.tileTitle, { color: theme.text, marginTop: 4 }]}>
                    {m.name}
                  </Text>
                  <Text
                    style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center' }}
                    numberOfLines={2}>
                    {m.roleTitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.toggleActions}>
            <Button
              label={decor.assistantVisible ? 'Đang bật nút Trợ lý' : 'Đang ẩn nút Trợ lý'}
              variant={decor.assistantVisible ? 'soft' : 'ghost'}
              size={'sm'}
              icon={decor.assistantVisible ? 'eye' : 'eye-off'}
              style={styles.flex}
              onPress={() => {
                decor.setAssistantVisible(!decor.assistantVisible);
                showToast(
                  decor.assistantVisible ? 'Đã ẩn nút Trợ lý nổi' : 'Đã hiện nút Trợ lý nổi ✨',
                  'info',
                );
              }}
            />
            <Button
              label={'Chạy Tour 7 bước'}
              size={'sm'}
              icon={'compass'}
              style={styles.flex}
              onPress={() => decor.startTour()}
            />
          </View>

          <Button
            label={'Đặt lại trang trí mặc định'}
            variant={'ghost'}
            size={'sm'}
            icon={'refresh'}
            onPress={() => {
              decor.resetDecor();
              showToast('Đã khôi phục trang trí mặc định', 'info');
            }}
          />
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  previewHero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  bubbleA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bubbleB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -55,
    left: -25,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  previewEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  previewName: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', marginTop: 2 },
  moodGlass: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  moodGlassText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', maxWidth: 165 },
  previewStickers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  comboRow: { gap: Spacing.two + 2, paddingRight: Spacing.two },
  comboWrap: { width: 210 },
  comboCard: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    gap: 6,
    minHeight: 158,
  },
  comboHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  comboBadge: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  comboBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  comboTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 2 },
  comboDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 11, lineHeight: 16 },
  comboCta: {
    marginTop: 'auto',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  comboCtaText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  card: { gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  subLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  modeRow: { flexDirection: 'row', gap: Spacing.two },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  modeText: { fontSize: 12, fontWeight: '800' },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  paletteItem: { width: '18%', minWidth: 62, flexGrow: 1, alignItems: 'center', gap: 5 },
  orbRing: { padding: 3, borderRadius: 999, borderWidth: 2.5 },
  orb: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  paletteName: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choiceTile: {
    width: '31%',
    minWidth: 96,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    gap: 3,
  },
  tileTitle: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  cardStyleList: { gap: Spacing.two },
  cardStyleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  frameRow: { gap: Spacing.two, paddingVertical: 6, paddingRight: Spacing.two },
  frameItem: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    minWidth: 82,
  },
  moodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  moodInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stickerPick: {
    width: '23%',
    minWidth: 74,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    gap: 5,
  },
  pinCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  mascotTile: {
    width: '47.5%',
    flexGrow: 1,
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    gap: 3,
  },
  toggleActions: { flexDirection: 'row', gap: Spacing.two },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
