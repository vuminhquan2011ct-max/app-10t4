import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { TASK_PRIORITIES, TASK_PRIORITY_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { daysSince, formatDate, relativeDay, shiftIsoDate, todayIso } from '@/lib/date';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { TaskPriority } from '@/types/models';

type TaskFilter = 'all' | 'todo' | 'done';

export default function TasksScreen() {
  const {
    classInfo,
    tasks,
    doneTaskIds,
    canEditClass,
    toggleTaskDone,
    addTask,
    removeTask,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const decor = useDecor();
  const { showToast } = useToast();

  const [filter, setFilter] = useState<TaskFilter>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Toán học');
  const [dueDate, setDueDate] = useState(shiftIsoDate(todayIso(), 3));
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [note, setNote] = useState('');

  const doneCount = useMemo(
    () => tasks.filter((t) => Boolean(doneTaskIds[t.id])).length,
    [tasks, doneTaskIds],
  );
  const progress = tasks.length === 0 ? 0 : doneCount / tasks.length;

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      const done = Boolean(doneTaskIds[t.id]);
      if (filter === 'todo') return !done;
      if (filter === 'done') return done;
      return true;
    });
  }, [tasks, doneTaskIds, filter]);

  const handleAdd = () => {
    if (!title.trim()) {
      showToast('Hãy nhập nội dung bài tập / nhiệm vụ', 'warning');
      return;
    }
    addTask({ title, subject, dueDate, priority, note });
    setTitle('');
    setNote('');
    setComposerOpen(false);
    showToast('Đã giao nhiệm vụ mới cho cả lớp!');
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Nhiệm vụ & Deadline'}
        subtitle={'Bài tập, dự án & lịch nộp bài lớp ' + classInfo.name}
        rightIcon={canEditClass ? (composerOpen ? 'close' : 'add') : undefined}
        rightLabel={canEditClass ? (composerOpen ? 'Đóng' : 'Giao việc') : undefined}
        onRightPress={canEditClass ? () => setComposerOpen((v) => !v) : undefined}
      />

      {/* Personal Completion Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.25 }]}>
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>TIẾN ĐỘ CÁ NHÂN CỦA BẠN</Text>
            <Text style={styles.heroTitle}>{`${doneCount} / ${tasks.length} hoàn thành`}</Text>
            <Text style={styles.heroSub}>
              Đánh dấu tiến độ hoàn thành được lưu riêng trên máy của bạn.
            </Text>
          </View>
          <ProgressRing
            progress={progress}
            size={84}
            color={'#FFFFFF'}
            trackColor={'rgba(255,255,255,0.25)'}
            caption={'xong'}
            textColor={'#FFFFFF'}
            captionColor={'rgba(255,255,255,0.85)'}
          />
        </LinearGradient>
      </FadeIn>

      {/* Composer */}
      {composerOpen && canEditClass ? (
        <FadeIn index={1}>
          <Card style={styles.composer}>
            <Text style={[styles.compTitle, { color: theme.text }]}>Thêm bài tập / deadline mới</Text>
            <TextField
              label={'Tên nhiệm vụ'}
              placeholder={'Ví dụ: Nộp bài thuyết trình nhóm Lịch sử'}
              value={title}
              onChangeText={setTitle}
            />
            <TextField
              label={'Môn học / Chủ đề'}
              placeholder={'Toán học, Ngữ văn, Tiếng Anh, Hoạt động lớp...'}
              value={subject}
              onChangeText={setSubject}
            />
            <OptionPicker
              label={'Mức độ ưu tiên'}
              columns={3}
              options={TASK_PRIORITY_LIST.map((p) => ({
                value: p,
                label: TASK_PRIORITIES[p].label,
                icon: TASK_PRIORITIES[p].icon,
              }))}
              value={priority}
              onChange={setPriority}
            />
            <DatePickerField label={'Hạn nộp / thực hiện'} value={dueDate} onChange={setDueDate} />
            <TextField
              label={'Hướng dẫn / Ghi chú (tuỳ chọn)'}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <Button label={'Đăng lên bảng nhiệm vụ'} icon={'checkmark-circle'} onPress={handleAdd} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={`Tất cả (${tasks.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip
          label={`Cần làm (${tasks.length - doneCount})`}
          selected={filter === 'todo'}
          onPress={() => setFilter('todo')}
        />
        <Chip label={`Đã xong (${doneCount})`} selected={filter === 'done'} onPress={() => setFilter('done')} />
      </ScrollView>

      {visible.length === 0 ? (
        <EmptyState
          icon={'checkmark-done-circle-outline'}
          title={filter === 'todo' ? 'Tuyệt vời! Bạn đã hoàn thành hết!' : 'Chưa có nhiệm vụ nào'}
          message={'Danh sách bài tập và hạn nộp của lớp sẽ hiển thị tại đây.'}
        />
      ) : (
        visible.map((task, idx) => {
          const done = Boolean(doneTaskIds[task.id]);
          const prio = TASK_PRIORITIES[task.priority];
          const diff = daysSince(task.dueDate);
          const overdue = !done && diff !== null && diff > 0;

          return (
            <FadeIn key={task.id} index={Math.min(idx + 1, 8)}>
              <Card
                style={[
                  styles.taskCard,
                  done && { opacity: 0.72 },
                  overdue && { borderColor: theme.danger, borderWidth: 1.5 },
                ]}>
                <View style={styles.taskTop}>
                  <Pressable
                    onPress={() => {
                      toggleTaskDone(task.id);
                      if (!done) decor.recordMissionProgress('complete_task', 1);
                      showToast(done ? 'Đã chuyển về Cần làm' : 'Đã đánh dấu hoàn thành! 🎉', done ? 'info' : 'success');
                    }}
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: done ? theme.success : 'transparent',
                        borderColor: done ? theme.success : theme.textMuted,
                      },
                    ]}>
                    {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </Pressable>

                  <View style={styles.flex}>
                    <Text
                      style={[
                        styles.taskTitle,
                        { color: theme.text },
                        done && styles.strike,
                      ]}>
                      {task.title}
                    </Text>
                    <View style={styles.badgeRow}>
                      <Badge label={task.subject} color={'purple'} soft={'purpleSoft'} />
                      <Badge label={prio.label} color={prio.color} soft={prio.soft} icon={prio.icon} />
                      <Badge
                        label={
                          overdue
                            ? `Quá hạn (${formatDate(task.dueDate)})`
                            : `${relativeDay(task.dueDate)} · ${formatDate(task.dueDate)}`
                        }
                        color={overdue ? 'danger' : 'accentText'}
                        soft={overdue ? 'dangerSoft' : 'accentSoft'}
                        icon={'calendar-outline'}
                      />
                    </View>
                  </View>

                  {canEditClass ? (
                    <Pressable
                      onPress={() => {
                        removeTask(task.id);
                        showToast('Đã xoá nhiệm vụ', 'warning');
                      }}
                      hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                {task.note ? (
                  <Text style={[styles.note, { color: theme.textSecondary }]}>{task.note}</Text>
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
  heroEyebrow: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 4, lineHeight: 17 },
  composer: { gap: Spacing.three },
  compTitle: { fontSize: 16, fontWeight: '900' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  taskCard: { gap: Spacing.two },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  taskTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  strike: { textDecorationLine: 'line-through' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 19, paddingLeft: 36 },
});
