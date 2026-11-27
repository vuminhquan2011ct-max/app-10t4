import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { formatDate, relativeDay } from '@/lib/date';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

export default function PollsScreen() {
  const {
    classInfo,
    polls,
    canEditClass,
    voterKey,
    addPoll,
    votePoll,
    togglePollClosed,
    removePoll,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const [composerOpen, setComposerOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);

  const handleCreate = () => {
    const opts = optionsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      showToast('Hãy nhập câu hỏi và ít nhất 2 lựa chọn (mỗi dòng 1 lựa chọn)', 'warning');
      return;
    }
    addPoll({ question, description, options: opts, deadline });
    setQuestion('');
    setDescription('');
    setOptionsText('');
    setDeadline(null);
    setComposerOpen(false);
    showToast('Đã tạo bình chọn mới cho cả lớp!');
  };

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      await votePoll(pollId, optionId);
      decor.recordMissionProgress('vote_poll', 1);
      showToast('Đã ghi nhận lá phiếu của bạn!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể gửi phiếu', 'danger');
    }
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Bình chọn lớp ' + classInfo.name}
        subtitle={'Lấy ý kiến tập thể nhanh chóng, công khai & minh bạch'}
        rightIcon={canEditClass ? (composerOpen ? 'close' : 'add') : undefined}
        rightLabel={canEditClass ? (composerOpen ? 'Đóng' : 'Tạo mới') : undefined}
        onRightPress={canEditClass ? () => setComposerOpen((v) => !v) : undefined}
      />

      {composerOpen && canEditClass ? (
        <FadeIn index={0}>
          <Card style={styles.composer}>
            <Text style={[styles.compTitle, { color: theme.text }]}>Tạo cuộc bình chọn mới</Text>
            <TextField
              label={'Câu hỏi bình chọn'}
              placeholder={'Ví dụ: Chọn màu áo đồng phục lớp 10T4?'}
              value={question}
              onChangeText={setQuestion}
            />
            <TextField
              label={'Mô tả thêm (tuỳ chọn)'}
              placeholder={'Ghi chú ngắn cho các bạn...'}
              value={description}
              onChangeText={setDescription}
            />
            <TextField
              label={'Các lựa chọn (mỗi dòng 1 phương án)'}
              placeholder={'Xanh Navy cá tính\nCam FPT nổi bật\nTrắng kem tối giản'}
              value={optionsText}
              onChangeText={setOptionsText}
              multiline
              style={styles.optArea}
            />
            <DatePickerField
              label={'Hạn đóng bình chọn (tuỳ chọn)'}
              value={deadline}
              onChange={setDeadline}
              clearable
              onClear={() => setDeadline(null)}
            />
            <Button label={'Đăng bình chọn'} icon={'bar-chart'} onPress={handleCreate} />
          </Card>
        </FadeIn>
      ) : null}

      {polls.length === 0 ? (
        <EmptyState
          icon={'bar-chart-outline'}
          title={'Chưa có bình chọn nào'}
          message={'Giáo viên hoặc ban cán sự có thể tạo khảo sát để cả lớp biểu quyết.'}
        />
      ) : (
        polls.map((poll, idx) => {
          const allVotes = Object.values(poll.votes ?? {});
          const totalVotes = allVotes.length;
          const myVote = poll.votes?.[voterKey] ?? null;

          return (
            <FadeIn key={poll.id} index={Math.min(idx + 1, 8)}>
              <Card style={styles.pollCard}>
                <View style={styles.topBadges}>
                  <Badge
                    label={poll.closed ? 'Đã kết thúc' : 'Đang mở phiếu'}
                    color={poll.closed ? 'textMuted' : 'success'}
                    soft={poll.closed ? 'backgroundElement' : 'successSoft'}
                    icon={poll.closed ? 'lock-closed' : 'radio-button-on'}
                  />
                  <Badge
                    label={`${totalVotes} phiếu`}
                    color={'accentText'}
                    soft={'accentSoft'}
                    icon={'people-outline'}
                  />
                  {poll.deadline ? (
                    <Badge
                      label={relativeDay(poll.deadline) + ' · ' + formatDate(poll.deadline)}
                      color={'purple'}
                      soft={'purpleSoft'}
                      icon={'calendar-outline'}
                    />
                  ) : null}
                </View>

                <Text style={[styles.question, { color: theme.text }]}>{poll.question}</Text>
                {poll.description ? (
                  <Text style={[styles.desc, { color: theme.textSecondary }]}>
                    {poll.description}
                  </Text>
                ) : null}

                <View style={styles.optList}>
                  {poll.options.map((opt) => {
                    const count = allVotes.filter((v) => v === opt.id).length;
                    const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                    const picked = myVote === opt.id;

                    return (
                      <Pressable
                        key={opt.id}
                        disabled={poll.closed}
                        onPress={() => handleVote(poll.id, opt.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked, disabled: poll.closed }}
                        accessibilityLabel={`${opt.label}, ${pct}% (${count} phiếu)`}
                        style={({ pressed }) => [
                          styles.optBox,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: picked ? theme.accent : theme.border,
                          },
                          pressed && !poll.closed && styles.pressed,
                        ]}>
                        {pct > 0 ? (
                          <LinearGradient
                            colors={picked ? gradient : [theme.accentSoft, theme.accentSoft]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[
                              styles.optFill,
                              {
                                width: `${pct}%` as `${number}%`,
                                opacity: picked ? 0.24 : 0.75,
                              },
                            ]}
                          />
                        ) : null}
                        <View style={styles.optContent}>
                          <Ionicons
                            name={picked ? 'checkmark-circle' : 'ellipse-outline'}
                            size={19}
                            color={picked ? theme.accent : theme.textMuted}
                          />
                          <Text style={[styles.optLabel, { color: theme.text }]}>{opt.label}</Text>
                          <Text
                            style={[
                              styles.optPct,
                              { color: picked ? theme.accentText : theme.textSecondary },
                            ]}>
                            {`${pct}% (${count})`}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.footer, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>
                    {'Tạo bởi ' + poll.author}
                  </Text>
                  {canEditClass ? (
                    <View style={styles.footerBtns}>
                      <Pressable
                        onPress={() => {
                          togglePollClosed(poll.id);
                          showToast(poll.closed ? 'Đã mở lại bình chọn' : 'Đã chốt bình chọn', 'info');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={poll.closed ? 'Mở lại bình chọn' : 'Chốt bình chọn'}
                        style={[styles.miniBtn, { backgroundColor: theme.backgroundElement }]}>
                        <Ionicons
                          name={poll.closed ? 'lock-open-outline' : 'lock-closed-outline'}
                          size={14}
                          color={theme.textSecondary}
                        />
                        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>
                          {poll.closed ? 'Mở lại' : 'Chốt'}
                        </Text>
                      </Pressable>
                      <ConfirmActionButton
                        onConfirm={() => {
                          removePoll(poll.id);
                          showToast('Đã xoá bình chọn', 'warning');
                        }}
                        accessibilityLabel={`Xoá bình chọn ${poll.question}`}
                        confirmAccessibilityLabel={`Nhấn lại để xoá bình chọn ${poll.question}`}
                      />
                    </View>
                  ) : null}
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
  composer: { gap: Spacing.three },
  compTitle: { fontSize: 16, fontWeight: '900' },
  optArea: { minHeight: 96, textAlignVertical: 'top' },
  pollCard: { gap: Spacing.two + 2 },
  topBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  question: { fontSize: 16, fontWeight: '900', lineHeight: 22 },
  desc: { fontSize: 13, lineHeight: 19 },
  optList: { gap: Spacing.two },
  optBox: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  optFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  optContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  optLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  optPct: { fontSize: 12, fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
