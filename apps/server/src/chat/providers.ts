import type { SupportedLang } from '@drop/types';
import { getTranslationConfig } from '../config';

export type TranslateInput = {
  text: string;
  source: SupportedLang;
  target: SupportedLang;
  signal?: AbortSignal;
};

export type TranslateResult = { text: string } | { error: 'quota' | 'timeout' | 'provider' };

export type TranslationProvider = {
  name: string;
  translate(input: TranslateInput): Promise<TranslateResult>;
};

type FetchLike = typeof fetch;

function isAbort(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
  );
}

export function createGeminiProvider(
  opts: { apiKey: string; model: string; fetch?: FetchLike } = {
    apiKey: '',
    model: 'gemini-3.5-flash-lite',
  },
): TranslationProvider {
  const fetchImpl = opts.fetch ?? fetch;
  return {
    name: 'gemini',
    async translate(input) {
      if (!opts.apiKey) return { error: 'provider' };
      try {
        const res = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': opts.apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Translate the following chat message into ${input.target}. Return only the translation, with no quotes or notes.\n\n${input.text}`,
                    },
                  ],
                },
              ],
              generationConfig: { temperature: 0, maxOutputTokens: 256 },
            }),
            signal: input.signal,
          },
        );
        if (res.status === 429) return { error: 'quota' };
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (/resource_exhausted|quota/i.test(body)) return { error: 'quota' };
          return { error: 'provider' };
        }
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) return { error: 'provider' };
        return { text };
      } catch (err) {
        if (isAbort(err)) return { error: 'timeout' };
        return { error: 'provider' };
      }
    },
  };
}

export function createMyMemoryProvider(
  opts: { email?: string; fetch?: FetchLike } = {},
): TranslationProvider {
  const fetchImpl = opts.fetch ?? fetch;
  return {
    name: 'mymemory',
    async translate(input) {
      const q = Buffer.byteLength(input.text, 'utf8') > 500 ? input.text.slice(0, 160) : input.text;
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', q);
      url.searchParams.set('langpair', `${input.source}|${input.target}`);
      if (opts.email) url.searchParams.set('de', opts.email);
      try {
        const res = await fetchImpl(url, { signal: input.signal });
        if (res.status === 429) return { error: 'quota' };
        if (!res.ok) return { error: 'provider' };
        const json = (await res.json()) as {
          responseStatus?: number;
          responseData?: { translatedText?: string };
          quotaFinished?: boolean;
          responseDetails?: string;
        };
        if (json.quotaFinished === true) return { error: 'quota' };
        if (typeof json.responseDetails === 'string' && /quota|limit/i.test(json.responseDetails)) {
          return { error: 'quota' };
        }
        const text = json.responseData?.translatedText?.trim();
        if (!text || json.responseStatus !== 200) return { error: 'provider' };
        return { text };
      } catch (err) {
        if (isAbort(err)) return { error: 'timeout' };
        return { error: 'provider' };
      }
    },
  };
}

export const noneProvider: TranslationProvider = {
  name: 'none',
  async translate() {
    return { error: 'provider' };
  },
};

export function providerFromEnv(
  cfg = getTranslationConfig(),
  deps: { fetch?: FetchLike } = {},
): TranslationProvider {
  if (cfg.provider === 'none') return noneProvider;
  if (cfg.provider === 'gemini') {
    return createGeminiProvider({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
      fetch: deps.fetch,
    });
  }
  return createMyMemoryProvider({ email: cfg.myMemoryEmail, fetch: deps.fetch });
}
