/**
 * contexts/ThemeContext.tsx
 *
 * Provides dark/light mode theming for the entire Liquid Luck app.
 * - Default: dark mode (#0a0520 background, white text, gold accents)
 * - Light mode: warm cream background (#f5f0e8), dark navy text, darker gold
 * - Preference saved to AsyncStorage with key "color_mode"
 * - Background color transition animated over 300ms
 * - useTheme() hook for easy access in any component
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light';

export interface AppColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textSub: string;
  textMuted: string;
  gold: string;
  goldDim: string;
  goldBorder: string;
  navBg: string;
  divider: string;
  switchTrackOff: string;
  rowBg: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
}

export const DARK_COLORS: AppColors = {
  bg: '#0a0520',
  cardBg: 'rgba(0,0,0,0.35)',
  cardBorder: 'rgba(255,215,0,0.25)',
  text: '#ffffff',
  textSub: 'rgba(255,255,255,0.75)',
  textMuted: 'rgba(255,255,255,0.45)',
  gold: '#FFD700',
  goldDim: '#c8a000',
  goldBorder: 'rgba(255,215,0,0.4)',
  navBg: '#12063A',
  divider: 'rgba(255,255,255,0.1)',
  switchTrackOff: 'rgba(255,255,255,0.15)',
  rowBg: 'rgba(255,255,255,0.07)',
  inputBg: '#1a1a2e',
  inputBorder: 'rgba(255,215,0,0.3)',
  inputText: '#ffffff',
};

export const LIGHT_COLORS: AppColors = {
  bg: '#f5f0e8',
  cardBg: 'rgba(255,255,255,0.92)',
  cardBorder: 'rgba(200,160,0,0.35)',
  text: '#1a1a2e',
  textSub: 'rgba(26,26,46,0.75)',
  textMuted: 'rgba(26,26,46,0.45)',
  gold: '#c8a000',
  goldDim: '#a07000',
  goldBorder: 'rgba(200,160,0,0.5)',
  navBg: '#3a2a0a',
  divider: 'rgba(0,0,0,0.1)',
  switchTrackOff: 'rgba(0,0,0,0.12)',
  rowBg: 'rgba(255,255,255,0.85)',
  inputBg: '#ffffff',
  inputBorder: 'rgba(200,160,0,0.4)',
  inputText: '#1a1a2e',
};

interface ThemeContextValue {
  mode: ThemeMode;
  colors: AppColors;
  isDark: boolean;
  bgAnim: Animated.Value;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: DARK_COLORS,
  isDark: true,
  bgAnim: new Animated.Value(0),
  toggleTheme: () => {},
});

export function LLThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const bgAnim = useRef(new Animated.Value(0)).current; // 0 = dark, 1 = light

  useEffect(() => {
    AsyncStorage.getItem('color_mode').then((saved) => {
      if (saved === 'light') {
        setMode('light');
        bgAnim.setValue(1);
      }
    }).catch(() => {});
  }, [bgAnim]);

  async function toggleTheme() {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    Animated.timing(bgAnim, {
      toValue: next === 'light' ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    try {
      await AsyncStorage.setItem('color_mode', next);
    } catch {}
  }

  const colors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ mode, colors, isDark: mode === 'dark', bgAnim, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
