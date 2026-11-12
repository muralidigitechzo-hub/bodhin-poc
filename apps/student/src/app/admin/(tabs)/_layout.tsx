/** Admin tabs: Home · Inbox · Tenants · Money · More (bottom bar on phones, side rail ≥ 900px). */
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTabs } from '@/ui/responsive';

const TABS = [
  ['index', 'Home', 'speedometer'],
  ['inbox', 'Inbox', 'file-tray-full'],
  ['tenants', 'Tenants', 'business'],
  ['money', 'Money', 'wallet'],
  ['more', 'More', 'menu'],
] as const;

export default function AdminTabs() {
  const tabs = useAppTabs(TABS, 'admin');
  return (
    <Tabs tabBar={tabs.tabBar} screenOptions={tabs.screenOptions}>
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color, focused }) => <Ionicons name={(focused ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap} size={24} color={color as string} /> }} />
      ))}
    </Tabs>
  );
}
