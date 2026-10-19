/**
 * Shared visual tokens. Keep product tunables in src/config, not here.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111318',
    textSecondary: '#5C6470',
    background: '#F7F8FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEFF3',
    border: '#D8DDE5',
    accent: '#0B6B57',
    accentText: '#FFFFFF',
    success: '#157F3D',
    warning: '#A15C00',
    danger: '#B42318',
  },
  dark: {
    text: '#F4F6F8',
    textSecondary: '#A7B0BC',
    background: '#0B0D10',
    backgroundElement: '#15191E',
    backgroundSelected: '#20262D',
    border: '#2C333C',
    accent: '#4FE0B6',
    accentText: '#06241D',
    success: '#5BE38B',
    warning: '#F3B44E',
    danger: '#FF7A70',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 1120;
