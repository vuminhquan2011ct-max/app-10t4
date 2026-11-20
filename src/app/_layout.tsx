import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AssistantOverlay } from '@/components/assistant/assistant-overlay';
import { AuthGate } from '@/components/auth-gate';
import { CommandPaletteProvider } from '@/components/command-palette';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider, useAuth } from '@/store/auth-store';
import { ClassStoreProvider, useClassStore } from '@/store/class-store';
import { DecorProvider } from '@/store/decor-store';
import { ThemePreferenceProvider, useThemePreference } from '@/store/theme-store';

SplashScreen.preventAutoHideAsync();

function WorkspaceStack() {
  const { ready } = useClassStore();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <CommandPaletteProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name={'(tabs)'} />
        <Stack.Screen name={'student/[id]'} />
        <Stack.Screen name={'insights'} />
        <Stack.Screen name={'studio'} />
        <Stack.Screen name={'creative'} />
        <Stack.Screen name={'seating'} />
        <Stack.Screen name={'kudos'} />
        <Stack.Screen name={'resources'} />
        <Stack.Screen name={'focus'} />
        <Stack.Screen name={'attendance'} />
        <Stack.Screen name={'announcements'} />
        <Stack.Screen name={'randomizer'} />
        <Stack.Screen name={'fund'} />
        <Stack.Screen name={'schedule'} />
        <Stack.Screen name={'polls'} />
        <Stack.Screen name={'tasks'} />
        <Stack.Screen name={'feedback'} />
        <Stack.Screen name={'members'} />
        <Stack.Screen name={'student-form'} options={{ presentation: 'modal' }} />
        <Stack.Screen name={'entry-form'} options={{ presentation: 'modal' }} />
        <Stack.Screen name={'bulk-students'} options={{ presentation: 'modal' }} />
      </Stack>
      <AssistantOverlay />
    </CommandPaletteProvider>
  );
}

function SplashWatcher() {
  const { loading, canEnterApp } = useAuth();

  useEffect(() => {
    if (!loading && !canEnterApp) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading, canEnterApp]);

  return null;
}

function AppShell() {
  const { isDark } = useThemePreference();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <DecorProvider>
          <ToastProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <SplashWatcher />
            <AuthGate>
              <ClassStoreProvider>
                <WorkspaceStack />
              </ClassStoreProvider>
            </AuthGate>
          </ToastProvider>
        </DecorProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        <AppShell />
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}
