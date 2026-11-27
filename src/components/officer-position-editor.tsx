/**
 * Reusable GVCN-Only Multi-Position & Custom Officer Permissions Editor.
 *
 * Supports:
 * - Multiple positions per student (`positions: string[]`) with 1-tap toggle chips
 *   and individual removable badges.
 * - Free-text GVCN custom positions (comma/semicolon multi-add supported) + optional
 *   saving into `classInfo.customPositions` for instant 1-tap reuse across the class.
 * - Live effective capability preview (combining built-in roles, smart keyword inference
 *   for custom titles like "Cán sự môn Toán", and explicit custom permission toggles).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTwoTapConfirm } from '@/hooks/use-two-tap-confirm';
import {
  CUSTOM_OFFICER_GRANTS,
  OFFICER_POSITIONS,
  computeOfficerPermissions,
  getOfficerPositionMeta,
  normalizeCustomGrants,
  normalizePositionsList,
  type CustomOfficerGrantKey,
} from '@/lib/officer-roles';

type IoniconName = keyof typeof Ionicons.glyphMap;
type AccentTone = 'accent' | 'success' | 'warning' | 'danger' | 'purple';

function softToneOf(color: AccentTone): ThemeColor {
  return `${color}Soft` as ThemeColor;
}

export type OfficerPositionEditorProps = {
  /** Currently assigned positions (controlled or synced with store). */
  positions: string[];
  /** Explicit GVCN custom permission grants beyond built-in/inferred powers. */
  customPermissions?: CustomOfficerGrantKey[];
  /** Saved class-wide custom position presets from `classInfo.customPositions`. */
  customPresets?: string[];
  /** Compact spacing for inline drawers (`students.tsx`, `members.tsx`). */
  compact?: boolean;
  /** Disables interactions while saving. */
  disabled?: boolean;
  /** Called whenever positions or customPermissions change. */
  onChange: (nextPositions: string[], nextCustomPermissions: CustomOfficerGrantKey[]) => void;
  /** Optional callback to save newly typed custom titles to `classInfo.customPositions`. */
  onSaveCustomPreset?: (title: string) => void;
  /** Optional callback to delete a saved custom preset chip. */
  onRemoveCustomPreset?: (title: string) => void;
};

export function OfficerPositionEditor({
  positions,
  customPermissions = [],
  customPresets = [],
  compact = false,
  disabled = false,
  onChange,
  onSaveCustomPreset,
  onRemoveCustomPreset,
}: OfficerPositionEditorProps): ReactElement {
  const theme = useTheme();
  const { isArmed, armOrConfirm, reset: resetConfirm } = useTwoTapConfirm(3_500);
  const [draft, setDraft] = useState('');
  const [saveAsPreset, setSaveAsPreset] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const normalizedPositions = useMemo(
    () => normalizePositionsList(positions, null),
    [positions],
  );
  const normalizedGrants = useMemo(
    () => normalizeCustomGrants(customPermissions),
    [customPermissions],
  );
  const selectedKeys = useMemo(
    () => new Set(normalizedPositions.map((p) => p.trim().toLowerCase())),
    [normalizedPositions],
  );

  const builtInLowerSet = useMemo(
    () => new Set(OFFICER_POSITIONS.map((opt) => opt.label.trim().toLowerCase())),
    [],
  );

  const uniqueCustomPresets = useMemo(
    () =>
      normalizePositionsList(customPresets, null).filter(
        (preset) => !builtInLowerSet.has(preset.trim().toLowerCase()),
      ),
    [customPresets, builtInLowerSet],
  );

  // Live preview of combined effective capabilities (built-in + smart inference + explicit grants).
  const effectivePreview = useMemo(
    () =>
      computeOfficerPermissions({
        isTeacher: false,
        isSubjectTeacher: false,
        memberRole: 'student',
        currentStudent: {
          id: 'preview',
          positions: normalizedPositions,
          customPermissions: normalizedGrants,
          group: 'Tổ 1',
        },
      }),
    [normalizedPositions, normalizedGrants],
  );

  const effectiveCapabilityLabels = useMemo(() => {
    const list: { label: string; color: AccentTone; icon: IoniconName }[] = [];
    if (effectivePreview.canRecordStudy) {
      const subjHint =
        effectivePreview.inferredStudySubjects.length > 0
          ? ` (${effectivePreview.inferredStudySubjects.join(', ')})`
          : '';
      const baseLabel = effectivePreview.canRecordStudyClassWide
        ? 'Cộng Stamp toàn lớp'
        : 'Cộng Stamp (+0,25đ) cho Tổ';
      list.push({
        label: `${baseLabel}${subjHint}`,
        color: 'success',
        icon: 'book-outline',
      });
    }
    if (effectivePreview.canManageDuty) {
      list.push({ label: 'Trực nhật · CC', color: 'success', icon: 'leaf-outline' });
    }
    if (effectivePreview.canRecordBonus) {
      list.push({
        label:
          effectivePreview.isClassMonitor ||
          normalizedGrants.includes('full_coordination') ||
          normalizedGrants.includes('record_bonus_class')
            ? 'Điểm cộng toàn lớp'
            : 'Điểm cộng Tổ',
        color: 'accent',
        icon: 'add-circle-outline',
      });
    }
    if (effectivePreview.canRecordViolation) {
      list.push({ label: 'Ghi vi phạm', color: 'danger', icon: 'alert-circle-outline' });
    }
    if (effectivePreview.canManageTasksAndEvents) {
      list.push({ label: 'Nhiệm vụ & Sự kiện', color: 'purple', icon: 'briefcase-outline' });
    }
    if (effectivePreview.canPostAnnouncements) {
      list.push({ label: 'Đăng Bảng tin', color: 'warning', icon: 'megaphone-outline' });
    }
    return list;
  }, [effectivePreview, normalizedGrants]);

  const togglePosition = (label: string) => {
    if (disabled) return;
    const key = label.trim().toLowerCase();
    const exists = selectedKeys.has(key);
    const nextPositions = exists
      ? normalizedPositions.filter((p) => p.trim().toLowerCase() !== key)
      : normalizePositionsList([...normalizedPositions, label], null);
    const nextGrants = nextPositions.length === 0 ? [] : normalizedGrants;
    onChange(nextPositions, nextGrants);
  };

  const removePosition = (label: string) => {
    if (disabled) return;
    resetConfirm();
    const key = label.trim().toLowerCase();
    const nextPositions = normalizedPositions.filter((p) => p.trim().toLowerCase() !== key);
    const nextGrants = nextPositions.length === 0 ? [] : normalizedGrants;
    onChange(nextPositions, nextGrants);
  };

  const clearAll = () => {
    if (disabled) return;
    resetConfirm();
    onChange([], []);
  };

  const handleAddCustom = () => {
    if (disabled) return;
    const raw = draft.trim();
    if (!raw) return;
    const parsed = normalizePositionsList(null, raw);
    if (parsed.length === 0) return;
    const nextPositions = normalizePositionsList([...normalizedPositions, ...parsed], null);
    onChange(nextPositions, normalizedGrants);
    if (saveAsPreset && onSaveCustomPreset) {
      for (const title of parsed) {
        if (!builtInLowerSet.has(title.trim().toLowerCase())) {
          onSaveCustomPreset(title);
        }
      }
    }
    setDraft('');
  };

  const toggleGrant = (grantKey: CustomOfficerGrantKey) => {
    if (disabled) return;
    const exists = normalizedGrants.includes(grantKey);
    const nextGrants = exists
      ? normalizedGrants.filter((g) => g !== grantKey)
      : normalizeCustomGrants([...normalizedGrants, grantKey]);
    onChange(normalizedPositions, nextGrants);
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {/* Active Multi-Position Tray */}
      <View
        style={[
          styles.activeTray,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <View style={styles.trayHeader}>
          <View style={styles.trayTitleRow}>
            <Ionicons name="shield-checkmark" size={14} color={theme.accent} />
            <Text style={[styles.trayTitle, { color: theme.text }]}>
              {normalizedPositions.length > 0
                ? `Đang giữ ${normalizedPositions.length} chức vụ`
                : 'Thành viên thường (Chưa gán chức vụ)'}
            </Text>
          </View>
          {normalizedPositions.length > 0 || normalizedGrants.length > 0 ? (
            <Pressable
              disabled={disabled}
              onPress={() => armOrConfirm('clear_all', clearAll)}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                isArmed('clear_all') ? 'Nhấn lại để hủy hết chức vụ' : 'Hủy hết chức vụ'
              }
              style={({ pressed }) => [
                styles.clearAllBtn,
                {
                  backgroundColor: isArmed('clear_all') ? '#DC2626' : theme.dangerSoft,
                  borderColor: isArmed('clear_all') ? '#DC2626' : theme.danger,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}>
              <Ionicons
                name={isArmed('clear_all') ? 'alert-circle' : 'close-circle-outline'}
                size={12}
                color={isArmed('clear_all') ? '#FFFFFF' : theme.danger}
              />
              <Text
                style={[
                  styles.clearAllText,
                  { color: isArmed('clear_all') ? '#FFFFFF' : theme.danger },
                ]}>
                {isArmed('clear_all') ? 'Xác nhận?' : 'Hủy hết'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {normalizedPositions.length > 0 ? (
          <View style={styles.pillWrap}>
            {normalizedPositions.map((pos) => {
              const meta = getOfficerPositionMeta(pos);
              const tone: AccentTone = meta?.color ?? 'purple';
              const softTone = softToneOf(tone);
              const posConfirmKey = `pos:${pos.trim().toLowerCase()}`;
              const armedPos = isArmed(posConfirmKey);
              return (
                <View
                  key={pos}
                  style={[
                    styles.activePill,
                    { backgroundColor: theme[softTone], borderColor: theme[tone] },
                  ]}>
                  <Ionicons
                    name={(meta?.icon ?? 'sparkles') as IoniconName}
                    size={12}
                    color={theme[tone]}
                  />
                  <Text style={[styles.activePillText, { color: theme[tone] }]}>{pos}</Text>
                  <Pressable
                    disabled={disabled}
                    onPress={() => armOrConfirm(posConfirmKey, () => removePosition(pos))}
                    hitSlop={
                      armedPos
                        ? { top: 10, bottom: 10, left: 8, right: 8 }
                        : { top: 13, bottom: 13, left: 13, right: 13 }
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      armedPos ? `Nhấn lại để gỡ chức vụ ${pos}` : `Gỡ chức vụ ${pos}`
                    }
                    style={({ pressed }) => [
                      armedPos ? styles.armedPillBtn : styles.removeX,
                      pressed && styles.pressed,
                    ]}>
                    {armedPos ? (
                      <Text style={styles.armedPillText}>Xoá?</Text>
                    ) : (
                      <Ionicons name="close" size={13} color={theme[tone]} />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: theme.textMuted, fontSize: 11.5, lineHeight: 16 }}>
            Chọn nhiều chức vụ bên dưới hoặc tự ghi chức vụ riêng bất kỳ cho thành viên này.
          </Text>
        )}

        {/* Live Effective Permissions Summary Strip */}
        {effectiveCapabilityLabels.length > 0 ? (
          <View style={[styles.capStrip, { borderColor: theme.border }]}>
            <Text style={[styles.capStripLabel, { color: theme.textMuted }]}>
              Quyền đang kích hoạt:
            </Text>
            <View style={styles.pillWrap}>
              {effectiveCapabilityLabels.map((cap) => (
                <Badge
                  key={cap.label}
                  label={cap.label}
                  color={cap.color}
                  soft={softToneOf(cap.color)}
                  icon={cap.icon}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Free-Text Custom Position Input (GVCN tự ghi chức vụ mới) */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          GVCN tự ghi chức vụ mới (không giới hạn)
        </Text>
        <View style={styles.inputRow}>
          <View
            style={[
              styles.inputBox,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <Ionicons name="create-outline" size={15} color={theme.purple} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleAddCustom}
              editable={!disabled}
              placeholder={'VD: Cán sự môn Toán, Đội trưởng CLB Tin, Thủ quỹ...'}
              placeholderTextColor={theme.textMuted}
              returnKeyType="done"
              style={[styles.input, { color: theme.text }]}
            />
          </View>
          <Pressable
            disabled={disabled || !draft.trim()}
            onPress={handleAddCustom}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Thêm chức vụ tự ghi"
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: draft.trim() ? theme.accent : theme.backgroundElement,
                borderColor: draft.trim() ? theme.accent : theme.border,
              },
              pressed && styles.pressed,
              (disabled || !draft.trim()) && styles.disabled,
            ]}>
            <Ionicons
              name="add"
              size={16}
              color={draft.trim() ? theme.accentOnFill : theme.textMuted}
            />
            <Text
              style={[
                styles.addBtnText,
                { color: draft.trim() ? theme.accentOnFill : theme.textMuted },
              ]}>
              Thêm
            </Text>
          </Pressable>
        </View>

        {onSaveCustomPreset ? (
          <Pressable
            disabled={disabled}
            onPress={() => setSaveAsPreset((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saveAsPreset }}
            accessibilityLabel="Lưu làm mẫu gợi ý cho cả lớp"
            style={styles.presetToggleRow}>
            <Ionicons
              name={saveAsPreset ? 'checkbox' : 'square-outline'}
              size={16}
              color={saveAsPreset ? theme.accent : theme.textMuted}
            />
            <Text style={{ color: theme.textSecondary, fontSize: 11.5, fontWeight: '600' }}>
              Lưu làm mẫu gợi ý cho cả lớp (chạm nhanh lần sau · có thể nhập nhiều chức vụ cách nhau bằng dấu phẩy)
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Built-in Ban Cán Sự Multi-Select Chips */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          Chức vụ Ban cán sự gợi ý (chọn được nhiều)
        </Text>
        <View style={styles.pillWrap}>
          {OFFICER_POSITIONS.map((opt) => {
            const active = selectedKeys.has(opt.label.trim().toLowerCase());
            const softTone = softToneOf(opt.color);
            return (
              <Pressable
                key={opt.key}
                disabled={disabled}
                onPress={() => togglePosition(opt.label)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.choiceChip,
                  {
                    backgroundColor: active ? theme[opt.color] : theme[softTone],
                    borderColor: theme[opt.color],
                  },
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}>
                <Ionicons
                  name={(active ? 'checkmark-circle' : opt.icon) as IoniconName}
                  size={13}
                  color={active ? '#FFFFFF' : theme[opt.color]}
                />
                <Text
                  style={[
                    styles.choiceChipText,
                    { color: active ? '#FFFFFF' : theme[opt.color] },
                  ]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Saved GVCN Custom Presets */}
      {uniqueCustomPresets.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.purple }]}>
            Mẫu chức vụ tự ghi của lớp ({uniqueCustomPresets.length})
          </Text>
          <View style={styles.pillWrap}>
            {uniqueCustomPresets.map((preset) => {
              const active = selectedKeys.has(preset.trim().toLowerCase());
              const presetConfirmKey = `preset:${preset.trim().toLowerCase()}`;
              const armedPreset = isArmed(presetConfirmKey);
              return (
                <View
                  key={preset}
                  style={[
                    styles.customPresetPill,
                    {
                      backgroundColor: active ? theme.purple : theme.purpleSoft,
                      borderColor: theme.purple,
                    },
                  ]}>
                  <Pressable
                    disabled={disabled}
                    onPress={() => togglePosition(preset)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Chọn mẫu chức vụ ${preset}`}
                    style={styles.customPresetTap}>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'sparkles-outline'}
                      size={12}
                      color={active ? '#FFFFFF' : theme.purple}
                    />
                    <Text
                      style={[
                        styles.choiceChipText,
                        { color: active ? '#FFFFFF' : theme.purple },
                      ]}>
                      {preset}
                    </Text>
                  </Pressable>
                  {onRemoveCustomPreset ? (
                    <Pressable
                      disabled={disabled}
                      onPress={() =>
                        armOrConfirm(presetConfirmKey, () => onRemoveCustomPreset(preset))
                      }
                      hitSlop={{ top: 11, bottom: 11, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        armedPreset
                          ? `Nhấn lại để xoá mẫu chức vụ ${preset}`
                          : `Xoá mẫu chức vụ ${preset}`
                      }
                      style={[
                        styles.presetDeleteBtn,
                        armedPreset && styles.presetDeleteArmed,
                      ]}>
                      {armedPreset ? (
                        <Text style={styles.armedPillText}>Xoá?</Text>
                      ) : (
                        <Ionicons
                          name="close"
                          size={12}
                          color={active ? 'rgba(255,255,255,0.9)' : theme.purple}
                        />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Expandable Advanced Explicit Permission Grants */}
      <View
        style={[
          styles.advancedBox,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <Pressable
          disabled={disabled}
          onPress={() => setAdvancedOpen((v) => !v)}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedOpen }}
          accessibilityLabel="Tùy chỉnh quyền hạn riêng nâng cao"
          style={styles.advancedHead}>
          <View style={styles.trayTitleRow}>
            <Ionicons name="key-outline" size={14} color={theme.accent} />
            <Text style={[styles.advancedTitle, { color: theme.text }]}>
              Tùy chỉnh quyền hạn riêng (nâng cao)
            </Text>
            {normalizedGrants.length > 0 ? (
              <Badge
                label={`+${normalizedGrants.length}`}
                color={'accentText'}
                soft={'accentSoft'}
              />
            ) : null}
          </View>
          <Ionicons
            name={advancedOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textMuted}
          />
        </Pressable>

        {advancedOpen ? (
          <View style={styles.grantsList}>
            <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
              Mọi chức vụ đều mặc định có quyền cộng &amp; xoá Stamp (+0,25đ) cho thành viên trong
              Tổ. Bật thêm quyền bên dưới nếu muốn mở rộng (VD: cộng Stamp toàn lớp, điểm cộng lớp,
              đăng bản tin...).
            </Text>
            {CUSTOM_OFFICER_GRANTS.map((grant) => {
              const active = normalizedGrants.includes(grant.key);
              const softTone = softToneOf(grant.color);
              return (
                <Pressable
                  key={grant.key}
                  disabled={disabled}
                  onPress={() => toggleGrant(grant.key)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${grant.label}: ${grant.description}`}
                  accessibilityState={{ checked: active }}
                  style={({ pressed }) => [
                    styles.grantRow,
                    {
                      backgroundColor: active ? theme[softTone] : theme.card,
                      borderColor: active ? theme[grant.color] : theme.border,
                    },
                    pressed && styles.pressed,
                    disabled && styles.disabled,
                  ]}>
                  <View
                    style={[
                      styles.grantIconBox,
                      { backgroundColor: active ? theme[grant.color] : theme[softTone] },
                    ]}>
                    <Ionicons
                      name={grant.icon as IoniconName}
                      size={14}
                      color={active ? '#FFFFFF' : theme[grant.color]}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.grantLabel, { color: theme.text }]}>{grant.label}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 15 }}>
                      {grant.description}
                    </Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={active ? theme[grant.color] : theme.textMuted}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: Spacing.three },
  wrapCompact: { gap: Spacing.two + 2 },
  activeTray: {
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  trayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  trayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  trayTitle: { fontSize: 12.5, fontWeight: '800' },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clearAllText: { fontSize: 11, fontWeight: '800' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 9,
    paddingRight: 5,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  activePillText: { fontSize: 12, fontWeight: '800' },
  removeX: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armedPillBtn: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  armedPillText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
  },
  capStrip: {
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  capStripLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase' },
  section: { gap: 7 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    minHeight: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 8,
    ...({ outlineStyle: 'none' } as object),
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    minHeight: 42,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  addBtnText: { fontSize: 12.5, fontWeight: '800' },
  presetToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  choiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  choiceChipText: { fontSize: 11.5, fontWeight: '800' },
  customPresetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  customPresetTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
  },
  presetDeleteBtn: {
    paddingRight: 8,
    paddingLeft: 4,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetDeleteArmed: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
  },
  advancedBox: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  advancedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.two + 2,
  },
  advancedTitle: { fontSize: 12.5, fontWeight: '800' },
  grantsList: {
    paddingHorizontal: Spacing.two + 4,
    paddingBottom: Spacing.two + 4,
    gap: 7,
  },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  grantIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grantLabel: { fontSize: 12.5, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.5 },
});
