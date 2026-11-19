import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { AppTabBar } from '@/components/app-tab-bar';

/** Five main sections rendered with the shared floating tab bar. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props: BottomTabBarProps) => (
        <AppTabBar state={props.state as unknown as Parameters<typeof AppTabBar>[0]['state']} />
      )}>
      <Tabs.Screen name="index" options={{ title: 'Tổng quan' }} />
      <Tabs.Screen name="students" options={{ title: 'Học sinh' }} />
      <Tabs.Screen name="feed" options={{ title: 'Nhật ký' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tiện ích' }} />
      <Tabs.Screen name="settings" options={{ title: 'Cài đặt' }} />
    </Tabs>
  );
}
