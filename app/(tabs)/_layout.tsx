import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPendingBadgeCount } from '../../utils/badgeDetection';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [pendingBadges, setPendingBadges] = useState(0);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const n = await getPendingBadgeCount();
      if (mounted && n !== pendingBadges) setPendingBadges(n);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, [pendingBadges]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 10, marginTop: -2 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarStyle: { height: 65, paddingTop: 4 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <MaterialIcons name="bar-chart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          tabBarIcon: ({ color }) => <MaterialIcons name="emoji-events" size={22} color={color} />,
          tabBarBadge: pendingBadges > 0 ? pendingBadges : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FFD700', color: '#0a0520', fontSize: 11, fontWeight: '800' },
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          title: 'Squad',
          tabBarIcon: ({ color }) => <MaterialIcons name="group" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
