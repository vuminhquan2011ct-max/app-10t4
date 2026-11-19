import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { FUND_CATEGORIES, FUND_CATEGORY_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { formatDate, todayIso } from '@/lib/date';
import { formatVnd } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import type { FundCategory, FundKind } from '@/types/models';

type TabMode = 'ledger' | 'dues';
type KindFilter = 'all' | FundKind;

export default function FundScreen() {
  const {
    classInfo,
    role,
    students,
    fundTransactions,
    fundPaid,
    fundCycleLabel,
    fundCycleAmount,
    fundSummary,
    addFundTransaction,
    removeFundTransaction,
    toggleFundPaid,
    updateFundCycle,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [tab, setTab] = useState<TabMode>('ledger');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [formOpen, setFormOpen] = useState(false);

  // Transaction form
  const [kind, setKind] = useState<FundKind>('expense');
  const [category, setCategory] = useState<FundCategory>('supplies');
  const [title, setTitle] = useState('');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');

  // Cycle editor
  const [editCycle, setEditCycle] = useState(false);
  const [cycleLabel, setCycleLabel] = useState(fundCycleLabel);
  const [cycleAmt, setCycleAmt] = useState(String(fundCycleAmount));

  const visibleTx = useMemo(
    () =>
      fundTransactions
        .filter((tx) => kindFilter === 'all' || tx.kind === kindFilter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [fundTransactions, kindFilter],
  );

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [students],
  );

  const duesRatio =
    students.length === 0 ? 0 : Math.min(1, fundSummary.paidCount / students.length);

  const handleSaveTx = () => {
    const cleanNum = Number.parseInt(amountText.replace(/[^\d]/g, ''), 10);
    if (!title.trim() || !Number.isFinite(cleanNum) || cleanNum <= 0) {
      showToast('Hãy nhập nội dung và số tiền hợp lệ', 'warning');
      return;
    }
    addFundTransaction({
      title,
      kind,
      category,
      amount: cleanNum,
      date,
      note,
    });
    setTitle('');
    setAmountText('');
    setNote('');
    setFormOpen(false);
    showToast(kind === 'income' ? 'Đã ghi khoản thu mới!' : 'Đã ghi khoản chi mới!');
  };

  const handleSaveCycle = () => {
    const amt = Number.parseInt(cycleAmt.replace(/[^\d]/g, ''), 10);
    updateFundCycle(cycleLabel, Number.isFinite(amt) ? amt : fundCycleAmount);
    setEditCycle(false);
    showToast('Đã cập nhật đợt thu quỹ!');
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Quỹ lớp ' + classInfo.name}
        subtitle={'Minh bạch thu chi & theo dõi đóng quỹ'}
        rightIcon={role === 'teacher' ? (formOpen ? 'close' : 'add') : undefined}
        rightLabel={role === 'teacher' ? (formOpen ? 'Đóng' : 'Ghi sổ') : undefined}
        onRightPress={
          role === 'teacher'
            ? () => {
                setTab('ledger');
                setFormOpen((v) => !v);
              }
            : undefined
        }
      />

      {/* Wallet Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.wallet, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={styles.walletBubble} />
          <Text style={styles.walletEyebrow}>SỐ DƯ QUỸ HIỆN TẠI</Text>
          <Text style={styles.walletBalance}>{formatVnd(fundSummary.balance)}</Text>

          <View style={styles.splitRow}>
            <View style={styles.splitCard}>
              <View style={styles.splitHead}>
                <Ionicons name="arrow-down-circle" size={16} color="#A7F3D0" />
                <Text style={styles.splitLabel}>Tổng thu</Text>
              </View>
              <Text style={styles.splitVal}>{formatVnd(fundSummary.totalIncome)}</Text>
            </View>
            <View style={styles.splitCard}>
              <View style={styles.splitHead}>
                <Ionicons name="arrow-up-circle" size={16} color="#FECACA" />
                <Text style={styles.splitLabel}>Tổng chi</Text>
              </View>
              <Text style={styles.splitVal}>{formatVnd(fundSummary.totalExpense)}</Text>
            </View>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Tab Switcher */}
      <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {(
          [
            { key: 'ledger', label: `Sổ Thu Chi (${fundTransactions.length})`, icon: 'receipt-outline' },
            {
              key: 'dues',
              label: `Đóng quỹ (${fundSummary.paidCount}/${students.length})`,
              icon: 'people-outline',
            },
          ] as const
        ).map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.segBtn, active && { backgroundColor: theme.accentSoft }]}>
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? theme.accentText : theme.textMuted}
              />
              <Text style={[styles.segText, { color: active ? theme.accentText : theme.textMuted }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'ledger' ? (
        <>
          {/* Add Transaction Form */}
          {formOpen && role === 'teacher' ? (
            <FadeIn index={0}>
              <Card style={styles.form}>
                <Text style={[styles.formTitle, { color: theme.text }]}>Ghi giao dịch mới</Text>
                <OptionPicker
                  label={'Loại giao dịch'}
                  columns={2}
                  options={[
                    { value: 'income', label: 'Khoản thu (+)', icon: 'arrow-down-circle-outline' },
                    { value: 'expense', label: 'Khoản chi (-)', icon: 'arrow-up-circle-outline' },
                  ]}
                  value={kind}
                  onChange={setKind}
                />
                <TextField
                  label={'Nội dung'}
                  placeholder={'Ví dụ: Mua nước liên hoan, Thu quỹ tháng 11'}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextField
                  label={'Số tiền (VNĐ)'}
                  icon={'cash-outline'}
                  placeholder={'150000'}
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType={'number-pad'}
                />
                <OptionPicker
                  label={'Danh mục'}
                  columns={3}
                  options={FUND_CATEGORY_LIST.map((c) => ({
                    value: c,
                    label: FUND_CATEGORIES[c].label,
                    icon: FUND_CATEGORIES[c].icon,
                  }))}
                  value={category}
                  onChange={setCategory}
                />
                <DatePickerField label={'Ngày giao dịch'} value={date} onChange={setDate} />
                <TextField label={'Ghi chú (tuỳ chọn)'} value={note} onChangeText={setNote} />
                <Button label={'Lưu vào sổ quỹ'} icon={'checkmark-circle'} onPress={handleSaveTx} />
              </Card>
            </FadeIn>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(
              [
                { value: 'all', label: 'Tất cả' },
                { value: 'income', label: 'Khoản thu' },
                { value: 'expense', label: 'Khoản chi' },
              ] as const
            ).map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                selected={kindFilter === f.value}
                onPress={() => setKindFilter(f.value)}
              />
            ))}
          </ScrollView>

          {visibleTx.length === 0 ? (
            <EmptyState icon={'wallet-outline'} title={'Chưa có giao dịch nào'} />
          ) : (
            visibleTx.map((tx, i) => {
              const isIncome = tx.kind === 'income';
              const cat = FUND_CATEGORIES[tx.category];
              return (
                <FadeIn key={tx.id} index={Math.min(i + 1, 8)}>
                  <Card style={styles.txRow}>
                    <View
                      style={[
                        styles.txIcon,
                        { backgroundColor: isIncome ? theme.successSoft : theme.dangerSoft },
                      ]}>
                      <Ionicons
                        name={cat.icon}
                        size={20}
                        color={isIncome ? theme.success : theme.danger}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.txTitle, { color: theme.text }]} numberOfLines={2}>
                        {tx.title}
                      </Text>
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                        {cat.label + ' · ' + formatDate(tx.date)}
                      </Text>
                      {tx.note ? (
                        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                          {tx.note}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.txRight}>
                      <Text
                        style={[
                          styles.txAmt,
                          { color: isIncome ? theme.success : theme.danger },
                        ]}>
                        {(isIncome ? '+' : '-') + formatVnd(tx.amount)}
                      </Text>
                      {role === 'teacher' ? (
                        <Pressable
                          onPress={() => {
                            removeFundTransaction(tx.id);
                            showToast('Đã xóa giao dịch', 'warning');
                          }}
                          hitSlop={8}>
                          <Ionicons name="trash-outline" size={14} color={theme.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      ) : (
        <>
          {/* Dues Progress Card */}
          <Card style={styles.duesSummary}>
            <View style={styles.duesTop}>
              <View style={styles.flex}>
                <Text style={[styles.formTitle, { color: theme.text }]}>{fundCycleLabel}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {'Mức đóng: ' +
                    formatVnd(fundCycleAmount) +
                    '/bạn · Đã thu ' +
                    formatVnd(fundSummary.collectedTotal)}
                </Text>
              </View>
              {role === 'teacher' ? (
                <Button
                  label={editCycle ? 'Đóng' : 'Sửa đợt'}
                  size={'sm'}
                  variant={'soft'}
                  onPress={() => {
                    setCycleLabel(fundCycleLabel);
                    setCycleAmt(String(fundCycleAmount));
                    setEditCycle((v) => !v);
                  }}
                />
              ) : null}
            </View>

            <View style={[styles.progressTrack, { backgroundColor: theme.backgroundElement }]}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressFill,
                  { width: `${Math.max(4, Math.round(duesRatio * 100))}%` as `${number}%` },
                ]}
              />
            </View>
            <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
              {`${fundSummary.paidCount} / ${students.length} học sinh đã đóng (${Math.round(duesRatio * 100)}%)`}
            </Text>

            {editCycle && role === 'teacher' ? (
              <View style={styles.form}>
                <TextField label={'Tên đợt thu'} value={cycleLabel} onChangeText={setCycleLabel} />
                <TextField
                  label={'Số tiền mỗi học sinh (VNĐ)'}
                  value={cycleAmt}
                  onChangeText={setCycleAmt}
                  keyboardType={'number-pad'}
                />
                <Button label={'Lưu cấu hình đợt thu'} size={'sm'} onPress={handleSaveCycle} />
              </View>
            ) : null}
          </Card>

          {sortedStudents.length === 0 ? (
            <EmptyState icon={'people-outline'} title={'Chưa có học sinh nào'} />
          ) : (
            sortedStudents.map((s) => {
              const paid = Boolean(fundPaid[s.id]);
              return (
                <Card
                  key={s.id}
                  style={styles.dueRow}
                  onPress={() => {
                    if (role !== 'teacher') {
                      showToast('Chỉ giáo viên / thủ quỹ mới đánh dấu đóng quỹ', 'info');
                      return;
                    }
                    toggleFundPaid(s.id);
                    showToast(
                      paid ? `Đã bỏ dấu ${s.name}` : `${s.name} đã đóng quỹ!`,
                      paid ? 'info' : 'success',
                    );
                  }}>
                  <Avatar name={s.name} size={40} />
                  <View style={styles.flex}>
                    <Text style={[styles.txTitle, { color: theme.text }]}>{s.name}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {[s.code, s.group].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.paidPill,
                      { backgroundColor: paid ? theme.successSoft : theme.backgroundElement },
                    ]}>
                    <Ionicons
                      name={paid ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={paid ? theme.success : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.paidText,
                        { color: paid ? theme.success : theme.textSecondary },
                      ]}>
                      {paid ? 'Đã đóng' : 'Chưa đóng'}
                    </Text>
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wallet: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  walletBubble: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  walletEyebrow: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  walletBalance: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  splitRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  splitCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: Spacing.three - 4,
    borderRadius: Radius.md,
    gap: 4,
  },
  splitHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  splitLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  splitVal: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  segment: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  segText: { fontSize: 12, fontWeight: '800' },
  form: { gap: Spacing.three },
  formTitle: { fontSize: 15, fontWeight: '800' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  txIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontSize: 14, fontWeight: '800' },
  txRight: { alignItems: 'flex-end', gap: 6 },
  txAmt: { fontSize: 14, fontWeight: '900' },
  duesSummary: { gap: Spacing.two + 2 },
  duesTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  progressTrack: { height: 9, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 9, borderRadius: 5 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  paidPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  paidText: { fontSize: 12, fontWeight: '800' },
});
