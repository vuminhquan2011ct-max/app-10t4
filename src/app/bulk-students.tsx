import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalHeader } from '@/components/modal-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OptionPicker } from '@/components/ui/option-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MIN_STUDENT_PASSWORD_LENGTH } from '@/lib/student-accounts';
import { normalizeName } from '@/lib/utils';
import { useClassStore } from '@/store/class-store';

/** Strip leading list numbering/bullets like `1. `, `02 - `, `• `. */
function parseNameLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.):\-\s]+|[-•*]\s+)/, ''))
    .map(normalizeName)
    .filter((line) => line.length >= 2);
}

export default function BulkStudentsModal() {
  const { bulkAddStudents, classInfo, isTeacher } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();

  const [rawText, setRawText] = useState('');
  const [autoGroups, setAutoGroups] = useState(true);
  const [fixedGroup, setFixedGroup] = useState<string>('Tổ 1');
  const [initialPassword, setInitialPassword] = useState('123456');
  const [saving, setSaving] = useState(false);

  const parsedNames = useMemo(() => parseNameLines(rawText), [rawText]);

  const handleImport = async () => {
    if (saving) return;
    if (!isTeacher) {
      showToast('Chỉ Giáo viên chủ nhiệm mới được nhập nhanh cả lớp', 'warning');
      return;
    }
    if (parsedNames.length === 0) {
      showToast('Hãy dán ít nhất 1 tên học sinh', 'warning');
      return;
    }
    if (initialPassword.trim().length < MIN_STUDENT_PASSWORD_LENGTH) {
      showToast(
        `Mật khẩu khởi tạo cần ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự`,
        'warning',
      );
      return;
    }
    setSaving(true);
    try {
      await bulkAddStudents(parsedNames, {
        autoDistributeGroups: autoGroups,
        group: autoGroups ? null : fixedGroup,
        initialPassword: initialPassword.trim(),
      });
      showToast(
        `Đã thêm ${parsedNames.length} học sinh kèm Số ID & mật khẩu khởi tạo "${initialPassword.trim()}"!`,
      );
      router.back();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể thêm danh sách học sinh',
        'danger',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ModalHeader
        title={'Nhập nhanh danh sách'}
        subtitle={`Lớp ${classInfo.name} · Mỗi dòng 1 học sinh`}
        actionLabel={
          !isTeacher
            ? undefined
            : saving
              ? 'Đang thêm...'
              : parsedNames.length > 0
                ? `Thêm (${parsedNames.length})`
                : 'Thêm'
        }
        onAction={!isTeacher || saving ? undefined : handleImport}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={'handled'}>
          {!isTeacher ? (
            <>
              <EmptyState
                icon={'lock-closed-outline'}
                title={'Chỉ Giáo viên chủ nhiệm được nhập nhanh cả lớp'}
                message={
                  'Học sinh vui lòng dùng nút "Thêm học sinh" để tạo từng tài khoản với Số ID & mật khẩu riêng tự đặt.'
                }
              />
              <Button
                label={'Mở Thêm học sinh mới'}
                icon={'person-add'}
                onPress={() => router.replace('/student-form' as never)}
              />
            </>
          ) : (
            <>
              <Card style={styles.tipCard}>
                <Ionicons name="flash" size={18} color={theme.accent} />
                <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                  Dán danh sách học sinh từ Excel, Word hoặc Zalo — hệ thống tự cấp Số ID không
                  trùng ({classInfo.name}-XX) và gán mật khẩu khởi tạo để học sinh tự đăng nhập &
                  đổi mật khẩu riêng.
                </Text>
              </Card>

              <TextField
                label={'Mật khẩu khởi tạo chung (học sinh có thể tự đổi sau)'}
                icon={'key-outline'}
                placeholder={'VD: 123456'}
                value={initialPassword}
                onChangeText={setInitialPassword}
                autoCapitalize={'none'}
              />

              <TextField
                label={'Danh sách họ và tên'}
                placeholder={
                  '1. Nguyễn Minh Anh\n2. Trần Gia Bảo\n3. Lê Hoàng Khánh Linh\n4. Phạm Đức Huy'
                }
                value={rawText}
                onChangeText={setRawText}
                multiline
                style={styles.textarea}
              />

              <Pressable
                onPress={() => setAutoGroups((v) => !v)}
                style={[styles.toggle, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.toggleTitle, { color: theme.text }]}>
                    Tự động chia đều Tổ 1 – Tổ 4
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Phân bổ lần lượt vào 4 tổ để quản lý dễ dàng
                  </Text>
                </View>
                <Ionicons
                  name={autoGroups ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={autoGroups ? theme.accent : theme.textMuted}
                />
              </Pressable>

              {!autoGroups ? (
                <OptionPicker
                  label={'Hoặc gán tất cả vào tổ'}
                  layout={'row'}
                  options={GROUP_PRESETS.map((g) => ({ value: g, label: g }))}
                  value={fixedGroup}
                  onChange={setFixedGroup}
                />
              ) : null}

              {parsedNames.length > 0 ? (
                <Card style={styles.preview}>
                  <Text style={[styles.toggleTitle, { color: theme.text }]}>
                    {'Xem trước (' + parsedNames.length + ' học sinh)'}
                  </Text>
                  <View style={styles.badgeWrap}>
                    {parsedNames.slice(0, 18).map((name, idx) => (
                      <Badge
                        key={`${name}_${idx}`}
                        label={`${idx + 1}. ${name}`}
                        color={'accentText'}
                        soft={'accentSoft'}
                      />
                    ))}
                    {parsedNames.length > 18 ? (
                      <Badge
                        label={`+${parsedNames.length - 18} bạn nữa`}
                        color={'purple'}
                        soft={'purpleSoft'}
                      />
                    ) : null}
                  </View>
                </Card>
              ) : null}

              <Button
                label={
                  saving
                    ? 'Đang thêm...'
                    : parsedNames.length > 0
                      ? `Thêm ${parsedNames.length} học sinh vào lớp`
                      : 'Thêm danh sách học sinh'
                }
                icon={'person-add'}
                disabled={parsedNames.length === 0 || saving}
                onPress={handleImport}
              />
            </>
          )}
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
  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19 },
  textarea: { minHeight: 150, textAlignVertical: 'top' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleTitle: { fontSize: 14, fontWeight: '800' },
  preview: { gap: Spacing.two },
  badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
