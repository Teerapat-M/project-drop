import { normalizeLang, type SupportedLang } from '@drop/types';

export function deviceLanguage(): SupportedLang {
  try {
    return normalizeLang(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return 'en';
  }
}

export const LANG_LABELS: Record<SupportedLang, string> = {
  en: 'English',
  th: 'ไทย',
  zh: '中文',
  ja: '日本語',
};

export const LANG_CYCLE: SupportedLang[] = ['en', 'th', 'zh', 'ja'];

export function nextLang(current: SupportedLang): SupportedLang {
  const i = LANG_CYCLE.indexOf(current);
  return LANG_CYCLE[(i + 1) % LANG_CYCLE.length] ?? 'en';
}
