import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LLThemeProvider } from '../contexts/ThemeContext';
import { ProProvider } from '../contexts/ProContext';
import { AuthProvider } from '../contexts/AuthContext';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Initialize RevenueCat once at module load — wrapped in try/catch so it
// never crashes the app if the SDK or network is unavailable.
try {
  const Purchases = require('react-native-purchases').default;
  const { LOG_LEVEL } = require('react-native-purchases');

  // TODO: Replace with your production iOS API key from RevenueCat dashboard
  // (App Settings → API Keys → Public SDK key — starts with "appl_")
  // The test key below will cause ALL in-app purchases to fail in App Store builds.
  Purchases.configure({ apiKey: 'REPLACE_WITH_PRODUCTION_REVENUECAT_IOS_KEY' });

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
} catch {
  // RevenueCat not available — app continues without Pro features
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
    <ProProvider>
      <LLThemeProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </LLThemeProvider>
    </ProProvider>
    </AuthProvider>
  );
}
