/**
 * Ultra-Luxury "Gói Pro" Locked Vault + VIP Owner Pro Center.
 *
 * Security model:
 * - Universally locked for EVERYONE (GVCN, Subject Teachers, Class Officers, Students)
 *   with ZERO role-based bypasses.
 * - Requires verification through `@/lib/pro-vault` (Password OR 7-digit PIN) with
 *   brute-force lockout countdown and strictly in-memory session state.
 * - Automatically locks when switching accounts / signing out (`accountScopeKey` /
 *   `loginEventId`), and locks on leaving this tab by default (`autoLockOnLeave`).
 * - Privileged Pro content only mounts AFTER `isProVaultUnlocked()` succeeds.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { formatPoints } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { DRIVE_CONFIG } from '@/lib/drive';
import { useDriveGallery } from '@/lib/drive-gallery';
import {
  buildClassRecordsExcelCsv,
  buildDriveMediaExcelCsv,
  buildStudyParticipationExcelCsv,
  downloadOrShareExcelCsv,
  exportJsonBackup,
  formatVnd,
  shareOrCopyText,
} from '@/lib/export';
import {
  buildWeeklyZaloReport,
  type WeeklyZaloPreset,
} from '@/lib/weekly-zalo-report';
import {
  PRO_LOCKOUT_SECONDS,
  PRO_MAX_ATTEMPTS,
  PRO_PIN_LENGTH,
  getProLockoutRemainingMs,
  getProVaultUnlockInfo,
  isProVaultUnlocked,
  lockProVault,
  subscribeProVault,
  verifyProVaultCredential,
  type ProAuthMethod,
  type ProVaultUnlockInfo,
} from '@/lib/pro-vault';
import { useAuth } from '@/store/auth-store';
import { useClassStore, useClassSync } from '@/store/class-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const OBSIDIAN_GRADIENT = ['#140E09', '#2A1809', '#120C07'] as const;
const ROYAL_GOLD_GRADIENT = ['#78350F', '#B45309', '#D97706', '#F59E0B'] as const;
const GOLD_BUTTON_GRADIENT = ['#92400E', '#D97706', '#F59E0B'] as const;

const KEYPAD_ROWS: readonly (readonly ('1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | '0' | 'back')[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
];

const PRO_SHORTCUTS: {
  label: string;
  sub: string;
  route: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
}[] = [
  {
    label: 'Tài khoản & MK',
    sub: 'GV & Học sinh',
    route: '/members',
    icon: 'shield-checkmark',
    color: 'warning',
    soft: 'warningSoft',
  },
  {
    label: 'Stamp học tập',
    sub: 'Tuần & HK I',
    route: '/study',
    icon: 'bookmark',
    color: 'success',
    soft: 'successSoft',
  },
  {
    label: 'Kho Ảnh & File',
    sub: 'Drive lớp',
    route: '/gallery',
    icon: 'images',
    color: 'accent',
    soft: 'accentSoft',
  },
  {
    label: 'Sơ đồ chỗ ngồi',
    sub: 'Bàn học 10T4',
    route: '/seating',
    icon: 'grid',
    color: 'purple',
    soft: 'purpleSoft',
  },
  {
    label: 'Trợ lý AI 10T4',
    sub: 'Phân tích lớp',
    route: '/insights',
    icon: 'sparkles',
    color: 'gold',
    soft: 'goldSoft',
  },
  {
    label: 'Cài đặt lớp',
    sub: 'Giao diện & Sync',
    route: '/settings',
    icon: 'settings',
    color: 'danger',
    soft: 'dangerSoft',
  },
];

function formatTimeHHmm(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAuditTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ==================== LOCKED VAULT GATE (SHOWN TO EVERYONE) ==================== */

function ProLockedVault() {
  const theme = useTheme();
  const { showToast } = useToast();

  const [authTab, setAuthTab] = useState<ProAuthMethod>('password');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [isFocused, setIsFocused] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState<number>(() =>
    Math.ceil(getProLockoutRemainingMs() / 1000),
  );
  const verifyingRef = useRef(false);
  const pinRef = useRef('');
  const isLockedOut = lockoutSec > 0;

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  const updatePin = useCallback((next: string) => {
    pinRef.current = next;
    setPin(next);
  }, []);

  // Single live brute-force lockout countdown interval with guaranteed unmount cleanup
  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => {
      const remaining = Math.ceil(getProLockoutRemainingMs() / 1000);
      setLockoutSec(remaining);
      if (remaining <= 0) {
        setErrorMsg(null);
      }
    }, 450);
    return () => clearInterval(timer);
  }, [isLockedOut]);

  const runVerify = useCallback(
    async (credential: string, method: ProAuthMethod) => {
      if (verifyingRef.current) return;
      const currentLockMs = getProLockoutRemainingMs();
      if (currentLockMs > 0) {
        setLockoutSec(Math.ceil(currentLockMs / 1000));
        return;
      }
      verifyingRef.current = true;
      setVerifying(true);
      setErrorMsg(null);
      try {
        const res = await verifyProVaultCredential(credential, method);
        if (res.ok) {
          setPassword('');
          updatePin('');
          setErrorMsg(null);
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          showToast(
            method === 'pin'
              ? 'Đã mở khóa Gói Pro bằng Mã PIN! 💎'
              : 'Đã mở khóa Gói Pro bằng Mật khẩu! 💎',
            'success',
          );
          return;
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
        if (method === 'pin') {
          updatePin('');
        }
        if (res.lockedUntilMs) {
          const sec = Math.max(1, Math.ceil((res.lockedUntilMs - Date.now()) / 1000));
          setLockoutSec(sec);
        }
        setErrorMsg(res.error || 'Thông tin xác thực không đúng.');
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [showToast, updatePin],
  );

  const handlePasswordSubmit = () => {
    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu xác thực.');
      return;
    }
    void runVerify(password, 'password');
  };

  const handlePinKey = useCallback(
    (key: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'back') => {
      if (verifyingRef.current || isLockedOut) return;
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setErrorMsg(null);
      if (key === 'clear') {
        updatePin('');
        return;
      }
      if (key === 'back') {
        updatePin(pinRef.current.slice(0, -1));
        return;
      }
      if (pinRef.current.length >= PRO_PIN_LENGTH) return;
      const next = pinRef.current + key;
      updatePin(next);
      if (next.length === PRO_PIN_LENGTH) {
        void runVerify(next, 'pin');
      }
    },
    [isLockedOut, runVerify, updatePin],
  );

  // Desktop / Web physical keyboard digit support (strictly when tab is focused on PIN mode)
  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !isFocused ||
      authTab !== 'pin' ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handlePinKey(e.key as '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlePinKey('back');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handlePinKey('clear');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused, authTab, handlePinKey]);

  return (
    <Screen>
      {/* Obsidian + Royal Gold Locked Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={OBSIDIAN_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.vaultHero, Shadow.floating]}>
          <View style={styles.vaultOrbA} />
          <View style={styles.vaultOrbB} />

          <View style={styles.vaultShieldWrap}>
            <LinearGradient
              colors={ROYAL_GOLD_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.vaultShieldCircle}>
              <Ionicons name="diamond" size={30} color="#FFFBEB" />
              <View style={styles.vaultShieldLockTag}>
                <Ionicons name="lock-closed" size={11} color="#FDE68A" />
              </View>
            </LinearGradient>
          </View>

          <Text style={styles.vaultTitle}>Gói PRO</Text>
        </LinearGradient>
      </FadeIn>

      {/* Authentication Card */}
      <FadeIn index={1}>
        <Card style={[styles.authCard, { borderColor: 'rgba(217, 119, 6, 0.45)', borderWidth: 1.2 }]}>
          {/* Segmented Switcher: Mật khẩu | Mã PIN (7 số) */}
          <View style={[styles.segTabs, { backgroundColor: theme.backgroundElement }]}>
            {(
              [
                { key: 'password', label: 'Mật khẩu', icon: 'key-outline' },
                { key: 'pin', label: `Mã PIN (${PRO_PIN_LENGTH} số)`, icon: 'keypad-outline' },
              ] as const
            ).map((t) => {
              const active = authTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    setAuthTab(t.key);
                    setErrorMsg(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  style={[
                    styles.segTab,
                    active && [
                      styles.segTabActive,
                      { backgroundColor: theme.card, borderColor: 'rgba(217, 119, 6, 0.45)' },
                    ],
                  ]}>
                  <Ionicons
                    name={t.icon}
                    size={15}
                    color={active ? '#D97706' : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.segTabText,
                      { color: active ? theme.text : theme.textSecondary },
                    ]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Brute-force Lockout Countdown Banner */}
          {isLockedOut ? (
            <View
              style={[
                styles.alertBanner,
                { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
              ]}>
              <Ionicons name="time" size={18} color={theme.danger} />
              <View style={styles.flex}>
                <Text style={[styles.alertTitle, { color: theme.danger }]}>
                  {`Tạm khóa xác thực · Thử lại sau ${lockoutSec}s`}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5, lineHeight: 16 }}>
                  {`Bảo vệ chống dò khóa (${PRO_MAX_ATTEMPTS} lần sai liên tiếp / khóa ${PRO_LOCKOUT_SECONDS} giây).`}
                </Text>
              </View>
            </View>
          ) : errorMsg ? (
            <View
              style={[
                styles.alertBanner,
                { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
              ]}>
              <Ionicons name="alert-circle" size={17} color={theme.danger} />
              <Text style={[styles.alertErrorText, { color: theme.danger }]}>{errorMsg}</Text>
            </View>
          ) : null}

          {authTab === 'password' ? (
            <View style={styles.pwdPanel}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                MẬT KHẨU XÁC THỰC GÓI PRO
              </Text>
              <View
                style={[
                  styles.pwdInputBox,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: errorMsg ? theme.danger : 'rgba(217, 119, 6, 0.45)',
                  },
                ]}>
                <Ionicons name="lock-closed-outline" size={18} color="#D97706" />
                <TextInput
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  editable={!verifying && !isLockedOut}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="done"
                  onSubmitEditing={handlePasswordSubmit}
                  placeholder="Nhập mật khẩu xác thực..."
                  placeholderTextColor={theme.textMuted}
                  style={[styles.pwdInput, { color: theme.text }]}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  style={styles.eyeBtn}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </View>

              <Pressable
                disabled={verifying || isLockedOut || !password}
                onPress={handlePasswordSubmit}
                accessibilityRole="button"
                accessibilityLabel="Mở khóa Gói Pro"
                style={({ pressed }) => [
                  styles.goldCtaWrap,
                  (verifying || isLockedOut || !password) && styles.disabledBtn,
                  pressed && styles.pressed,
                ]}>
                <LinearGradient
                  colors={GOLD_BUTTON_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.goldCta}>
                  {verifying ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="diamond" size={17} color="#FFFFFF" />
                  )}
                  <Text style={styles.goldCtaText}>
                    {verifying ? 'Đang xác thực...' : 'Mở khóa Gói Pro'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <View style={styles.pinPanel}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: 'center' }]}>
                {`NHẬP MÃ PIN GỒM ${PRO_PIN_LENGTH} CHỮ SỐ`}
              </Text>

              {/* 7 Masked PIN Dots */}
              <View style={styles.pinDotsRow}>
                {Array.from({ length: PRO_PIN_LENGTH }).map((_, idx) => {
                  const filled = idx < pin.length;
                  const activeSlot = idx === pin.length && !isLockedOut && !verifying;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.pinDotSlot,
                        {
                          backgroundColor: filled
                            ? 'rgba(217, 119, 6, 0.18)'
                            : theme.backgroundElement,
                          borderColor: errorMsg
                            ? theme.danger
                            : filled || activeSlot
                              ? '#D97706'
                              : theme.border,
                        },
                      ]}>
                      {filled ? (
                        <View style={styles.pinDotFill} />
                      ) : (
                        <View style={[styles.pinDotEmpty, { backgroundColor: theme.border }]} />
                      )}
                    </View>
                  );
                })}
              </View>

              {verifying ? (
                <View style={styles.pinVerifyingRow}>
                  <ActivityIndicator size="small" color="#D97706" />
                  <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '800' }}>
                    Đang xác thực Mã PIN...
                  </Text>
                </View>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 11.5, textAlign: 'center' }}>
                  {Platform.OS === 'web'
                    ? 'Bấm bàn phím bên dưới hoặc gõ số trực tiếp — tự mở khóa khi đủ 7 số'
                    : 'Chạm các phím số bên dưới — tự mở khóa ngay khi đủ 7 chữ số'}
                </Text>
              )}

              {/* Tactile Numeric Keypad */}
              <View style={styles.keypad}>
                {KEYPAD_ROWS.map((row, rIdx) => (
                  <View key={rIdx} style={styles.keypadRow}>
                    {row.map((key) => {
                      const isAction = key === 'clear' || key === 'back';
                      return (
                        <Pressable
                          key={key}
                          disabled={verifying || isLockedOut}
                          onPress={() => handlePinKey(key)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            key === 'clear'
                              ? 'Xoá hết mã PIN'
                              : key === 'back'
                                ? 'Xoá một chữ số'
                                : `Số ${key}`
                          }
                          style={({ pressed }) => [
                            styles.keypadKey,
                            {
                              backgroundColor: isAction
                                ? theme.backgroundElement
                                : theme.card,
                              borderColor: isAction
                                ? theme.border
                                : 'rgba(217, 119, 6, 0.3)',
                              opacity: verifying || isLockedOut ? 0.45 : 1,
                            },
                            pressed && styles.keypadPressed,
                          ]}>
                          {key === 'back' ? (
                            <Ionicons name="backspace-outline" size={20} color={theme.text} />
                          ) : key === 'clear' ? (
                            <Text style={[styles.keypadActionText, { color: theme.danger }]}>
                              Xoá hết
                            </Text>
                          ) : (
                            <Text style={[styles.keypadDigit, { color: theme.text }]}>{key}</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>
      </FadeIn>
    </Screen>
  );
}

/* ==================== UNLOCKED VIP OWNER PRO CENTER ==================== */

function ProUnlockedCenter({
  unlockInfo,
  autoLockOnLeave,
  onToggleAutoLock,
  onLockNow,
}: {
  unlockInfo: ProVaultUnlockInfo | null;
  autoLockOnLeave: boolean;
  onToggleAutoLock: () => void;
  onLockNow: () => void;
}) {
  const theme = useTheme();
  const { showToast } = useToast();
  const {
    classInfo,
    students,
    entries,
    attendance,
    dutyLogs,
    announcements,
    tasks,
    resources,
    fundTransactions,
    fundPaid,
    registeredMembers,
    registeredTeachers,
    totals,
    fundSummary,
    activityLog,
    getStudyParticipationReport,
    exportStateJson,
    pullNow,
  } = useClassStore();
  const { syncStatus, lastSyncedAt } = useClassSync();
  const driveGallery = useDriveGallery();

  const [syncingNow, setSyncingNow] = useState(false);
  const [busyExport, setBusyExport] = useState<string | null>(null);
  const [zaloPreset, setZaloPreset] = useState<WeeklyZaloPreset>('parents');
  const [zaloOpen, setZaloOpen] = useState(false);

  const studyReport = getStudyParticipationReport();
  const zaloReport = useMemo(
    () =>
      buildWeeklyZaloReport({
        classInfo,
        students,
        entries,
        attendance,
        dutyLogs,
        fundTransactions,
        fundPaid,
        tasks,
        preset: zaloPreset,
      }),
    [classInfo, students, entries, attendance, dutyLogs, fundTransactions, fundPaid, tasks, zaloPreset],
  );

  const handleCopyZaloSummary = async () => {
    const res = await shareOrCopyText(zaloReport.text, zaloReport.title);
    showToast(
      res === 'copied'
        ? `Đã sao chép ${zaloPreset === 'parents' ? 'Bản tin Phụ huynh' : 'Bản tin Lớp 10T4'} cho Zalo!`
        : res === 'shared'
          ? 'Đã mở chia sẻ bản tin tổng kết tuần!'
          : 'Không thể sao chép bản tin lúc này',
      res === 'failed' ? 'danger' : 'success',
    );
  };

  const handleShareZaloSummary = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: zaloReport.title, text: zaloReport.text });
        showToast('Đã mở hộp thoại chia sẻ bản tin Zalo!', 'success');
        return;
      } catch {
        // Fallback to copy
      }
    } else if (Platform.OS !== 'web') {
      try {
        await Share.share({ title: zaloReport.title, message: zaloReport.text });
        showToast('Đã mở hộp thoại chia sẻ Zalo!', 'success');
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyZaloSummary();
  };
  const registeredStudentCount = registeredMembers.filter((m) => m.role === 'student').length;
  const recentAudit = activityLog.slice(0, 15);

  const syncMeta = {
    synced: {
      label: 'Cloud trực tuyến ⚡',
      color: 'success' as const,
      soft: 'successSoft' as const,
      icon: 'cloud-done' as IoniconName,
    },
    syncing: {
      label: 'Đang đồng bộ...',
      color: 'warning' as const,
      soft: 'warningSoft' as const,
      icon: 'sync' as IoniconName,
    },
    offline: {
      label: 'Mất mạng · Lưu tạm',
      color: 'danger' as const,
      soft: 'dangerSoft' as const,
      icon: 'cloud-offline' as IoniconName,
    },
    local: {
      label: 'Chế độ cục bộ',
      color: 'accentText' as const,
      soft: 'accentSoft' as const,
      icon: 'phone-portrait' as IoniconName,
    },
  }[syncStatus];

  const handleSyncNow = async () => {
    if (syncingNow) return;
    setSyncingNow(true);
    try {
      await Promise.all([pullNow(), driveGallery.refresh({ silent: true })]);
      showToast('Đã đồng bộ toàn bộ dữ liệu lớp & Kho Drive! ⚡', 'success');
    } catch {
      showToast('Không thể đồng bộ ngay lúc này', 'warning');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleExportClassExcel = async () => {
    if (busyExport) return;
    setBusyExport('class');
    try {
      const csv = buildClassRecordsExcelCsv({
        students,
        entries,
        announcements,
        tasks,
        resources,
      });
      await downloadOrShareExcelCsv(
        `pro-toan-bo-lop-${classInfo.name}-${todayIso()}.csv`,
        csv,
      );
      showToast('Đã xuất Excel (.csv) toàn bộ dữ liệu lớp!', 'success');
    } catch {
      showToast('Không thể xuất Excel dữ liệu lớp', 'danger');
    } finally {
      setBusyExport(null);
    }
  };

  const handleExportStudyExcel = async (mode: 'weekly' | 'semester1') => {
    if (busyExport) return;
    setBusyExport(`study-${mode}`);
    try {
      const csv = buildStudyParticipationExcelCsv(studyReport, mode);
      const name =
        mode === 'weekly'
          ? `pro-stamp-tuan-${studyReport.selectedWeekStart}-${classInfo.name}.csv`
          : `pro-stamp-cong-don-hk1-${classInfo.name}-${todayIso()}.csv`;
      await downloadOrShareExcelCsv(name, csv);
      showToast(
        mode === 'weekly'
          ? 'Đã xuất Excel (.csv) Stamp phát biểu tuần!'
          : 'Đã xuất Excel (.csv) cộng dồn Stamp HK I!',
        'success',
      );
    } catch {
      showToast('Không thể xuất Excel Stamp phát biểu', 'danger');
    } finally {
      setBusyExport(null);
    }
  };

  const handleExportDriveExcel = async () => {
    if (busyExport) return;
    setBusyExport('drive');
    try {
      const csv = buildDriveMediaExcelCsv(driveGallery.items);
      await downloadOrShareExcelCsv(
        `pro-kho-drive-${classInfo.name}-${todayIso()}.csv`,
        csv,
      );
      showToast(`Đã xuất Excel (.csv) ${driveGallery.items.length} tệp Kho Drive!`, 'success');
    } catch {
      showToast('Không thể xuất Excel Kho Drive', 'danger');
    } finally {
      setBusyExport(null);
    }
  };

  const handleExportJsonBackup = async () => {
    if (busyExport) return;
    setBusyExport('json');
    try {
      const json = exportStateJson();
      const res = await exportJsonBackup(
        json,
        `pro-backup-lop-${classInfo.name}-${todayIso()}.json`,
      );
      showToast(
        res === 'downloaded'
          ? 'Đã tải file sao lưu JSON toàn lớp!'
          : res === 'copied'
            ? 'Đã sao chép bản sao lưu JSON!'
            : 'Đã mở chia sẻ sao lưu JSON!',
        'success',
      );
    } catch {
      showToast('Không thể xuất sao lưu JSON', 'danger');
    } finally {
      setBusyExport(null);
    }
  };

  const methodLabel = unlockInfo?.method === 'pin' ? 'Mã PIN' : 'Mật khẩu';

  return (
    <Screen onRefresh={handleSyncNow}>
      {/* Luxury Royal Gold VIP Owner Hero */}
      <FadeIn index={0}>
        <LinearGradient
          colors={ROYAL_GOLD_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.vipHero, Shadow.floating]}>
          <View style={styles.vipOrbA} />
          <View style={styles.vipOrbB} />

          <View style={styles.vipTopRow}>
            <View style={styles.vipEyebrowPill}>
              <Ionicons name="diamond" size={12} color="#FEF3C7" />
              <Text style={styles.vipEyebrowText}>GÓI PRO · TRUNG TÂM CHỦ SỞ HỮU</Text>
            </View>
            <View style={styles.vipSessionPill}>
              <Ionicons name="shield-checkmark" size={11} color="#A7F3D0" />
              <Text style={styles.vipSessionText}>
                {`Mở bằng ${methodLabel} · ${formatTimeHHmm(unlockInfo?.unlockedAt)}`}
              </Text>
            </View>
          </View>

          <Text style={styles.vipTitle}>{`Bảng Điều Khiển Pro · Lớp ${classInfo.name}`}</Text>
          <Text style={styles.vipSubtitle}>
            Toàn quyền theo dõi chỉ số hệ thống, xuất dữ liệu Excel/JSON và giám sát nhật ký thời
            gian thực.
          </Text>

          {/* Auto-lock Toggle Pill + Prominent Lock Now Button */}
          <View style={styles.vipControlRow}>
            <Pressable
              onPress={onToggleAutoLock}
              accessibilityRole="switch"
              accessibilityState={{ checked: autoLockOnLeave }}
              accessibilityLabel="Tự động khóa khi rời tab"
              style={({ pressed }) => [styles.autoLockPill, pressed && styles.pressed]}>
              <Ionicons
                name={autoLockOnLeave ? 'shield-checkmark' : 'lock-open-outline'}
                size={14}
                color={autoLockOnLeave ? '#A7F3D0' : '#FDE68A'}
              />
              <Text style={styles.autoLockText} numberOfLines={1}>
                {`Tự khóa khi rời tab: ${autoLockOnLeave ? 'BẬT' : 'TẮT'}`}
              </Text>
            </Pressable>

            <Pressable
              onPress={onLockNow}
              accessibilityRole="button"
              accessibilityLabel="Khóa Gói Pro ngay"
              style={({ pressed }) => [styles.lockNowBtn, pressed && styles.pressed]}>
              <Ionicons name="lock-closed" size={14} color="#92400E" />
              <Text style={styles.lockNowText}>Khóa ngay 🔒</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Live System Pro Metrics */}
      <FadeIn index={1}>
        <SectionHeader
          title={'Chỉ số hệ thống Pro'}
          subtitle={'Cập nhật trực tiếp theo thời gian thực'}
        />
      </FadeIn>

      <FadeIn index={1} style={styles.metricGrid}>
        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="people" size={17} color={theme.accent} />
          </View>
          <Text style={[styles.metricVal, { color: theme.text }]}>{registeredStudentCount}</Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Học sinh đã ĐK</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>
            {`${students.length} hồ sơ trong sổ`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.warningSoft }]}>
            <Ionicons name="school" size={17} color={theme.warning} />
          </View>
          <Text style={[styles.metricVal, { color: theme.text }]}>{registeredTeachers.length}</Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Giáo viên đã ĐK</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>GVCN & GV Bộ môn</Text>
        </Card>

        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.successSoft }]}>
            <Ionicons name="bookmark" size={17} color={theme.success} />
          </View>
          <Text style={[styles.metricVal, { color: theme.success }]}>
            {`${studyReport.semester1.totalSpeeches}`}
          </Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Stamps HK I</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>
            {`+${formatPoints(studyReport.semester1.totalPoints)}đ · Tuần: ${studyReport.weekly.totalSpeeches}`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.purpleSoft }]}>
            <Ionicons name="trophy" size={17} color={theme.purple} />
          </View>
          <Text style={[styles.metricVal, { color: theme.text }]}>{entries.length}</Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Tổng ghi nhận</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>
            {`${formatPoints(totals.points)}đ · ${totals.pending} chờ duyệt`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.goldSoft }]}>
            <Ionicons name="cloud-upload" size={17} color={theme.gold} />
          </View>
          <Text style={[styles.metricVal, { color: theme.text }]}>{driveGallery.items.length}</Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Kho Drive lớp</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>
            {`Thư mục ${DRIVE_CONFIG.folderName}`}
          </Text>
        </Card>

        <Card style={styles.metricCard}>
          <View style={[styles.metricIcon, { backgroundColor: theme.dangerSoft }]}>
            <Ionicons name="wallet" size={17} color={theme.danger} />
          </View>
          <Text style={[styles.metricVal, { color: theme.text }]} numberOfLines={1}>
            {formatVnd(fundSummary.balance)}
          </Text>
          <Text style={[styles.metricLab, { color: theme.textSecondary }]}>Số dư quỹ lớp</Text>
          <Text style={[styles.metricHint, { color: theme.textMuted }]}>
            {`${fundSummary.paidCount} bạn đã đóng`}
          </Text>
        </Card>
      </FadeIn>

      {/* Cloud Sync Control Strip */}
      <FadeIn index={2}>
        <Card style={[styles.syncCard, { borderColor: theme[syncMeta.color], borderWidth: 1.1 }]}>
          <View style={styles.syncRow}>
            <View style={[styles.metricIcon, { backgroundColor: theme[syncMeta.soft] }]}>
              <Ionicons name={syncMeta.icon} size={18} color={theme[syncMeta.color]} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.syncTitle, { color: theme.text }]}>
                Trạng thái đồng bộ Cloud
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {`${syncMeta.label}${lastSyncedAt ? ` · Lúc ${formatTimeHHmm(lastSyncedAt)}` : ''}`}
              </Text>
            </View>
            <Button
              label={syncingNow ? 'Đang tải...' : 'Đồng bộ ngay'}
              size={'sm'}
              icon={'refresh'}
              disabled={syncingNow}
              onPress={() => void handleSyncNow()}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Pro Export Suite */}
      <FadeIn index={3}>
        <SectionHeader
          title={'Bộ Xuất Dữ Liệu Pro (1 chạm)'}
          subtitle={'Xuất Excel UTF-8 BOM (.csv) & sao lưu JSON toàn lớp'}
        />
      </FadeIn>

      <FadeIn index={3}>
        <Card style={styles.exportCard}>
          <View style={styles.exportRow}>
            <Button
              label={busyExport === 'class' ? 'Đang xuất...' : 'Excel Toàn bộ Dữ liệu Lớp'}
              icon={'document-text-outline'}
              size={'sm'}
              style={styles.flex}
              disabled={Boolean(busyExport)}
              onPress={() => void handleExportClassExcel()}
            />
          </View>

          <View style={styles.exportRow}>
            <Button
              label={busyExport === 'study-weekly' ? 'Đang xuất...' : 'Excel Stamp Tuần'}
              variant={'soft'}
              icon={'calendar-outline'}
              size={'sm'}
              style={styles.flex}
              disabled={Boolean(busyExport)}
              onPress={() => void handleExportStudyExcel('weekly')}
            />
            <Button
              label={busyExport === 'study-semester1' ? 'Đang xuất...' : 'Excel Stamp HK I'}
              variant={'soft'}
              icon={'ribbon-outline'}
              size={'sm'}
              style={styles.flex}
              disabled={Boolean(busyExport)}
              onPress={() => void handleExportStudyExcel('semester1')}
            />
          </View>

          <View style={styles.exportRow}>
            <Button
              label={busyExport === 'drive' ? 'Đang xuất...' : 'Excel Kho Ảnh & File Drive'}
              variant={'soft'}
              icon={'images-outline'}
              size={'sm'}
              style={styles.flex}
              disabled={Boolean(busyExport)}
              onPress={() => void handleExportDriveExcel()}
            />
            <Button
              label={busyExport === 'json' ? 'Đang xuất...' : 'Sao lưu JSON'}
              variant={'soft'}
              icon={'code-download-outline'}
              size={'sm'}
              style={styles.flex}
              disabled={Boolean(busyExport)}
              onPress={() => void handleExportJsonBackup()}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Quick Weekly Zalo Summary Card (Pro Unlocked Center) */}
      <FadeIn index={3}>
        <Card style={styles.exportCard}>
          <Pressable
            onPress={() => setZaloOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mở hoặc thu gọn bản tin tổng kết tuần Zalo"
            style={styles.syncRow}>
            <View style={[styles.metricIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="chatbubble-ellipses" size={18} color={theme.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.syncTitle, { color: theme.text }]}>
                Bản tin Tổng kết Tuần (Zalo 1-chạm)
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {`${zaloReport.weekLabel} · ${zaloReport.metrics.weeklySpeeches} stamps tuần · Quỹ ${formatVnd(zaloReport.metrics.fundBalance)}`}
              </Text>
            </View>
            <Ionicons
              name={zaloOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textMuted}
            />
          </Pressable>

          <View style={styles.exportRow}>
            <Button
              label={'Phụ huynh (Zalo)'}
              variant={zaloPreset === 'parents' ? 'primary' : 'soft'}
              icon={'people-outline'}
              size={'sm'}
              style={styles.flex}
              onPress={() => setZaloPreset('parents')}
            />
            <Button
              label={'Lớp 10T4'}
              variant={zaloPreset === 'class' ? 'primary' : 'soft'}
              icon={'flame-outline'}
              size={'sm'}
              style={styles.flex}
              onPress={() => setZaloPreset('class')}
            />
          </View>

          {zaloOpen ? (
            <View
              style={{
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: Radius.md,
                padding: Spacing.three,
              }}>
              <Text selectable style={{ color: theme.text, fontSize: 12.5, lineHeight: 19 }}>
                {zaloReport.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.exportRow}>
            <Button
              label={'Copy Zalo'}
              icon={'copy-outline'}
              size={'sm'}
              style={styles.flex}
              onPress={() => void handleCopyZaloSummary()}
            />
            <Button
              label={'Chia sẻ'}
              variant={'soft'}
              icon={'share-social-outline'}
              size={'sm'}
              style={styles.flex}
              onPress={() => void handleShareZaloSummary()}
            />
            <Button
              label={zaloOpen ? 'Ẩn' : 'Xem'}
              variant={'soft'}
              icon={zaloOpen ? 'eye-off-outline' : 'eye-outline'}
              size={'sm'}
              onPress={() => setZaloOpen((v) => !v)}
            />
          </View>
        </Card>
      </FadeIn>

      {/* Quick Pro Admin Shortcuts */}
      <FadeIn index={4}>
        <SectionHeader
          title={'Lối tắt Quản trị Pro'}
          subtitle={'Đi nhanh tới mọi trung tâm điều hành lớp'}
        />
      </FadeIn>

      <FadeIn index={4} style={styles.shortcutGrid}>
        {PRO_SHORTCUTS.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route as never)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [
              styles.shortcutTile,
              Shadow.card,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.shortcutIcon, { backgroundColor: theme[item.soft] }]}>
              <Ionicons name={item.icon} size={19} color={theme[item.color]} />
            </View>
            <Text style={[styles.shortcutTitle, { color: theme.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.shortcutSub, { color: theme.textMuted }]} numberOfLines={1}>
              {item.sub}
            </Text>
          </Pressable>
        ))}
      </FadeIn>

      {/* Pro System Audit Log */}
      <FadeIn index={5}>
        <SectionHeader
          title={`Nhật ký hệ thống Pro (${recentAudit.length})`}
          subtitle={'15 hoạt động gần nhất trên toàn hệ thống lớp'}
        />
      </FadeIn>

      <FadeIn index={5}>
        <Card style={styles.auditCard}>
          {recentAudit.length === 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
              Chưa có nhật ký hoạt động hệ thống nào được ghi nhận.
            </Text>
          ) : (
            recentAudit.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.auditRow,
                  { borderBottomColor: theme.border },
                  idx === recentAudit.length - 1 && styles.auditRowLast,
                ]}>
                <View style={[styles.auditDot, { backgroundColor: '#D97706' }]} />
                <View style={styles.flex}>
                  <Text style={[styles.auditMsg, { color: theme.text }]}>{item.action}</Text>
                  <View style={styles.auditMetaRow}>
                    {item.actor ? (
                      <Badge label={item.actor} color={'gold'} soft={'goldSoft'} />
                    ) : null}
                    <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                      {formatAuditTime(item.createdAt)}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>
      </FadeIn>
    </Screen>
  );
}

/* ==================== MAIN GÓI PRO ROUTE ==================== */

export default function ProScreen() {
  const auth = useAuth();
  const { showToast } = useToast();

  const [unlocked, setUnlocked] = useState<boolean>(() => isProVaultUnlocked());
  const [unlockInfo, setUnlockInfo] = useState<ProVaultUnlockInfo | null>(() =>
    getProVaultUnlockInfo(),
  );
  const [autoLockOnLeave, setAutoLockOnLeave] = useState<boolean>(true);
  const autoLockRef = useRef<boolean>(true);

  const accountFingerprint = `${auth.accountScopeKey}:${auth.loginEventId}`;
  const prevAccountRef = useRef<string>(accountFingerprint);

  // Subscribe to reactive Pro vault state
  useEffect(() => {
    return subscribeProVault(() => {
      setUnlocked(isProVaultUnlocked());
      setUnlockInfo(getProVaultUnlockInfo());
    });
  }, []);

  // Auto-lock immediately if the user switches accounts or signs out
  useEffect(() => {
    if (prevAccountRef.current !== accountFingerprint) {
      prevAccountRef.current = accountFingerprint;
      if (isProVaultUnlocked()) {
        lockProVault();
      }
    }
  }, [accountFingerprint]);

  // Auto-lock when leaving the Gói Pro tab (enabled by default)
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (autoLockRef.current && isProVaultUnlocked()) {
          lockProVault();
        }
      };
    }, []),
  );

  const handleToggleAutoLock = () => {
    const next = !autoLockRef.current;
    autoLockRef.current = next;
    setAutoLockOnLeave(next);
    showToast(
      next
        ? 'Đã bật tự động khóa Gói Pro khi rời tab 🔒'
        : 'Đã tắt tự động khóa cho phiên hiện tại (nhớ bấm Khóa ngay khi xong)',
      'info',
    );
  };

  const handleLockNow = () => {
    lockProVault();
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    showToast('Đã khóa Gói Pro an toàn! 🔒', 'info');
  };

  if (!unlocked) {
    return <ProLockedVault />;
  }

  return (
    <ProUnlockedCenter
      unlockInfo={unlockInfo}
      autoLockOnLeave={autoLockOnLeave}
      onToggleAutoLock={handleToggleAutoLock}
      onLockNow={handleLockNow}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabledBtn: { opacity: 0.5 },

  /* Locked Obsidian + Gold Hero */
  vaultHero: {
    borderRadius: Radius.xl,
    paddingVertical: Spacing.four + 6,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    borderWidth: 1.4,
    borderColor: 'rgba(245, 158, 11, 0.55)',
    overflow: 'hidden',
    alignItems: 'center',
  },
  vaultOrbA: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -85,
    right: -65,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  vaultOrbB: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    bottom: -65,
    left: -45,
    backgroundColor: 'rgba(217, 119, 6, 0.14)',
  },
  vaultShieldWrap: {
    padding: 6,
    borderRadius: 42,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.35)',
  },
  vaultShieldCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultShieldLockTag: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1C1008',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultTitle: {
    color: '#FFFBEB',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  /* Auth Card */
  authCard: { gap: Spacing.three },
  segTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    gap: 4,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segTabActive: {
    shadowColor: '#D97706',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTabText: { fontSize: 12.5, fontWeight: '800' },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  alertTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  alertErrorText: { flex: 1, fontSize: 12.5, fontWeight: '700', lineHeight: 18 },

  /* Password Mode */
  pwdPanel: { gap: Spacing.two + 2 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  pwdInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1.2,
  },
  pwdInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldCtaWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 2,
  },
  goldCta: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  goldCtaText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  /* PIN Mode */
  pinPanel: { gap: Spacing.three, alignItems: 'center' },
  pinDotsRow: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  pinDotSlot: {
    flex: 1,
    minWidth: 32,
    maxWidth: 40,
    aspectRatio: 0.88,
    borderRadius: Radius.sm,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotFill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D97706',
  },
  pinDotEmpty: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.6,
  },
  pinVerifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    gap: Spacing.two,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  keypadKey: {
    flex: 1,
    height: 54,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  keypadDigit: {
    fontSize: 21,
    fontWeight: '900',
  },
  keypadActionText: {
    fontSize: 12,
    fontWeight: '800',
  },

  /* Unlocked VIP Hero */
  vipHero: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.two + 2,
    overflow: 'hidden',
  },
  vipOrbA: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  vipOrbB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -60,
    left: -35,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  vipTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  vipEyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    borderColor: 'rgba(254, 243, 199, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  vipEyebrowText: {
    color: '#FEF3C7',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  vipSessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.24)',
    borderColor: 'rgba(167, 243, 208, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  vipSessionText: {
    color: '#ECFDF5',
    fontSize: 10.5,
    fontWeight: '800',
  },
  vipTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  vipSubtitle: {
    color: 'rgba(255, 251, 235, 0.9)',
    fontSize: 12.5,
    lineHeight: 18,
  },
  vipControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  autoLockPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  autoLockText: {
    color: '#FFFBEB',
    fontSize: 11.5,
    fontWeight: '800',
  },
  lockNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  lockNowText: {
    color: '#92400E',
    fontSize: 12.5,
    fontWeight: '900',
  },

  /* Metrics & Sync */
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 146,
    gap: 3,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  metricLab: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  metricHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  syncCard: { gap: Spacing.two },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  syncTitle: { fontSize: 14, fontWeight: '800' },

  /* Export Suite */
  exportCard: { gap: Spacing.two },
  exportRow: { flexDirection: 'row', gap: Spacing.two },

  /* Admin Shortcuts */
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  shortcutTile: {
    width: '31%',
    flexGrow: 1,
    minWidth: 102,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 5,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  shortcutTitle: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  shortcutSub: { fontSize: 10.5, fontWeight: '600', textAlign: 'center' },

  /* Audit Log */
  auditCard: { gap: 0 },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  auditRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  auditMsg: {
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  auditMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
});
