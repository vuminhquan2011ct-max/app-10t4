import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ClassStoreProvider, useClassStore } from '@/store/class-store';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { ready } = useClassStore();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name={'(tabs)'} />
      <Stack.Screen name={'student/[id]'} />
      <Stack.Screen name={'student-form'} options={{ presentation: 'modal' }} />
      <Stack.Screen name={'entry-form'} options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ClassStoreProvider>
        <StatusBar style={'auto'} />
        <Gate />
      </ClassStoreProvider>
    </ThemeProvider>
  );
}
