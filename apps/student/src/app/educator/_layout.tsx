/**
 * Educator area — same app, same login. Shown to owners and tutors.
 * Fixed 5 tabs: Home · Courses · Batches · Live · More (bottom bar on phones, side rail ≥ 900px).
 */
import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { educatorMembership, useAuth } from '@/store/auth';
import { useAppTabs } from '@/ui/responsive';

const TABS = [
  ['home', 'Home', 'grid'],
  ['courses', 'Courses', 'layers'],
  ['batches', 'Batches', 'people'],
  ['live', 'Live', 'radio'],
  ['more', 'More', 'menu'],
] as const;

export default function EducatorLayout() {
  const { session, ready } = useAuth();
  const tabs = useAppTabs(TABS, 'educator');
  if (ready && !session) return <Redirect href="/sign-in" />;
  if (ready && !educatorMembership(session)) return <Redirect href="/home" />;

  return (
    <Tabs tabBar={tabs.tabBar} screenOptions={tabs.screenOptions}>
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => <Ionicons name={(focused ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap} size={24} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
