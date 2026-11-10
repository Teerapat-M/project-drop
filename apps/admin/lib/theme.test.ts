import { describe, expect, it } from '@jest/globals';
import { adminCssVars, adminTheme, palette } from './theme';

describe('admin theme', () => {
  it('is light with yellow primary and black on-primary', () => {
    expect(adminTheme.mode).toBe('light');
    expect(palette.primary).toBe('#FFEA33');
    expect(palette.onPrimary).toBe('#141414');

    const vars = adminCssVars();
    expect(vars['--drop-primary']).toBe('#FFEA33');
    expect(vars['--drop-on-primary']).toBe('#141414');
    expect(vars['--drop-bg']).toBe(adminTheme.colors.background);
  });
});
