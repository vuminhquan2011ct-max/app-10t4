/**
 * Compact cross-platform two-tap destructive action button.
 *
 * Transitions from an idle icon/pill button to a high-contrast crimson
 * `"Xác nhận?"` state for 3.5s before invoking `onConfirm`, guaranteeing a
 * >= 44x44px touch target and full screen-reader accessibility on iOS, Android,
 * and Web.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTwoTapConfirm } from '@/hooks/use-two-tap-confirm';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ARMED_BG = '#DC2626';
const ARMED_FG = '#FFFFFF';
const ACTION_KEY = 'confirm-action';
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export type ConfirmActionButtonProps = {
  /** Invoked only on the second tap while the button is armed. */
  onConfirm: () => void;
  /** Icon displayed in idle state (defaults to `'trash-outline'`). */
  icon?: IoniconName;
  /** Optional text label in idle state; omit for a compact icon-only button. */
  label?: string;
  /** Confirmation prompt shown while armed (defaults to `'Xác nhận?'`). */
  confirmLabel?: string;
  /** Accessible label in idle state. */
  accessibilityLabel?: string;
  /** Accessible label while armed. */
  confirmAccessibilityLabel?: string;
  /** Auto-disarm duration in milliseconds (defaults to `3500`). */
  timeoutMs?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function ConfirmActionButton({
  onConfirm,
  icon = 'trash-outline',
  label,
  confirmLabel = 'Xác nhận?',
  accessibilityLabel,
  confirmAccessibilityLabel = 'Nhấn lần nữa để xác nhận',
  timeoutMs = 3500,
  disabled = false,
  size = 'sm',
  style,
}: ConfirmActionButtonProps) {
  const theme = useTheme();
  const { isArmed, armOrConfirm } = useTwoTapConfirm(timeoutMs);
  const armed = isArmed(ACTION_KEY);

  const handlePress = () => {
    if (disabled) return;
    if (!armed && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    armOrConfirm(ACTION_KEY, onConfirm);
  };

  const isSmall = size === 'sm';
  const idleIconColor = theme.danger;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={
        armed ? confirmAccessibilityLabel : (accessibilityLabel ?? label ?? 'Xoá')
      }
      accessibilityHint={
        armed ? 'Chạm lần nữa để thực hiện ngay' : 'Chạm hai lần để xác nhận thao tác'
      }
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        isSmall ? styles.sm : styles.md,
        armed
          ? styles.armed
          : label
            ? styles.pillIdle
            : isSmall
              ? styles.iconOnlySm
              : styles.iconOnlyMd,
        {
          backgroundColor: armed ? ARMED_BG : theme.dangerSoft,
          borderColor: armed ? ARMED_BG : `${theme.danger}38`,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Ionicons
        name={armed ? 'alert-circle' : icon}
        size={isSmall ? 15 : 17}
        color={armed ? ARMED_FG : idleIconColor}
      />
      {armed ? (
        <Text style={[styles.confirmText, isSmall && styles.textSm]}>{confirmLabel}</Text>
      ) : label ? (
        <Text style={[styles.idleText, isSmall && styles.textSm, { color: idleIconColor }]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  sm: {
    minHeight: 32,
  },
  md: {
    minHeight: 38,
  },
  iconOnlySm: {
    width: 32,
    height: 32,
    paddingHorizontal: 0,
  },
  iconOnlyMd: {
    width: 38,
    height: 38,
    paddingHorizontal: 0,
  },
  pillIdle: {
    paddingHorizontal: 11,
  },
  armed: {
    paddingHorizontal: 11,
  },
  confirmText: {
    color: ARMED_FG,
    fontSize: 12.5,
    fontWeight: '800',
  },
  idleText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  textSm: {
    fontSize: 11.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
