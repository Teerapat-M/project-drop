import {
  detectLang,
  isChatPresetKey,
  normalizeLang,
  presetText,
  type ChatPresetKey,
  type SupportedLang,
} from '@drop/types';
import { getTranslationConfig } from '../config';
import { TRANSLATION_BUCKET, type TokenBucket } from './rateLimit';
import { providerFromEnv, type TranslateResult, type TranslationProvider } from './providers';

export type TranslateRequest = {
  userId: string;
  text: string;
  sourceLang?: string | null;
  targetLang: string | null | undefined;
  presetKey?: string | null;
};

export type TranslateOutcome = {
  original: string;
  translated: string | null;
  sourceLang: SupportedLang;
  targetLang: SupportedLang;
  usedProvider: boolean;
};

export type Translator = (req: TranslateRequest) => Promise<TranslateOutcome>;

export function createTranslator(
  opts: {
    provider?: TranslationProvider;
    bucket?: TokenBucket;
    timeoutMs?: number;
    now?: () => number;
  } = {},
): Translator {
  const provider = opts.provider ?? providerFromEnv();
  const bucket = opts.bucket ?? TRANSLATION_BUCKET;
  const timeoutMs = opts.timeoutMs ?? getTranslationConfig().timeoutMs;
  const now = opts.now ?? Date.now;

  return async (req) => {
    const original = req.text.trim().slice(0, 1000);
    const targetLang = normalizeLang(req.targetLang);
    const sourceLang = req.presetKey && isChatPresetKey(req.presetKey)
      ? normalizeLang(req.sourceLang)
      : normalizeLang(req.sourceLang ?? detectLang(original));

    if (req.presetKey && isChatPresetKey(req.presetKey)) {
      const key = req.presetKey as ChatPresetKey;
      const src = presetText(key, sourceLang);
      const dst = presetText(key, targetLang);
      return {
        original: original || src,
        translated: dst === (original || src) ? null : dst,
        sourceLang,
        targetLang,
        usedProvider: false,
      };
    }

    if (sourceLang === targetLang) {
      return { original, translated: null, sourceLang, targetLang, usedProvider: false };
    }

    if (!bucket.take(req.userId, now())) {
      return { original, translated: null, sourceLang, targetLang, usedProvider: false };
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let result: TranslateResult;
    try {
      result = await provider.translate({
        text: original,
        source: sourceLang,
        target: targetLang,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if ('error' in result) {
      return { original, translated: null, sourceLang, targetLang, usedProvider: true };
    }
    const translated = result.text.trim();
    if (!translated || translated === original) {
      return { original, translated: null, sourceLang, targetLang, usedProvider: true };
    }
    return { original, translated, sourceLang, targetLang, usedProvider: true };
  };
}
