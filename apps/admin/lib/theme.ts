import { adminTheme, palette } from '@drop/tokens';

export function adminCssVars(): Record<string, string> {
  return {
    '--drop-primary': adminTheme.colors.primary,
    '--drop-on-primary': adminTheme.colors.onPrimary,
    '--drop-bg': adminTheme.colors.background,
    '--drop-surface': adminTheme.colors.surface,
    '--drop-text': adminTheme.colors.text,
    '--drop-muted': adminTheme.colors.textSecondary,
    '--drop-border': adminTheme.colors.border,
    '--drop-danger': adminTheme.colors.danger,
    '--drop-success': adminTheme.colors.success,
  };
}

export { adminTheme, palette };
