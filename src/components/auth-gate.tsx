/**
 * Premium Multi-Provider Authentication Gate for Class 10T4.
 *
 * Supports:
 * 1. 1-tap Google & GitHub OAuth sign-in (returning users enter immediately;
 *    first-time OAuth users complete profile onboarding or link an existing Mã ID).
 * 2. Gmail + Password registration & login (preserving full backward compatibility
 *    with Mã ID lớp + personal password and teacher quick-login code `K8T4`).
 * 3. Self-service "Quên mật khẩu?" email reset + dedicated "Đặt mật khẩu mới"
 *    recovery screen when opening the private reset link from Gmail.
 * 4. Graceful handling for pending Gmail confirmation and unconfigured OAuth providers.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmailShieldIcon,
  GitHubLogoIcon,
  GoogleLogoIcon,
} from '@/components/auth/provider-icons';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { SUBJECT_TEACHER_PRESETS } from '@/constants/utilities-meta';
import { useBrandGradient, useIsDark, useTheme } from '@/hooks/use-theme';
import {
  isLoginIdTaken,
  normalizeLoginIdDisplay,
  suggestNextLoginId,
  validateLoginId,
} from '@/lib/student-accounts';
import {
  isTeacherLoginIdTaken,
  suggestNextTeacherLoginId,
  validateTeacherLoginId,
  type TeacherRole,
} from '@/lib/teacher-accounts';
import { useAuth } from '@/store/auth-store';
import type { PendingOAuthUser } from '@/types/auth';

type IoniconName = keyof typeof Ionicons.glyphMap;
type AuthSubView = 'login' | 'register' | 'forgot';
type RegisterKind = 'student' | 'subject_teacher' | 'teacher';
type LoginKind = 'student' | 'teacher';
type OnboardingTab = 'create' | 'link';
type GenderChoice = 'male' | 'female';
type IdAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const MIN_AUTH_PASSWORD_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type StrengthInfo = {
  bars: 0 | 1 | 2 | 3;
  label: string;
  color: ThemeColor;
};

function evaluateAuthPasswordStrength(password: string): StrengthInfo {
  const trimmed = password.trim();
  if (!trimmed) {
    return { bars: 0, label: '', color: 'textMuted' };
  }
  if (trimmed.length < MIN_AUTH_PASSWORD_LENGTH) {
    return {
      bars: 0,
      label: `Tối thiểu ${MIN_AUTH_PASSWORD_LENGTH} ký tự`,
      color: 'danger',
    };
  }
  let score = 0;
  if (trimmed.length >= 8) score += 1;
  if (/[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) score += 1;
  if (/[^a-zA-Z0-9]/.test(trimmed) || (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed))) {
    score += 1;
  }
  if (score <= 0) return { bars: 1, label: 'Yếu', color: 'warning' };
  if (score === 1) return { bars: 2, label: 'Khá', color: 'accent' };
  return { bars: 3, label: 'Mạnh', color: 'success' };
}

function isValidEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(raw.trim().toLowerCase());
}

function triggerHaptic(type: 'light' | 'success' | 'error' = 'light'): void {
  if (Platform.OS === 'web') return;
  if (type === 'light') {
    Haptics.selectionAsync().catch(() => {});
  } else {
    Haptics.notificationAsync(
      type === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }
}

/* ---------- Shared Visual Primitives ---------- */

function AuthBackdrop({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isDark = useIsDark();
  const gradient = useBrandGradient();
  const insets = useSafeAreaInsets();

  const backdropColors: [string, string, string] = isDark
    ? ['#0D0908', '#17100D', '#0B0B14']
    : [theme.background, theme.card, theme.backgroundElement];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={backdropColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top gradient ribbon & ambient glow orbs */}
      <View pointerEvents="none" style={styles.ambientLayer}>
        <LinearGradient
          colors={[gradient[0], gradient[1], 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={[styles.topGlowRibbon, { opacity: isDark ? 0.34 : 0.24 }]}
        />
        <View
          style={[
            styles.glowOrbLeft,
            { backgroundColor: gradient[0], opacity: isDark ? 0.22 : 0.14 },
          ]}
        />
        <View
          style={[
            styles.glowOrbRight,
            { backgroundColor: gradient[1], opacity: isDark ? 0.2 : 0.14 },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top + 18, 28),
              paddingBottom: Math.max(insets.bottom + 28, 36),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.centerColumn}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function GlassAuthCard({ children }: { children: ReactNode }) {
  const isDark = useIsDark();
  const theme = useTheme();

  return (
    <View
      style={[
        styles.glassCard,
        Shadow.floating,
        {
          backgroundColor: isDark ? 'rgba(24, 17, 14, 0.86)' : 'rgba(255, 253, 249, 0.92)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(180, 140, 90, 0.26)',
        },
        Platform.OS === 'web'
          ? ({
              backdropFilter: 'blur(26px) saturate(180%)',
              WebkitBackdropFilter: 'blur(26px) saturate(180%)',
            } as object)
          : null,
      ]}>
      <View
        pointerEvents="none"
        style={[
          styles.glassTopHighlight,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : `${theme.accent}35` },
        ]}
      />
      {children}
    </View>
  );
}

function BrandHeroHeader({
  isCloudSyncEnabled,
  studentCount,
  teacherCount,
  subtitle,
}: {
  isCloudSyncEnabled: boolean;
  studentCount: number;
  teacherCount: number;
  subtitle?: string;
}) {
  const theme = useTheme();
  const isDark = useIsDark();
  const gradient = useBrandGradient();

  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandBadgeRow}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.brandLogoMark, Shadow.card]}>
          <Text style={styles.brandLogoText}>10T4</Text>
        </LinearGradient>
        <View style={styles.brandTitleWrap}>
          <Text style={[styles.brandTitle, { color: theme.text }]}>
            Lớp 10T4 · Cổng Thành Viên
          </Text>
          <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
            {subtitle ?? 'Đăng nhập thông minh · Đồng bộ tức thì mọi thiết bị'}
          </Text>
        </View>
      </View>

      <View style={styles.statusPillRow}>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.8)',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : theme.border,
            },
          ]}>
          <View
            style={[
              styles.liveDot,
              { backgroundColor: isCloudSyncEnabled ? theme.success : theme.warning },
            ]}
          />
          <Text style={[styles.statusPillText, { color: theme.textSecondary }]}>
            {isCloudSyncEnabled ? 'Đồng bộ Cloud trực tuyến' : 'Chế độ cục bộ'}
          </Text>
        </View>

        {studentCount > 0 || teacherCount > 0 ? (
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.8)',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : theme.border,
              },
            ]}>
            <Ionicons name="people-outline" size={12} color={theme.accent} />
            <Text style={[styles.statusPillText, { color: theme.textSecondary }]}>
              {studentCount} HS · {teacherCount} GV
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

type StyledInputProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  icon: IoniconName;
  secure?: boolean;
  showPassword?: boolean;
  onToggleShowPassword?: () => void;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'new-password' | 'name' | 'username' | 'off';
  returnKeyType?: 'next' | 'done' | 'go';
  onSubmitEditing?: () => void;
  error?: string | null;
  hint?: string;
  rightElement?: ReactNode;
  editable?: boolean;
};

function AuthInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  secure = false,
  showPassword = false,
  onToggleShowPassword,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoComplete = 'off',
  returnKeyType = 'next',
  onSubmitEditing,
  error,
  hint,
  rightElement,
  editable = true,
}: StyledInputProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.danger
    : focused
      ? theme.accent
      : isDark
        ? 'rgba(255,255,255,0.12)'
        : theme.border;

  const bgColor = focused
    ? theme.card
    : isDark
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(244, 232, 209, 0.42)';

  return (
    <View style={styles.fieldGroup}>
      {label ? (
        <View style={styles.fieldLabelRow}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
          {rightElement}
        </View>
      ) : null}
      <View
        style={[
          styles.inputBox,
          {
            backgroundColor: bgColor,
            borderColor,
          },
          focused && !error ? { shadowColor: theme.accent, ...styles.inputFocusGlow } : null,
        ]}>
        <Ionicons
          name={icon}
          size={18}
          color={error ? theme.danger : focused ? theme.accent : theme.textMuted}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secure && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.textInput, { color: theme.text }]}
        />
        {secure && onToggleShowPassword ? (
          <Pressable
            onPress={onToggleShowPassword}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={theme.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.fieldHelper, { color: theme.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.fieldHelper, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const theme = useTheme();
  const isDark = useIsDark();
  const info = evaluateAuthPasswordStrength(password);
  if (!password.trim()) return null;

  const activeColor = theme[info.color];
  const emptyColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(150, 120, 90, 0.22)';

  return (
    <View style={styles.strengthWrap}>
      <View style={styles.strengthBarRow}>
        {[1, 2, 3].map((step) => (
          <View
            key={step}
            style={[
              styles.strengthBar,
              { backgroundColor: info.bars >= step ? activeColor : emptyColor },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: activeColor }]}>{info.label}</Text>
    </View>
  );
}

function GradientSubmitButton({
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const gradient = useBrandGradient();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.primaryCta,
        { shadowColor: gradient[0] },
        pressed && !disabled && !loading ? styles.pressedScale : null,
        (disabled || loading) && styles.disabledOpacity,
      ]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <>
          <Text style={styles.primaryCtaText}>{label}</Text>
          {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
        </>
      )}
    </Pressable>
  );
}

function InlineCallout({
  tone,
  icon,
  title,
  message,
  onDismiss,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon: IoniconName;
  title?: string;
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const palette = {
    danger: { bg: theme.dangerSoft, fg: theme.danger, border: `${theme.danger}40` },
    warning: { bg: theme.warningSoft, fg: theme.warning, border: `${theme.warning}44` },
    info: { bg: theme.accentSoft, fg: theme.accentText, border: `${theme.accent}3A` },
    success: { bg: theme.successSoft, fg: theme.success, border: `${theme.success}40` },
  }[tone];

  return (
    <View
      style={[
        styles.calloutBox,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}>
      <View style={styles.calloutHeader}>
        <Ionicons name={icon} size={18} color={palette.fg} style={styles.calloutIcon} />
        <View style={styles.calloutBody}>
          {title ? (
            <Text style={[styles.calloutTitle, { color: palette.fg }]}>{title}</Text>
          ) : null}
          <Text style={[styles.calloutText, { color: theme.text }]}>{message}</Text>
          {actionLabel && onAction ? (
            <Pressable
              onPress={onAction}
              disabled={actionDisabled}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => [
                styles.calloutActionBtn,
                { borderColor: palette.border, backgroundColor: theme.card },
                pressed && !actionDisabled ? styles.pressedOpacity : null,
                actionDisabled && styles.disabledOpacity,
              ]}>
              <Ionicons name="paper-plane-outline" size={14} color={palette.fg} />
              <Text style={[styles.calloutActionText, { color: palette.fg }]}>
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Đóng thông báo">
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- Custom Cooldown Hook ---------- */

function useCooldownTimer() {
  const [remaining, setRemaining] = useState(0);
  const active = remaining > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const start = (seconds = RESEND_COOLDOWN_SECONDS) => {
    setRemaining(seconds);
  };

  return { remaining, start };
}

/* ---------- Live Class Login ID Availability Hook ---------- */

function useLiveIdAvailability(loginId: string, kind: RegisterKind) {
  const [checkedKey, setCheckedKey] = useState('');
  const [checkedKind, setCheckedKind] = useState<RegisterKind>(kind);
  const [checkedStatus, setCheckedStatus] = useState<IdAvailability>('idle');

  const trimmed = loginId.trim();
  const normalized = normalizeLoginIdDisplay(trimmed);

  useEffect(() => {
    if (!normalized) return;

    const validationError =
      kind === 'student' ? validateLoginId(normalized) : validateTeacherLoginId(normalized);
    if (validationError) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      const checkPromise =
        kind === 'student'
          ? isLoginIdTaken(normalized)
          : isTeacherLoginIdTaken(normalized);

      checkPromise
        .then((taken) => {
          if (cancelled) return;
          setCheckedKey(normalized);
          setCheckedKind(kind);
          setCheckedStatus(taken ? 'taken' : 'available');
        })
        .catch(() => {
          if (cancelled) return;
          setCheckedKey(normalized);
          setCheckedKind(kind);
          setCheckedStatus('idle');
        });
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized, kind]);

  if (!normalized) {
    return { status: 'idle' as IdAvailability, validationError: null as string | null };
  }

  const validationError =
    kind === 'student' ? validateLoginId(normalized) : validateTeacherLoginId(normalized);
  if (validationError) {
    return { status: 'invalid' as IdAvailability, validationError };
  }

  if (checkedKey !== normalized || checkedKind !== kind) {
    return { status: 'checking' as IdAvailability, validationError: null };
  }

  return { status: checkedStatus, validationError: null };
}

/* ---------- State 0: Loading Screen ---------- */

function LoadingGateView() {
  const theme = useTheme();
  const gradient = useBrandGradient();

  return (
    <AuthBackdrop>
      <FadeIn index={0}>
        <GlassAuthCard>
          <View style={styles.loadingCardInner}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.loadingLogoOrb, Shadow.card]}>
              <Text style={styles.loadingLogoText}>10T4</Text>
            </LinearGradient>
            <ActivityIndicator size="large" color={theme.accent} style={styles.loadingSpinner} />
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              Đang kết nối phiên đăng nhập lớp 10T4...
            </Text>
            <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
              Đồng bộ bảo mật tài khoản & dữ liệu trực tuyến
            </Text>
          </View>
        </GlassAuthCard>
      </FadeIn>
    </AuthBackdrop>
  );
}

/* ---------- State A: Password Recovery (New Password) ---------- */

function PasswordRecoveryView() {
  const auth = useAuth();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const passwordsMatch =
    confirmPassword.length > 0 && newPassword.trim() === confirmPassword.trim();
  const mismatchError =
    confirmPassword.length > 0 && !passwordsMatch ? 'Mật khẩu xác nhận chưa khớp.' : null;

  const handleSubmit = async () => {
    setLocalError(null);
    auth.clearError();
    const clean = newPassword.trim();
    if (clean.length < MIN_AUTH_PASSWORD_LENGTH) {
      setLocalError(`Mật khẩu mới cần ít nhất ${MIN_AUTH_PASSWORD_LENGTH} ký tự.`);
      triggerHaptic('error');
      return;
    }
    if (clean !== confirmPassword.trim()) {
      setLocalError('Mật khẩu xác nhận chưa khớp. Vui lòng nhập lại.');
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await auth.completePasswordReset(clean);
      if (res.ok) {
        triggerHaptic('success');
        showToast('Đã đặt mật khẩu mới thành công!', 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể cập nhật mật khẩu mới. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    triggerHaptic('light');
    await auth.cancelPasswordRecovery();
  };

  return (
    <AuthBackdrop>
      <FadeIn index={0}>
        <BrandHeroHeader
          isCloudSyncEnabled={auth.isCloudSyncEnabled}
          studentCount={auth.studentAccountCount}
          teacherCount={auth.teacherAccountCount}
          subtitle="Khôi phục bảo mật tài khoản qua Gmail"
        />
      </FadeIn>

      <FadeIn index={1}>
        <GlassAuthCard>
          <View style={styles.centerHeroBlock}>
            <EmailShieldIcon
              size={64}
              primaryColor={gradient[0]}
              accentColor={gradient[1]}
              variant="lock"
            />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Đặt mật khẩu mới</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              Liên kết khôi phục đã được xác thực. Hãy tạo mật khẩu mới thật an toàn cho tài
              khoản lớp 10T4 của bạn.
            </Text>
          </View>

          {localError || auth.error || auth.authCallbackError ? (
            <InlineCallout
              tone="danger"
              icon="alert-circle"
              message={localError ?? auth.error ?? auth.authCallbackError ?? ''}
              onDismiss={() => {
                setLocalError(null);
                auth.clearError();
                auth.clearAuthCallbackError();
              }}
            />
          ) : null}

          <View style={styles.formStack}>
            <View style={styles.fieldWithMeter}>
              <AuthInput
                label="Mật khẩu mới"
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  setLocalError(null);
                }}
                placeholder="Nhập ít nhất 6 ký tự"
                icon="lock-closed-outline"
                secure
                showPassword={showNew}
                onToggleShowPassword={() => setShowNew((v) => !v)}
                autoComplete="new-password"
              />
              <PasswordStrengthMeter password={newPassword} />
            </View>

            <AuthInput
              label="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setLocalError(null);
              }}
              placeholder="Nhập lại mật khẩu mới"
              icon="shield-checkmark-outline"
              secure
              showPassword={showConfirm}
              onToggleShowPassword={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              error={mismatchError}
              hint={passwordsMatch ? '✓ Mật khẩu xác nhận trùng khớp' : undefined}
            />

            <GradientSubmitButton
              label="Cập nhật mật khẩu mới"
              icon="checkmark-circle-outline"
              loading={submitting || auth.busy}
              onPress={handleSubmit}
            />

            <Pressable
              onPress={handleCancel}
              disabled={submitting || auth.busy}
              accessibilityRole="button"
              accessibilityLabel="Hủy và quay lại đăng nhập"
              style={({ pressed }) => [styles.ghostLinkBtn, pressed && styles.pressedOpacity]}>
              <Ionicons name="arrow-back-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.ghostLinkText, { color: theme.textSecondary }]}>
                Hủy & quay lại đăng nhập
              </Text>
            </Pressable>
          </View>
        </GlassAuthCard>
      </FadeIn>
    </AuthBackdrop>
  );
}

/* ---------- State B: First-Time OAuth Onboarding ---------- */

function OAuthOnboardingView({ user }: { user: PendingOAuthUser }) {
  const auth = useAuth();
  const theme = useTheme();
  const isDark = useIsDark();
  const { showToast } = useToast();

  const [tab, setTab] = useState<OnboardingTab>('create');

  // Create-new-account state
  const [roleKind, setRoleKind] = useState<RegisterKind>('student');
  const [fullName, setFullName] = useState(user.displayName ?? '');
  const [loginId, setLoginId] = useState('');
  const [group, setGroup] = useState<string>(GROUP_PRESETS[0]);
  const [gender, setGender] = useState<GenderChoice>('male');
  const [subject, setSubject] = useState<string>(SUBJECT_TEACHER_PRESETS[0].subject);
  const [customSubject, setCustomSubject] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [showOptionalPwSection, setShowOptionalPwSection] = useState(false);
  const [optionalPassword, setOptionalPassword] = useState('');
  const [confirmOptionalPassword, setConfirmOptionalPassword] = useState('');
  const [showOptPw, setShowOptPw] = useState(false);

  // Link-existing-account state
  const [linkKind, setLinkKind] = useState<LoginKind>('student');
  const [linkLoginId, setLinkLoginId] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [showLinkPw, setShowLinkPw] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [suggestingId, setSuggestingId] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const idCheck = useLiveIdAvailability(loginId, roleKind);

  const providerKind = user.primaryProvider;
  const providerLabel =
    providerKind === 'google'
      ? 'Google'
      : providerKind === 'github'
        ? 'GitHub'
        : 'Gmail';

  const handleSuggestId = async () => {
    triggerHaptic('light');
    setSuggestingId(true);
    try {
      const next =
        roleKind === 'student'
          ? await suggestNextLoginId('10T4')
          : await suggestNextTeacherLoginId(roleKind as TeacherRole);
      setLoginId(next);
    } finally {
      setSuggestingId(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setLocalError(null);
    auth.clearError();

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setLocalError('Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự).');
      triggerHaptic('error');
      return;
    }

    const trimmedId = loginId.trim();
    if (trimmedId) {
      if (idCheck.validationError) {
        setLocalError(idCheck.validationError);
        triggerHaptic('error');
        return;
      }
      if (idCheck.status === 'taken') {
        setLocalError(
          `Mã ID “${normalizeLoginIdDisplay(trimmedId)}” đã có người dùng. Hãy bấm “Gợi ý ID” hoặc chuyển sang tab “Liên kết Mã ID đã có”.`,
        );
        triggerHaptic('error');
        return;
      }
    }

    const resolvedSubject =
      roleKind === 'subject_teacher' ? (customSubject.trim() || subject).trim() : null;
    if (roleKind === 'subject_teacher' && !resolvedSubject) {
      setLocalError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
      triggerHaptic('error');
      return;
    }

    if (roleKind !== 'student' && !accessCode.trim()) {
      setLocalError('Vui lòng nhập Mã xác thực Giáo viên của lớp 10T4.');
      triggerHaptic('error');
      return;
    }

    const cleanOptPw = showOptionalPwSection ? optionalPassword.trim() : '';
    if (cleanOptPw) {
      if (cleanOptPw.length < MIN_AUTH_PASSWORD_LENGTH) {
        setLocalError(`Mật khẩu Gmail tùy chọn cần tối thiểu ${MIN_AUTH_PASSWORD_LENGTH} ký tự.`);
        triggerHaptic('error');
        return;
      }
      if (cleanOptPw !== confirmOptionalPassword.trim()) {
        setLocalError('Mật khẩu xác nhận chưa trùng khớp.');
        triggerHaptic('error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await auth.completeOAuthOnboarding({
        kind: roleKind,
        name: trimmedName,
        loginId: trimmedId ? normalizeLoginIdDisplay(trimmedId) : undefined,
        gender: roleKind === 'student' ? gender : undefined,
        group: roleKind === 'student' ? group : null,
        subject: resolvedSubject,
        accessCode: roleKind !== 'student' ? accessCode.trim() : undefined,
        optionalPassword: cleanOptPw || undefined,
      });
      if (res.ok) {
        triggerHaptic('success');
        showToast('Chào mừng bạn gia nhập lớp 10T4!', 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể hoàn tất tài khoản. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkExisting = async () => {
    setLocalError(null);
    auth.clearError();

    if (!linkLoginId.trim()) {
      setLocalError('Vui lòng nhập Mã ID lớp bạn đã đăng ký trước đây.');
      triggerHaptic('error');
      return;
    }
    if (!linkPassword.trim()) {
      setLocalError('Vui lòng nhập mật khẩu hiện tại của Mã ID này.');
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await auth.linkOAuthToExistingAccount({
        kind: linkKind,
        loginId: normalizeLoginIdDisplay(linkLoginId),
        password: linkPassword.trim(),
      });
      if (res.ok) {
        triggerHaptic('success');
        showToast(`Đã liên kết ${providerLabel} với tài khoản thành công!`, 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể liên kết tài khoản. Hãy kiểm tra lại Mã ID & mật khẩu.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthBackdrop>
      <FadeIn index={0}>
        <BrandHeroHeader
          isCloudSyncEnabled={auth.isCloudSyncEnabled}
          studentCount={auth.studentAccountCount}
          teacherCount={auth.teacherAccountCount}
          subtitle="Chỉ còn 1 bước nhỏ để hoàn tất hồ sơ lớp 10T4"
        />
      </FadeIn>

      <FadeIn index={1}>
        <GlassAuthCard>
          {/* Verified OAuth User Identity Banner */}
          <View
            style={[
              styles.oauthIdentityCard,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.backgroundElement,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.border,
              },
            ]}>
            <Avatar
              name={user.displayName || user.email || '10T4'}
              imageUrl={user.avatarUrl}
              size={62}
              ring
            />
            <View style={styles.oauthIdentityMeta}>
              <View style={styles.providerChipRow}>
                <View
                  style={[
                    styles.providerVerifiedPill,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}>
                  {providerKind === 'google' ? (
                    <GoogleLogoIcon size={14} />
                  ) : providerKind === 'github' ? (
                    <GitHubLogoIcon size={14} color={isDark ? '#FFFFFF' : '#161B22'} />
                  ) : (
                    <Ionicons name="mail" size={14} color={theme.accent} />
                  )}
                  <Text style={[styles.providerVerifiedText, { color: theme.text }]}>
                    Đã xác thực qua {providerLabel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.oauthUserName, { color: theme.text }]} numberOfLines={1}>
                {user.displayName || 'Thành viên mới 10T4'}
              </Text>
              {user.email ? (
                <Text style={[styles.oauthUserEmail, { color: theme.textSecondary }]} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
          </View>

          {auth.authCallbackError ? (
            <InlineCallout
              tone="warning"
              icon="information-circle"
              message={auth.authCallbackError}
              onDismiss={auth.clearAuthCallbackError}
            />
          ) : null}

          {/* Segmented Onboarding Mode Switch */}
          <View
            style={[
              styles.segmentedControl,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : theme.backgroundElement,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.border,
              },
            ]}>
            {(
              [
                { key: 'create', label: 'Tạo tài khoản mới', icon: 'person-add-outline' },
                { key: 'link', label: 'Liên kết Mã ID đã có', icon: 'link-outline' },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    triggerHaptic('light');
                    setTab(item.key);
                    setLocalError(null);
                    auth.clearError();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={[
                    styles.segmentedTab,
                    active
                      ? [styles.segmentedTabActive, { backgroundColor: theme.card }, Shadow.card]
                      : null,
                  ]}>
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={active ? theme.accent : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.segmentedTabText,
                      { color: active ? theme.text : theme.textSecondary },
                    ]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {localError || auth.error ? (
            <InlineCallout
              tone="danger"
              icon="alert-circle"
              message={localError ?? auth.error ?? ''}
              onDismiss={() => {
                setLocalError(null);
                auth.clearError();
              }}
            />
          ) : null}

          {tab === 'create' ? (
            <View style={styles.formStack}>
              {/* Role Selector */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  Vai trò trong lớp 10T4
                </Text>
                <View style={styles.roleThreeGrid}>
                  {(
                    [
                      { key: 'student', label: 'Học sinh 10T4', icon: 'school-outline' },
                      { key: 'subject_teacher', label: 'GV Bộ môn', icon: 'book-outline' },
                      { key: 'teacher', label: 'GV Chủ nhiệm', icon: 'shield-checkmark-outline' },
                    ] as const
                  ).map((item) => {
                    const selected = roleKind === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => {
                          triggerHaptic('light');
                          if ((roleKind === 'student') !== (item.key === 'student')) {
                            setLoginId('');
                          }
                          setRoleKind(item.key);
                          setLocalError(null);
                          auth.clearError();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        style={[
                          styles.roleCardPill,
                          {
                            backgroundColor: selected
                              ? theme.accentSoft
                              : isDark
                                ? 'rgba(255,255,255,0.04)'
                                : theme.card,
                            borderColor: selected ? theme.accent : theme.border,
                          },
                        ]}>
                        <Ionicons
                          name={item.icon}
                          size={16}
                          color={selected ? theme.accent : theme.textMuted}
                        />
                        <Text
                          style={[
                            styles.roleCardLabel,
                            { color: selected ? theme.accentText : theme.textSecondary },
                          ]}
                          numberOfLines={1}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <AuthInput
                label="Họ và tên hiển thị"
                value={fullName}
                onChangeText={(v) => {
                  setFullName(v);
                  setLocalError(null);
                }}
                placeholder="VD: Nguyễn Minh Anh"
                icon="person-outline"
                autoCapitalize="words"
                autoComplete="name"
              />

              {/* Optional Editable Class Login ID */}
              <AuthInput
                label="Mã ID lớp (tùy chọn)"
                value={loginId}
                onChangeText={(v) => {
                  setLoginId(v.toUpperCase());
                  setLocalError(null);
                }}
                placeholder={roleKind === 'student' ? 'VD: 10T4-01 (để trống tự cấp)' : 'VD: GVCN-01 (để trống tự cấp)'}
                icon="id-card-outline"
                autoCapitalize="characters"
                rightElement={
                  <Pressable
                    onPress={handleSuggestId}
                    disabled={suggestingId}
                    accessibilityRole="button"
                    accessibilityLabel="Gợi ý Mã ID trống"
                    style={({ pressed }) => [
                      styles.suggestPill,
                      { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}35` },
                      pressed && styles.pressedOpacity,
                    ]}>
                    <Ionicons name="sparkles" size={12} color={theme.accent} />
                    <Text style={[styles.suggestPillText, { color: theme.accentText }]}>
                      {suggestingId ? 'Đang tạo...' : 'Gợi ý ID'}
                    </Text>
                  </Pressable>
                }
                error={
                  idCheck.status === 'invalid'
                    ? idCheck.validationError
                    : idCheck.status === 'taken'
                      ? 'Mã ID này đã tồn tại — hãy chọn mã khác hoặc bấm Gợi ý ID.'
                      : null
                }
                hint={
                  idCheck.status === 'available'
                    ? '✓ Mã ID khả dụng'
                    : idCheck.status === 'checking'
                      ? 'Đang kiểm tra Mã ID...'
                      : 'Để trống hệ thống sẽ tự tạo Mã ID lớp gọn đẹp cho bạn.'
                }
              />

              {roleKind === 'student' ? (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Tổ sinh hoạt</Text>
                    <View style={styles.chipWrap}>
                      {GROUP_PRESETS.map((g) => (
                        <Chip
                          key={g}
                          label={g}
                          selected={group === g}
                          onPress={() => {
                            triggerHaptic('light');
                            setGroup(g);
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Giới tính</Text>
                    <View style={styles.twoColRow}>
                      {(
                        [
                          { key: 'male', label: 'Nam', icon: 'male-outline' },
                          { key: 'female', label: 'Nữ', icon: 'female-outline' },
                        ] as const
                      ).map((opt) => {
                        const selected = gender === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => {
                              triggerHaptic('light');
                              setGender(opt.key);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Giới tính ${opt.label}`}
                            style={[
                              styles.genderPill,
                              {
                                backgroundColor: selected ? theme.accentSoft : theme.card,
                                borderColor: selected ? theme.accent : theme.border,
                              },
                            ]}>
                            <Ionicons
                              name={opt.icon}
                              size={16}
                              color={selected ? theme.accent : theme.textMuted}
                            />
                            <Text
                              style={[
                                styles.genderLabel,
                                { color: selected ? theme.accentText : theme.textSecondary },
                              ]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  {roleKind === 'subject_teacher' ? (
                    <View style={styles.fieldGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                        Bộ môn giảng dạy
                      </Text>
                      <View style={styles.chipWrap}>
                        {SUBJECT_TEACHER_PRESETS.map((preset) => (
                          <Chip
                            key={preset.subject}
                            label={`${preset.emoji} ${preset.subject}`}
                            selected={!customSubject.trim() && subject === preset.subject}
                            onPress={() => {
                              triggerHaptic('light');
                              setSubject(preset.subject);
                              setCustomSubject('');
                            }}
                          />
                        ))}
                      </View>
                      <AuthInput
                        value={customSubject}
                        onChangeText={setCustomSubject}
                        placeholder="Hoặc nhập tên bộ môn khác..."
                        icon="create-outline"
                        autoCapitalize="sentences"
                      />
                    </View>
                  ) : null}

                  <AuthInput
                    label="Mã xác thực Giáo viên"
                    value={accessCode}
                    onChangeText={(v) => {
                      setAccessCode(v);
                      setLocalError(null);
                    }}
                    placeholder="Nhập mã xác thực GV lớp 10T4"
                    icon="key-outline"
                    secure
                    showPassword={showAccessCode}
                    onToggleShowPassword={() => setShowAccessCode((v) => !v)}
                    hint="Chỉ giáo viên được cấp mã mới tạo được tài khoản GV."
                  />
                </>
              )}

              {/* Expandable Optional Gmail Password */}
              <View
                style={[
                  styles.optionalSection,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : theme.backgroundElement,
                    borderColor: isDark ? 'rgba(255,255,255,0.09)' : theme.border,
                  },
                ]}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    setShowOptionalPwSection((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Đặt mật khẩu Gmail tùy chọn"
                  style={styles.optionalToggleRow}>
                  <View style={styles.optionalToggleLeft}>
                    <Ionicons name="key-outline" size={16} color={theme.accent} />
                    <Text style={[styles.optionalToggleTitle, { color: theme.text }]}>
                      Đặt mật khẩu Gmail (tùy chọn)
                    </Text>
                  </View>
                  <Ionicons
                    name={showOptionalPwSection ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.textMuted}
                  />
                </Pressable>
                <Text style={[styles.optionalSubtitle, { color: theme.textMuted }]}>
                  {providerKind === 'email'
                    ? 'Đặt mật khẩu riêng để đăng nhập trực tiếp bằng Gmail + Mật khẩu ở mọi thiết bị.'
                    : `Giúp bạn đăng nhập được cả bằng Gmail + Mật khẩu ngoài nút 1 chạm ${providerLabel}.`}
                </Text>

                {showOptionalPwSection ? (
                  <View style={styles.optionalFields}>
                    <View style={styles.fieldWithMeter}>
                      <AuthInput
                        label="Mật khẩu Gmail"
                        value={optionalPassword}
                        onChangeText={setOptionalPassword}
                        placeholder="Tối thiểu 6 ký tự"
                        icon="lock-closed-outline"
                        secure
                        showPassword={showOptPw}
                        onToggleShowPassword={() => setShowOptPw((v) => !v)}
                        autoComplete="new-password"
                      />
                      <PasswordStrengthMeter password={optionalPassword} />
                    </View>
                    <AuthInput
                      label="Xác nhận mật khẩu"
                      value={confirmOptionalPassword}
                      onChangeText={setConfirmOptionalPassword}
                      placeholder="Nhập lại mật khẩu"
                      icon="shield-checkmark-outline"
                      secure
                      showPassword={showOptPw}
                      onToggleShowPassword={() => setShowOptPw((v) => !v)}
                      autoComplete="new-password"
                      error={
                        confirmOptionalPassword && optionalPassword.trim() !== confirmOptionalPassword.trim()
                          ? 'Mật khẩu xác nhận chưa khớp.'
                          : null
                      }
                    />
                  </View>
                ) : null}
              </View>

              <GradientSubmitButton
                label="Hoàn tất & Vào lớp 10T4 ✨"
                loading={submitting || auth.busy}
                onPress={handleCompleteOnboarding}
              />
            </View>
          ) : (
            <View style={styles.formStack}>
              <InlineCallout
                tone="info"
                icon="link"
                message={
                  providerKind === 'email'
                    ? 'Đã có Mã ID lớp 10T4 trước đó? Nhập Mã ID & mật khẩu hiện tại để gắn liền với Gmail này — đồng bộ mượt trên mọi thiết bị!'
                    : `Đã có Mã ID lớp 10T4 trước đó? Nhập Mã ID & mật khẩu hiện tại để gắn liền với tài khoản ${providerLabel} này — từ lần sau chỉ cần bấm 1 chạm để vào ngay!`
                }
              />

              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Loại tài khoản</Text>
                <View style={styles.twoColRow}>
                  {(
                    [
                      { key: 'student', label: 'Học sinh', icon: 'school-outline' },
                      { key: 'teacher', label: 'Giáo viên', icon: 'shield-checkmark-outline' },
                    ] as const
                  ).map((opt) => {
                    const selected = linkKind === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          triggerHaptic('light');
                          if (linkKind !== opt.key) {
                            setLinkLoginId('');
                          }
                          setLinkKind(opt.key);
                          setLocalError(null);
                          auth.clearError();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Liên kết tài khoản ${opt.label}`}
                        style={[
                          styles.genderPill,
                          {
                            backgroundColor: selected ? theme.accentSoft : theme.card,
                            borderColor: selected ? theme.accent : theme.border,
                          },
                        ]}>
                        <Ionicons
                          name={opt.icon}
                          size={16}
                          color={selected ? theme.accent : theme.textMuted}
                        />
                        <Text
                          style={[
                            styles.genderLabel,
                            { color: selected ? theme.accentText : theme.textSecondary },
                          ]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <AuthInput
                label="Mã ID lớp hiện có"
                value={linkLoginId}
                onChangeText={(v) => {
                  setLinkLoginId(v.toUpperCase());
                  setLocalError(null);
                }}
                placeholder={linkKind === 'student' ? 'VD: 10T4-01' : 'VD: GVCN-01'}
                icon="id-card-outline"
                autoCapitalize="characters"
              />

              <AuthInput
                label="Mật khẩu hiện tại của Mã ID"
                value={linkPassword}
                onChangeText={(v) => {
                  setLinkPassword(v);
                  setLocalError(null);
                }}
                placeholder="Nhập mật khẩu cá nhân"
                icon="lock-closed-outline"
                secure
                showPassword={showLinkPw}
                onToggleShowPassword={() => setShowLinkPw((v) => !v)}
                returnKeyType="done"
                onSubmitEditing={handleLinkExisting}
              />

              <GradientSubmitButton
                label="Liên kết & Đăng nhập ngay"
                icon="arrow-forward"
                loading={submitting || auth.busy}
                onPress={handleLinkExisting}
              />
            </View>
          )}

          {/* Switch OAuth Account Footer */}
          <View style={[styles.footerDivider, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                void auth.signOut();
              }}
              disabled={submitting || auth.busy}
              accessibilityRole="button"
              accessibilityLabel="Dùng tài khoản Google hoặc GitHub khác"
              style={({ pressed }) => [styles.ghostLinkBtn, pressed && styles.pressedOpacity]}>
              <Ionicons name="swap-horizontal-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.ghostLinkText, { color: theme.textSecondary }]}>
                Dùng tài khoản Google / GitHub khác
              </Text>
            </Pressable>
          </View>
        </GlassAuthCard>
      </FadeIn>
    </AuthBackdrop>
  );
}

/* ---------- Email Confirmation Sent Card ---------- */

function EmailConfirmationCard({
  email,
  onConfirmedGoToLogin,
}: {
  email: string;
  onConfirmedGoToLogin: (email: string) => void;
}) {
  const auth = useAuth();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();
  const cooldown = useCooldownTimer();
  const [resending, setResending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleResend = async () => {
    if (cooldown.remaining > 0 || resending) return;
    setLocalError(null);
    setResending(true);
    try {
      const res = await auth.resendConfirmationEmail(email);
      if (res.ok) {
        triggerHaptic('success');
        cooldown.start(RESEND_COOLDOWN_SECONDS);
        showToast('Đã gửi lại email xác nhận tới Gmail của bạn!', 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Chưa thể gửi lại email xác nhận. Vui lòng thử lại sau ít phút.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.formStack}>
      <View style={styles.centerHeroBlock}>
        <EmailShieldIcon
          size={64}
          primaryColor={gradient[0]}
          accentColor={gradient[1]}
          variant="mail"
        />
        <Badge label="Chờ xác nhận Gmail" color="success" soft="successSoft" icon="mail-unread" />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Kiểm tra hộp thư Gmail của bạn
        </Text>
        <View
          style={[
            styles.emailHighlightPill,
            { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}38` },
          ]}>
          <Ionicons name="mail" size={15} color={theme.accent} />
          <Text style={[styles.emailHighlightText, { color: theme.accentText }]}>{email}</Text>
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Hệ thống đã gửi một email xác nhận bảo mật tới địa chỉ trên. Hãy mở Gmail và bấm vào
          nút xác nhận (kiểm tra thêm mục Thư rác / Spam nếu chưa thấy), sau đó đăng nhập để vào
          lớp 10T4 ngay.
        </Text>
      </View>

      {localError ? (
        <InlineCallout
          tone="danger"
          icon="alert-circle"
          message={localError}
          onDismiss={() => setLocalError(null)}
        />
      ) : null}

      <GradientSubmitButton
        label="Tôi đã xác nhận — Đăng nhập ngay"
        icon="arrow-forward"
        onPress={() => {
          triggerHaptic('light');
          auth.clearPendingEmailConfirmation();
          onConfirmedGoToLogin(email);
        }}
      />

      <Pressable
        onPress={handleResend}
        disabled={cooldown.remaining > 0 || resending}
        accessibilityRole="button"
        accessibilityLabel="Gửi lại email xác nhận"
        style={({ pressed }) => [
          styles.secondaryOutlineBtn,
          { borderColor: theme.border, backgroundColor: theme.card },
          pressed && cooldown.remaining === 0 ? styles.pressedOpacity : null,
          (cooldown.remaining > 0 || resending) && styles.disabledOpacity,
        ]}>
        {resending ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Ionicons name="refresh-outline" size={16} color={theme.accent} />
        )}
        <Text style={[styles.secondaryOutlineText, { color: theme.text }]}>
          {cooldown.remaining > 0
            ? `Gửi lại email xác nhận (${cooldown.remaining}s)`
            : 'Gửi lại email xác nhận'}
        </Text>
      </Pressable>
    </View>
  );
}

/* ---------- Forgot Password Sub-View ---------- */

function ForgotPasswordPanel({
  initialEmail,
  onBackToLogin,
}: {
  initialEmail: string;
  onBackToLogin: () => void;
}) {
  const auth = useAuth();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();
  const cooldown = useCooldownTimer();

  const [email, setEmail] = useState(initialEmail);
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSendReset = async () => {
    setLocalError(null);
    auth.clearError();
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setLocalError('Vui lòng nhập đúng địa chỉ Gmail đã đăng ký (VD: ten@gmail.com).');
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await auth.requestPasswordReset(clean);
      if (res.ok) {
        triggerHaptic('success');
        setSentToEmail(clean);
        cooldown.start(RESEND_COOLDOWN_SECONDS);
        showToast('Đã gửi email đặt lại mật khẩu tới Gmail của bạn!', 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.formStack}>
      <Pressable
        onPress={() => {
          triggerHaptic('light');
          onBackToLogin();
        }}
        accessibilityRole="button"
        accessibilityLabel="Quay lại đăng nhập"
        style={({ pressed }) => [styles.backRowBtn, pressed && styles.pressedOpacity]}>
        <Ionicons name="arrow-back" size={16} color={theme.accent} />
        <Text style={[styles.backRowText, { color: theme.accentText }]}>Quay lại đăng nhập</Text>
      </Pressable>

      <View style={styles.centerHeroBlock}>
        <EmailShieldIcon
          size={62}
          primaryColor={gradient[0]}
          accentColor={gradient[1]}
          variant="mail"
        />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quên mật khẩu?</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
          Nhập Gmail đã đăng ký — hệ thống sẽ tự động gửi email đặt lại mật khẩu riêng tới hộp thư
          của bạn.
        </Text>
      </View>

      {localError || auth.error ? (
        <InlineCallout
          tone="danger"
          icon="alert-circle"
          message={localError ?? auth.error ?? ''}
          onDismiss={() => {
            setLocalError(null);
            auth.clearError();
          }}
        />
      ) : null}

      {sentToEmail ? (
        <View style={styles.formStack}>
          <InlineCallout
            tone="success"
            icon="checkmark-circle"
            title="Đã gửi email đặt lại mật khẩu!"
            message={`Kiểm tra hộp thư ${sentToEmail} (và mục Thư rác / Spam nếu chưa thấy). Bấm vào liên kết trong email để mở màn hình tạo mật khẩu mới.`}
          />

          <Pressable
            onPress={handleSendReset}
            disabled={cooldown.remaining > 0 || submitting}
            accessibilityRole="button"
            accessibilityLabel="Gửi lại email đặt lại mật khẩu"
            style={({ pressed }) => [
              styles.secondaryOutlineBtn,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && cooldown.remaining === 0 ? styles.pressedOpacity : null,
              (cooldown.remaining > 0 || submitting) && styles.disabledOpacity,
            ]}>
            {submitting ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="refresh-outline" size={16} color={theme.accent} />
            )}
            <Text style={[styles.secondaryOutlineText, { color: theme.text }]}>
              {cooldown.remaining > 0
                ? `Gửi lại email sau (${cooldown.remaining}s)`
                : 'Gửi lại email đặt lại mật khẩu'}
            </Text>
          </Pressable>

          <GradientSubmitButton
            label="← Quay lại đăng nhập"
            onPress={onBackToLogin}
          />
        </View>
      ) : (
        <View style={styles.formStack}>
          <AuthInput
            label="Địa chỉ Gmail đã đăng ký"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setLocalError(null);
            }}
            placeholder="ten@gmail.com"
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={handleSendReset}
          />

          <GradientSubmitButton
            label="Gửi email đặt lại mật khẩu"
            icon="paper-plane-outline"
            loading={submitting || auth.busy}
            onPress={handleSendReset}
          />
        </View>
      )}
    </View>
  );
}

/* ---------- State C: Main Auth Portal (OAuth + Login + Register + Forgot) ---------- */

function MainAuthPortal() {
  const auth = useAuth();
  const theme = useTheme();
  const isDark = useIsDark();
  const { showToast } = useToast();
  const loginResendCooldown = useCooldownTimer();

  const [subView, setSubView] = useState<AuthSubView>('login');
  const [oauthBusyProvider, setOauthBusyProvider] = useState<'google' | 'github' | null>(null);
  const [oauthNotEnabledName, setOauthNotEnabledName] = useState<string | null>(null);

  // Login form state
  const [loginRole, setLoginRole] = useState<LoginKind>('student');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [unconfirmedLoginEmail, setUnconfirmedLoginEmail] = useState<string | null>(null);
  const [resendingLoginConfirm, setResendingLoginConfirm] = useState(false);

  // Register form state
  const [regRole, setRegRole] = useState<RegisterKind>('student');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegConfirmPw, setShowRegConfirmPw] = useState(false);
  const [regName, setRegName] = useState('');
  const [regGroup, setRegGroup] = useState<string>(GROUP_PRESETS[0]);
  const [regGender, setRegGender] = useState<GenderChoice>('male');
  const [regSubject, setRegSubject] = useState<string>(SUBJECT_TEACHER_PRESETS[0].subject);
  const [regCustomSubject, setRegCustomSubject] = useState('');
  const [regAccessCode, setRegAccessCode] = useState('');
  const [showRegAccessCode, setShowRegAccessCode] = useState(false);
  const [regLoginId, setRegLoginId] = useState('');
  const [suggestingRegId, setSuggestingRegId] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const regIdCheck = useLiveIdAvailability(regLoginId, regRole);

  const switchSubView = (next: AuthSubView) => {
    triggerHaptic('light');
    setSubView(next);
    setLocalError(null);
    setUnconfirmedLoginEmail(null);
    setOauthNotEnabledName(null);
    auth.clearError();
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    triggerHaptic('light');
    setLocalError(null);
    setOauthNotEnabledName(null);
    auth.clearError();
    auth.clearAuthCallbackError();

    setOauthBusyProvider(provider);
    try {
      const res =
        provider === 'google' ? await auth.signInWithGoogle() : await auth.signInWithGithub();
      if (res.providerNotEnabled) {
        setOauthNotEnabledName(provider === 'google' ? 'Google' : 'GitHub');
        triggerHaptic('error');
      } else if (!res.ok && res.error) {
        setLocalError(res.error);
        triggerHaptic('error');
      }
    } finally {
      setOauthBusyProvider(null);
    }
  };

  const handleLogin = async () => {
    setLocalError(null);
    setUnconfirmedLoginEmail(null);
    auth.clearError();

    const identifier = loginIdentifier.trim();
    const password = loginPassword.trim();

    if (loginRole === 'student' && !identifier) {
      setLocalError('Vui lòng nhập Gmail hoặc Mã ID lớp của bạn.');
      triggerHaptic('error');
      return;
    }
    if (!password) {
      setLocalError('Vui lòng nhập mật khẩu.');
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await auth.signInWithEmailOrId({
        kind: loginRole,
        identifier,
        password,
      });
      if (res.ok) {
        triggerHaptic('success');
        showToast('Đăng nhập thành công! Chào mừng trở lại 10T4', 'success');
      } else {
        triggerHaptic('error');
        if (res.emailNotConfirmed && identifier.includes('@')) {
          setUnconfirmedLoginEmail(identifier.toLowerCase());
        }
        setLocalError(res.error ?? 'Thông tin đăng nhập chưa chính xác.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendUnconfirmedLogin = async () => {
    if (!unconfirmedLoginEmail || loginResendCooldown.remaining > 0 || resendingLoginConfirm) {
      return;
    }
    setResendingLoginConfirm(true);
    try {
      const res = await auth.resendConfirmationEmail(unconfirmedLoginEmail);
      if (res.ok) {
        triggerHaptic('success');
        loginResendCooldown.start(RESEND_COOLDOWN_SECONDS);
        showToast('Đã gửi lại email xác nhận tới Gmail của bạn!', 'success');
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể gửi lại email xác nhận lúc này.');
      }
    } finally {
      setResendingLoginConfirm(false);
    }
  };

  const handleSuggestRegId = async () => {
    triggerHaptic('light');
    setSuggestingRegId(true);
    try {
      const next =
        regRole === 'student'
          ? await suggestNextLoginId('10T4')
          : await suggestNextTeacherLoginId(regRole as TeacherRole);
      setRegLoginId(next);
    } finally {
      setSuggestingRegId(false);
    }
  };

  const handleRegister = async () => {
    setLocalError(null);
    auth.clearError();

    const cleanEmail = regEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setLocalError('Vui lòng nhập đúng địa chỉ Gmail hợp lệ (VD: ten@gmail.com).');
      triggerHaptic('error');
      return;
    }

    const cleanPassword = regPassword.trim();
    if (cleanPassword.length < MIN_AUTH_PASSWORD_LENGTH) {
      setLocalError(`Mật khẩu cần tối thiểu ${MIN_AUTH_PASSWORD_LENGTH} ký tự.`);
      triggerHaptic('error');
      return;
    }

    if (cleanPassword !== regConfirmPassword.trim()) {
      setLocalError('Mật khẩu xác nhận chưa trùng khớp.');
      triggerHaptic('error');
      return;
    }

    const cleanName = regName.trim();
    if (cleanName.length < 2) {
      setLocalError('Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự).');
      triggerHaptic('error');
      return;
    }

    const resolvedSubject =
      regRole === 'subject_teacher' ? (regCustomSubject.trim() || regSubject).trim() : null;
    if (regRole === 'subject_teacher' && !resolvedSubject) {
      setLocalError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
      triggerHaptic('error');
      return;
    }

    if (regRole !== 'student' && !regAccessCode.trim()) {
      setLocalError('Vui lòng nhập Mã xác thực Giáo viên của lớp 10T4.');
      triggerHaptic('error');
      return;
    }

    const cleanLoginId = regLoginId.trim();
    if (cleanLoginId) {
      if (regIdCheck.validationError) {
        setLocalError(regIdCheck.validationError);
        triggerHaptic('error');
        return;
      }
      if (regIdCheck.status === 'taken') {
        setLocalError(
          `Mã ID “${normalizeLoginIdDisplay(cleanLoginId)}” đã có người dùng. Hãy bấm “Gợi ý ID” hoặc để trống để tự cấp.`,
        );
        triggerHaptic('error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await auth.registerWithEmailAndPassword({
        kind: regRole,
        email: cleanEmail,
        password: cleanPassword,
        name: cleanName,
        loginId: cleanLoginId ? normalizeLoginIdDisplay(cleanLoginId) : undefined,
        gender: regRole === 'student' ? regGender : undefined,
        group: regRole === 'student' ? regGroup : null,
        subject: resolvedSubject,
        accessCode: regRole !== 'student' ? regAccessCode.trim() : undefined,
      });

      if (res.ok) {
        triggerHaptic('success');
        if (res.needsEmailConfirmation) {
          showToast('Đã gửi email xác nhận tới Gmail của bạn!', 'info');
        } else {
          showToast('Tạo tài khoản thành công & đã cập nhật tên lên lớp 10T4!', 'success');
        }
      } else {
        triggerHaptic('error');
        setLocalError(res.error ?? 'Không thể tạo tài khoản. Vui lòng thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showPendingConfirmCard = Boolean(auth.pendingEmailConfirmation);
  const identifierIsEmail = loginIdentifier.includes('@');
  const prefillForgotEmail = identifierIsEmail ? loginIdentifier.trim() : '';
  const anyOAuthBusy = oauthBusyProvider !== null || auth.busy;

  return (
    <AuthBackdrop>
      <FadeIn index={0}>
        <BrandHeroHeader
          isCloudSyncEnabled={auth.isCloudSyncEnabled}
          studentCount={auth.studentAccountCount}
          teacherCount={auth.teacherAccountCount}
        />
      </FadeIn>

      <FadeIn index={1}>
        <GlassAuthCard>
          {auth.authCallbackError ? (
            <View style={styles.topBannerSpacing}>
              <InlineCallout
                tone="danger"
                icon="alert-circle"
                title="Đăng nhập chưa hoàn tất"
                message={auth.authCallbackError}
                onDismiss={auth.clearAuthCallbackError}
              />
            </View>
          ) : null}

          {showPendingConfirmCard && auth.pendingEmailConfirmation ? (
            <EmailConfirmationCard
              email={auth.pendingEmailConfirmation}
              onConfirmedGoToLogin={(confirmedEmail) => {
                setLoginIdentifier(confirmedEmail);
                setSubView('login');
                setLocalError(null);
                setOauthNotEnabledName(null);
                auth.clearError();
              }}
            />
          ) : subView === 'forgot' ? (
            <ForgotPasswordPanel
              initialEmail={prefillForgotEmail}
              onBackToLogin={() => switchSubView('login')}
            />
          ) : (
            <>
              {/* 1-Tap OAuth Hero Section */}
              <View style={styles.oauthHeroSection}>
                <Pressable
                  onPress={() => handleOAuth('google')}
                  disabled={anyOAuthBusy || submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Tiếp tục với Google"
                  style={({ pressed }) => [
                    styles.googleButton,
                    Shadow.card,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.22)' : '#DADCE0',
                    },
                    pressed && !anyOAuthBusy ? styles.pressedScale : null,
                    (anyOAuthBusy || submitting) && styles.disabledOpacity,
                  ]}>
                  {oauthBusyProvider === 'google' ? (
                    <ActivityIndicator size="small" color="#1F2937" />
                  ) : (
                    <GoogleLogoIcon size={20} />
                  )}
                  <Text style={styles.googleButtonText}>Tiếp tục với Google</Text>
                </Pressable>

                <Pressable
                  onPress={() => handleOAuth('github')}
                  disabled={anyOAuthBusy || submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Tiếp tục với GitHub"
                  style={({ pressed }) => [
                    styles.githubButton,
                    Shadow.card,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.18)' : '#24292F',
                    },
                    pressed && !anyOAuthBusy ? styles.pressedScale : null,
                    (anyOAuthBusy || submitting) && styles.disabledOpacity,
                  ]}>
                  {oauthBusyProvider === 'github' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <GitHubLogoIcon size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.githubButtonText}>Tiếp tục với GitHub</Text>
                </Pressable>

                <Text style={[styles.oauthMicroCaption, { color: theme.textMuted }]}>
                  Tài khoản đã đăng ký bấm 1 chạm để vào ngay · Tài khoản mới tự mở bước tạo hồ sơ
                </Text>

                {oauthNotEnabledName ? (
                  <InlineCallout
                    tone="info"
                    icon="information-circle"
                    title={`Đăng nhập ${oauthNotEnabledName} đang chờ bật trên máy chủ`}
                    message={`Quản trị viên cần bật nhà cung cấp ${oauthNotEnabledName} trong Supabase Dashboard (Authentication → Providers). Trong lúc chờ, bạn vẫn đăng nhập / đăng ký ngay bằng Gmail & Mật khẩu hoặc Mã ID lớp bên dưới!`}
                    onDismiss={() => setOauthNotEnabledName(null)}
                  />
                ) : null}
              </View>

              {/* Sleek Divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.textMuted }]}>
                  hoặc tiếp tục bằng Gmail / Mã ID
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              {/* Clean Segmented Switch: Đăng nhập | Tạo tài khoản mới */}
              <View
                style={[
                  styles.segmentedControl,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : theme.backgroundElement,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : theme.border,
                  },
                ]}>
                {(
                  [
                    { key: 'login', label: 'Đăng nhập', icon: 'log-in-outline' },
                    { key: 'register', label: 'Tạo tài khoản mới', icon: 'sparkles-outline' },
                  ] as const
                ).map((item) => {
                  const active = subView === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => switchSubView(item.key)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      style={[
                        styles.segmentedTab,
                        active
                          ? [styles.segmentedTabActive, { backgroundColor: theme.card }, Shadow.card]
                          : null,
                      ]}>
                      <Ionicons
                        name={item.icon}
                        size={15}
                        color={active ? theme.accent : theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.segmentedTabText,
                          { color: active ? theme.text : theme.textSecondary },
                        ]}
                        numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Main Login Form */}
              {subView === 'login' ? (
                <View style={styles.formStack}>
                  {/* Role Selector Pill */}
                  <View style={styles.twoColRow}>
                    {(
                      [
                        { key: 'student', label: 'Học sinh', icon: 'school-outline' },
                        { key: 'teacher', label: 'Giáo viên', icon: 'shield-checkmark-outline' },
                      ] as const
                    ).map((opt) => {
                      const selected = loginRole === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => {
                            triggerHaptic('light');
                            setLoginRole(opt.key);
                            setLocalError(null);
                            setUnconfirmedLoginEmail(null);
                            auth.clearError();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Đăng nhập vai trò ${opt.label}`}
                          style={[
                            styles.genderPill,
                            {
                              backgroundColor: selected ? theme.accentSoft : theme.card,
                              borderColor: selected ? theme.accent : theme.border,
                            },
                          ]}>
                          <Ionicons
                            name={opt.icon}
                            size={16}
                            color={selected ? theme.accent : theme.textMuted}
                          />
                          <Text
                            style={[
                              styles.genderLabel,
                              { color: selected ? theme.accentText : theme.textSecondary },
                            ]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <AuthInput
                    label="Gmail hoặc Mã ID lớp"
                    value={loginIdentifier}
                    onChangeText={(v) => {
                      setLoginIdentifier(v);
                      setLocalError(null);
                      setUnconfirmedLoginEmail(null);
                    }}
                    placeholder={
                      loginRole === 'student'
                        ? 'ten@gmail.com hoặc 10T4-01'
                        : 'ten@gmail.com hoặc GVCN-01 (để trống nếu dùng mã GV)'
                    }
                    icon={identifierIsEmail ? 'mail-outline' : 'id-card-outline'}
                    keyboardType={identifierIsEmail ? 'email-address' : 'default'}
                    autoCapitalize="none"
                    autoComplete="username"
                  />

                  <AuthInput
                    label="Mật khẩu"
                    value={loginPassword}
                    onChangeText={(v) => {
                      setLoginPassword(v);
                      setLocalError(null);
                    }}
                    placeholder={
                      loginRole === 'teacher' && !loginIdentifier.trim()
                        ? 'Nhập mật khẩu cá nhân hoặc mã xác thực GV'
                        : 'Nhập mật khẩu của bạn'
                    }
                    icon="lock-closed-outline"
                    secure
                    showPassword={showLoginPw}
                    onToggleShowPassword={() => setShowLoginPw((v) => !v)}
                    autoComplete="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    rightElement={
                      <Pressable
                        onPress={() => switchSubView('forgot')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Quên mật khẩu">
                        <Text style={[styles.forgotLinkText, { color: theme.accent }]}>
                          Quên mật khẩu?
                        </Text>
                      </Pressable>
                    }
                  />

                  {unconfirmedLoginEmail ? (
                    <InlineCallout
                      tone="warning"
                      icon="mail-unread"
                      title="Gmail chưa được xác nhận"
                      message={`Tài khoản ${unconfirmedLoginEmail} cần xác nhận liên kết trong Gmail trước khi đăng nhập lần đầu.`}
                      actionLabel={
                        loginResendCooldown.remaining > 0
                          ? `Gửi lại sau (${loginResendCooldown.remaining}s)`
                          : resendingLoginConfirm
                            ? 'Đang gửi lại...'
                            : 'Gửi lại email xác nhận'
                      }
                      actionDisabled={loginResendCooldown.remaining > 0 || resendingLoginConfirm}
                      onAction={handleResendUnconfirmedLogin}
                    />
                  ) : localError || auth.error ? (
                    <InlineCallout
                      tone="danger"
                      icon="alert-circle"
                      message={localError ?? auth.error ?? ''}
                      onDismiss={() => {
                        setLocalError(null);
                        auth.clearError();
                      }}
                    />
                  ) : null}

                  <GradientSubmitButton
                    label="Đăng nhập ngay"
                    icon="arrow-forward"
                    loading={submitting || auth.busy}
                    onPress={handleLogin}
                  />
                </View>
              ) : (
                /* Main Register Form */
                <View style={styles.formStack}>
                  {/* 3-Role Selector */}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                      Vai trò đăng ký
                    </Text>
                    <View style={styles.roleThreeGrid}>
                      {(
                        [
                          { key: 'student', label: 'Học sinh 10T4', icon: 'school-outline' },
                          { key: 'subject_teacher', label: 'GV Bộ môn', icon: 'book-outline' },
                          {
                            key: 'teacher',
                            label: 'GV Chủ nhiệm',
                            icon: 'shield-checkmark-outline',
                          },
                        ] as const
                      ).map((item) => {
                        const selected = regRole === item.key;
                        return (
                          <Pressable
                            key={item.key}
                            onPress={() => {
                              triggerHaptic('light');
                              if ((regRole === 'student') !== (item.key === 'student')) {
                                setRegLoginId('');
                              }
                              setRegRole(item.key);
                              setLocalError(null);
                              auth.clearError();
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Đăng ký vai trò ${item.label}`}
                            style={[
                              styles.roleCardPill,
                              {
                                backgroundColor: selected
                                  ? theme.accentSoft
                                  : isDark
                                    ? 'rgba(255,255,255,0.04)'
                                    : theme.card,
                                borderColor: selected ? theme.accent : theme.border,
                              },
                            ]}>
                            <Ionicons
                              name={item.icon}
                              size={16}
                              color={selected ? theme.accent : theme.textMuted}
                            />
                            <Text
                              style={[
                                styles.roleCardLabel,
                                { color: selected ? theme.accentText : theme.textSecondary },
                              ]}
                              numberOfLines={1}>
                              {item.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <AuthInput
                    label="Email (Gmail)"
                    value={regEmail}
                    onChangeText={(v) => {
                      setRegEmail(v);
                      setLocalError(null);
                    }}
                    placeholder="ten@gmail.com"
                    icon="mail-outline"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    error={
                      regEmail.trim().length > 3 && !isValidEmail(regEmail)
                        ? 'Định dạng Gmail chưa hợp lệ.'
                        : null
                    }
                    hint="Dùng để đăng nhập, đồng bộ đa thiết bị & khôi phục mật khẩu riêng tư."
                  />

                  <View style={styles.fieldWithMeter}>
                    <AuthInput
                      label="Mật khẩu"
                      value={regPassword}
                      onChangeText={(v) => {
                        setRegPassword(v);
                        setLocalError(null);
                      }}
                      placeholder="Tối thiểu 6 ký tự"
                      icon="lock-closed-outline"
                      secure
                      showPassword={showRegPw}
                      onToggleShowPassword={() => setShowRegPw((v) => !v)}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthMeter password={regPassword} />
                  </View>

                  <AuthInput
                    label="Xác nhận mật khẩu"
                    value={regConfirmPassword}
                    onChangeText={(v) => {
                      setRegConfirmPassword(v);
                      setLocalError(null);
                    }}
                    placeholder="Nhập lại mật khẩu"
                    icon="shield-checkmark-outline"
                    secure
                    showPassword={showRegConfirmPw}
                    onToggleShowPassword={() => setShowRegConfirmPw((v) => !v)}
                    autoComplete="new-password"
                    error={
                      regConfirmPassword.length > 0 &&
                      regPassword.trim() !== regConfirmPassword.trim()
                        ? 'Mật khẩu xác nhận chưa khớp.'
                        : null
                    }
                    hint={
                      regConfirmPassword.length > 0 &&
                      regPassword.trim() === regConfirmPassword.trim()
                        ? '✓ Mật khẩu xác nhận trùng khớp'
                        : undefined
                    }
                  />

                  <AuthInput
                    label="Họ và tên"
                    value={regName}
                    onChangeText={(v) => {
                      setRegName(v);
                      setLocalError(null);
                    }}
                    placeholder={
                      regRole === 'student' ? 'VD: Nguyễn Minh Anh' : 'VD: Thầy / Cô Nguyễn Văn A'
                    }
                    icon="person-outline"
                    autoCapitalize="words"
                    autoComplete="name"
                  />

                  {regRole === 'student' ? (
                    <>
                      <View style={styles.fieldGroup}>
                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                          Tổ sinh hoạt
                        </Text>
                        <View style={styles.chipWrap}>
                          {GROUP_PRESETS.map((g) => (
                            <Chip
                              key={g}
                              label={g}
                              selected={regGroup === g}
                              onPress={() => {
                                triggerHaptic('light');
                                setRegGroup(g);
                              }}
                            />
                          ))}
                        </View>
                      </View>

                      <View style={styles.fieldGroup}>
                        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                          Giới tính
                        </Text>
                        <View style={styles.twoColRow}>
                          {(
                            [
                              { key: 'male', label: 'Nam', icon: 'male-outline' },
                              { key: 'female', label: 'Nữ', icon: 'female-outline' },
                            ] as const
                          ).map((opt) => {
                            const selected = regGender === opt.key;
                            return (
                              <Pressable
                                key={opt.key}
                                onPress={() => {
                                  triggerHaptic('light');
                                  setRegGender(opt.key);
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={`Chọn giới tính ${opt.label}`}
                                style={[
                                  styles.genderPill,
                                  {
                                    backgroundColor: selected ? theme.accentSoft : theme.card,
                                    borderColor: selected ? theme.accent : theme.border,
                                  },
                                ]}>
                                <Ionicons
                                  name={opt.icon}
                                  size={16}
                                  color={selected ? theme.accent : theme.textMuted}
                                />
                                <Text
                                  style={[
                                    styles.genderLabel,
                                    { color: selected ? theme.accentText : theme.textSecondary },
                                  ]}>
                                  {opt.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      {regRole === 'subject_teacher' ? (
                        <View style={styles.fieldGroup}>
                          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                            Bộ môn giảng dạy
                          </Text>
                          <View style={styles.chipWrap}>
                            {SUBJECT_TEACHER_PRESETS.map((preset) => (
                              <Chip
                                key={preset.subject}
                                label={`${preset.emoji} ${preset.subject}`}
                                selected={!regCustomSubject.trim() && regSubject === preset.subject}
                                onPress={() => {
                                  triggerHaptic('light');
                                  setRegSubject(preset.subject);
                                  setRegCustomSubject('');
                                }}
                              />
                            ))}
                          </View>
                          <AuthInput
                            value={regCustomSubject}
                            onChangeText={setRegCustomSubject}
                            placeholder="Hoặc nhập tên bộ môn khác..."
                            icon="create-outline"
                            autoCapitalize="sentences"
                          />
                        </View>
                      ) : null}

                      <AuthInput
                        label="Mã xác thực Giáo viên"
                        value={regAccessCode}
                        onChangeText={(v) => {
                          setRegAccessCode(v);
                          setLocalError(null);
                        }}
                        placeholder="Nhập mã xác thực GV lớp 10T4"
                        icon="key-outline"
                        secure
                        showPassword={showRegAccessCode}
                        onToggleShowPassword={() => setShowRegAccessCode((v) => !v)}
                        hint="Bảo vệ quyền quản trị — chỉ Giáo viên có mã mới đăng ký được."
                      />
                    </>
                  )}

                  {/* Optional Editable Class ID */}
                  <AuthInput
                    label="Mã ID lớp (tùy chọn)"
                    value={regLoginId}
                    onChangeText={(v) => {
                      setRegLoginId(v.toUpperCase());
                      setLocalError(null);
                    }}
                    placeholder={
                      regRole === 'student'
                        ? 'VD: 10T4-01 (để trống tự cấp)'
                        : 'VD: GVCN-01 (để trống tự cấp)'
                    }
                    icon="id-card-outline"
                    autoCapitalize="characters"
                    rightElement={
                      <Pressable
                        onPress={handleSuggestRegId}
                        disabled={suggestingRegId}
                        accessibilityRole="button"
                        accessibilityLabel="Gợi ý Mã ID lớp"
                        style={({ pressed }) => [
                          styles.suggestPill,
                          { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}35` },
                          pressed && styles.pressedOpacity,
                        ]}>
                        <Ionicons name="sparkles" size={12} color={theme.accent} />
                        <Text style={[styles.suggestPillText, { color: theme.accentText }]}>
                          {suggestingRegId ? 'Đang tạo...' : 'Gợi ý ID'}
                        </Text>
                      </Pressable>
                    }
                    error={
                      regIdCheck.status === 'invalid'
                        ? regIdCheck.validationError
                        : regIdCheck.status === 'taken'
                          ? 'Mã ID này đã có người dùng — hãy bấm Gợi ý ID.'
                          : null
                    }
                    hint={
                      regIdCheck.status === 'available'
                        ? '✓ Mã ID khả dụng'
                        : regIdCheck.status === 'checking'
                          ? 'Đang kiểm tra Mã ID...'
                          : 'Để trống hệ thống tự cấp Mã ID lớp đẹp nhất cho bạn.'
                    }
                  />

                  {localError || auth.error ? (
                    <InlineCallout
                      tone="danger"
                      icon="alert-circle"
                      message={localError ?? auth.error ?? ''}
                      onDismiss={() => {
                        setLocalError(null);
                        auth.clearError();
                      }}
                    />
                  ) : null}

                  <GradientSubmitButton
                    label="Tạo tài khoản & Cập nhật tên lên lớp ✨"
                    loading={submitting || auth.busy}
                    onPress={handleRegister}
                  />
                </View>
              )}
            </>
          )}
        </GlassAuthCard>
      </FadeIn>

      <FadeIn index={2}>
        <Text style={[styles.footerNote, { color: theme.textMuted }]}>
          Bảo mật chuẩn Supabase Auth · Tên & ảnh cập nhật trực tiếp toàn lớp 10T4
        </Text>
      </FadeIn>
    </AuthBackdrop>
  );
}

/* ---------- Root AuthGate Component ---------- */

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.loading) {
    return <LoadingGateView />;
  }

  if (auth.passwordRecoveryPending) {
    return <PasswordRecoveryView />;
  }

  if (auth.needsProfileCompletion && auth.pendingOAuthUser) {
    return (
      <OAuthOnboardingView
        key={auth.pendingOAuthUser.authUserId}
        user={auth.pendingOAuthUser}
      />
    );
  }

  if (!auth.canEnterApp) {
    return <MainAuthPortal />;
  }

  return <>{children}</>;
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  ambientLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  topGlowRibbon: {
    position: 'absolute',
    top: -60,
    left: -40,
    right: -40,
    height: 290,
    borderBottomLeftRadius: 160,
    borderBottomRightRadius: 160,
  },
  glowOrbLeft: {
    position: 'absolute',
    top: 90,
    left: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  glowOrbRight: {
    position: 'absolute',
    bottom: 60,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  centerColumn: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    gap: 16,
  },
  brandHeader: {
    gap: 12,
    paddingHorizontal: 2,
  },
  brandBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandLogoMark: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  brandLogoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandTitleWrap: {
    flex: 1,
    gap: 2,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  statusPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  glassCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    overflow: 'hidden',
  },
  glassTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 2,
    borderRadius: 1,
  },
  topBannerSpacing: {
    marginBottom: 14,
  },
  loadingCardInner: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingLogoOrb: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  loadingLogoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  loadingSpinner: {
    marginTop: 8,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
  loadingSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  oauthHeroSection: {
    gap: 10,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  googleButtonText: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  githubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#161B22',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  githubButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  oauthMicroCaption: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    marginBottom: 16,
  },
  segmentedTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  segmentedTabActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.14)',
  },
  segmentedTabText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  formStack: {
    gap: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldWithMeter: {
    gap: 7,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1.4,
  },
  inputFocusGlow: {
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 11,
    ...({ outlineStyle: 'none' } as object),
  },
  fieldHelper: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  forgotLinkText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  strengthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  strengthBarRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  strengthBar: {
    flex: 1,
    height: 4.5,
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    minWidth: 58,
    textAlign: 'right',
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    marginTop: 2,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondaryOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1.2,
    paddingHorizontal: 14,
  },
  secondaryOutlineText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  ghostLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  ghostLinkText: {
    fontSize: 13,
    fontWeight: '700',
  },
  backRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 4,
  },
  backRowText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  centerHeroBlock: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  emailHighlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  emailHighlightText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  calloutBox: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 12,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  calloutIcon: {
    marginTop: 1,
  },
  calloutBody: {
    flex: 1,
    gap: 4,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  calloutText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  calloutActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: 6,
  },
  calloutActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  roleThreeGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  roleCardPill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.3,
  },
  roleCardLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1.3,
    paddingHorizontal: 10,
  },
  genderLabel: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  suggestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  suggestPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  oauthIdentityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
  },
  oauthIdentityMeta: {
    flex: 1,
    gap: 4,
  },
  providerChipRow: {
    flexDirection: 'row',
  },
  providerVerifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  providerVerifiedText: {
    fontSize: 11,
    fontWeight: '800',
  },
  oauthUserName: {
    fontSize: 16,
    fontWeight: '900',
  },
  oauthUserEmail: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  optionalSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  optionalToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionalToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  optionalToggleTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  optionalSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  optionalFields: {
    marginTop: 8,
    gap: 12,
  },
  footerDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 6,
  },
  footerNote: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  pressedScale: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  pressedOpacity: {
    opacity: 0.72,
  },
  disabledOpacity: {
    opacity: 0.5,
  },
});
