/**
 * The website's palette and type, as React Native values.
 *
 * Dark is the default, exactly as on the web (`--vw-*` in voice-workspace.css);
 * the light palette mirrors `body.light-mode`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Palette = {
  paper: string; panel: string; surface: string; surface2: string; ink: string; muted: string;
  line: string; lineStrong: string; lime: string; limeInk: string; chip: string; chipInk: string;
  userBg: string; userInk: string; warnBg: string; warnInk: string; good: string;
  primaryBg: string; primaryInk: string; glow: string;
};

const dark: Palette = {
  paper: '#141513', panel: '#1a1b19', surface: '#212220', surface2: '#2a2b28', ink: '#f1f2ec',
  muted: '#9b9d93', line: 'rgba(255,255,255,0.10)', lineStrong: 'rgba(255,255,255,0.16)',
  lime: '#d8f878', limeInk: '#1d1e19', chip: '#2a3021', chipInk: '#bcd98d', userBg: '#2f312c',
  userInk: '#f1f2ec', warnBg: 'rgba(217,118,106,0.14)', warnInk: '#f0a99f', good: '#a9d06a',
  primaryBg: '#d8f878', primaryInk: '#1d1e19', glow: 'rgba(216,248,120,0.20)',
};

const light: Palette = {
  paper: '#fbfaf7', panel: '#f7f7f2', surface: '#ffffff', surface2: '#f2f3ea', ink: '#191a17',
  muted: '#74766d', line: '#e4e5dd', lineStrong: '#d7d8ce', lime: '#d8f878', limeInk: '#1d1e19',
  chip: '#eef3e3', chipInk: '#55702a', userBg: '#20211c', userInk: '#f4f5ee', warnBg: '#fdf1ef',
  warnInk: '#9c4a40', good: '#5a7a2c', primaryBg: '#20211c', primaryInk: '#ffffff',
  glow: 'rgba(180,217,87,0.30)',
};

/** Manrope for words, DM Mono for labels — the same pair the website loads. */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export type ThemeName = 'dark' | 'light';
type ThemeValue = { name: ThemeName; colors: Palette; toggle: () => void };

const ThemeContext = createContext<ThemeValue>({ name: 'dark', colors: dark, toggle: () => {} });
const STORAGE_KEY = 'svarah.theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark') setName(saved);
      })
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setName((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ name, colors: name === 'dark' ? dark : light, toggle }), [name, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
