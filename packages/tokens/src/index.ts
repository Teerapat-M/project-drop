export const palette = {
  primary: '#FFEA33',
  onPrimary: '#141414',
  ink: '#141414',
  paper: '#FFFFFF',
  paperMuted: '#F6F6F4',
  inkMuted: '#5C5C5C',
  night: '#0E0E0E',
  nightRaised: '#1C1C1C',
  nightText: '#F5F5F5',
  nightMuted: '#A3A3A3',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
};

export type Theme = {
  mode: 'light' | 'dark';
  colors: ThemeColors;
};

export const riderLight: Theme = {
  mode: 'light',
  colors: {
    background: palette.paperMuted,
    surface: palette.paper,
    text: palette.ink,
    textMuted: palette.inkMuted,
    primary: palette.primary,
    onPrimary: palette.onPrimary,
  },
};

export const riderDark: Theme = {
  mode: 'dark',
  colors: {
    background: palette.night,
    surface: palette.nightRaised,
    text: palette.nightText,
    textMuted: palette.nightMuted,
    primary: palette.primary,
    onPrimary: palette.onPrimary,
  },
};

/** Driver app is dark-only. */
export const driverTheme: Theme = riderDark;

/** Admin dashboard is light-only. */
export const adminTheme: Theme = riderLight;

export function riderTheme(scheme: 'light' | 'dark' | null | undefined): Theme {
  return scheme === 'dark' ? riderDark : riderLight;
}
