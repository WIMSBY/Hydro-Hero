import React from 'react';
import { View } from 'react-native';

// The Settings tab is a shortcut: its tabPress listener in (tabs)/_layout.tsx
// intercepts the press, routes to Home, and opens the Settings modal. This
// placeholder screen exists only so expo-router registers the route — it
// should never actually render.
export default function SettingsTabPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: '#0a0520' }} />;
}
