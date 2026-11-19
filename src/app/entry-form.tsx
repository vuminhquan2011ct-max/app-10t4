import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Button } from '@/components/ui/button';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LIST,
  ENTRY_KINDS,
  ENTRY_KIND_LIST,
  ENTRY_LEVELS,
  ENTRY_LEVEL_LIST,
} from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { ENTRY_TEMPLATES, type EntryTemplate } from '@/data/seed-extras';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { suggestedPoints } from '@/lib/stats';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';
import type { EntryCategory, EntryKind, EntryLevel } from '@/types/models';

export default function EntryFormScreen() {
  const { id, studentId } = useLocalSearchParams<{ id?: string; studentId?: string }>();
  const {
    getEntry,
    addEntry,
    updateEntry,
    removeEntry,
    setEntryStatus,
    students,
    role,
    canEditClass,
    currentStudent,
  } = useClassStore();
  const theme = useTheme();
  const decor = useDecor();
  const { showToast } = useToast();
  const existing = id ? getEntry(id) : undefined;
  const isStudent = !canEditClass;
  const readOnly = Boolean(
    existing && isStudent && (existing.status !== 'pending' || existing.studentId !== currentStudent?.id),
  );

  const [owner, setOwner] = useState<string | null>(
    existing?.studentId ?? (isStudent ? (currentStudent?.id ?? null) : (studentId ?? students[0]?.id ?? null)),
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<EntryKind>(existing?.kind ?? 'achievement');
  const [category, setCategory] = useState<EntryCategory>(existing?.category ?? 'study');
  const [level, setLevel] = useState<EntryLevel>(existing?.level ?? 'school');
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [points, setPoints] = useState(String(existing?.points ?? suggestedPoints('school')));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [proofUrl, setProofUrl] = useState(existing?.proofUrl ?? '');
  const [reviewNote, setReviewNote] = useState(existing?.reviewNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changeLevel = (next: EntryLevel) => {
    setLevel(next);
    if (!existing) setPoints(String(suggestedPoints(next)));
  };

  const applyTemplate = (tpl: EntryTemplate) => {
    setTitle(tpl.title);
    setKind(tpl.kind);
    setCategory(tpl.category);
    setLevel(tpl.level);
    setPoints(String(tpl.points));
    setError(null);
  };

  const save = async () => {
    if (readOnly) {
      showToast('Mục này đã khoá chỉnh sửa', 'info');
      return;
    }
    if (!owner) {
      setError(
        isStudent
          ? 'Tài khoản của bạn chưa được GVCN liên kết với hồ sơ học sinh trong danh sách lớp.'
          : 'Hãy chọn học sinh',
      );
      return;
    }
    if (!title.trim()) {
      setError('Hãy nhập tên thành tích / hoạt động');
      return;
    }
    const numeric = Number.parseInt(points, 10);
    const data = {
      studentId: owner,
      title,
      kind,
      category,
      level,
      date,
      description,
      proofUrl,
      points: Number.isFinite(numeric) ? numeric : 0,
    };
    try {
      if (existing) {
        updateEntry(existing.id, data);
        if (canEditClass && reviewNote !== (existing.reviewNote ?? '')) {
          setEntryStatus(existing.id, existing.status, reviewNote.trim() || null);
        }
        showToast('Đã cập nhật thành tích!');
      } else {
        await addEntry({ ...data, submittedBy: role });
        decor.recordMissionProgress('submit_entry', 1);
        showToast(isStudent ? 'Đã gửi lên chờ GVCN duyệt!' : 'Đã ghi thành tích mới!');
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu thành tích');
    }
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      showToast('Bấm lần nữa để xác nhận xóa mục này', 'warning');
      return;
    }
    removeEntry(existing.id);
    showToast('Đã xóa mục thành tích', 'warning');
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={readOnly ? 'Chi tiết mục' : existing ? 'Sửa mục' : 'Ghi thành tích'}
        subtitle={
          readOnly
            ? 'Chỉ xem — mục đã được xét duyệt'
            : isStudent
              ? 'Sẽ chờ giáo viên duyệt'
              : 'Giáo viên ghi trực tiếp'
        }
        actionLabel={readOnly ? undefined : 'Lưu'}
        onAction={readOnly ? undefined : save}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {/* Quick Presets */}
          {!existing ? (
            <View style={styles.presetWrap}>
              <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>
                Chọn nhanh mẫu gợi ý
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}>
                {ENTRY_TEMPLATES.map((tpl) => (
                  <Pressable
                    key={tpl.label}
                    onPress={() => applyTemplate(tpl)}
                    style={({ pressed }) => [
                      styles.presetChip,
                      { backgroundColor: theme.accentSoft, borderColor: theme.border },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.presetText, { color: theme.accentText }]}>{tpl.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {isStudent ? null : (
            <OptionPicker
              label={'Học sinh'}
              layout={'row'}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              value={owner}
              onChange={(v) => {
                setOwner(v);
                setError(null);
              }}
            />
          )}
          <OptionPicker
            label={'Loại'}
            options={ENTRY_KIND_LIST.map((k) => ({
              value: k,
              label: ENTRY_KINDS[k].label,
              icon: ENTRY_KINDS[k].icon,
            }))}
            value={kind}
            onChange={setKind}
          />
          <TextField
            label={'Tên thành tích / hoạt động'}
            icon={'trophy-outline'}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder={'Giải Nhất Olympic Toán cấp trường'}
            error={error}
          />
          <OptionPicker
            label={'Lĩnh vực'}
            columns={3}
            options={ENTRY_CATEGORY_LIST.map((c) => ({
              value: c,
              label: ENTRY_CATEGORIES[c].label,
              icon: ENTRY_CATEGORIES[c].icon,
            }))}
            value={category}
            onChange={setCategory}
          />
          <OptionPicker
            label={'Cấp độ'}
            columns={3}
            options={ENTRY_LEVEL_LIST.map((l) => ({ value: l, label: ENTRY_LEVELS[l].label }))}
            value={level}
            onChange={changeLevel}
          />
          <DatePickerField label={'Ngày diễn ra'} value={date} onChange={setDate} />
          <TextField
            label={'Điểm thi đua'}
            icon={'ribbon-outline'}
            value={points}
            onChangeText={setPoints}
            keyboardType={'number-pad'}
            hint={'Gợi ý theo cấp độ, giáo viên có thể điều chỉnh khi duyệt.'}
          />
          <TextField
            label={'Mô tả'}
            icon={'document-text-outline'}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextField
            label={'Link minh chứng'}
            icon={'link-outline'}
            value={proofUrl}
            onChangeText={setProofUrl}
            autoCapitalize={'none'}
            placeholder={'https://...'}
          />
          {existing && role === 'teacher' ? (
            <TextField
              label={'Ghi chú duyệt của giáo viên'}
              icon={'chatbubble-ellipses-outline'}
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder={'Khen ngợi hoặc lý do điều chỉnh...'}
            />
          ) : null}

          {!readOnly ? (
            <Button label={existing ? 'Lưu thay đổi' : 'Gửi lên'} icon={'checkmark-circle'} onPress={save} />
          ) : null}
          {existing && !readOnly && (role === 'teacher' || existing.status === 'pending') ? (
            <Button
              label={confirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá mục này'}
              variant={'danger'}
              icon={'trash-outline'}
              onPress={remove}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  presetWrap: { gap: Spacing.one + 2 },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presetRow: { gap: Spacing.two, paddingRight: Spacing.two },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetText: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
