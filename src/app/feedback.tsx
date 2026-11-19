import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';
import type { FeedbackCategory } from '@/types/models';

export default function FeedbackScreen() {
  const {
    classInfo,
    isTeacher,
    feedback,
    sendFeedback,
    replyFeedback,
    removeFeedback,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [sending, setSending] = useState(false);

  // Teacher reply box
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const handleSend = async () => {
    if (!content.trim()) {
      showToast('Hãy nhập nội dung góp ý hoặc lời nhắn gửi thầy/cô', 'warning');
      return;
    }
    setSending(true);
    try {
      await sendFeedback({ category, content, anonymous });
      setContent('');
      showToast('Đã gửi góp ý bảo mật tới GVCN!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gửi thất bại', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleReply = async (id: string) => {
    try {
      await replyFeedback(id, replyDraft, true);
      setReplyingId(null);
      setReplyDraft('');
      showToast('Đã gửi phản hồi!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể lưu phản hồi', 'danger');
    }
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Hộp thư Góp ý Bảo mật'}
        subtitle={'Kênh nhắn riêng tư trực tiếp tới GVCN ' + classInfo.teacherName}
      />

      {/* Privacy Assurance Banner */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.25 }]}>
          <View style={styles.lockCircle}>
            <Ionicons name="lock-closed" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>Riêng tư tuyệt đối</Text>
            <Text style={styles.heroSub}>
              {isTeacher
                ? 'Chỉ Giáo viên chủ nhiệm mới đọc được toàn bộ góp ý của học sinh.'
                : 'Các bạn khác trong lớp KHÔNG đọc được tin của bạn. Bạn có thể chọn gửi ẩn danh.'}
            </Text>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Compose Box */}
      <FadeIn index={1}>
        <Card style={styles.composer}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Viết góp ý / đề xuất mới</Text>
          <OptionPicker
            label={'Chủ đề'}
            columns={2}
            options={FEEDBACK_CATEGORY_LIST.map((c) => ({
              value: c,
              label: FEEDBACK_CATEGORIES[c].label,
              icon: FEEDBACK_CATEGORIES[c].icon,
            }))}
            value={category}
            onChange={setCategory}
          />
          <TextField
            label={'Nội dung nhắn gửi'}
            placeholder={'Chia sẻ ý kiến xây dựng lớp, khó khăn học tập hoặc đề xuất...'}
            value={content}
            onChangeText={setContent}
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
            <View style={styles.flex}>
              <Text style={[styles.anonTitle, { color: theme.text }]}>
                {anonymous ? 'Gửi ẩn danh (Không hiện tên)' : 'Gửi kèm tên của bạn'}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                Chạm để đổi chế độ hiển thị tên với giáo viên
              </Text>
            </View>
            <Ionicons
              name={anonymous ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={anonymous ? theme.purple : theme.textMuted}
            />
          </Pressable>
          <Button
            label={sending ? 'Đang gửi...' : 'Gửi bảo mật tới GVCN'}
            icon={'send'}
            disabled={sending}
            onPress={handleSend}
          />
        </Card>
      </FadeIn>

      {/* Inbox List */}
      <SectionHeader
        title={isTeacher ? 'Hộp thư đến của lớp' : 'Tin nhắn bạn đã gửi'}
        subtitle={
          isTeacher
            ? `${feedback.length} tin · ${feedback.filter((f) => !f.resolved).length} chưa xử lý`
            : `${feedback.length} tin riêng của bạn`
        }
      />

      {feedback.length === 0 ? (
        <EmptyState
          icon={'mail-open-outline'}
          title={'Hộp thư đang trống'}
          message={
            isTeacher
              ? 'Khi học sinh gửi góp ý hoặc câu hỏi riêng, tin nhắn sẽ xuất hiện tại đây.'
              : 'Bạn chưa gửi góp ý nào. Mọi tin bạn gửi đều được bảo mật.'
          }
        />
      ) : (
        feedback.map((item, idx) => {
          const cat = FEEDBACK_CATEGORIES[item.category];
          const openReply = replyingId === item.id;

          return (
            <FadeIn key={item.id} index={Math.min(idx + 2, 8)}>
              <Card style={styles.msgCard}>
                <View style={styles.msgTop}>
                  <Badge label={cat.label} color={cat.color} soft={cat.soft} icon={cat.icon} />
                  <Badge
                    label={item.anonymous ? 'Ẩn danh' : item.authorName}
                    color={'textSecondary'}
                    soft={'backgroundElement'}
                    icon={item.anonymous ? 'glasses-outline' : 'person-outline'}
                  />
                  {item.resolved ? (
                    <Badge
                      label={'Đã phản hồi'}
                      color={'success'}
                      soft={'successSoft'}
                      icon={'checkmark-circle'}
                    />
                  ) : null}
                </View>

                <Text style={[styles.msgBody, { color: theme.text }]}>{item.content}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                </Text>

                {item.reply ? (
                  <View style={[styles.replyBox, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.replyLabel, { color: theme.accentText }]}>
                      {'Phản hồi của GVCN ' + classInfo.teacherName + ':'}
                    </Text>
                    <Text style={[styles.replyText, { color: theme.text }]}>{item.reply}</Text>
                  </View>
                ) : null}

                {isTeacher ? (
                  openReply ? (
                    <View style={styles.replyForm}>
                      <TextField
                        placeholder={'Nhập lời phản hồi tới học sinh...'}
                        value={replyDraft}
                        onChangeText={setReplyDraft}
                        multiline
                      />
                      <View style={styles.rowBtns}>
                        <Button
                          label={'Huỷ'}
                          variant={'ghost'}
                          size={'sm'}
                          onPress={() => setReplyingId(null)}
                        />
                        <Button
                          label={'Gửi phản hồi'}
                          size={'sm'}
                          icon={'send'}
                          style={styles.flex}
                          onPress={() => handleReply(item.id)}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.rowBtns}>
                      <Button
                        label={item.reply ? 'Sửa phản hồi' : 'Phản hồi'}
                        size={'sm'}
                        variant={'soft'}
                        icon={'chatbubble-outline'}
                        style={styles.flex}
                        onPress={() => {
                          setReplyingId(item.id);
                          setReplyDraft(item.reply ?? '');
                        }}
                      />
                      <Button
                        label={'Xoá'}
                        size={'sm'}
                        variant={'danger'}
                        icon={'trash-outline'}
                        onPress={async () => {
                          await removeFeedback(item.id);
                          showToast('Đã xoá góp ý', 'warning');
                        }}
                      />
                    </View>
                  )
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
  flex: { flex: 1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 18, marginTop: 2 },
  composer: { gap: Spacing.three },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  anonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  anonTitle: { fontSize: 13, fontWeight: '800' },
  msgCard: { gap: Spacing.two + 2 },
  msgTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  msgBody: { fontSize: 14, lineHeight: 21 },
  replyBox: { padding: Spacing.three, borderRadius: Radius.md, gap: 4 },
  replyLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  replyText: { fontSize: 13, lineHeight: 19 },
  replyForm: { gap: Spacing.two },
  rowBtns: { flexDirection: 'row', gap: Spacing.two },
});
