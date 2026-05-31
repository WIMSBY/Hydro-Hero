import { Tabs } from 'expo-router';
import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProContext } from '../../contexts/ProContext';

/** Small gold "PRO" badge overlaid on a tab icon for locked tabs */
function ProBadge() {
  return (
    <View style={{
      position: 'absolute', top: -4, right: -10,
      backgroundColor: '#FFD700', borderRadius: 5,
      paddingHorizontal: 4, paddingVertical: 1,
    }}>
      <Text style={{ color: '#0a0520', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 }}>PRO</Text>
    </View>
  );
}

function LockedTabIcon({ children, isPro }: { children: React.ReactNode; isPro: boolean }) {
  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      {children}
      {!isPro && <ProBadge />}
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isPro, openPaywall } = useProContext();

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
          tabBarIcon: ({ color }) => (
            <LockedTabIcon isPro={isPro}>
              <MaterialIcons name="bar-chart" size={22} color={isPro ? color : 'rgba(150,150,150,0.7)'} />
            </LockedTabIcon>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!isPro) {
              e.preventDefault();
              openPaywall('stats_tab');
            }
          },
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
