/**
 * Study Vault & Exam Prep Resources Hub (Kho Tài liệu & Đề cương Lớp 10T4).
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import {
  RESOURCE_SUBJECT_PRESETS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LIST,
} from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { shareOrCopyText } from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { ResourceType } from '@/types/models';

export default function ResourcesScreen() {
  const {
    classInfo,
    resources,
    savedResourceIds,
    canEditClass,
    toggleResourceSaved,
    addResource,
    togglePinResource,
    removeResource,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ResourceType>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  // Composer fields
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(RESOURCE_SUBJECT_PRESETS[0]);
  const [type, setType] = useState<ResourceType>('outline');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [pinned, setPinned] = useState(false);

  const savedCount = useMemo(
    () => resources.filter((r) => Boolean(savedResourceIds[r.id])).length,
    [resources, savedResourceIds],
  );
  const pinnedCount = useMemo(() => resources.filter((r) => r.pinned).length, [resources]);

  const subjects = useMemo(() => {
    const set = new Set<string>(RESOURCE_SUBJECT_PRESETS);
    for (const r of resources) {
      if (r.subject.trim()) set.add(r.subject.trim());
    }
    return ['all', 'saved', ...Array.from(set)];
  }, [resources]);

  const visible = useMemo(() => {
    const q = stripVietnamese(query);
    return resources.filter((item) => {
      const matchSub =
        subjectFilter === 'all'
          ? true
          : subjectFilter === 'saved'
            ? Boolean(savedResourceIds[item.id])
            : item.subject.trim() === subjectFilter;
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      const matchQ =
        !q ||
        stripVietnamese(`${item.title} ${item.subject} ${item.description ?? ''} ${item.author}`).includes(
          q,
        );
      return matchSub && matchType && matchQ;
    });
  }, [resources, subjectFilter, typeFilter, query, savedResourceIds]);

  const openUrl = (rawUrl: string) => {
    const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    Linking.openURL(target).catch(() => showToast('Không thể mở liên kết này', 'warning'));
  };

  const handlePublish = async () => {
    if (!title.trim() || !url.trim()) {
      showToast('Hãy nhập tiêu đề và đường link tài liệu', 'warning');
      return;
    }
    try {
      await addResource({
        title,
        subject,
        type,
        url,
        description,
        pinned: canEditClass ? pinned : false,
      });
      decor.recordMissionProgress('save_resource', 2);
      setTitle('');
      setUrl('');
      setDescription('');
      setPinned(false);
      setComposerOpen(false);
      showToast('Đã chia sẻ tài liệu vào Kho học tập 10T4! 📚');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể lưu tài liệu', 'danger');
    }
  };

  return (
    <Screen withTabBar={false} onRefresh={pullNow}>
      <PageHeader
        title={'Kho Tài liệu & Đề cương'}
        subtitle={`Thư viện học tập chung của lớp ${classInfo.name}`}
        rightIcon={composerOpen ? 'close' : 'add'}
        rightLabel={composerOpen ? 'Đóng' : 'Đóng góp'}
        onRightPress={() => setComposerOpen((v) => !v)}
      />

      {/* Vault Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.bubble} />
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>THƯ VIỆN SỐ 10T4</Text>
            <Text style={styles.heroTitle}>{`${resources.length} tài liệu học tập`}</Text>
            <Text style={styles.heroSub}>
              {`${pinnedCount} đề cương ghim quan trọng · ${savedCount} mục bạn đã lưu ⭐`}
            </Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="library" size={28} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Composer */}
      {composerOpen ? (
        <FadeIn index={0}>
          <Card style={styles.composer}>
            <Text style={[styles.compTitle, { color: theme.text }]}>Chia sẻ tài liệu mới 📚</Text>
            <TextField
              label={'Tiêu đề tài liệu'}
              placeholder={'Ví dụ: Đề cương ôn tập Giữa kỳ 1 môn Hóa'}
              value={title}
              onChangeText={setTitle}
            />
            <OptionPicker
              label={'Môn học'}
              layout={'row'}
              options={RESOURCE_SUBJECT_PRESETS.map((s) => ({ value: s, label: s }))}
              value={subject}
              onChange={setSubject}
            />
            <OptionPicker
              label={'Loại tài liệu'}
              columns={3}
              options={RESOURCE_TYPE_LIST.map((t) => ({
                value: t,
                label: RESOURCE_TYPES[t].label,
                icon: RESOURCE_TYPES[t].icon,
              }))}
              value={type}
              onChange={setType}
            />
            <TextField
              label={'Đường link (Google Drive, PDF, YouTube...)'}
              icon={'link-outline'}
              placeholder={'https://drive.google.com/...'}
              value={url}
              onChangeText={setUrl}
              autoCapitalize={'none'}
            />
            <TextField
              label={'Mô tả ngắn (tuỳ chọn)'}
              placeholder={'Nội dung chính, chương nào, lưu ý khi ôn tập...'}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            {canEditClass ? (
              <Pressable
                onPress={() => setPinned((v) => !v)}
                style={[styles.pinRow, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={18} color={theme.accent} />
                <Text style={[styles.pinText, { color: theme.text }]}>Ghim lên đầu kho tài liệu</Text>
                <Ionicons
                  name={pinned ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={pinned ? theme.accent : theme.textMuted}
                />
              </Pressable>
            ) : null}
            <Button label={'Đăng tài liệu lên kho lớp'} icon={'cloud-upload'} onPress={handlePublish} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Search */}
      <FadeIn index={1}>
        <TextField
          icon={'search'}
          placeholder={'Tìm đề cương, tên môn, slide...'}
          value={query}
          onChangeText={setQuery}
        />
      </FadeIn>

      {/* Subject filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {subjects.map((sub) => (
          <Chip
            key={sub}
            label={
              sub === 'all' ? 'Tất cả môn' : sub === 'saved' ? `Đã lưu (${savedCount})` : sub
            }
            icon={sub === 'saved' ? 'star' : undefined}
            selected={subjectFilter === sub}
            onPress={() => setSubjectFilter(sub)}
          />
        ))}
      </ScrollView>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={'Mọi định dạng'} selected={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
        {RESOURCE_TYPE_LIST.map((t) => (
          <Chip
            key={t}
            label={RESOURCE_TYPES[t].label}
            icon={RESOURCE_TYPES[t].icon}
            selected={typeFilter === t}
            onPress={() => setTypeFilter(t)}
          />
        ))}
      </ScrollView>

      {/* Resource List */}
      {visible.length === 0 ? (
        <EmptyState
          icon={'folder-open-outline'}
          title={'Chưa có tài liệu phù hợp'}
          message={'Thử bỏ bộ lọc hoặc bấm "Đóng góp" để chia sẻ đề cương hay cho cả lớp.'}
        />
      ) : (
        visible.map((item, idx) => {
          const meta = RESOURCE_TYPES[item.type] ?? RESOURCE_TYPES.link;
          const saved = Boolean(savedResourceIds[item.id]);

          return (
            <FadeIn key={item.id} index={Math.min(idx + 2, 8)}>
              <Card
                style={[
                  styles.resCard,
                  item.pinned && { borderColor: theme.accent, borderWidth: 1.5 },
                ]}>
                <View style={styles.resHead}>
                  <View style={[styles.typeIcon, { backgroundColor: theme[meta.soft] }]}>
                    <Ionicons name={meta.icon} size={20} color={theme[meta.color]} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.resTitle, { color: theme.text }]}>{item.title}</Text>
                    <View style={styles.badgeRow}>
                      <Badge label={item.subject} color={'purple'} soft={'purpleSoft'} />
                      <Badge label={meta.label} color={meta.color} soft={meta.soft} />
                      {item.pinned ? (
                        <Badge label={'Ghim'} color={'gold'} soft={'goldSoft'} icon={'pin'} />
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      toggleResourceSaved(item.id);
                      if (!saved) decor.recordMissionProgress('save_resource', 1);
                      showToast(saved ? 'Đã bỏ lưu tài liệu' : 'Đã lưu vào mục Yêu thích ⭐', 'info');
                    }}
                    hitSlop={8}>
                    <Ionicons
                      name={saved ? 'star' : 'star-outline'}
                      size={22}
                      color={saved ? theme.gold : theme.textMuted}
                    />
                  </Pressable>
                </View>

                {item.description ? (
                  <Text style={[styles.resDesc, { color: theme.textSecondary }]}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={[styles.resFooter, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 11, flex: 1 }} numberOfLines={1}>
                    {'Chia sẻ bởi ' + item.author}
                  </Text>
                  <View style={styles.footerBtns}>
                    <Pressable
                      onPress={async () => {
                        const res = await shareOrCopyText(item.url, item.title);
                        showToast(res === 'copied' ? 'Đã sao chép đường link!' : 'Đã mở chia sẻ!');
                      }}
                      style={[styles.miniBtn, { backgroundColor: theme.backgroundElement }]}>
                      <Ionicons name="copy-outline" size={14} color={theme.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => openUrl(item.url)}
                      style={[styles.openBtn, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name="open-outline" size={14} color={theme.accentText} />
                      <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
                        Mở ngay
                      </Text>
                    </Pressable>
                    {canEditClass ? (
                      <>
                        <Pressable
                          onPress={() => togglePinResource(item.id)}
                          style={[styles.miniBtn, { backgroundColor: theme.backgroundElement }]}>
                          <Ionicons
                            name={item.pinned ? 'pin' : 'pin-outline'}
                            size={14}
                            color={item.pinned ? theme.accent : theme.textSecondary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            removeResource(item.id);
                            showToast('Đã xoá tài liệu', 'warning');
                          }}
                          style={[styles.miniBtn, { backgroundColor: theme.dangerSoft }]}>
                          <Ionicons name="trash-outline" size={14} color={theme.danger} />
                        </Pressable>
                      </>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -70,
    right: -40,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 3 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: { gap: Spacing.two + 2 },
  compTitle: { fontSize: 16, fontWeight: '900' },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  pinText: { flex: 1, fontSize: 13, fontWeight: '700' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  resCard: { gap: Spacing.two + 2 },
  resHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  typeIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  resTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  resDesc: { fontSize: 13, lineHeight: 19 },
  resFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
});
