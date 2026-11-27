import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateLong, formatMonthYear, parseIsoDate, todayIso } from '@/lib/date';

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function startOfMonthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // Monday-first grid: shift Sunday (0) to index 6.
  const offset = (first.getDay() + 6) % 7;
  const days: string[] = [];
  for (let i = 0; i < offset; i += 1) days.push('');
  const total = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= total; day += 1) days.push(toIso(year, month, day));
  return days;
}

type DatePickerFieldProps = {
  label?: string;
  value: string | null;
  onChange: (value: string) => void;
  /** Allows the picker to stay open on a "not set" option. */
  clearable?: boolean;
  onClear?: () => void;
};

/** Read-only field that opens a small hand-rolled calendar modal. */
export function DatePickerField({
  label,
  value,
  onChange,
  clearable = false,
  onClear,
}: DatePickerFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const initial = parseIsoDate(value) ?? new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const today = todayIso();
  const cells = startOfMonthGrid(year, month);

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
        <Text style={[styles.fieldText, { color: value ? theme.text : theme.textMuted }]}>
          {value ? formatDateLong(value) : 'Chọn ngày'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <CalendarSheet
          year={year}
          month={month}
          cells={cells}
          today={today}
          value={value}
          theme={theme}
          onShiftMonth={shiftMonth}
          onPick={pick}
          onToday={() => pick(today)}
          clearable={clearable}
          onClear={() => {
            onClear?.();
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </View>
  );
}


type CalendarSheetProps = {
  year: number;
  month: number;
  cells: string[];
  today: string;
  value: string | null;
  theme: ReturnType<typeof useTheme>;
  onShiftMonth: (delta: number) => void;
  onPick: (iso: string) => void;
  onToday: () => void;
  clearable: boolean;
  onClear: () => void;
  onClose: () => void;
};

function CalendarSheet({
  year,
  month,
  cells,
  today,
  value,
  theme,
  onShiftMonth,
  onPick,
  onToday,
  clearable,
  onClear,
  onClose,
}: CalendarSheetProps) {
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        style={[styles.sheet, Shadow.floating, { backgroundColor: theme.card }]}
        onPress={(event) => event.stopPropagation()}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={() => onShiftMonth(-1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: theme.text }]}>
            {formatMonthYear(`${year}-${pad(month + 1)}-01`)}
          </Text>
          <Pressable onPress={() => onShiftMonth(1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((day) => (
            <Text key={day} style={[styles.weekday, { color: theme.textMuted }]}>
              {day}
            </Text>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.grid}>
          {cells.map((iso, index) => {
            if (!iso) return <View key={`blank-${index}`} style={styles.cell} />;
            const selected = iso === value;
            const isToday = iso === today;
            return (
              <Pressable
                key={iso}
                onPress={() => onPick(iso)}
                style={[
                  styles.cell,
                  selected && { backgroundColor: theme.accent },
                  !selected && isToday && { backgroundColor: theme.accentSoft },
                ]}>
                <Text
                  style={[
                    styles.cellText,
                    { color: selected ? '#FFFFFF' : theme.text },
                    !selected && isToday && { color: theme.accentText, fontWeight: '800' },
                  ]}>
                  {Number(iso.slice(8, 10))}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          {clearable ? (
            <Pressable onPress={onClear}>
              <Text style={[styles.footerAction, { color: theme.textSecondary }]}>Xoá</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={onToday}>
            <Text style={[styles.footerAction, { color: theme.accentText }]}>Hôm nay</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    minHeight: 50,
  },
  fieldText: { flex: 1, fontSize: 15 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 12, 20, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: { padding: Spacing.one },
  monthLabel: { fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxHeight: 300,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  cellText: { fontSize: 14, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  footerAction: { fontSize: 14, fontWeight: '700' },
});
