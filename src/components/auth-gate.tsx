/**
 * Role-Aware Password Sign-In Gate rendered before the class workspace.
 *
 * - Students enter the class access password (`vuquan`) & earn Daily Login Coins + Stickers.
 * - Subject Teachers (`subject_teacher`) & Homeroom Teacher (`teacher`) authenticate
 *   using the dedicated teacher password (`K8T4`).
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
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

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { SUBJECT_TEACHER_PRESETS } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { useAuth, type AccountRole } from '@/store/auth-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ROLE_TABS: { key: AccountRole; label: string; icon: IoniconName }[] = [
  { key: 'student', label: 'Học sinh', icon: 'person' },
  { key: 'subject_teacher', label: 'GV Bộ môn', icon: 'book' },
  { key: 'teacher', label: 'GV Chủ nhiệm', icon: 'shield-checkmark' },
];

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AccountRole>('student');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [subject, setSubject] = useState(SUBJECT_TEACHER_PRESETS[0].subject);
  const [customSubject, setCustomSubject] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (auth.loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Đang kiểm tra đăng nhập...
        </Text>
      </View>
    );
  }

  if (auth.canEnterApp) {
    return <>{children}</>;
  }

  const effectiveSubject = customSubject.trim() || subject;

  const handleSubmit = async () => {
    const ok = await auth.signInWithPassword(password, displayName, {
      mode,
      subjectName: mode === 'subject_teacher' ? effectiveSubject : null,
    });
    if (ok) {
      setPassword('');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      if (mode === 'subject_teacher') {
        showToast(`Chào mừng GV Bộ môn ${effectiveSubject}! Bạn có thể vào Bảng tin đăng thông báo 📚`);
      } else if (mode === 'teacher') {
        showToast('Đăng nhập tài khoản Giáo viên chủ nhiệm thành công! 🛡️');
      } else {
        showToast('Đăng nhập thành công! Mở quà Tiền Xu & Sticker ngay nào 🎉');
      }
    } else if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const isTeacherTab = mode === 'teacher' || mode === 'subject_teacher';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: theme.background }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.accentSoft, theme.background]}
        style={styles.bgGlow}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.five },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.col}>
          {/* Brand Header */}
          <FadeIn index={0}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
              <View style={styles.bubbleA} />
              <View style={styles.bubbleB} />
              <View style={styles.shield}>
                <Ionicons
                  name={mode === 'subject_teacher' ? 'book' : mode === 'teacher' ? 'shield-checkmark' : 'key'}
                  size={34}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.heroTitle}>Quản lý Lớp 10T4</Text>
              <Text style={styles.heroSub}>THPT FPT · Không gian học tập, nhiệm vụ & sáng tạo</Text>

              {/* Login Reward Teaser Pill */}
              <View style={styles.rewardTeaser}>
                <Text style={{ fontSize: 14 }}>🪙</Text>
                <Text style={styles.rewardTeaserText}>
                  Đăng nhập mỗi ngày tặng ngay Tiền Xu & Sticker Hiếm 💎
                </Text>
              </View>
            </LinearGradient>
          </FadeIn>

          {/* Error Banner */}
          {auth.error ? (
            <FadeIn index={1}>
              <Card
                style={[
                  styles.errCard,
                  { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
                ]}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <Text style={[styles.errText, { color: theme.danger }]}>{auth.error}</Text>
                <Pressable onPress={auth.clearError} hitSlop={8}>
                  <Ionicons name="close" size={16} color={theme.danger} />
                </Pressable>
              </Card>
            </FadeIn>
          ) : null}

          {/* Password Sign-In Card */}
          <FadeIn index={1}>
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Chọn vai trò & Đăng nhập
              </Text>

              {/* 3-Role Switcher */}
              <View style={[styles.roleTabs, { backgroundColor: theme.backgroundElement }]}>
                {ROLE_TABS.map((t) => {
                  const active = mode === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        if (auth.error) auth.clearError();
                        setMode(t.key);
                      }}
                      style={[
                        styles.roleTab,
                        active && [styles.roleTabActive, { backgroundColor: theme.card }],
                      ]}>
                      <Ionicons
                        name={t.icon}
                        size={15}
                        color={active ? theme.accent : theme.textMuted}
                      />
                      <Text
                        style={[
                          styles.roleTabLabel,
                          { color: active ? theme.text : theme.textSecondary },
                        ]}
                        numberOfLines={1}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
                {mode === 'student'
                  ? 'Nhập mật khẩu truy cập Lớp 10T4 để điểm danh nhận Tiền Xu, làm nhiệm vụ săn Sticker Hiếm & xem thông báo từ thầy cô.'
                  : mode === 'subject_teacher'
                    ? 'Cổng dành riêng cho Giáo viên bộ môn — chọn môn giảng dạy & xác thực bằng mật khẩu giáo viên để vào đăng thông báo lớp.'
                    : 'Cổng dành cho Giáo viên chủ nhiệm — xác thực bằng mật khẩu giáo viên để mở toàn quyền quản trị lớp 10T4.'}
              </Text>

              {/* Subject Picker for Subject Teachers */}
              {mode === 'subject_teacher' ? (
                <View style={styles.subjectWrap}>
                  <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                    Chọn bộ môn giảng dạy
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subjectRow}>
                    {SUBJECT_TEACHER_PRESETS.map((item) => (
                      <Chip
                        key={item.subject}
                        label={`${item.emoji} ${item.subject}`}
                        selected={!customSubject.trim() && subject === item.subject}
                        onPress={() => {
                          setSubject(item.subject);
                          setCustomSubject('');
                        }}
                      />
                    ))}
                  </ScrollView>
                  <TextField
                    label={'Hoặc nhập tên môn khác (tuỳ chọn)'}
                    icon={'book-outline'}
                    placeholder={'VD: Robotics, Kỹ năng mềm...'}
                    value={customSubject}
                    onChangeText={setCustomSubject}
                  />
                </View>
              ) : null}

              <TextField
                label={
                  mode === 'subject_teacher'
                    ? 'Tên Thầy / Cô hiển thị trên thông báo'
                    : mode === 'teacher'
                      ? 'Tên Giáo viên chủ nhiệm (tuỳ chọn)'
                      : 'Tên hiển thị của bạn (tuỳ chọn)'
                }
                icon={'person-outline'}
                placeholder={
                  mode === 'subject_teacher'
                    ? 'Ví dụ: Cô Nguyễn Lan Anh / Thầy Minh'
                    : mode === 'teacher'
                      ? 'Ví dụ: Thầy Ngô Vũ Hảo'
                      : 'Ví dụ: Vũ Quân hoặc tên của bạn...'
                }
                value={displayName}
                onChangeText={setDisplayName}
                returnKeyType="next"
              />

              <View style={styles.passGroup}>
                <Text style={[styles.passLabel, { color: theme.textSecondary }]}>
                  {isTeacherTab ? 'Mật khẩu tài khoản Giáo viên' : 'Mật khẩu truy cập Lớp 10T4'}
                </Text>
                <View
                  style={[
                    styles.passBox,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: auth.error ? theme.danger : theme.border,
                    },
                  ]}>
                  <Ionicons
                    name={isTeacherTab ? 'shield-outline' : 'lock-closed-outline'}
                    size={18}
                    color={isTeacherTab ? theme.warning : theme.textMuted}
                  />
                  <TextInput
                    value={password}
                    onChangeText={(text) => {
                      if (auth.error) auth.clearError();
                      setPassword(text);
                    }}
                    placeholder={
                      isTeacherTab ? 'Nhập mật khẩu xác thực giáo viên...' : 'Nhập mật khẩu lớp...'
                    }
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    style={[styles.passInput, { color: theme.text }]}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>

              <Button
                label={
                  auth.busy
                    ? 'Đang xác thực...'
                    : mode === 'subject_teacher'
                      ? `Vào Cổng GV ${effectiveSubject}`
                      : mode === 'teacher'
                        ? 'Đăng nhập Giáo viên chủ nhiệm'
                        : 'Đăng nhập & Nhận Quà Xu 🪙'
                }
                icon={isTeacherTab ? 'shield-checkmark' : 'lock-open'}
                disabled={auth.busy}
                onPress={handleSubmit}
              />

              <View style={styles.featureList}>
                {[
                  {
                    icon: 'gift' as const,
                    text: 'Đăng nhập hằng ngày thưởng Tiền Xu 🪙, chuỗi 7 ngày & Rương Sticker Hiếm',
                  },
                  {
                    icon: 'trophy' as const,
                    text: '16 Nhiệm vụ học sinh mở khóa Sticker Sử Thi, Huyền Thoại & Thần Thoại 🌌',
                  },
                  {
                    icon: 'megaphone' as const,
                    text: 'Giáo viên bộ môn & GVCN đăng thông báo, lịch kiểm tra trực tiếp lên Bảng tin',
                  },
                ].map((item) => (
                  <View key={item.text} style={styles.featRow}>
                    <View style={[styles.featIcon, { backgroundColor: theme.accentSoft }]}>
                      <Ionicons name={item.icon} size={15} color={theme.accent} />
                    </View>
                    <Text style={[styles.featText, { color: theme.textSecondary }]}>
                      {item.text}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeIn>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  loadingText: { fontSize: 14, fontWeight: '700' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  col: { width: '100%', maxWidth: 480, gap: Spacing.three },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four + 4,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bubbleA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bubbleB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -50,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shield: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  rewardTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  rewardTeaserText: { color: '#FDE68A', fontSize: 11.5, fontWeight: '800' },
  errCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1 },
  errText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  card: { gap: Spacing.three },
  cardTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  cardDesc: { fontSize: 12.5, lineHeight: 19 },
  roleTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.md,
    gap: 4,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  roleTabActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roleTabLabel: { fontSize: 12, fontWeight: '800' },
  subjectWrap: { gap: Spacing.two },
  subjectRow: { gap: Spacing.two, paddingRight: Spacing.two },
  passGroup: { gap: 6 },
  passLabel: { fontSize: 12, fontWeight: '800' },
  passBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  passInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 10,
    ...({ outlineStyle: 'none' } as object),
  },
  featureList: { gap: Spacing.two, marginTop: 2 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  featIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 18 },
});
