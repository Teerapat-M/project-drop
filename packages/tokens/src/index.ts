/** Drop tokens from the Penpot build spec (v0.2). Primary yellow + near-black. */

export const palette = {
  primary: '#FFEA33',
  primaryPressed: '#F2D900',
  primarySoft: '#FFF8C2',
  onPrimary: '#141414',
  secondary: '#141414',
  secondaryPressed: '#2E2E2E',
  secondarySoft: '#F0F0F0',
  success: '#0B7343',
  successBg: '#E2F4EA',
  warning: '#F5A524',
  warningBg: '#FFF4D6',
  warningText: '#8A5A00',
  danger: '#C4282E',
  dangerBg: '#FCE7E8',
  ink: '#141414',
  inkSecondary: '#5E5E5E',
  inkMuted: '#8C8C8C',
  border: '#E6E6E6',
  surface: '#FFFFFF',
  bg: '#F6F6F4',
  disabled: '#E4E4E4',
} as const;

export const darkPalette = {
  bg: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceRaised: '#242424',
  border: '#2E2E2E',
  ink: '#F5F5F5',
  inkSecondary: '#B3B3B3',
  inkMuted: '#8A8A8A',
  primary: '#FFEA33',
  primaryPressed: '#F2D900',
  primarySoft: '#3A3410',
  onPrimary: '#141414',
  secondary: '#F5F5F5',
  success: '#3DD68C',
  danger: '#FF6B6B',
  warning: '#F5B83D',
  disabled: '#2E2E2E',
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  secondary: string;
  border: string;
  danger: string;
  dangerBg: string;
  success: string;
  disabled: string;
};

export type Theme = {
  mode: 'light' | 'dark';
  colors: ThemeColors;
};

export const riderLight: Theme = {
  mode: 'light',
  colors: {
    background: palette.bg,
    surface: palette.surface,
    surfaceRaised: palette.surface,
    text: palette.ink,
    textSecondary: palette.inkSecondary,
    textMuted: palette.inkMuted,
    primary: palette.primary,
    primaryPressed: palette.primaryPressed,
    primarySoft: palette.primarySoft,
    onPrimary: palette.onPrimary,
    secondary: palette.secondary,
    border: palette.border,
    danger: palette.danger,
    dangerBg: palette.dangerBg,
    success: palette.success,
    disabled: palette.disabled,
  },
};

export const riderDark: Theme = {
  mode: 'dark',
  colors: {
    background: darkPalette.bg,
    surface: darkPalette.surface,
    surfaceRaised: darkPalette.surfaceRaised,
    text: darkPalette.ink,
    textSecondary: darkPalette.inkSecondary,
    textMuted: darkPalette.inkMuted,
    primary: darkPalette.primary,
    primaryPressed: darkPalette.primaryPressed,
    primarySoft: darkPalette.primarySoft,
    onPrimary: darkPalette.onPrimary,
    secondary: darkPalette.secondary,
    border: darkPalette.border,
    danger: darkPalette.danger,
    dangerBg: '#3A1818',
    success: darkPalette.success,
    disabled: darkPalette.disabled,
  },
};

/** Driver app is dark-only. */
export const driverTheme: Theme = riderDark;

/** Admin dashboard is light-only. */
export const adminTheme: Theme = riderLight;

export function riderTheme(scheme: 'light' | 'dark' | null | undefined): Theme {
  return scheme === 'dark' ? riderDark : riderLight;
}
